import { describe, it, expect } from 'vitest';
import { run } from '../src/engine';
import { bindingConstraints } from '../src/lib/constraint';
import atlas from '../src/data/atlas-systems-2027.json';
import agency from '../src/data/northgate-studio-2027.json';
import type { OperatingModel } from '../src/models/types';

const A = atlas as unknown as OperatingModel;
const G = agency as unknown as OperatingModel;
const bind = (M: OperatingModel, ivs: string[] = []) =>
  bindingConstraints(M, M.run!, ivs, run(M, { scenario: M.run!.scenarioId, interventions: ivs }));

/*
 * Goldratt's point, tested rather than repeated: capacity added anywhere but the
 * constraint buys nothing. The tempting shortcut is to answer from utilisation and name
 * whichever team is reddest. On this model that is the wrong team, which is exactly why
 * the answer is measured by running the year again instead.
 */
describe('the constraint is measured, not guessed from utilisation', () => {
  it('does not name the busiest team as the one the queue turns on', () => {
    const r = run(A, { scenario: A.run!.scenarioId });
    const busiest = [...r.teams].sort((a, b) => b.peakUtilization - a.peakUtilization)[0].teamId;
    const b = bind(A);
    expect(b.service).not.toBeNull();
    // The busiest team is the portfolio's constraint here, and does nothing for the queue.
    expect(b.service!.teamId).not.toBe(busiest);
    expect(b.portfolio!.teamId).toBe(busiest);
  });

  it('finds teams where more people change nothing at all', () => {
    const b = bind(A);
    expect(b.idle.length).toBeGreaterThan(0);
    expect(b.idle.length).toBeLessThan(A.teams.length);
  });

  it('is right about them: adding people there really does move nothing', () => {
    const base = run(A, { scenario: A.run!.scenarioId });
    for (const id of bind(A).idle) {
      const more: OperatingModel = {
        ...A,
        teams: A.teams.map((t) => (t.id === id ? { ...t, currentFte: t.currentFte + 5 } : t)),
      };
      const r = run(more, { scenario: A.run!.scenarioId });
      expect(r.summary.serviceLevelPct!).toBeCloseTo(base.summary.serviceLevelPct!, 2);
      expect(Math.abs(r.summary.revenueExposure - base.summary.revenueExposure)).toBeLessThan(50_000);
    }
  });

  it('says nothing moves the queue when nothing does', () => {
    // A studio's support desk is four people; no amount of hiring turns that into the
    // year's problem, and the line should not invent one.
    expect(bind(G).service).toBeNull();
    expect(bind(G).portfolio).not.toBeNull();
  });

  /*
   * Written the other way round first, asserting that relieving the queue lowers what a
   * person is worth on it. The engine disagreed and the engine was right: taking work off
   * one team leaves the aggregate less dominated by a collapsed one, so the marginal
   * person on the queue is worth more, not less. What follows is what actually happens.
   */
  it('loses value where the run has already relieved it', () => {
    // Running Platform Scale leaner gives Data Platform its hours back, so the next five
    // people there are worth less than half what they were.
    const before = bind(A).portfolio!.gain;
    const after = bind(A, ['intervention-stretch-platform']).portfolio!.gain;
    expect(after).toBeLessThan(before / 2);
  });

  it('moves to a different team when the run takes people off one', () => {
    // Move five out of Customer Operations and Customer Operations becomes the queue.
    const before = bind(A).service!.teamId;
    const after = bind(A, ['intervention-reallocate-to-implementation']).service!.teamId;
    expect(after).not.toBe(before);
    expect(after).toBe('team-customer-ops');
  });

  it('grows the set of teams that buy nothing, as work is taken away', () => {
    expect(bind(A, ['intervention-cancel-self-service']).idle.length)
      .toBeGreaterThan(bind(A).idle.length);
  });

  it('never claims a gain it cannot show', () => {
    for (const M of [A, G]) {
      const b = bind(M);
      if (b.service) expect(b.service.gain).toBeGreaterThan(0.005);
      if (b.portfolio) expect(b.portfolio.gain).toBeGreaterThan(50_000);
      const named = [b.service?.teamId, b.portfolio?.teamId].filter(Boolean);
      for (const id of named) expect(b.idle).not.toContain(id);
    }
  });
});
