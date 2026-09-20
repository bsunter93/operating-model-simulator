import { describe, expect, it } from 'vitest';
import { run, validateModel, addMonths, expandMonths, annualToMonthlyRate, classify } from '../src/engine';
import type { OperatingModel, Intervention } from '../src/models/types';
import fixture from '../src/data/atlas-systems-2027.json';

const model = fixture as unknown as OperatingModel;
const totalGap = (r: ReturnType<typeof run>) => r.teams.reduce((s, t) => s + t.totalGapHours, 0);
const team = (r: ReturnType<typeof run>, id: string) => r.teams.find((t) => t.teamId === id)!;
const clone = () => structuredClone(model);

describe('calendar', () => {
  it('adds months across year boundaries', () => {
    expect(addMonths('2027-11', 3)).toBe('2028-02');
    expect(addMonths('2027-01', -1)).toBe('2026-12');
  });
  it('expands an inclusive range', () => {
    expect(expandMonths('2027-01', '2027-12')).toHaveLength(12);
    expect(expandMonths('2027-06', '2027-06')).toEqual(['2027-06']);
  });
  it('converts annual attrition to a compounding monthly rate', () => {
    const m = annualToMonthlyRate(0.12);
    expect(1 - Math.pow(1 - m, 12)).toBeCloseTo(0.12, 10);
    expect(m).toBeCloseTo(0.0106, 3);
  });
});

describe('status classification', () => {
  it('uses non-overlapping bands around the target', () => {
    expect(classify(0.70, 0.80)).toBe('healthy');
    expect(classify(0.7499, 0.80)).toBe('healthy');
    expect(classify(0.75, 0.80)).toBe('watch');
    expect(classify(0.80, 0.80)).toBe('watch');
    expect(classify(0.8001, 0.80)).toBe('constrained');
    expect(classify(1.0, 0.80)).toBe('constrained');
    expect(classify(1.0001, 0.80)).toBe('severe');
  });
});

describe('validation', () => {
  it('accepts the fixture', () => {
    expect(validateModel(model)).toEqual([]);
  });
  it('rejects a work mix that does not sum to one', () => {
    const m = clone(); m.demandStreams[0].workMix.bespoke += 0.1;
    expect(validateModel(m).join('\n')).toMatch(/workMix sums to/);
  });
  it('rejects an operational team with no demand', () => {
    const m = clone(); m.demandStreams = m.demandStreams.filter((s) => s.teamId !== 'team-implementation');
    expect(validateModel(m).join('\n')).toMatch(/team-implementation is operational but has no demand stream/);
  });
  it('rejects circular dependencies', () => {
    const m = clone();
    m.dependencies.push({ id: 'dep-cycle', predecessorId: 'init-international-expansion', successorId: 'init-platform-scale', lagMonths: 0 });
    expect(validateModel(m).join('\n')).toMatch(/circular dependency/);
  });
  it('rejects unknown references', () => {
    const m = clone(); m.hiringPlan[0].teamId = 'team-nope';
    expect(validateModel(m).join('\n')).toMatch(/unknown team "team-nope"/);
  });
  it('run() throws a readable error on an invalid model', () => {
    const m = clone(); m.teams[0].shrinkage = 2;
    expect(() => run(m)).toThrow(/shrinkage must be between 0 and 0.99/);
  });
});

