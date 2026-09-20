/**
 * Every assumption moves the result in the direction it should, and nothing
 * else. These pin the downstream logic a reader can check by hand.
 */
import { describe, expect, it } from 'vitest';
import { run, modelWarnings } from '../src/engine';
import type { OperatingModel } from '../src/models/types';
import fixture from '../src/data/atlas-systems-2027.json';

const model = fixture as unknown as OperatingModel;
const base = run(model);
const team = (r: ReturnType<typeof run>, id: string) => r.teams.find((t) => t.teamId === id)!;
const gap = (r: ReturnType<typeof run>) => r.teams.reduce((s, t) => s + t.totalGapVsPlanHours, 0);
const clone = () => structuredClone(model);
const ENTERPRISE = ['team-implementation', 'team-customer-ops', 'team-enterprise-support'];

describe('targeted and combined scenarios', () => {
  it('enterprise wins moves only the enterprise streams, only from March', () => {
    const r = run(model, { scenario: 'scenario-enterprise-wins' });
    for (const t of r.teams) {
      const b = team(base, t.teamId);
      t.months.forEach((m, i) => {
        if (!ENTERPRISE.includes(t.teamId) || i < 2) expect(m.runHours).toBeCloseTo(b.months[i].runHours, 6);
        else expect(m.runHours).toBeCloseTo(b.months[i].runHours * 1.25, 6);
      });
    }
  });
  it('a downturn cuts workload and cancels hires; attrition still runs', () => {
    const r = run(model, { scenario: 'scenario-downturn' });
    expect(gap(r)).toBeLessThan(gap(base));
    for (const t of r.teams) expect(t.months.every((m) => m.hiresLanded === 0)).toBe(true);
    expect(r.summary.endingFte).toBeLessThan(base.summary.endingFte);
    expect(r.financials.annualTotalCostUsd).toBeLessThan(base.financials.annualTotalCostUsd);
    // Less work does not make budget worse.
    expect(r.financials.annualVarianceUsd).toBeLessThanOrEqual(base.financials.annualVarianceUsd);
  });
  it('team-specific attrition touches only that team', () => {
    const r = run(model, { scenario: 'scenario-implementation-attrition' });
    for (const t of r.teams) {
      const b = team(base, t.teamId);
      if (t.teamId === 'team-implementation') { expect(t.endingFte).toBeLessThan(b.endingFte); expect(t.totalGapVsPlanHours).toBeGreaterThan(b.totalGapVsPlanHours); }
      else expect(t.endingFte).toBeCloseTo(b.endingFte, 6);
    }
  });
  it('combined effects multiply rather than overwrite', () => {
    const r = run(model, { scenario: { id: 'x', name: 'x', type: 'combined', effects: [{ type: 'demandMultiplier', demandMultiplier: 1.1 }, { type: 'demandMultiplier', demandMultiplier: 1.1 }] } });
    const a = team(r, 'team-consumer-ops').months[5].runHours, b = team(base, 'team-consumer-ops').months[5].runHours;
    expect(a).toBeCloseTo(b * 1.21, 6);
  });
});

