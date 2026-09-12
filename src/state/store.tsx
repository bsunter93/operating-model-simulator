import { createContext, useContext, useEffect, useMemo, useReducer, useState } from 'react';
import type { ReactNode } from 'react';
import { run } from '../engine';
import type { OperatingModel, DecisionWeights } from '../models/types';
import type { ModelResult } from '../models/results';
import fixture from '../data/atlas-systems-2027.json';

export const model = fixture as unknown as OperatingModel;
const BASE_SCENARIO = model.scenarios.find((s) => s.type === 'base')!.id;

export interface State {
  scenarioId: string;
  interventionIds: string[];
  weights: DecisionWeights;
}

type Action =
  | { type: 'scenario'; id: string }
  | { type: 'toggleIntervention'; id: string }
  | { type: 'setInterventions'; ids: string[] }
  | { type: 'weights'; weights: DecisionWeights }
  | { type: 'reset' };

const initial: State = { scenarioId: BASE_SCENARIO, interventionIds: [], weights: model.decisionWeights };

function readQuery(): Partial<State> {
  const q = window.location.hash.split('?')[1];
  if (!q) return {};
  const p = new URLSearchParams(q);
  const out: Partial<State> = {};
  const s = p.get('s');
  if (s && model.scenarios.some((x) => x.id === s)) out.scenarioId = s;
  const i = p.get('i');
  if (i) out.interventionIds = i.split(',').filter((x) => model.interventions.some((y) => y.id === x));
  return out;
}

function writeQuery(s: State): void {
  const [path] = window.location.hash.split('?');
  const cur = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
  const p = new URLSearchParams();
  if (cur.get('theme')) p.set('theme', cur.get('theme')!);
  if (s.scenarioId !== BASE_SCENARIO) p.set('s', s.scenarioId);
  if (s.interventionIds.length) p.set('i', s.interventionIds.join(','));
  const q = p.toString();
  const next = (path || '#/overview') + (q ? '?' + q : '');
  if (next !== window.location.hash) history.replaceState(null, '', next);
}

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'scenario': return { ...s, scenarioId: a.id };
    case 'toggleIntervention':
      return { ...s, interventionIds: s.interventionIds.includes(a.id) ? s.interventionIds.filter((x) => x !== a.id) : [...s.interventionIds, a.id] };
    case 'setInterventions': return { ...s, interventionIds: a.ids };
    case 'weights': return { ...s, weights: a.weights };
    case 'reset': return initial;
  }
}

interface Ctx {
  state: State;
  dispatch: (a: Action) => void;
  /** Current scenario with the active interventions applied. */
  result: ModelResult;
  /** Current scenario, no interventions. */
  doNothing: ModelResult;
  /** Base plan, no interventions. */
  base: ModelResult;
  isBase: boolean;
}

const StoreContext = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial, (i) => ({ ...i, ...readQuery() }));
  useEffect(() => { writeQuery(state); }, [state]);
  const base = useMemo(() => run(model), []);
  const doNothing = useMemo(() => (state.scenarioId === BASE_SCENARIO ? base : run(model, { scenario: state.scenarioId })), [state.scenarioId, base]);
  const result = useMemo(
    () => (state.interventionIds.length === 0 ? doNothing : run(model, { scenario: state.scenarioId, interventions: state.interventionIds })),
    [state.scenarioId, state.interventionIds, doNothing],
  );
  const isBase = state.scenarioId === BASE_SCENARIO && state.interventionIds.length === 0;
  const value = useMemo(() => ({ state, dispatch, result, doNothing, base, isBase }), [state, result, doNothing, base, isBase]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Ctx {
  const c = useContext(StoreContext);
  if (!c) throw new Error('useStore outside StoreProvider');
  return c;
}

export type Route = { view: 'overview' } | { view: 'capacity'; teamId: string };

function parseHash(): Route {
  const h = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  const [view, arg] = h.split('/');
  if (view === 'capacity') return { view: 'capacity', teamId: arg && model.teams.some((t) => t.id === arg) ? arg : 'team-implementation' };
  return { view: 'overview' };
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(parseHash);
  useEffect(() => {
    const on = () => setRoute(parseHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function href(r: Route): string {
  const q = window.location.hash.split('?')[1];
  return (r.view === 'overview' ? '#/overview' : `#/capacity/${r.teamId}`) + (q ? '?' + q : '');
}

export const teamName = (id: string) => model.teams.find((t) => t.id === id)?.name ?? id;