describe('base run', () => {
  const base = run(model);
  it('is deterministic', () => {
    expect(JSON.stringify(run(model))).toBe(JSON.stringify(base));
  });
  it('does not mutate the input', () => {
    const before = JSON.stringify(model);
    run(model, { scenario: 'scenario-growth-20', interventions: ['intervention-expedite-implementation', 'intervention-cancel-self-service'] });
    expect(JSON.stringify(model)).toBe(before);
  });
  it('produces no NaN or Infinity anywhere', () => {
    const bad: string[] = [];
    const walk = (v: unknown, path: string) => {
      if (typeof v === 'number') { if (!Number.isFinite(v)) bad.push(path); }
      else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
    };
    walk(base, 'result');
    expect(bad).toEqual([]);
  });
  it('annual figures are sums of monthly ones', () => {
    for (const t of base.teams) {
      expect(t.annualWorkloadHours).toBeCloseTo(t.months.reduce((s, m) => s + m.workloadHours, 0), 6);
      expect(t.annualRunCost).toBeCloseTo(t.months.reduce((s, m) => s + m.runCost, 0), 6);
    }
    expect(base.financials.annualTotalCost).toBeCloseTo(base.financials.monthly.reduce((s, f) => s + f.totalCost, 0), 6);
  });
  it('seasonality redistributes but preserves the annual total', () => {
    const flat = clone();
    for (const k of Object.keys(flat.seasonality)) flat.seasonality[k] = 1;
    const a = run(flat), b = base;
    for (const t of a.teams) {
      const ra = t.months.reduce((s, m) => s + m.runHours, 0);
      const rb = team(b, t.teamId).months.reduce((s, m) => s + m.runHours, 0);
      expect(ra).toBeCloseTo(rb, 6);
    }
  });
});

describe('workforce timing', () => {
  const base = run(model);
  it('hires add no capacity before request + lead time', () => {
    const impl = team(base, 'team-implementation');
    // requested 2027-01, lead 5 -> lands index 5 (June)
    for (let m = 0; m < 5; m++) expect(impl.months[m].hiresLanded).toBe(0);
    expect(impl.months[5].hiresLanded).toBe(10);
    expect(impl.months[5].availableFte).toBeGreaterThan(impl.months[4].availableFte + 9);
  });
  it('attrition erodes headcount every month', () => {
    const sup = team(base, 'team-enterprise-support'); // no hires
    for (let m = 1; m < 12; m++) expect(sup.months[m].availableFte).toBeLessThan(sup.months[m - 1].availableFte);
    expect(sup.endingFte).toBeCloseTo(40 * (1 - 0.12), 1);
  });
  it('a hiring freeze cancels every not-yet-started request and removes nobody', () => {
    const frozen = run(model, { scenario: 'scenario-hiring-freeze' });
    for (const t of frozen.teams) {
      for (const m of t.months) expect(m.hiresLanded).toBe(0);
      expect(t.months[0].availableFte).toBeCloseTo(team(base, t.teamId).months[0].availableFte, 6);
    }
    expect(totalGap(frozen)).toBeGreaterThan(totalGap(base));
  });
  it('a freeze that starts later lets in-flight requests complete', () => {
    const r = run(model, { scenario: { id: 'x', name: 'x', type: 'hiringFreeze', fromMonth: '2027-02' } });
    expect(team(r, 'team-implementation').months[5].hiresLanded).toBe(10); // requested Jan, before freeze
    expect(team(r, 'team-consumer-ops').months.every((m) => m.hiresLanded === 0)).toBe(true); // requested Feb
  });
  it('expediting a hire lands it earlier and never adds headcount', () => {
    const r = run(model, { interventions: ['intervention-expedite-implementation'] });
    const impl = team(r, 'team-implementation');
    expect(impl.months[3].hiresLanded).toBe(10);
    expect(impl.months.reduce((s, m) => s + m.hiresLanded, 0)).toBe(10);
    expect(totalGap(r)).toBeLessThan(totalGap(base));
    expect(r.financials.annualChangeCost).toBe(120000);
  });
  it('adding FTE cannot increase the capacity gap', () => {
    const iv: Intervention = { id: 'x', name: 'x', type: 'hire', teamId: 'team-consumer-ops', headcount: 20, leadTimeMonths: 0, recruitingCostPerHead: 0 };
    expect(totalGap(run(model, { interventions: [iv] }))).toBeLessThanOrEqual(totalGap(base));
  });
});

