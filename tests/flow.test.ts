import { describe, expect, it } from 'vitest';
import { run } from '../src/engine';
import { layout, shareLabel } from '../src/components/FlowCanvas';
import type { OperatingModel } from '../src/models/types';
import atlas from '../src/data/atlas-systems-2027.json';
import health from '../src/data/meadowbrook-health-2027.json';
import agency from '../src/data/northgate-studio-2027.json';
import ngo from '../src/data/riverbank-trust-2027.json';

/**
 * The flow is what the canvas draws. It is not a second calculation: it is the arithmetic
 * the engine was already doing to get its hours, kept instead of summed away. These tests
 * pin that, because the moment the picture and the numbers can disagree, the picture is
 * decoration.
 */
const models = [atlas, health, agency, ngo] as unknown as OperatingModel[];

describe('the work network', () => {
  it('gives every stream and every route exactly one arrow', () => {
    for (const m of models) {
      const r = run(m);
      expect(r.flow.filter((f) => f.kind === 'arrival')).toHaveLength(m.demandStreams.length);
      expect(r.flow.filter((f) => f.kind === 'route')).toHaveLength((m.routes ?? []).length);
      expect(new Set(r.flow.map((f) => f.id)).size).toBe(r.flow.length);
    }
  });

  it('carries the whole of a stream across the year', () => {
    for (const m of models) {
      const r = run(m);
      for (const s of m.demandStreams) {
        const f = r.flow.find((x) => x.kind === 'arrival' && x.sourceId === s.id)!;
        const total = f.unitsByMonth.reduce((a, b) => a + b, 0);
        expect(total).toBeCloseTo(s.annualVolume, 4);
        expect(f.unitsByMonth).toHaveLength(r.months.length);
      }
    }
  });

  it('routes exactly the authored share of the upstream stream', () => {
    for (const m of models) {
      const r = run(m);
      for (const route of m.routes ?? []) {
        const up = r.flow.find((x) => x.kind === 'arrival' && x.sourceId === route.fromStreamId)!;
        const down = r.flow.find((x) => x.id === `route:${route.id}`)!;
        for (let i = 0; i < r.months.length; i++) {
          expect(down.unitsByMonth[i]).toBeCloseTo(up.unitsByMonth[i] * route.share, 6);
        }
      }
    }
  });

  /* The one that matters. If the arrows into a block do not add up to the work that block
     is given, the diagram is telling a different story from the model underneath it. */
  it('adds up to the run hours the engine gave each team', () => {
    for (const m of models) {
      const r = run(m);
      for (const t of r.teams) {
        const into = r.flow.filter((f) => f.toTeamId === t.teamId);
        for (let i = 0; i < t.months.length; i++) {
          const sum = into.reduce((a, f) => a + f.hoursByMonth[i], 0);
          expect(sum).toBeCloseTo(t.months[i].runHours, 6);
        }
      }
    }
  });

  it('moves the arrows when a scenario changes demand', () => {
    const m = models[0];
    /* A scenario is an effect in its own right; `combined` is the one that carries a list.
       Finding it this way rather than by id keeps the fixture ids out of the assertion. */
    const shock = m.scenarios.find(
      (s) => s.type === 'demandMultiplier' && (s as { demandMultiplier?: number }).demandMultiplier! > 1,
    )!;
    const base = run(m);
    const after = run(m, { scenario: shock.id });
    const total = (r: ReturnType<typeof run>) =>
      r.flow.filter((f) => f.kind === 'arrival').reduce((a, f) => a + f.unitsByMonth.reduce((x, y) => x + y, 0), 0);
    expect(total(after)).toBeGreaterThan(total(base));
  });
});

describe('the canvas layout', () => {
  it('places every source and every team, and never overlaps two of them', () => {
    for (const m of models) {
      const r = run(m);
      const geo = layout(m, r);
      expect(geo.teams.size).toBe(m.teams.length);
      for (const s of m.demandStreams) expect(geo.sources.has(s.id)).toBe(true);
      const boxes = [...geo.sources.values(), ...geo.teams.values()];
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i], b = boxes[j];
          const hit = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
          expect(hit).toBe(false);
        }
      }
      expect(Math.max(...boxes.map((p) => p.x + p.w))).toBeLessThanOrEqual(geo.width);
      expect(Math.max(...boxes.map((p) => p.y + p.h))).toBeLessThanOrEqual(geo.height);
    }
  });

  it('puts a routed team downstream of whatever feeds it', () => {
    for (const m of models) {
      const r = run(m);
      const geo = layout(m, r);
      for (const f of r.flow.filter((x) => x.kind === 'route')) {
        expect(geo.teams.get(f.toTeamId)!.x).toBeGreaterThan(geo.teams.get(f.sourceId)!.x);
      }
    }
  });

  it('keeps a decimal on a split too small to survive rounding', () => {
    expect(shareLabel(0.06)).toBe('6%');
    expect(shareLabel(0.012987)).toBe('1.3%');
    expect(shareLabel(0.5)).toBe('50%');
  });
});
