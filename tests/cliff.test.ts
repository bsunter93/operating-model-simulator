import { describe, it, expect } from 'vitest';
import { run } from '../src/engine';
import atlas from '../src/data/atlas-systems-2027.json';
import type { OperatingModel } from '../src/models/types';

const M = atlas as unknown as OperatingModel;
const withDemand = (k: number): OperatingModel => ({
  ...M, demandStreams: M.demandStreams.map((s) => ({ ...s, annualVolume: Math.round(s.annualVolume * k) })),
});
const withPeople = (k: number): OperatingModel => ({
  ...M, teams: M.teams.map((t) => ({ ...t, currentFte: Math.max(1, Math.round(t.currentFte * k)) })),
});
const worstMonth = (m: OperatingModel) => {
  let w = 1;
  for (const t of run(m).teams) for (const x of t.months) if (x.serviceLevel !== null) w = Math.min(w, x.serviceLevel);
  return w;
};

/*
 * The sandbox exists to let somebody feel this, so it had better be true. Queues hold and
 * then they fall over, and the distance between those two states is far smaller than any
 * plan assumes. These pin the claims the sandbox's presets make in words.
 */
describe('queues hold, and then they do not', () => {
  it('is comfortable on the plan as written', () => {
    expect(worstMonth(M)).toBeGreaterThan(0.9);
  });

  it('falls off a cliff on a tenth more work, which is not a crisis', () => {
    expect(worstMonth(withDemand(1.1))).toBeLessThan(0.5);
  });

  it('falls further than the work rose, which is the whole point', () => {
    // Ten percent more work, seventy-odd points of answer rate. Nothing linear here.
    const drop = worstMonth(M) - worstMonth(withDemand(1.1));
    expect(drop).toBeGreaterThan(0.4);
  });

  it('does the same when people leave instead of work arriving', () => {
    expect(worstMonth(withPeople(0.9))).toBeLessThan(0.5);
  });

  it('hides inside an annual average, which is how it gets through a review', () => {
    // The year reads fine while a month inside it is on the floor.
    const r = run(withDemand(1.1));
    expect(r.summary.serviceLevelPct!).toBeGreaterThan(0.85);
    expect(worstMonth(withDemand(1.1))).toBeLessThan(0.5);
  });
});

/*
 * And the opposite lesson, which is the one an executive is likelier to need: raising the
 * target does not add capacity. It moves the line, so teams stop counting as over while
 * doing exactly what they were doing.
 */
describe('raising the target changes the dashboard, not the work', () => {
  const hotter: OperatingModel = {
    ...M, teams: M.teams.map((t) => ({ ...t, targetUtilization: Math.min(0.99, t.targetUtilization * 1.2) })),
  };

  it('empties the over-capacity count', () => {
    expect(run(hotter).summary.teamsConstrained).toBeLessThan(run(M).summary.teamsConstrained);
  });

  it('while the work done does not move', () => {
    const a = run(M), b = run(hotter);
    expect(b.summary.shedHours).toBeCloseTo(a.summary.shedHours, 0);
    expect(b.summary.serviceLevelPct!).toBeCloseTo(a.summary.serviceLevelPct!, 1);
  });
});
