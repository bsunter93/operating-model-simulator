import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState } from 'react';
import { makeFmt, type Fmt } from '../lib/format';
import { migrateModel } from '../models/migrate';
import { SAMPLE_IDS } from '../data/templates';
import { createModelStore, decodeShare, type ModelStore } from './persistence';
import type { ReactNode } from 'react';
import { run, validateModel } from '../engine';
import { applyDecisions, type Decision } from '../lib/edits';
import type { OperatingModel, DecisionWeights, Intervention } from '../models/types';
import type { ModelResult } from '../models/results';
import fixture from '../data/atlas-systems-2027.json';

export const FIXTURE = fixture as unknown as OperatingModel;

/** Per-intervention parameter overrides: the one knob each type exposes. */
export type Overrides = Record<string, number>;

export interface State {
  model: OperatingModel;
  scenarioId: string;
  /**
   * What the reader has done to this company, in the order they did it.
   *
   * This lived in the sandbox as component state, which meant the full model was
   * computing a different year from the one the reader was playing: they picked the
   * shock year and made four calls, and the board behind it still showed the plan as
   * written. One list, here, and every view answers about the same year.
   */
  decisions: Decision[];
  interventionIds: string[];
  overrides: Overrides;
  weights: DecisionWeights;
  tourStep: number | null;
  tourChoice: string | null;
  /** Team in focus for the levers section and the team drawer. */
  teamId: string | null;
}

type Action =
  | { type: 'scenario'; id: string }
  | { type: 'toggleIntervention'; id: string }
  | { type: 'setInterventions'; ids: string[] }
  | { type: 'override'; id: string; value: number }
  | { type: 'weights'; weights: DecisionWeights }
  | { type: 'model'; model: OperatingModel }
  | { type: 'decide'; decision: Decision }
  | { type: 'undoDecision' }
  | { type: 'editModel'; model: OperatingModel }
  | { type: 'tour'; step: number | null }
  | { type: 'tourChoice'; id: string | null }
  | { type: 'team'; id: string }
  | { type: 'reset' };

const baseId = (m: OperatingModel) => m.scenarios.find((s) => s.type === 'base')!.id;

/**
 * A model opens on the year it nominates for its run, not on the plan as written. The
 * base plan is the one year in which nothing ever queues, so opening there shows a
 * reader an organisation where nothing happens and asks them to go looking for the
 * pressure.
 */
const openingScenario = (m: OperatingModel) =>
  (m.run?.scenarioId && m.scenarios.some((x) => x.id === m.run!.scenarioId)
    ? m.run.scenarioId : baseId(m));

function fresh(model: OperatingModel): State {
  return { model, scenarioId: openingScenario(model), decisions: [], interventionIds: [], overrides: {}, weights: model.decisionWeights, tourStep: null, tourChoice: null, teamId: null };
}

function reducer(s: State, a: Action): State {
  switch (a.type) {
    /* A decision is taken against a team and a month of one year. Changing the year
       underneath it would leave a hire attached to a team that may not be short in the
       new one, so the log is cleared with the scenario. */
    case 'scenario': return { ...s, scenarioId: a.id, decisions: [] };
    case 'decide': return { ...s, decisions: [...s.decisions, a.decision] };
    case 'undoDecision': return { ...s, decisions: s.decisions.slice(0, -1) };
    case 'toggleIntervention':
      return { ...s, interventionIds: s.interventionIds.includes(a.id) ? s.interventionIds.filter((x) => x !== a.id) : [...s.interventionIds, a.id] };
    case 'setInterventions': return { ...s, interventionIds: a.ids };
    case 'override': return { ...s, overrides: { ...s.overrides, [a.id]: a.value } };
    case 'weights': return { ...s, weights: a.weights };
    case 'model': return fresh(a.model);
    case 'editModel': return { ...s, model: a.model, decisions: [], scenarioId: a.model.scenarios.some((x) => x.id === s.scenarioId) ? s.scenarioId : baseId(a.model), interventionIds: s.interventionIds.filter((id) => (isCustomId(id) ? a.model.teams.some((t) => t.id === id.split(':')[0]) : a.model.interventions.some((x) => x.id === id))) };
    case 'tour': return { ...s, tourStep: a.step, tourChoice: a.step === null ? null : s.tourChoice };
    case 'tourChoice': return { ...s, tourChoice: a.id };
    case 'team': return { ...s, teamId: a.id };
    case 'reset': return { ...fresh(s.model), tourStep: s.tourStep, tourChoice: s.tourChoice, teamId: s.teamId };
  }
}