describe('demand and productivity', () => {
  const base = run(model);
  it('higher demand cannot reduce workload', () => {
    const g = run(model, { scenario: 'scenario-growth-20' });
    for (const t of g.teams) t.months.forEach((m, i) => expect(m.runHours).toBeGreaterThanOrEqual(team(base, t.teamId).months[i].runHours));
    expect(totalGap(g)).toBeGreaterThan(totalGap(base));
  });
  it('a demand step from April leaves earlier months unchanged', () => {
    const s = run(model, { scenario: 'scenario-demand-shock' });
    const a = team(s, 'team-consumer-ops'), b = team(base, 'team-consumer-ops');
    for (let m = 0; m < 3; m++) expect(a.months[m].runHours).toBeCloseTo(b.months[m].runHours, 6);
    expect(a.months[3].runHours).toBeCloseTo(b.months[3].runHours * 1.3, 6);
  });
  it('higher productivity cannot increase required FTE', () => {
    const p = run(model, { scenario: 'scenario-productivity-15' });
    for (const t of p.teams) t.months.forEach((m, i) => expect(m.requiredFte).toBeLessThanOrEqual(team(base, t.teamId).months[i].requiredFte + 1e-9));
  });
  it('automation reduces workload only after time to impact', () => {
    const r = run(model, { interventions: ['intervention-automate-consumer'] });
    const a = team(r, 'team-consumer-ops'), b = team(base, 'team-consumer-ops');
    for (let m = 0; m < 3; m++) expect(a.months[m].runHours).toBeCloseTo(b.months[m].runHours, 6);
    for (let m = 3; m < 12; m++) expect(a.months[m].runHours).toBeCloseTo(b.months[m].runHours * 0.85, 6);
    expect(r.financials.annualChangeCost).toBe(1200000);
  });
});

describe('portfolio and dependencies', () => {
  const base = run(model);
  it('initiatives consume capacity only while active', () => {
    const portal = base.initiatives.find((i) => i.initiativeId === 'init-self-service')!;
    expect(portal.effectiveStart).toBe('2027-02');
    expect(portal.completion).toBe('2027-08');
    expect(portal.activeMonthIndexes).toEqual([1, 2, 3, 4, 5, 6]);
    const cons = team(base, 'team-consumer-ops');
    expect(cons.months[0].portfolioHours).toBe(0);
    expect(cons.months[1].portfolioHours).toBeCloseTo(4 * 160 * (1 - 0.16), 6);
    expect(cons.months[7].portfolioHours).toBe(0);
  });
  it('a dependency pushes the successor to predecessor completion + lag', () => {
    const intl = base.initiatives.find((i) => i.initiativeId === 'init-international-expansion')!;
    expect(intl.plannedStart).toBe('2027-03');
    expect(intl.effectiveStart).toBe('2027-12');
    expect(intl.delayMonths).toBe(9);
    expect(intl.pushedBy?.predecessorId).toBe('init-platform-scale');
    expect(intl.truncated).toBe(true);
    expect(base.constraints.some((c) => c.kind === 'sequencing' && c.initiativeId === 'init-international-expansion')).toBe(true);
  });
  it('a dependency delay cannot improve downstream timing', () => {
    const m = clone(); m.initiatives.find((i) => i.id === 'init-platform-scale')!.durationMonths += 2;
    const r = run(m);
    expect(r.initiatives.find((i) => i.initiativeId === 'init-international-expansion')!.delayMonths).toBe(11);
  });
  it('deferring an initiative cannot increase current portfolio load', () => {
    const r = run(model, { interventions: ['intervention-defer-international'] });
    const intl = r.initiatives.find((i) => i.initiativeId === 'init-international-expansion')!;
    expect(intl.status).toBe('deferred');
    // Still pushed by the dependency, so the effective start does not move.
    expect(intl.effectiveStart).toBe('2027-12');
    for (const t of r.teams) t.months.forEach((mm, i) => expect(mm.portfolioHours).toBeLessThanOrEqual(team(base, t.teamId).months[i].portfolioHours + 1e-9));
  });
  it('cancelling an initiative releases its capacity', () => {
    const r = run(model, { interventions: ['intervention-cancel-self-service'] });
    const cons = team(r, 'team-consumer-ops');
    for (let m = 1; m < 7; m++) expect(cons.months[m].portfolioHours).toBe(0);
    expect(r.exposure.items.some((e) => e.initiativeId === 'init-self-service')).toBe(false);
    expect(totalGap(r)).toBeLessThanOrEqual(totalGap(base));
  });
  it('reallocation keeps total FTE constant and moves capacity after the transition', () => {
    const r = run(model, { interventions: ['intervention-reallocate-to-implementation'] });
    const from = team(r, 'team-customer-ops'), to = team(r, 'team-implementation');
    expect(from.months[0].availableFte).toBeCloseTo(team(base, 'team-customer-ops').months[0].availableFte, 6);
    expect(to.months[1].availableFte - team(base, 'team-implementation').months[1].availableFte).toBeCloseTo(5, 6);
    expect(from.months[1].availableFte - team(base, 'team-customer-ops').months[1].availableFte).toBeCloseTo(-5, 6);
    const tot = (x: ReturnType<typeof run>, i: number) => x.teams.reduce((s, t) => s + t.months[i].availableFte, 0);
    expect(tot(r, 1)).toBeCloseTo(tot(base, 1), 6);
  });
});

