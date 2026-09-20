import { describe, it, expect } from 'vitest';
import { run } from '../src/engine';
import fixture from '../src/data/atlas-systems-2027.json';
import type { OperatingModel } from '../src/models/types';

const M = fixture as unknown as OperatingModel;
const clone = () => JSON.parse(JSON.stringify(M)) as OperatingModel;
const team = (r: ReturnType<typeof run>, id: string) => r.teams.find((t) => t.teamId === id)!;
const hours = (r: ReturnType<typeof run>, id: string) =>
  team(r, id).months.reduce((a, m) => a + m.runHours, 0);

/*
 * Before routes, the only thing connecting two teams was staffing the same initiative, so
 * making one team faster could never help another. These tests pin the path that fixes it,
 * and the hiring decision that turns a saved hour into saved money.
 */
describe('work routes', () => {
  it('carry upstream work downstream', () => {
    const without = clone();
    delete (without as { routes?: unknown }).routes;
    expect(hours(run(M), 'team-consumer-support'))
      .toBeGreaterThan(hours(run(without), 'team-consumer-support'));
  });

  it('shrink downstream when the upstream team is automated', () => {
    const base = run(M);
    const auto = run(M, { interventions: ['intervention-automate-consumer'] });
    // Consumer Operations is the automated team; Consumer Support and Data Platform are
    // only reachable from it through routes.
    expect(team(auto, 'team-consumer-ops').peakUtilization)
      .toBeLessThan(team(base, 'team-consumer-ops').peakUtilization);
    expect(hours(auto, 'team-consumer-support')).toBeLessThan(hours(base, 'team-consumer-support'));
    expect(hours(auto, 'team-data-platform')).toBeLessThan(hours(base, 'team-data-platform'));
  });

  it('leave unrouted teams alone, so propagation is a path and not a mood', () => {
    const base = run(M);
    const auto = run(M, { interventions: ['intervention-automate-consumer'] });
    for (const id of ['team-enterprise-sales', 'team-enterprise-support', 'team-implementation']) {
      expect(hours(auto, id)).toBeCloseTo(hours(base, id), 6);
    }
  });

  it('are re-attribution, not new work: the base plan is unchanged by wiring it up', () => {
    // The routed volume was taken out of the downstream streams rather than added on top.
    // If this drifts, the fixture has started inventing hours.
    expect(team(run(M), 'team-consumer-support').peakUtilization).toBeCloseTo(0.81, 2);
    expect(team(run(M), 'team-data-platform').peakUtilization).toBeCloseTo(0.92, 2);
  });
});

describe('conditional hiring', () => {
  it('keeps a hire the plan still needs', () => {
    // On the base plan Consumer Operations would peak at 96% without these people.
    expect(run(M).summary.hiresDropped).toHaveLength(0);
  });

  it('drops a hire once the work behind it is gone', () => {
    const auto = run(M, { interventions: ['intervention-automate-consumer'] });
    expect(auto.summary.hiresDropped).toContain('hire-consumer-ops-12');
    expect(auto.summary.hiresDroppedFte).toBe(12);
    expect(auto.summary.endingFte).toBeLessThan(run(M).summary.endingFte);
  });

  it('judges the hire against a year run without it', () => {
    // The circular version of this test passes for the wrong reason: a team that has just
    // been given twelve people looks like a team that does not need twelve people. The
    // decision has to be made on the run where they were never hired.
    const auto = run(M, { interventions: ['intervention-automate-consumer'] });
    const co = team(auto, 'team-consumer-ops');
    expect(co.months.every((m) => m.hiresLanded === 0)).toBe(true);
    expect(Math.max(...co.months.map((m) => m.utilization))).toBeGreaterThan(0.6);
  });

  it('is inert for plans that never set the policy', () => {
    const plain = clone();
    plain.hiringPlan = plain.hiringPlan.map((h) => {
      const { cancelIfSlack: _drop, ...rest } = h;
      return rest;
    });
    const r = run(plain);
    expect(r.summary.hiresDropped).toHaveLength(0);
    expect(r.summary.hiresDroppedFte).toBe(0);
  });
});