/** The one editable parameter per intervention type. */
export interface Knob { label: string; unit: string; min: number; max: number; step: number; get: (iv: Intervention) => number; set: (iv: Intervention, v: number) => Intervention }

export function knobFor(iv: Intervention): Knob | null {
  switch (iv.type) {
    case 'expediteHiring': return { label: 'lead time', unit: 'months', min: 0, max: 12, step: 1, get: (x) => (x as typeof iv).newLeadTimeMonths, set: (x, v) => ({ ...(x as typeof iv), newLeadTimeMonths: v }) };
    case 'hire': return { label: 'headcount', unit: 'people', min: 0, max: 100, step: 1, get: (x) => (x as typeof iv).headcount, set: (x, v) => ({ ...(x as typeof iv), headcount: v }) };
    case 'automation': return { label: 'reduction', unit: '%', min: 0, max: 60, step: 1, get: (x) => Math.round((x as typeof iv).workloadReductionRate * 100), set: (x, v) => ({ ...(x as typeof iv), workloadReductionRate: v / 100 }) };
    case 'reallocation': return { label: 'headcount', unit: 'people', min: 0, max: 50, step: 1, get: (x) => (x as typeof iv).headcount, set: (x, v) => ({ ...(x as typeof iv), headcount: v }) };
    case 'defer': return { label: 'defer by', unit: 'months', min: 0, max: 12, step: 1, get: (x) => (x as typeof iv).months, set: (x, v) => ({ ...(x as typeof iv), months: v }) };
    case 'serviceLevelChange': return { label: 'new target', unit: '%', min: 50, max: 100, step: 1, get: (x) => Math.round((x as typeof iv).newTargetUtilization * 100), set: (x, v) => ({ ...(x as typeof iv), newTargetUtilization: v / 100 }) };
    case 'restaff': return { label: 'people on it', unit: '%', min: 40, max: 200, step: 5, get: (x) => Math.round((x as typeof iv).fteMultiplier * 100), set: (x, v) => ({ ...(x as typeof iv), fteMultiplier: v / 100 }) };
    case 'rescope': return { label: 'scope kept', unit: '%', min: 10, max: 100, step: 5, get: (x) => Math.round((x as typeof iv).scopeMultiplier * 100), set: (x, v) => ({ ...(x as typeof iv), scopeMultiplier: v / 100 }) };
    case 'cancel': return null;
  }
}

export const CUSTOM_KINDS = ['hire', 'automate', 'target'] as const;
export type CustomKind = (typeof CUSTOM_KINDS)[number];

export function isCustomId(id: string): boolean {
  const parts = id.split(':');
  return parts.length === 2 && (CUSTOM_KINDS as readonly string[]).includes(parts[1]);
}

/**
 * Generic levers that apply to any team, so the same three questions can be
 * asked of an imported model: add people, remove work, or accept a higher
 * target. Costs are stated assumptions, visible in the tooltip.
 */