describe('budget and exposure', () => {
  const base = run(model);
  it('a lower budget cannot raise the cap and surfaces levers without applying them', () => {
    const r = run(model, { scenario: 'scenario-budget-cut' });
    expect(r.financials.annualBudget).toBeCloseTo(base.financials.annualBudget * 0.9, 6);
    expect(r.financials.annualRunCost).toBeCloseTo(base.financials.annualRunCost, 6);
    expect(r.financials.budgetLevers.length).toBeGreaterThan(0);
    expect(r.financials.budgetLevers.some((l) => l.kind === 'defer-discretionary-initiative' && l.id === 'init-self-service')).toBe(true);
    expect(r.financials.budgetLevers.some((l) => l.kind === 'defer-discretionary-initiative' && l.id === 'init-enterprise-growth')).toBe(false);
  });
  it('raising execution-failure probability cannot reduce exposure', () => {
    const r = run(model, { scenario: 'scenario-revenue-exposure' });
    expect(r.exposure.total).toBeGreaterThanOrEqual(base.exposure.total);
    for (const e of r.exposure.items) expect(e.scenarioProbability).toBeCloseTo(Math.min(1, e.baseProbability * 1.5), 10);
  });
  it('probability is capped at one', () => {
    const r = run(model, { scenario: { id: 'x', name: 'x', type: 'failureProbabilityMultiplier', multiplier: 100 } });
    for (const e of r.exposure.items) { expect(e.scenarioProbability).toBe(1); expect(e.effectiveProbability).toBe(1); }
  });
  it('a capacity shortfall on an initiative team raises its effective probability', () => {
    for (const e of base.exposure.items) expect(e.effectiveProbability).toBeGreaterThanOrEqual(e.scenarioProbability - 1e-12);
  });
});

describe('scenario isolation', () => {
  it('running every scenario and intervention leaves the base result unchanged', () => {
    const before = JSON.stringify(run(model));
    for (const s of model.scenarios) run(model, { scenario: s.id, interventions: model.interventions.map((i) => i.id) });
    expect(JSON.stringify(run(model))).toBe(before);
  });
});

describe('edge cases', () => {
  it('zero demand yields zero utilization and no constraints for that team', () => {
    const m = clone(); for (const s of m.demandStreams) if (s.teamId === 'team-enterprise-support') s.annualVolume = 0;
    const r = run(m); const t = team(r, 'team-enterprise-support');
    expect(t.peakUtilization).toBe(0);
    expect(t.worstStatus).toBe('healthy');
  });
  it('zero FTE with demand is reported as severe without NaN', () => {
    const m = clone(); m.teams.find((t) => t.id === 'team-enterprise-support')!.currentFte = 0;
    const r = run(m); const t = team(r, 'team-enterprise-support');
    expect(t.worstStatus).toBe('severe');
    expect(t.months.every((x) => Number.isFinite(x.requiredFte))).toBe(true);
  });
  it('a hire landing after the horizon contributes nothing and is not a lever', () => {
    const m = clone(); m.hiringPlan[0].leadTimeMonths = 24;
    const r = run(m);
    expect(team(r, 'team-implementation').months.every((x) => x.hiresLanded === 0)).toBe(true);
    expect(r.financials.budgetLevers.some((l) => l.id === 'hire-implementation-10')).toBe(false);
  });
});
