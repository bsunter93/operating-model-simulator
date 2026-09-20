import { describe, it, expect } from 'vitest';
import { run } from '../src/engine';
import { validateModel } from '../src/engine/validate';
import fixture from '../src/data/atlas-systems-2027.json';
import type { OperatingModel, RunSpec } from '../src/models/types';
import { allEndings, calibrate, runWith, triangleOf } from '../src/views/Run';

const M = fixture as unknown as OperatingModel;
const SPEC = M.run as RunSpec;
const clone = (f: (m: OperatingModel) => void) => {
  const c = JSON.parse(JSON.stringify(M)) as OperatingModel;
  f(c);
  return c;
};
const flat: RunSpec = { ...SPEC, scenarioId: undefined };
const endings = allEndings(M, SPEC);
const spread = (f: (r: ReturnType<typeof run>) => number, spec = SPEC) => {
  const v = allEndings(M, spec).map(f);
  return Math.max(...v) - Math.min(...v);
};

/*
 * The run is data on the model, not a table written into a React component. It used to be
 * the latter, which meant the demo existed only for the one set of numbers it was typed
 * against: nine intervention ids, two team ids and a scenario, all hardcoded in the view.
 */
describe('the run is part of the model', () => {
  it('is carried by the fixture and validates with it', () => {
    expect(SPEC.decisions.length).toBeGreaterThan(0);
    expect(validateModel(M)).toEqual([]);
  });

  it('is optional: a model without one is still a valid model', () => {
    expect(validateModel(clone((c) => { delete c.run; }))).toEqual([]);
  });

  it('refuses a choice that points at an intervention the model has not got', () => {
    const bad = clone((c) => { c.run!.decisions[0].options[0].interventionId = 'intervention-nope'; });
    expect(validateModel(bad).join(' ')).toMatch(/unknown intervention/);
  });

  it('refuses a decision with no do-nothing option, which is always a real answer', () => {
    const bad = clone((c) => {
      c.run!.decisions[0].options = c.run!.decisions[0].options.filter((o) => o.interventionId !== null);
    });
    expect(validateModel(bad).join(' ')).toMatch(/do-nothing/);
  });

  it('refuses a decision landing outside the plan year', () => {
    const bad = clone((c) => { c.run!.decisions[0].monthIndex = 99; });
    expect(validateModel(bad).join(' ')).toMatch(/outside the plan year/);
  });

  it('refuses a focus team the model has not got', () => {
    const bad = clone((c) => { c.run!.decisions[0].focusTeamId = 'team-nope'; });
    expect(validateModel(bad).join(' ')).toMatch(/unknown team/);
  });
});

/*
 * The year it is played on is not decoration. On the flat plan the two measures a reader
 * cares about most were constants: service level sat inside a third of a point across
 * every ending and nothing was ever left undone, so most of the decisions could not be
 * judged by their results at all.
 */
describe('the run year is the one the decisions can be judged on', () => {
  it('makes the customer answer something a decision can move', () => {
    expect(spread((r) => (r.summary.serviceLevelPct ?? 1) * 100, flat)).toBeLessThan(1);
    expect(spread((r) => (r.summary.serviceLevelPct ?? 1) * 100)).toBeGreaterThan(20);
  });

  it('makes undone work something a decision can move', () => {
    expect(spread((r) => r.summary.shedHours, flat)).toBe(0);
    expect(spread((r) => r.summary.shedHours)).toBeGreaterThan(5000);
  });

  it('widens what is at stake rather than flattening it', () => {
    expect(spread((r) => r.summary.revenueExposureUsd))
      .toBeGreaterThan(spread((r) => r.summary.revenueExposureUsd, flat));
  });
});

/*
 * The triangle is measured against the endings rather than against four numbers typed in
 * by hand. Hand calibration was right for exactly one fixture: on anything else positions
 * clamped at a corner, which is the one failure of this visual a reader cannot see.
 */
describe('the triangle calibrates itself', () => {
  const cal = calibrate(endings);
  const tri = endings.map((r) => triangleOf(r, cal));
  const spans = (axis: 'cost' | 'scope' | 'time') => {
    const v = tri.map((t) => t[axis]);
    expect(Math.min(...v)).toBeCloseTo(0, 6);
    expect(Math.max(...v)).toBeCloseTo(1, 6);
  };
  it('fills the cost axis exactly', () => spans('cost'));
  it('fills the scope axis exactly', () => spans('scope'));
  it('fills the time axis exactly', () => spans('time'));

  it('never puts a position outside the triangle', () => {
    for (const t of tri) {
      for (const v of [t.cost, t.scope, t.time, t.x, t.y]) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('scores an axis nothing trades away as kept, rather than dividing by zero', () => {
    const one = [endings[0]];
    const t = triangleOf(endings[0], calibrate(one));
    expect(t.cost).toBe(1);
    expect(t.scope).toBe(1);
    expect(t.time).toBe(1);
  });

  it('puts leaving the plan alone at dead centre, which is the honest reading of it', () => {
    const t = triangleOf(runWith(M, SPEC), cal);
    expect(t.cost).toBeCloseTo(1, 6);
    expect(t.scope).toBeCloseTo(1, 6);
    expect(t.time).toBeCloseTo(1, 6);
  });
});

describe('the claims the write-up makes about this year', () => {
  it('lands most of the undone work on a single team', () => {
    const r = runWith(M, SPEC);
    const byTeam = r.teams
      .map((t) => t.months.reduce((a, m) => a + m.shedHours, 0))
      .sort((a, b) => b - a);
    expect(byTeam[0] / r.summary.shedHours).toBeGreaterThan(0.5);
  });

  it('is moved most by the lever aimed at that team, not by the one that adds people', () => {
    const ivs = SPEC.decisions.flatMap((d) => d.options.map((o) => o.interventionId)).filter((x): x is string => !!x);
    const byType = (...ts: string[]) =>
      ivs.find((iv) => ts.includes(M.interventions.find((x) => x.id === iv)!.type));
    const automate = byType('automation')!;
    const hire = byType('expediteHiring', 'hire')!;
    const nothing = runWith(M, SPEC).summary;
    const a = runWith(M, SPEC, [automate]).summary;
    const h = runWith(M, SPEC, [hire]).summary;
    expect(a.shedHours).toBeLessThan(h.shedHours);
    expect(a.serviceLevelPct!).toBeGreaterThan(nothing.serviceLevelPct! + 0.2);
    // The hiring lever helps a team the pressure did not land on, so the queue is unmoved.
    expect(Math.abs(h.serviceLevelPct! - nothing.serviceLevelPct!)).toBeLessThan(0.02);
  });

  it('still has a lever that does nothing at all, which is its own lesson', () => {
    const base = runWith(M, SPEC).summary.revenueExposureUsd;
    const inert = SPEC.decisions
      .flatMap((d) => d.options.map((o) => o.interventionId))
      .filter((x): x is string => !!x)
      .filter((iv) => Math.abs(runWith(M, SPEC, [iv]).summary.revenueExposureUsd - base) < 1);
    expect(inert.length).toBeGreaterThan(0);
  });
});