export function customIntervention(model: OperatingModel, teamId: string, kind: CustomKind, value?: number): Intervention | null {
  const t = model.teams.find((x) => x.id === teamId);
  if (!t) return null;
  const id = `${teamId}:${kind}`;
  switch (kind) {
    case 'hire': {
      const lead = model.hiringPlan.find((h) => h.teamId === teamId)?.leadTimeMonths ?? 4;
      return { id, name: `Hire more for ${t.name}`, type: 'hire', teamId, headcount: value ?? 10, leadTimeMonths: lead, recruitingCostPerHead: t.monthlyFteCost,
        description: `Requested in month one, landing after the team's ${lead}-month lead time. Recruiting cost assumed at one month of loaded cost per hire, then their salary.` };
    }
    case 'automate': {
      const rate = (value ?? 15) / 100;
      const annualCost = t.currentFte * t.monthlyFteCost * 12;
      return { id, name: `Take work out of ${t.name}`, type: 'automation', teamId, workloadReductionRate: rate, timeToImpactMonths: 2, implementationCost: Math.round(annualCost * rate * 0.5),
        description: 'Automation, self-service, or standardization that removes a share of hands-on hours. Lands after two months. Cost assumed at half a year of the hours it saves.' };
    }
    case 'target': {
      const target = (value ?? Math.min(100, Math.round(t.targetUtilization * 100) + 8)) / 100;
      return { id, name: `Accept higher utilization on ${t.name}`, type: 'serviceLevelChange', teamId, newTargetUtilization: target,
        description: 'Raise the target utilization. The work does not change; the service level absorbs the difference. Scores like doing nothing in comparisons.' };
    }
  }
}

/** Interventions from the model with the user's parameter overrides applied, plus any generic levers in `customIds`. */
export function effectiveInterventions(model: OperatingModel, overrides: Overrides, customIds: string[] = []): Intervention[] {
  const fromModel = model.interventions.map((iv) => {
    const k = knobFor(iv);
    return k && overrides[iv.id] !== undefined ? k.set(iv, overrides[iv.id]) : iv;
  });
  const custom = customIds.map((id) => {
    const [teamId, kind] = id.split(':') as [string, CustomKind];
    return customIntervention(model, teamId, kind, overrides[id]);
  }).filter((x): x is Intervention => x !== null);
  return [...fromModel, ...custom];
}

interface Ctx {
  state: State;
  dispatch: (a: Action) => void;
  /** The model as authored. Editing and schema work read this one. */
  model: OperatingModel;
  /** The model with the reader's decisions folded in, which is what `result` was run on. */
  tuned: OperatingModel;
  /** Interventions with overrides applied. */
  interventions: Intervention[];
  /** Current scenario with the active interventions applied. */
  result: ModelResult;
  /** Current scenario, no interventions. */
  doNothing: ModelResult;
  /** Base plan, no interventions. */
  base: ModelResult;
  isBase: boolean;
  isFixture: boolean;
  /** Number and money formatting, bound to this model's currency and locale. */
  fmt: Fmt;
  /** Where saved models live. Swap the implementation, not the callers. */
  store: ModelStore;
  /** Set when this page picked a model up from somewhere, so it can say so. */
  restoredFrom: 'session' | 'link' | 'link-failed' | null;
  dismissRestored: () => void;
  teamName: (id: string) => string;
  initName: (id: string) => string;
}

const StoreContext = createContext<Ctx | null>(null);

const PAGES = ['#/mine', '#/summary', '#/model', '#/answer', '#/sandbox'];

/**
 * Where the full board lives. Four helpers in this file built links as "#/" plus a query,
 * which meant the model back when the model was the landing page. It has not been for some
 * time, so "next: what it costs" inside the board was quietly throwing the reader out of
 * the board. Named now, so the next time the front door moves this does not.
 */
const MODEL = '#/model';

/**
 * A shared model arrives in the hash, and it has to be read before anything else touches
 * the URL. writeQuery rebuilds the query from a fixed list of keys it knows about, runs
 * on mount like every other effect, and is declared first, so by the time the restore
 * effect looked for the token it had already been swept away. Read it at load instead.
 */
const SHARE_TOKEN: string | null = (() => {
  if (typeof window === 'undefined') return null;
  try { return new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('m'); }
  catch { return null; }
})();