describe('one assumption at a time', () => {
  it('more shrinkage: fewer productive hours, higher utilization, more people required', () => {
    const m = clone(); const t = m.teams.find((x) => x.id === 'team-implementation')!; t.shrinkage += 0.05;
    const r = team(run(m), 'team-implementation'), b = team(base, 'team-implementation');
    r.months.forEach((x, i) => { expect(x.productiveHoursPerFte).toBeLessThan(b.months[i].productiveHoursPerFte); expect(x.utilization).toBeGreaterThan(b.months[i].utilization); expect(x.requiredFte).toBeGreaterThan(b.months[i].requiredFte); });
  });
  it('a higher target utilization: same work, fewer people required, smaller gap', () => {
    const m = clone(); const t = m.teams.find((x) => x.id === 'team-implementation')!; t.targetUtilization = 0.9;
    const r = team(run(m), 'team-implementation'), b = team(base, 'team-implementation');
    r.months.forEach((x, i) => { expect(x.workloadHours).toBeCloseTo(b.months[i].workloadHours, 6); expect(x.requiredFte).toBeLessThan(b.months[i].requiredFte); expect(x.gapHours).toBeLessThanOrEqual(b.months[i].gapHours + 1e-9); });
  });
  it('more attrition: fewer people every month after the first, a bigger gap, lower cost', () => {
    const m = clone(); const t = m.teams.find((x) => x.id === 'team-consumer-ops')!; t.annualAttrition = 0.3;
    const r = run(m); const a = team(r, 'team-consumer-ops'), b = team(base, 'team-consumer-ops');
    for (let i = 0; i < 12; i++) expect(a.months[i].availableFte).toBeLessThan(b.months[i].availableFte);
    expect(a.totalGapVsPlanHours).toBeGreaterThan(b.totalGapVsPlanHours);
    expect(r.financials.annualRunCostUsd).toBeLessThan(base.financials.annualRunCostUsd);
  });
  it('longer handling time: proportionally more hours, nothing else', () => {
    // Burnout is switched off on both sides here on purpose. With it on, more hours means
    // more strain means fewer people, and this test is about whether hours move
    // proportionally, not about the loop that reads them.
    const m = clone(); const s = m.demandStreams.find((x) => x.id === 'demand-consumer-cases')!; s.handlingMinutesPerUnit *= 1.1;
    m.teams.forEach((t) => { t.burnoutSensitivity = 0; });
    const flatBase = clone(); flatBase.teams.forEach((t) => { t.burnoutSensitivity = 0; });
    const a = team(run(m), 'team-consumer-ops'), b = team(run(flatBase), 'team-consumer-ops');
    a.months.forEach((x, i) => { expect(x.runHours).toBeCloseTo(b.months[i].runHours * 1.1, 6); expect(x.availableFte).toBeCloseTo(b.months[i].availableFte, 6); });
  });
  it('a longer hiring lead time lands the same people later and leaves more months over capacity', () => {
    const m = clone(); m.hiringPlan.find((h) => h.id === 'hire-implementation-10')!.leadTimeMonths = 8;
    const a = team(run(m), 'team-implementation'), b = team(base, 'team-implementation');
    expect(a.months[8].hiresLanded).toBe(10);
    expect(a.months.reduce((s, x) => s + x.hiresLanded, 0)).toBe(10);
    expect(a.monthsConstrained).toBeGreaterThan(b.monthsConstrained);
  });
  it('more people on payroll: higher cost, lower utilization, budget variance up by exactly their cost', () => {
    const m = clone(); const t = m.teams.find((x) => x.id === 'team-enterprise-support')!; t.currentFte += 10;
    const r = run(m);
    expect(team(r, 'team-enterprise-support').peakUtilization).toBeLessThan(team(base, 'team-enterprise-support').peakUtilization);
    const extra = r.financials.annualRunCostUsd - base.financials.annualRunCostUsd;
    expect(extra).toBeGreaterThan(0);
    expect(r.financials.annualVarianceUsd - base.financials.annualVarianceUsd).toBeCloseTo(extra, 6);
  });
  it('a bigger budget changes the variance and nothing operational', () => {
    const m = clone(); m.budget.modeledAnnualBudgetUsd *= 1.2;
    const r = run(m);
    expect(r.financials.annualVarianceUsd).toBeLessThan(base.financials.annualVarianceUsd);
    expect(JSON.stringify(r.teams)).toBe(JSON.stringify(base.teams));
  });
  it('an initiative that needs more people from a team pushes that team up and no other', () => {
    const m = clone(); m.initiatives.find((i) => i.id === 'init-platform-scale')!.requiredFteByTeam['team-data-platform'] += 5;
    const r = run(m);
    expect(team(r, 'team-data-platform').totalGapVsPlanHours).toBeGreaterThan(team(base, 'team-data-platform').totalGapVsPlanHours);
    expect(team(r, 'team-consumer-ops').totalGapVsPlanHours).toBeCloseTo(team(base, 'team-consumer-ops').totalGapVsPlanHours, 6);
  });
});

describe('model warnings', () => {
  it('the calibrated fixture raises none', () => {
    expect(modelWarnings(model)).toEqual([]);
  });
  it('an impossible target and an oversized hire are flagged', () => {
    const m = clone(); m.teams[1].targetUtilization = 0.95; m.hiringPlan[0].headcount = 500;
    const w = modelWarnings(m);
    expect(w.some((x) => /leaves almost no room/.test(x))).toBe(true);
    expect(w.some((x) => /larger than the team/.test(x))).toBe(true);
  });
});
