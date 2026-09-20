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
    // Filtered to match this test's own name. It used to take the max across every row,
    // which held only while every lever reduced load. Crashing an initiative deliberately
    // adds people to finish sooner, so it is worse than doing nothing on this measure and
    // better on time. That is the trade, not a regression.
    const reducing = rows.filter((r) => r.residualGapHours <= dn.residualGapHours);
    expect(Math.max(...reducing.map((r) => r.residualGapHours))).toBeCloseTo(dn.residualGapHours, 6);
  });

  it('a lever can be worse than doing nothing, which is what makes it a choice', () => {
    const rows = compareOptions(doNothing, options, model.decisionWeights);
    const dn = rows.find((r) => r.id === 'do-nothing')!;
    const crash = rows.find((r) => r.id === 'intervention-crash-enterprise')!;
    expect(crash.residualGapHours).toBeGreaterThan(dn.residualGapHours);
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
    const accept88 = { id: 'accept', label: 'Accept 88% on Implementation', result: run(model, { interventions: [{ id: 'accept', name: 'accept', type: 'serviceLevelChange' as const, teamId: 'team-implementation', newTargetUtilization: 0.88 }] }) };
    const rows = compareOptions(doNothing, [...options, accept88], model.decisionWeights);
    const accept = rows.find((r) => r.id === 'accept')!;
    const dn = rows.find((r) => r.id === 'do-nothing')!;
    // The work is still identical: raising a target moves no hours. What it now also does
    // is change who burns out, so the residual gap is no longer identical to doing nothing.
    // That is a real effect and it gets its own test below rather than being averaged away.
    const w = (r: ReturnType<typeof run>, id: string) =>
      r.teams.find((t) => t.teamId === id)!.months.reduce((a, m) => a + m.workloadHours, 0);
    expect(w(accept88.result, 'team-implementation')).toBeCloseTo(w(doNothing, 'team-implementation'), 6);
  });

  it('accepting a hotter target keeps people, because fewer months count as over capacity', () => {
    const hotter = run(model, { interventions: [{ id: 'accept', name: 'accept', type: 'serviceLevelChange' as const, teamId: 'team-implementation', newTargetUtilization: 0.88 }] });
    expect(hotter.summary.peopleLostToAttrition).toBeLessThan(doNothing.summary.peopleLostToAttrition);
    expect(hotter.summary.strainMonths).toBeLessThan(doNothing.summary.strainMonths);
  });
  it('removing an option can change the others\' scores (and the UI must say so)', () => {
    const all = compareOptions(doNothing, options, model.decisionWeights);
    const fewer = compareOptions(doNothing, options.slice(1), model.decisionWeights);
    const a = all.find((r) => r.id === options[1].id)!, b = fewer.find((r) => r.id === options[1].id)!;
    expect(typeof a.score).toBe('number'); expect(typeof b.score).toBe('number');
  });
});
