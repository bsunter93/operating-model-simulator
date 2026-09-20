import { describe, it, expect } from 'vitest';
import { run } from '../src/engine';
import fixture from '../src/data/atlas-systems-2027.json';
import type { OperatingModel } from '../src/models/types';

const M = fixture as unknown as OperatingModel;
const base = run(M);
const ini = (r: ReturnType<typeof run>, id: string) => r.initiatives.find((i) => i.initiativeId === id)!;
const spend = (r: ReturnType<typeof run>) => r.financials.monthly.reduce((a, m) => a + m.changeCost, 0);
const hours = (r: ReturnType<typeof run>, id: string) =>
  r.teams.find((t) => t.teamId === id)!.months.reduce((a, m) => a + m.portfolioHours, 0);

/*
 * Cost, scope and time: the three things any plan trades between. The model used to
 * have one of them. Cost moved across eight values, scope across two and time across
 * two, so a position inside that triangle would have slid along one edge and called
 * itself a decision. These pin all three as real axes.
 */
describe('restaff trades time against people', () => {
  const longer = run(M, { interventions: ['intervention-stretch-platform'] });
  const crash = run(M, { interventions: ['intervention-crash-enterprise'] });

  it('running leaner makes it finish later', () => {
    expect(ini(longer, 'init-platform-scale').completion)
      .not.toBe(ini(base, 'init-platform-scale').completion);
    expect(ini(longer, 'init-platform-scale').completion! > ini(base, 'init-platform-scale').completion!).toBe(true);
  });

  it('running leaner gives the team its hours back', () => {
    expect(hours(longer, 'team-platform-engineering')).toBeLessThan(hours(base, 'team-platform-engineering'));
  });

  it('crashing it costs money', () => {
    expect(spend(crash)).toBeGreaterThan(spend(base));
  });

  it('is what gives the model a time axis at all', () => {
    const seen = new Set<string>();
    for (const combo of [[], ['intervention-stretch-platform'], ['intervention-crash-enterprise'],
                         ['intervention-stretch-platform', 'intervention-crash-enterprise']]) {
      seen.add(run(M, { interventions: combo }).initiatives.map((i) => i.completion).join('|'));
    }
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });
});

describe('rescope trades scope against effort', () => {
  const half = run(M, { interventions: ['intervention-half-portal'] });

  it('delivers less of what the portfolio was worth', () => {
    expect(half.summary.portfolioValue).toBeLessThan(base.summary.portfolioValue);
  });

  it('takes fewer people to build, without cancelling it', () => {
    expect(hours(half, 'team-consumer-ops')).toBeLessThan(hours(base, 'team-consumer-ops'));
    expect(ini(half, 'init-self-service').status).not.toBe('cancelled');
  });

  it('is not the same move as cancelling', () => {
    const killed = run(M, { interventions: ['intervention-cancel-self-service'] });
    expect(half.summary.portfolioValue).toBeGreaterThan(killed.summary.portfolioValue);
  });
});

describe('the three vertices all have range', () => {
  // A guard, not a measurement. If any of these collapses toward one, a position inside
  // the triangle has stopped meaning anything and the visual is lying.
  const ivs = M.interventions.map((i) => i.id);
  const cost = new Set<number>(), scope = new Set<number>(), time = new Set<string>();
  for (let mask = 0; mask < (1 << ivs.length); mask++) {
    const pick = ivs.filter((_, k) => mask & (1 << k));
    const r = run(M, { interventions: pick });
    cost.add(Math.round(spend(r) / 1e4));
    scope.add(Math.round(r.summary.portfolioValue / 1e5));
    time.add(r.initiatives.map((i) => i.completion).join('|'));
  }
  it('cost', () => expect(cost.size).toBeGreaterThanOrEqual(8));
  it('scope', () => expect(scope.size).toBeGreaterThanOrEqual(6));
  it('time', () => expect(time.size).toBeGreaterThanOrEqual(6));
});
