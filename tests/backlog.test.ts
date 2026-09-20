import { describe, it, expect } from 'vitest';
import { run } from '../src/engine';
import fixture from '../src/data/atlas-systems-2027.json';
import type { OperatingModel } from '../src/models/types';

const M = fixture as unknown as OperatingModel;
const clone = (f: (m: OperatingModel) => void) => {
  const c = JSON.parse(JSON.stringify(M)) as OperatingModel;
  f(c);
  return c;
};
/** The model as it was before any of this: overflow simply evaporated. */
const noPolicy = clone((c) => c.teams.forEach((t) => { delete t.backlog; }));
const allMonths = (r: ReturnType<typeof run>) => r.teams.flatMap((t) => t.months);

/*
 * A month of work that nobody got to has to go somewhere. Before this, it went nowhere:
 * a team at 130% did 100% and the remaining 30% ceased to exist, so next month started
 * clean and the year never showed the cost of being short. Now it either waits or it is
 * shed, and shedding is its own decision rather than an accident of the arithmetic.
 */
describe('nothing appears or disappears', () => {
  it('balances every team, every month, every scenario', () => {
    for (const sc of [undefined, ...M.scenarios.map((s) => s.id)]) {
      for (const m of allMonths(run(M, sc ? { scenario: sc } : {}))) {
        const done = Math.min(m.workloadHours, m.availableProductiveHours);
        expect(done + m.carriedOutHours + m.shedHours).toBeCloseTo(m.workloadHours, 6);
      }
    }
  });

  it('hands each month\'s leftovers to the next one', () => {
    for (const t of run(M, { scenario: 'scenario-demand-shock' }).teams) {
      expect(t.months[0].carriedInHours).toBe(0);
      for (let i = 1; i < t.months.length; i++) {
        expect(t.months[i].carriedInHours).toBeCloseTo(t.months[i - 1].carriedOutHours, 6);
      }
    }
  });

  it('counts the work that was waiting as work, not as a footnote', () => {
    // If carried work did not land in workloadHours it would not raise utilisation, and
    // the whole mechanism would be a number on a page with no consequence attached.
    const shock = run(M, { scenario: 'scenario-demand-shock' });
    const withCarry = allMonths(shock).filter((m) => m.carriedInHours > 0);
    expect(withCarry.length).toBeGreaterThan(0);
    for (const m of withCarry) expect(m.workloadHours).toBeGreaterThan(m.runHours + m.portfolioHours - 1e-6);
  });
});

describe('a model that never sets a policy is untouched', () => {
  it('matches the old behaviour exactly on the base plan', () => {
    const a = run(noPolicy), b = run(M);
    expect(b.summary.revenueExposureUsd).toBeCloseTo(a.summary.revenueExposureUsd, 6);
    expect(b.summary.peopleLostToAttrition).toBeCloseTo(a.summary.peopleLostToAttrition, 6);
    expect(b.summary.closingBacklogHours).toBeCloseTo(0, 6);
  });

  it('sheds everything it cannot reach, and carries none of it', () => {
    for (const m of allMonths(run(noPolicy, { scenario: 'scenario-demand-shock' }))) {
      expect(m.carriedOutHours).toBe(0);
      expect(m.shedHours).toBeCloseTo(m.unservedHours, 6);
    }
  });
});

/*
 * The part worth testing rather than asserting. Backlog is a reinforcing loop on its own
 * (short -> queue -> shorter next month) and burnout is another (strain -> attrition ->
 * strain). Together they are the classic death spiral, and a model that runs one of these
 * without a ceiling ends the year with an empty company and a straight face.
 */
describe('the double loop converges', () => {
  it('never lets a queue exceed one month of capacity, in any scenario', () => {
    for (const sc of M.scenarios) {
      for (const m of allMonths(run(M, { scenario: sc.id }))) {
        expect(Number.isFinite(m.carriedInHours)).toBe(true);
        expect(m.carriedInHours).toBeGreaterThanOrEqual(0);
        expect(m.carriedInHours).toBeLessThanOrEqual(m.availableProductiveHours + 1e-6);
      }
    }
  });

  it('keeps people and headcount finite and positive everywhere', () => {
    for (const sc of M.scenarios) {
      const r = run(M, { scenario: sc.id });
      for (const m of allMonths(r)) {
        expect(Number.isFinite(m.availableFte)).toBe(true);
        expect(m.availableFte).toBeGreaterThanOrEqual(0);
      }
      expect(r.summary.retentionRate).toBeGreaterThan(0);
      expect(r.summary.retentionRate).toBeLessThanOrEqual(1);
    }
  });

  it('costs people when stacked on burnout, but a bounded number of them', () => {
    // Both loops on, against burnout alone. The queue makes the bad months worse and so
    // costs more people; if that difference were not small and finite the loop diverges.
    const burnoutOnly = clone((c) => c.teams.forEach((t) => { delete t.backlog; }));
    const shock = { scenario: 'scenario-demand-shock' };
    const extra = run(M, shock).summary.peopleLostToAttrition
      - run(burnoutOnly, shock).summary.peopleLostToAttrition;
    expect(extra).toBeGreaterThanOrEqual(0);
    expect(extra).toBeLessThan(25);
  });

  it('does not compound when the year is calm', () => {
    for (const sc of ['scenario-productivity-15', 'scenario-downturn', 'scenario-budget-cut']) {
      expect(run(M, { scenario: sc }).summary.closingBacklogHours).toBeCloseTo(0, 6);
    }
  });
});

describe('it is quiet until it is not', () => {
  it('leaves the base plan alone', () => {
    expect(run(M).summary.closingBacklogHours).toBeCloseTo(0, 6);
    expect(run(M).summary.shedHours).toBeCloseTo(0, 6);
  });

  it('shows up under a demand shock', () => {
    const s = run(M, { scenario: 'scenario-demand-shock' }).summary;
    expect(s.shedHours).toBeGreaterThan(1000);
    expect(s.closingBacklogHours).toBeGreaterThan(0);
  });
});

/*
 * Declining work is a lever, not a failure. A team that refuses what it cannot reach has
 * calmer months afterwards and less of the year's work done: that trade is the point.
 */
describe('turning work away is a decision with two sides', () => {
  const shock = { scenario: 'scenario-demand-shock' };
  const holds = run(clone((c) => c.teams.forEach((t) => { t.backlog = { carryForward: 0.95 }; })), shock);
  const turns = run(clone((c) => c.teams.forEach((t) => { t.backlog = { carryForward: 0.2 }; })), shock);

  it('sheds more work when it holds less', () => {
    expect(turns.summary.shedHours).toBeGreaterThan(holds.summary.shedHours);
  });

  it('ends the year with a smaller queue for it', () => {
    expect(turns.summary.closingBacklogHours).toBeLessThan(holds.summary.closingBacklogHours);
  });

  it('and puts its people under less strain', () => {
    const over = (r: ReturnType<typeof run>) =>
      allMonths(r).filter((m) => m.utilization > m.targetUtilization).length;
    expect(over(turns)).toBeLessThanOrEqual(over(holds));
  });
});
