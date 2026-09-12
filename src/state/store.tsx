import { createContext, useContext, useEffect, useMemo, useReducer, useState } from 'react';
import type { ReactNode } from 'react';
import { run, validateModel } from '../engine';
import type { OperatingModel, DecisionWeights, Intervention } from '../models/types';
import type { ModelResult } from '../models/results';
import fixture from '../data/atlas-systems-2027.json';

export const FIXTURE = fixture as unknown as OperatingModel;

/** Per-intervention parameter overrides: the one knob each type exposes. */
export type Overrides = Record<string, number>;

export interface State {
  model: OperatingModel;
  scenarioId: string;
  interventionIds: string[];
  overrides: Overrides;
  weights: DecisionWeights;
  tourStep: number | null;
}

type Action =
  | { type: 'scenario'; id: string }
  | { type: 'toggleIntervention'; id: string }
  | { type: 'setInterventions'; ids: string[] }
  | { type: 'override'; id: string; value: number }
  | { type: 'weights'; weights: DecisionWeights }
  | { type: 'model'; model: OperatingModel }
  | { type: 'editModel'; model: OperatingModel }
  | { type: 'tour'; step: number | null }
  | { type: 'reset' };

const baseId = (m: OperatingModel) => m.scenarios.find((s) => s.type === 'base')!.id;

function fresh(model: OperatingModel): State {
  return { model, scenarioId: baseId(model), interventionIds: [], overrides: {}, weights: model.decisionWeights, tourStep: null };
}

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'scenario': return { ...s, scenarioId: a.id };
    case 'toggleIntervention':
      return { ...s, interventionIds: s.interventionIds.includes(a.id) ? s.interventionIds.filter((x) => x !== a.id) : [...s.interventionIds, a.id] };
    case 'setInterventions': return { ...s, interventionIds: a.ids };
    case 'override': return { ...s, overrides: { ...s.overrides, [a.id]: a.value } };
    case 'weights': return { ...s, weights: a.weights };
    case 'model': return fresh(a.model);
    case 'editModel': return { ...s, model: a.model, scenarioId: a.model.scenarios.some((x) => x.id === s.scenarioId) ? s.scenarioId : baseId(a.model), interventionIds: s.interventionIds.filter((id) => (isCustomId(id) ? a.model.teams.some((t) => t.id === id.split(':')[0]) : a.model.interventions.some((x) => x.id === id))) };
    case 'tour': return { ...s, tourStep: a.step };
    case 'reset': return { ...fresh(s.model), tourStep: s.tourStep };
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
      return { id, name: `Hire more for ${t.name}`, type: 'hire', teamId, headcount: value ?? 10, leadTimeMonths: lead, recruitingCostPerHeadUsd: t.monthlyFteCostUsd,
        description: `Requested in month one, landing after the team's ${lead}-month lead time. Recruiting cost assumed at one month of loaded cost per hire, then their salary.` };
    }
    case 'automate': {
      const rate = (value ?? 15) / 100;
      const annualCost = t.currentFte * t.monthlyFteCostUsd * 12;
      return { id, name: `Take work out of ${t.name}`, type: 'automation', teamId, workloadReductionRate: rate, timeToImpactMonths: 2, implementationCostUsd: Math.round(annualCost * rate * 0.5),
        description: 'Automation, self-service, or standardization that removes a share of hands-on hours. Lands after two months. Cost assumed at half a year of the hours it saves.' };
    }
    case 'target': {
      const target = (value ?? Math.min(100, Math.round(t.targetUtilization * 100) + 8)) / 100;
      return { id, name: `Accept higher utilization on ${t.name}`, type: 'serviceLevelChange', teamId, newTargetUtilization: target,
        description: 'Run hotter on purpose. The work does not change; the service level absorbs the difference. Scores like doing nothing in comparisons.' };
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
  model: OperatingModel;
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
  teamName: (id: string) => string;
  initName: (id: string) => string;
}

const StoreContext = createContext<Ctx | null>(null);

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

function writeQuery(s: State): void {
  const [path, cur] = window.location.hash.split('?');
  const curP = new URLSearchParams(cur ?? '');
  const p = new URLSearchParams();
  if (curP.get('theme')) p.set('theme', curP.get('theme')!);
  if (s.scenarioId !== baseId(s.model)) p.set('s', s.scenarioId);
  if (s.interventionIds.length) p.set('i', s.interventionIds.map((id) => (s.overrides[id] !== undefined ? `${id}:${s.overrides[id]}` : id)).join(','));
  const q = p.toString();
  const next = (path || '#/overview') + (q ? '?' + q : '');
  if (next !== window.location.hash) history.replaceState(null, '', next);
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, FIXTURE, (m) => ({ ...fresh(m), ...readQuery(m) }));
  useEffect(() => { writeQuery(state); }, [state]);
  const { model } = state;
  const interventions = useMemo(() => effectiveInterventions(model, state.overrides, state.interventionIds.filter(isCustomId)), [model, state.overrides, state.interventionIds]);
  const active = useMemo(() => interventions.filter((iv) => state.interventionIds.includes(iv.id)), [interventions, state.interventionIds]);
  const base = useMemo(() => run(model), [model]);
  const doNothing = useMemo(() => (state.scenarioId === baseId(model) ? base : run(model, { scenario: state.scenarioId })), [model, state.scenarioId, base]);
  const result = useMemo(() => (active.length === 0 ? doNothing : run(model, { scenario: state.scenarioId, interventions: active })), [model, state.scenarioId, active, doNothing]);
  const value = useMemo<Ctx>(() => ({
    state, dispatch, model, interventions, result, doNothing, base,
    isBase: state.scenarioId === baseId(model) && active.length === 0,
    isFixture: model.id === FIXTURE.id,
    teamName: (id) => model.teams.find((t) => t.id === id)?.name ?? id,
    initName: (id) => model.initiatives.find((i) => i.id === id)?.name ?? id,
  }), [state, model, interventions, result, doNothing, base, active.length]);
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
  const m = parsed as OperatingModel;
  for (const key of ['calendar', 'teams', 'demandStreams', 'hiringPlan', 'initiatives', 'dependencies', 'budget', 'pooling', 'scenarios', 'interventions', 'decisionWeights', 'seasonality'] as const) {
    if (!(key in m)) return { errors: [`Missing "${key}". Export the current model to see the expected structure.`] };
  }
  const errors = validateModel(m);
  return errors.length ? { errors } : { model: m };
}

// ── routing ────────────────────────────────────────────────────────────────
export type Route = { view: 'overview' } | { view: 'capacity'; teamId: string } | { view: 'scenarios' } | { view: 'model' };

function parseHash(model: OperatingModel): Route {
  const h = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  const [view, arg] = h.split('/');
  if (view === 'capacity') return { view: 'capacity', teamId: arg && model.teams.some((t) => t.id === arg) ? arg : model.teams[0].id };
  if (view === 'scenarios') return { view: 'scenarios' };
  if (view === 'model') return { view: 'model' };
  return { view: 'overview' };
}

export function useRoute(): Route {
  const { model } = useStore();
  const [route, setRoute] = useState<Route>(() => parseHash(model));
  useEffect(() => {
    const on = () => setRoute(parseHash(model));
    on();
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, [model]);
  return route;
}

export function href(path: string): string {
  const q = window.location.hash.split('?')[1];
  return path + (q ? '?' + q : '');
}
