import { describe, it, expect } from 'vitest';
import { run } from '../src/engine';
import fixture from '../src/data/atlas-systems-2027.json';
import type { OperatingModel } from '../src/models/types';

const M = fixture as unknown as OperatingModel;
const flat = (() => {
  const c = JSON.parse(JSON.stringify(M)) as OperatingModel;
  c.teams.forEach((t) => { t.burnoutSensitivity = 0; });
  return c;
})();
const lost = (r: ReturnType<typeof run>) => r.summary.peopleLostToAttrition;

/*
 * Attrition used to be a constant: a team could run at 120% all year and lose exactly as
 * many people as one running at 60%. These pin the loop that fixes it, and more
 * importantly they pin the two ways it could go wrong. A reinforcing loop with no ceiling
 * models a company that ends the year empty, and one that fires in a healthy year is just
 * a tax on every scenario rather than a consequence of strain.
 */
describe('strain pushes people out', () => {
  it('costs more people than a flat rate does', () => {
    expect(lost(run(M))).toBeGreaterThan(lost(run(flat)));
  });

  it('stays quiet when nobody is over capacity', () => {
    // Productivity +15% pulls the whole company back inside its limits.
    const calm = run(M, { scenario: 'scenario-productivity-15' });
    const calmFlat = run(flat, { scenario: 'scenario-productivity-15' });
    expect(lost(calm) - lost(calmFlat)).toBeLessThan(2);
  });

  it('bites hard when the year goes wrong', () => {
    const shock = run(M, { scenario: 'scenario-demand-shock' });
    const shockFlat = run(flat, { scenario: 'scenario-demand-shock' });
    expect(lost(shock) - lost(shockFlat)).toBeGreaterThan(10);
  });

  it('costs more under growth than under a downturn', () => {
    // Worth pinning because it is counterintuitive and it falls out of the mechanism
    // rather than being written anywhere: growth is harder on people than shrinking is.
    const grow = lost(run(M, { scenario: 'scenario-growth-20' })) - lost(run(flat, { scenario: 'scenario-growth-20' }));
    const down = lost(run(M, { scenario: 'scenario-downturn' })) - lost(run(flat, { scenario: 'scenario-downturn' }));
    expect(grow).toBeGreaterThan(down);
  });
});

describe('the loop converges', () => {
  it('never runs a team negative or non-finite, in any scenario', () => {
    for (const sc of M.scenarios) {
      const r = run(M, { scenario: sc.id });
      for (const t of r.teams) {
        for (const m of t.months) {
          expect(Number.isFinite(m.availableFte)).toBe(true);
          expect(m.availableFte).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('keeps retention inside 0 and 1', () => {
    for (const sc of M.scenarios) {
      const rr = run(M, { scenario: sc.id }).summary.retentionRate;
      expect(rr).toBeGreaterThan(0);
      expect(rr).toBeLessThanOrEqual(1);
    }
  });

  it('is inert for a model that never sets a sensitivity', () => {
    expect(lost(run(flat))).toBeCloseTo(lost(run(flat)), 9);
    const a = run(flat), b = run(flat, { scenario: 'scenario-demand-shock' });
    expect(a.summary.retentionRate).toBeGreaterThan(b.summary.retentionRate - 0.2);
  });
});

describe('strain months', () => {
  it('counts only the teams that are over, and the customer-facing subset is smaller', () => {
    const r = run(M);
    expect(r.summary.strainMonths).toBeGreaterThan(0);
    expect(r.summary.customerFacingStrainMonths).toBeLessThanOrEqual(r.summary.strainMonths);
  });
});