// ── URL state: #/view/arg?s=scenario&i=id:knob,id&theme=dark ──────────────
function readQuery(model: OperatingModel): Partial<State> {
  const q = window.location.hash.split('?')[1];
  if (!q) return {};
  const p = new URLSearchParams(q);
  const out: Partial<State> = {};
  const s = p.get('s');
  if (s && model.scenarios.some((x) => x.id === s)) out.scenarioId = s;
  const i = p.get('i');
  if (i) {
    const ids: string[] = [], overrides: Overrides = {};
    for (const part of i.split(',')) {
      const bits = part.split(':');
      const id = bits.length >= 2 && isCustomId(bits.slice(0, 2).join(':')) ? bits.slice(0, 2).join(':') : bits[0];
      const v = bits.length >= 2 && isCustomId(id) ? bits[2] : bits[1];
      if (!isCustomId(id) && !model.interventions.some((y) => y.id === id)) continue;
      if (isCustomId(id) && !model.teams.some((t) => t.id === id.split(':')[0])) continue;
      ids.push(id);
      if (v !== undefined && Number.isFinite(Number(v))) overrides[id] = Number(v);
    }
    out.interventionIds = ids; out.overrides = overrides;
  }
  return out;
}

/** Drops one parameter from the hash and leaves the rest of the URL alone. */
function stripQuery(key: string): void {
  const [path, cur] = window.location.hash.split('?');
  const p = new URLSearchParams(cur ?? '');
  if (!p.has(key)) return;
  p.delete(key);
  const q = p.toString();
  history.replaceState(null, '', path + (q ? '?' + q : ''));
}

