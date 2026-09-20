import { describe, it, expect } from 'vitest';
import { run, serviceLevel } from '../src/engine';
import fixture from '../src/data/atlas-systems-2027.json';
import type { OperatingModel } from '../src/models/types';

const M = fixture as unknown as OperatingModel;
const base = run(M);
const team = (r: ReturnType<typeof run>, id: string) => r.teams.find((t) => t.teamId === id)!;

/*
 * Service level, by Erlang C, on the work that actually queues.
 *
 * The reason this is worth having and not just another reading of utilisation: pooling.
 * The same 85% is comfortable on a large team and a crisis on a small one, because a
 * small team has no variance to absorb. And queues do not degrade in a line. They hold,
 * and then they fall over.
 */
describe('it is not utilisation with another name', () => {
  it('rewards size at identical utilisation', () => {
    const at85 = (n: number) => serviceLevel(n, n * 0.85, 1560, 120);
    expect(at85(10)).toBeLessThan(0.6);
    expect(at85(150)).toBeGreaterThan(0.99);
    // and it is monotonic in size, which is the property the whole thing rests on
    const sizes = [10, 25, 50, 100, 150, 300].map(at85);
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeGreaterThan(sizes[i - 1]);
  });
});

describe('only work that queues gets a number', () => {
  it('scores the queue teams', () => {
    for (const id of ['team-consumer-ops', 'team-consumer-support', 'team-enterprise-support', 'team-customer-ops']) {
      expect(team(base, id).months.every((m) => m.serviceLevel !== null)).toBe(true);
    }
  });

  it('leaves project work alone rather than inventing a figure for it', () => {
    // Implementation runs at 7,900 minutes a unit. "Answered within two minutes" is not a
    // thing anybody measures about it, and Erlang C would have returned 25% and meant nothing.
    for (const id of ['team-implementation', 'team-platform-engineering', 'team-data-platform', 'team-enterprise-sales']) {
      expect(team(base, id).months.every((m) => m.serviceLevel === null)).toBe(true);
    }
  });

  it('is absent from the summary for a model with no queueing work', () => {
    const noQueues = JSON.parse(JSON.stringify(M)) as OperatingModel;
    noQueues.demandStreams.forEach((s) => { delete s.answerWithinSeconds; });
    expect(run(noQueues).summary.serviceLevelPct).toBeNull();
    expect(run(noQueues).summary.worstServiceMonth).toBeNull();
  });
});

describe('queues hold and then fall over', () => {
  it('is comfortable on the base plan', () => {
    expect(base.summary.serviceLevelPct!).toBeGreaterThan(0.98);
  });

  it('collapses under a demand shock, far faster than utilisation moves', () => {
    const shock = run(M, { scenario: 'scenario-demand-shock' });
    expect(shock.summary.serviceLevelPct!).toBeLessThan(0.6);
    // The cliff: some month is unreachable, not merely slow.
    expect(shock.summary.worstServiceLevel!).toBeLessThan(0.05);
  });

  it('degrades when you stop hiring, with no change in demand at all', () => {
    // Nothing arrives differently under a freeze. The queue gets worse anyway, because the
    // people answering it leave and are not replaced. Not hiring is a service decision and
    // this is where it shows up.
    const freeze = run(M, { scenario: 'scenario-hiring-freeze' });
    expect(freeze.summary.serviceLevelPct!).toBeLessThan(base.summary.serviceLevelPct!);
    expect(freeze.summary.worstServiceLevel!).toBeLessThan(0.7);
  });

  it('degrades when people leave faster, for the same reason', () => {
    const churn = run(M, { scenario: 'scenario-attrition-shock' });
    expect(churn.summary.worstServiceLevel!).toBeLessThan(0.8);
  });

  it('is fine in a downturn, because demand fell', () => {
    expect(run(M, { scenario: 'scenario-downturn' }).summary.serviceLevelPct!).toBeGreaterThan(0.99);
  });

  it('keeps the worst month rather than letting an average hide it', () => {
    const shock = run(M, { scenario: 'scenario-demand-shock' });
    expect(shock.summary.worstServiceLevel!).toBeLessThan(shock.summary.serviceLevelPct!);
    expect(shock.summary.worstServiceMonth).toBeTruthy();
  });
});
