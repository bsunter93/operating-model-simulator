import { describe, expect, it } from 'vitest';
import { run } from '../src/engine';
import { briefAt, verdictOf } from '../src/lib/brief';
import type { OperatingModel } from '../src/models/types';
import atlas from '../src/data/atlas-systems-2027.json';
import health from '../src/data/meadowbrook-health-2027.json';
import agency from '../src/data/northgate-studio-2027.json';
import ngo from '../src/data/riverbank-trust-2027.json';

/**
 * The two things worth carrying over from the run: prose attached to particular months,
 * and an ending read off the year rather than scored against a curve.
 */
const models = [atlas, health, agency, ngo] as unknown as OperatingModel[];

describe('what was written about a month', () => {
  it('finds a brief only in the month it was written for', () => {
    for (const m of models) {
      for (const d of m.run?.decisions ?? []) {
        const b = briefAt(m, d.monthIndex);
        expect(b).not.toBeNull();
        expect(b!.question).toBe(d.question);
      }
    }
  });

  it('returns nothing for a month nobody wrote about', () => {
    for (const m of models) {
      const written = new Set((m.run?.decisions ?? []).map((d) => d.monthIndex));
      for (let i = 0; i < 12; i++) if (!written.has(i)) expect(briefAt(m, i)).toBeNull();
    }
  });

  it('names a team that is actually in the model, when it names one', () => {
    for (const m of models) {
      for (const d of m.run?.decisions ?? []) {
        if (!d.focusTeamId) continue;
        expect(m.teams.some((t) => t.id === d.focusTeamId)).toBe(true);
      }
    }
  });
});

describe('how the year ended', () => {
  it('meets the objective only when neither condition was broken', () => {
    for (const m of models) {
      const v = verdictOf(run(m));
      expect(v.met).toBe(!v.pastCapacity && !v.overBudget);
    }
  });

  it('reads the peak off the year rather than the last month', () => {
    for (const m of models) {
      const r = run(m, { scenario: m.run?.scenarioId });
      const v = verdictOf(r);
      const peak = Math.max(...r.teams.flatMap((t) => t.months.map((x) => x.utilization)));
      expect(v.peak).toBeCloseTo(peak, 9);
      expect(v.pastCapacity).toBe(peak > 1);
    }
  });

  it('counts every hour the year turned away, not one month of it', () => {
    for (const m of models) {
      const r = run(m, { scenario: m.run?.scenarioId });
      const shed = r.teams.reduce((a, t) => a + t.months.reduce((b, x) => b + x.shedHours, 0), 0);
      expect(verdictOf(r).shed).toBeCloseTo(shed, 6);
    }
  });
});