function writeQuery(s: State): void {
  const [path, cur] = window.location.hash.split('?');
  const curP = new URLSearchParams(cur ?? '');
  const p = new URLSearchParams();
  if (curP.get('theme')) p.set('theme', curP.get('theme')!);
  for (const k of ['p', 'go', 'team']) if (curP.get(k)) p.set(k, curP.get(k)!);
  if (s.scenarioId !== baseId(s.model)) p.set('s', s.scenarioId);
  if (s.interventionIds.length) p.set('i', s.interventionIds.map((id) => (s.overrides[id] !== undefined ? `${id}:${s.overrides[id]}` : id)).join(','));
  const q = p.toString();
  /* Every page the app has, not the three it had when this was written. Leaving #/model
     off the list meant the board silently refused to keep a scenario in the URL, so you
     could not link anyone to what you were looking at. */
  const base = PAGES.find((k) => path.startsWith(k)) ?? '#/';
  const next = base + (q ? '?' + q : '');
  if (next !== window.location.hash && (path === '#/' || path === '#' || path === '' || PAGES.some((k) => path.startsWith(k)))) {
    history.replaceState(null, '', next);
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, FIXTURE, (m) => ({ ...fresh(m), ...readQuery(m) }));
  useEffect(() => { writeQuery(state); }, [state]);

  const store = useMemo(() => createModelStore(), []);
  const [restoredFrom, setRestoredFrom] = useState<'session' | 'link' | 'link-failed' | null>(null);
  const [ready, setReady] = useState(false);

  /* One routine for both ways a link arrives: a fresh load, and somebody pasting one into
     a tab that already has the page open. They behaved differently before, which is to
     say the second one did not behave at all. */
  const openShared = useCallback(async (token: string, live: () => boolean) => {
    const decoded = await decodeShare(token);
    const parsed = decoded ? parseImportedModel(JSON.stringify(decoded)) : { errors: ['unreadable'] };
    // Spent either way: a link that does not open should not keep failing on every refresh.
    stripQuery('m');
    if (!live()) return true;
    if ('model' in parsed) {
      dispatch({ type: 'model', model: parsed.model });
      setRestoredFrom('link');
    } else {
      // Say so rather than sitting on whatever was already here and looking ignored.
      setRestoredFrom('link-failed');
    }
    return true;
  }, []);

  /* Pasted into a tab that is already open. The hash changes and nothing remounts, so the
     load-time read never happens; read it here, synchronously, before anything rewrites
     the URL. replaceState does not fire hashchange, so stripping it cannot loop. */
  useEffect(() => {
    const onHash = () => {
      const t = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('m');
      if (t) void openShared(t, () => true);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [openShared]);

  /* On the way in: a shared link wins over whatever was here last, because somebody
     followed it on purpose. Both arrive through parseImportedModel rather than being
     trusted: a link is an untrusted file that happens to be in a URL. */
  useEffect(() => {
    let live = true;
    void (async () => {
      if (SHARE_TOKEN) {
        await openShared(SHARE_TOKEN, () => live);
        if (live) setReady(true);
        return;
      }
      const saved = await store.readSession();
      if (live && saved) {
        const parsed = parseImportedModel(JSON.stringify(saved));
        if ('model' in parsed && parsed.model.id !== FIXTURE.id) {
          dispatch({ type: 'model', model: parsed.model });
          setRestoredFrom('session');
        }
      }
      if (live) setReady(true);
    })();
    return () => { live = false; };
  }, [store, openShared]);

  /* On the way out. Only once the restore has had its turn, or the first render would
     write the fixture over the very thing we are about to read back. */
  useEffect(() => {
    if (!ready) return;
    void store.writeSession(state.model.id === FIXTURE.id ? null : state.model);
  }, [ready, store, state.model]);
  const { model } = state;
  const interventions = useMemo(() => effectiveInterventions(model, state.overrides, state.interventionIds.filter(isCustomId)), [model, state.overrides, state.interventionIds]);
  const active = useMemo(() => interventions.filter((iv) => state.interventionIds.includes(iv.id)), [interventions, state.interventionIds]);
  const base = useMemo(() => run(model), [model]);
  const doNothing = useMemo(() => (state.scenarioId === baseId(model) ? base : run(model, { scenario: state.scenarioId })), [model, state.scenarioId, base]);
  /* The reader's calls, folded in here rather than in whichever view happens to be open,
     so `result` is the year they are playing wherever it is read from. `base` and
     `doNothing` stay clear of them, because they are what the year is being compared
     against. */
  const applied = useMemo(() => applyDecisions(model, state.decisions), [model, state.decisions]);
  const result = useMemo(() => {
    if (active.length === 0 && state.decisions.length === 0) return doNothing;
    /* Objects for the ones the reader toggled, ids for the ones a decision built, which
       exist on the adjusted model rather than the authored one. run() takes either. */
    return run(applied.model, {
      scenario: state.scenarioId,
      interventions: [...active, ...applied.interventionIds],
    });
  }, [applied, state.scenarioId, active, doNothing, state.decisions.length]);
  const value = useMemo<Ctx>(() => ({
    state, dispatch, model, tuned: applied.model, interventions, result, doNothing, base,
    isBase: state.scenarioId === baseId(model) && active.length === 0 && state.decisions.length === 0,
    // Any model the app ships, not just Atlas. A community health service is no more
    // "your numbers" than Atlas is.
    isFixture: SAMPLE_IDS.has(model.id),
    fmt: makeFmt(model.currency, model.locale),
    store,
    restoredFrom,
    dismissRestored: () => setRestoredFrom(null),
    teamName: (id) => model.teams.find((t) => t.id === id)?.name ?? id,
    initName: (id) => model.initiatives.find((i) => i.id === id)?.name ?? id,
  }), [state, model, applied.model, interventions, result, doNothing, base, active.length, store, restoredFrom]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Ctx {
  const c = useContext(StoreContext);
  if (!c) throw new Error('useStore outside StoreProvider');
  return c;
}

export function parseImportedModel(text: string): { model: OperatingModel } | { errors: string[] } {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch (e) { return { errors: [`Not valid JSON: ${(e as Error).message}`] }; }
  if (!parsed || typeof parsed !== 'object') return { errors: ['The file is not a JSON object.'] };
  // Files exported before the amount fields lost their currency suffix still open.
  const m = migrateModel(parsed).model as OperatingModel;
  for (const key of ['calendar', 'teams', 'demandStreams', 'hiringPlan', 'initiatives', 'dependencies', 'budget', 'pooling', 'scenarios', 'interventions', 'decisionWeights', 'seasonality'] as const) {
    if (!(key in m)) return { errors: [`Missing "${key}". Export the current model to see the expected structure.`] };
  }
  const errors = validateModel(m);
  return errors.length ? { errors } : { model: m };
}

// ── routing: one page, plus an optional panel (drawer) in the hash query ──
export type Panel =
  | { kind: 'team'; teamId: string }
  | { kind: 'initiatives' }
  | { kind: 'workforce' }
  | { kind: 'cost' }
  | { kind: 'organization' }
  | { kind: 'plan' }
  | { kind: 'about' };

export const STEPS: { id: string; label: string }[] = [
  { id: 'sec-hold', label: 'Can the plan work?' },
  { id: 'sec-whatif', label: 'What if' },
  { id: 'sec-options', label: 'What to do' },
  { id: 'sec-decide', label: 'Decide' },
];

export function parsePanel(model: OperatingModel): Panel | null {
  const q = window.location.hash.split('?')[1];
  const p = new URLSearchParams(q ?? '').get('p');
  if (!p) return null;
  const [kind, arg] = p.split(':');
  if (kind === 'team') return { kind: 'team', teamId: arg && model.teams.some((t) => t.id === arg) ? arg : model.teams[0].id };
  if (kind === 'initiatives' || kind === 'workforce' || kind === 'cost' || kind === 'organization' || kind === 'plan' || kind === 'about') return { kind };
  return null;
}

export function panelKey(p: Panel): string {
  return p.kind === 'team' ? `team:${p.teamId}` : p.kind;
}

/** Hash for opening a panel (or closing it with null) while keeping scenario and levers. */
export function panelHref(p: Panel | null): string {
  const q = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
  if (p) q.set('p', panelKey(p)); else q.delete('p');
  const s = q.toString();
  return MODEL + (s ? '?' + s : '');
}

export function usePanel(): Panel | null {
  const { model } = useStore();
  const [panel, setPanel] = useState<Panel | null>(() => parsePanel(model));
  useEffect(() => {
    const on = () => setPanel(parsePanel(model));
    on();
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, [model]);
  return panel;
}

export function openPanel(p: Panel | null): void {
  window.location.hash = panelHref(p);
}

/** Scroll to a section on the one page. */
export function scrollToSection(id: string): void {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** Legacy links keep working: #/why/x, #/options/x, #/whatif, #/decide, #/plan, #/about. */
export function migrateLegacyHash(model: OperatingModel): void {
  const h = window.location.hash.replace(/^#\/?/, '');
  const [path, q] = h.split('?');
  const [view, arg] = path.split('/');
  if (!view || view === '') return;
  const qs = new URLSearchParams(q ?? '');
  const team = arg && model.teams.some((t) => t.id === arg) ? arg : null;
  if (view === 'why') qs.set('p', arg === 'initiatives' || arg === 'workforce' || arg === 'cost' || arg === 'organization' ? arg : `team:${team ?? model.teams[0].id}`);
  else if (view === 'plan' || view === 'about') qs.set('p', view);
  else if (view === 'whatif' || view === 'options' || view === 'decide') { qs.delete('p'); setTimeout(() => scrollToSection(`sec-${view}`), 150); }
  const s = qs.toString();
  history.replaceState(null, '', MODEL + (s ? '?' + s : ''));
}

/**
 * Links. Legacy paths are accepted so every view can keep writing
 * `href('#/why/team-x')`: panels become `?p=`, sections become `?go=` which
 * App turns into a scroll (and a team selection for `#/options/<team>`).
 */
export function href(path: string): string {
  const seg = path.split('?')[0].replace(/^#\/?/, '').split('/');
  const view = seg[0] ?? '', arg = seg[1];
  const q = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
  q.delete('go'); q.delete('team');
  if (view === 'why') {
    q.set('p', arg === 'initiatives' || arg === 'workforce' || arg === 'cost' || arg === 'organization' ? arg : `team:${arg}`);
  } else if (view === 'plan' || view === 'about') {
    q.set('p', view);
  } else {
    q.delete('p');
    q.set('go', view === 'whatif' || view === 'options' || view === 'decide' ? `sec-${view}` : 'sec-hold');
    if (view === 'options' && arg) q.set('team', arg);
  }
  const s = q.toString();
  return MODEL + (s ? '?' + s : '');
}
