import { describe, it, expect } from 'vitest';
import { run } from '../src/engine';
import fixture from '../src/data/atlas-systems-2027.json';
import type { OperatingModel } from '../src/models/types';
import { DECISIONS, RUN_SCENARIO, triangleOf } from '../src/views/Run';

const M = fixture as unknown as OperatingModel;
const year = (ivs: string[] = []) => run(M, { scenario: RUN_SCENARIO, interventions: ivs });
const flat = (ivs: string[] = []) => run(M, { interventions: ivs });

/** Every ending the five decisions can reach, as the run itself walks them. */
const paths = (() => {
  const out: string[][] = [];
  const walk = (i: number, picked: string[]) => {
    if (i === DECISIONS.length) { out.push(picked); return; }
    for (const o of DECISIONS[i].options) walk(i + 1, o.iv && !picked.includes(o.iv) ? [...picked, o.iv] : picked);
  };
  walk(0, []);
  return out;
})();
const spread = (f: (r: ReturnType<typeof run>) => number, g = year) => {
  const v = paths.map((p) => f(g(p)));
  return Math.max(...v) - Math.min(...v);
};

/*
 * The run is played on a year with a demand spike in it, and that is not decoration.
 * On the flat plan the two measures a reader cares about most were constants: service
 * level sat in a third of a point across all 243 endings and nothing was ever left
 * undone, so three of the five decisions could not be judged by their results at all.
 */
describe('the run year is the one the decisions can be judged on', () => {
  it('names a scenario the model actually has', () => {
    expect(M.scenarios.some((s) => s.id === RUN_SCENARIO)).toBe(true);
  });

  it('offers only interventions the model defines', () => {
    for (const d of DECISIONS) for (const o of d.options) {
      if (o.iv) expect(M.interventions.some((i) => i.id === o.iv)).toBe(true);
    }
  });

  it('makes the customer answer something a decision can move', () => {
    // Flat year: under a point of spread, which is a dial painted on the dashboard.
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
 * The triangle is drawn against a fixed calibration. If the reachable spread ever stops
 * filling it, positions clamp at a corner and the picture quietly starts lying, which is
 * the one failure mode of this visual that a reader cannot see.
 */
describe('all three vertices still have their range on the run year', () => {
  const tri = paths.map((p) => triangleOf(year(p)));
  const spans = (axis: 'cost' | 'scope' | 'time') => {
    const v = tri.map((t) => t[axis]);
    expect(Math.min(...v)).toBeLessThan(0.08);
    expect(Math.max(...v)).toBeGreaterThan(0.92);
  };
  it('cost', () => spans('cost'));
  it('scope', () => spans('scope'));
  it('time', () => spans('time'));

  it('puts doing nothing at dead centre, which is the honest reading of it', () => {
    const t = triangleOf(year());
    expect(t.cost).toBeCloseTo(1, 6);
    expect(t.scope).toBeCloseTo(1, 6);
    expect(t.time).toBeCloseTo(1, 6);
  });
});

describe('the claims the write-up makes about this year', () => {
  it('lands most of the undone work on a single team', () => {
    const r = year();
    const byTeam = r.teams
      .map((t) => t.months.reduce((a, m) => a + m.shedHours, 0))
      .sort((a, b) => b - a);
    expect(byTeam[0] / r.summary.shedHours).toBeGreaterThan(0.5);
  });

  it('is moved most by the lever aimed at that team, not by the one that adds people', () => {
    const nothing = year().summary;
    const automate = year(['intervention-automate-consumer']).summary;
    const hire = year(['intervention-expedite-implementation']).summary;
    expect(automate.shedHours).toBeLessThan(hire.shedHours);
    expect(automate.serviceLevelPct!).toBeGreaterThan(nothing.serviceLevelPct! + 0.2);
    // The hiring lever helps a team the spike did not land on, so the queue is unmoved.
    expect(Math.abs(hire.serviceLevelPct! - nothing.serviceLevelPct!)).toBeLessThan(0.02);
  });

  it('still has a lever that does nothing at all, which is its own lesson', () => {
    expect(year(['intervention-defer-international']).summary.revenueExposureUsd)
      .toBeCloseTo(year().summary.revenueExposureUsd, 6);
  });
});
