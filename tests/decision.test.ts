import { describe, expect, it } from 'vitest';
import { compareOptions, run } from '../src/engine';
import type { OperatingModel } from '../src/models/types';
import fixture from '../src/data/atlas-systems-2027.json';

const model = fixture as unknown as OperatingModel;

describe('decision comparison', () => {
  const doNothing = run(model);
  const options = model.interventions.map((iv) => ({ id: iv.id, label: iv.name, result: run(model, { interventions: [iv.id] }) }));

  it('do nothing has zero incremental cost and the worst residual gap among gap-reducing options', () => {
    const rows = compareOptions(doNothing, options, model.decisionWeights);
    const dn = rows.find((r) => r.id === 'do-nothing')!;
    expect(dn.incrementalCostUsd).toBe(0);
    expect(dn.costUtility).toBe(1);
    expect(Math.max(...rows.map((r) => r.residualGapHours))).toBeCloseTo(dn.residualGapHours, 6);
  });
  it('weights change the ranking', () => {
    const costFirst = compareOptions(doNothing, options, { cost: 1, speed: 0, revenueExposure: 0 });
    const speedFirst = compareOptions(doNothing, options, { cost: 0, speed: 1, revenueExposure: 0 });
    expect(costFirst.find((r) => r.rank === 1)!.id).toBe('do-nothing');
    expect(speedFirst.find((r) => r.rank === 1)!.id).not.toBe('do-nothing');
  });
  it('utilities are within [0, 1] and ranks are a permutation', () => {
    const rows = compareOptions(doNothing, options, model.decisionWeights);
    for (const r of rows) for (const u of [r.costUtility, r.speedUtility, r.exposureUtility]) { expect(u).toBeGreaterThanOrEqual(0); expect(u).toBeLessThanOrEqual(1); }
    expect([...rows.map((r) => r.rank)].sort((a, b) => a - b)).toEqual(rows.map((_, i) => i + 1));
  });
  it('raising a utilization target moves no work and scores like doing nothing', () => {
    const rows = compareOptions(doNothing, options, model.decisionWeights);
    const accept = rows.find((r) => r.id === 'intervention-accept-higher-utilization')!;
    const dn = rows.find((r) => r.id === 'do-nothing')!;
    expect(accept.residualGapHours).toBeCloseTo(dn.residualGapHours, 6);
    expect(accept.residualExposureUsd).toBeCloseTo(dn.residualExposureUsd, 6);
  });
  it('removing an option can change the others\' scores (and the UI must say so)', () => {
    const all = compareOptions(doNothing, options, model.decisionWeights);
    const fewer = compareOptions(doNothing, options.slice(1), model.decisionWeights);
    const a = all.find((r) => r.id === options[1].id)!, b = fewer.find((r) => r.id === options[1].id)!;
    expect(typeof a.score).toBe('number'); expect(typeof b.score).toBe('number');
  });
});
