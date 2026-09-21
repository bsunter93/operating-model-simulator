import { describe, expect, it } from 'vitest';
import { run } from '../src/engine';
import { asUnits, pressureOf, workloadOf, yearShape } from '../src/lib/workload';
import type { OperatingModel } from '../src/models/types';
import atlas from '../src/data/atlas-systems-2027.json';
import health from '../src/data/meadowbrook-health-2027.json';
import agency from '../src/data/northgate-studio-2027.json';
import ngo from '../src/data/riverbank-trust-2027.json';

const models = [atlas, health, agency, ngo] as unknown as OperatingModel[];

describe('what a team was handed', () => {
  /* The bar in the interface is this number cut into pieces. If the pieces stop adding up
     to the engine's own total, the picture is telling a different story from the model. */
  it('adds up to the workload the engine recorded, every team, every month', () => {
    for (const m of models) {
      const r = run(m);
      for (const t of r.teams) {
        for (let i = 0; i < t.months.length; i++) {
          const w = workloadOf(r, t.teamId, i)!;
          expect(w.given).toBeCloseTo(t.months[i].workloadHours, 5);
        }
      }
    }
  });

  it('names last month queue and change work separately from what arrived', () => {
    const m = models[0];
    const shock = m.scenarios.find(
      (s) => s.type === 'demandMultiplier' && (s as { demandMultiplier?: number }).demandMultiplier! > 1,
    )!;
    const r = run(m, { scenario: shock.id });
    /* Somewhere in a shock year a team carries work forward; if nothing does, the fixture
       has no backlog policy and this assertion is the thing that would tell us. */
    let sawWaiting = false, sawChange = false;
    for (const t of r.teams) {
      for (let i = 0; i < t.months.length; i++) {
        const w = workloadOf(r, t.teamId, i)!;
        if (w.sources.some((s) => s.kind === 'waiting')) sawWaiting = true;
        if (w.sources.some((s) => s.kind === 'change')) sawChange = true;
      }
    }
    expect(sawWaiting).toBe(true);
    expect(sawChange).toBe(true);
  });

  it('shares sum to one wherever anything was handed over', () => {
    for (const m of models) {
      const r = run(m);
      for (const t of r.teams) {
        const w = workloadOf(r, t.teamId, 0)!;
        if (w.given <= 0) continue;
        expect(w.sources.reduce((a, s) => a + s.share, 0)).toBeCloseTo(1, 6);
      }
    }
  });

  /* Hours are the engine's unit of account and nobody's unit of thought. The conversion is
     the team's own: its month's arrivals divided by its month's hours. */
  it('counts work in the unit the team actually handles', () => {
    const r = run(models[0]);
    const queueing = r.teams.find((t) => t.months[0].serviceLevel !== null)!;
    const w = workloadOf(r, queueing.teamId, 0)!;
    expect(w.unit).toBeTruthy();
    expect(w.perHour).toBeGreaterThan(0);
    expect(asUnits(w, w.capacityHours)).toBeCloseTo(w.capacityHours * w.perHour, 6);
  });

  it('says nothing about units for a team with no countable work', () => {
    const r = run(models[0]);
    const noArrivals = r.teams.find((t) => !r.flow.some((f) => f.toTeamId === t.teamId));
    if (!noArrivals) return;
    const w = workloadOf(r, noArrivals.teamId, 0)!;
    expect(w.unit).toBeNull();
    expect(asUnits(w, 100)).toBeNull();
  });

  it('reads pressure off the team target, not off a fixed line', () => {
    expect(pressureOf({ utilization: 0.6, targetUtilization: 0.85 })).toBe('holding');
    expect(pressureOf({ utilization: 0.8, targetUtilization: 0.85 })).toBe('tight');
    expect(pressureOf({ utilization: 0.9, targetUtilization: 0.85 })).toBe('over');
    expect(pressureOf({ utilization: 1.3, targetUtilization: 0.85 })).toBe('buried');
    /* A team planning for 70% is over at 75%; one planning for 95% is not. */
    expect(pressureOf({ utilization: 0.75, targetUtilization: 0.7 })).toBe('over');
    expect(pressureOf({ utilization: 0.75, targetUtilization: 0.95 })).toBe('holding');
  });
});

describe('the shape of the year', () => {
  it('gives one point per month with the count of teams over capacity', () => {
    for (const m of models) {
      const r = run(m);
      const shape = yearShape(r);
      expect(shape).toHaveLength(r.months.length);
      for (const p of shape) {
        expect(p.teams).toBe(r.teams.length);
        expect(p.over).toBeGreaterThanOrEqual(0);
        expect(p.over).toBeLessThanOrEqual(p.teams);
      }
    }
  });

  it('shows a demand shock as a year that gets worse partway through', () => {
    const m = models[0];
    const shock = m.scenarios.find(
      (s) => s.type === 'demandMultiplier' && (s as { demandMultiplier?: number }).demandMultiplier! > 1,
    )!;
    const before = yearShape(run(m));
    const after = yearShape(run(m, { scenario: shock.id }));
    const worst = (s: typeof before) => Math.max(...s.map((p) => p.over));
    expect(worst(after)).toBeGreaterThan(worst(before));
  });
});

describe('mixed units', () => {
  /* Data Platform takes a handful of projects a month and a stream of escalated cases.
     Summing both and labelling the total in projects said it had three hundred projects
     waiting, which is not a sentence about anything. */
  it('builds the rate from the unit it reports, not from every unit it is fed', () => {
    for (const m of models) {
      const r = run(m);
      for (const t of r.teams) {
        for (let i = 0; i < t.months.length; i++) {
          const w = workloadOf(r, t.teamId, i)!;
          if (!w.unit || w.perHour <= 0) continue;
          const into = r.flow.filter((f) => f.toTeamId === t.teamId);
          const u = into.filter((f) => f.unit === w.unit)
            .reduce((a, f) => a + (f.unitsByMonth[i] ?? 0), 0);
          const h = into.reduce((a, f) => a + (f.hoursByMonth[i] ?? 0), 0);
          if (h <= 0) continue;
          expect(w.perHour).toBeCloseTo(u / h, 9);
        }
      }
    }
  });

  it('never reports more arriving work than the stream that names the unit carries', () => {
    const m = models[0];
    const r = run(m);
    for (const t of r.teams) {
      const w = workloadOf(r, t.teamId, 0)!;
      if (!w.unit || w.perHour <= 0) continue;
      const arriving = r.flow
        .filter((f) => f.toTeamId === t.teamId && f.unit === w.unit)
        .reduce((a, f) => a + (f.unitsByMonth[0] ?? 0), 0);
      const reported = asUnits(w, w.sources
        .filter((s) => s.kind === 'arrival' || s.kind === 'route')
        .reduce((a, s) => a + s.hours, 0))!;
      /* Arrivals in another unit inflate the hours, never the count, so the reported
         figure can only come in at or under what that unit actually brought. */
      expect(reported).toBeLessThanOrEqual(arriving * 1.0001);
    }
  });
});
