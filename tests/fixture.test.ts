/**
 * Golden tests for the calibrated Atlas Systems story. These assert the
 * operating story the fixture was designed to tell, computed by the engine.
 * If a fixture edit breaks one of these, the story changed; decide on purpose.
 */
import { describe, expect, it } from 'vitest';
import { run } from '../src/engine';
import type { OperatingModel } from '../src/models/types';
import fixture from '../src/data/atlas-systems-2027.json';

const model = fixture as unknown as OperatingModel;
const base = run(model);
const team = (id: string, r = base) => r.teams.find((t) => t.teamId === id)!;
const status = (id: string, r = base) => team(id, r).months.map((m) => m.status);

describe('Atlas Systems base plan', () => {
  it('Enterprise Sales is portfolio-only and stays healthy', () => {
    expect(team('team-enterprise-sales').worstStatus).toBe('healthy');
  });
  it('Enterprise Support and Platform Engineering are healthy all year', () => {
    expect(team('team-enterprise-support').worstStatus).toBe('healthy');
    expect(team('team-platform-engineering').worstStatus).toBe('healthy');
  });
  it('Customer Operations is under moderate pressure: reaches watch, never constrained', () => {
    expect(team('team-customer-ops').worstStatus).toBe('watch');
  });
  it('Consumer Operations is constrained through the seasonal peak', () => {
    const t = team('team-consumer-ops');
    expect(t.worstStatus).toBe('constrained');
    expect(t.monthsConstrained).toBeGreaterThanOrEqual(4);
    expect(t.peakUtilization).toBeGreaterThan(0.85);
    expect(t.peakUtilization).toBeLessThan(0.95);
  });
  it('Consumer Support brushes its target mid-year', () => {
    const t = team('team-consumer-support');
    expect(t.peakUtilization).toBeGreaterThanOrEqual(0.78);
    expect(t.peakUtilization).toBeLessThan(0.84);
  });
  it('Data Platform sits in the 85 to 95% band mid-year with no slack', () => {
    const t = team('team-data-platform');
    expect(t.peakUtilization).toBeGreaterThan(0.85);
    expect(t.peakUtilization).toBeLessThan(0.95);
    expect(status('team-data-platform').slice(3, 10).every((s) => s === 'constrained' || s === 'watch')).toBe(true);
  });
  it('Implementation has a meaningful gap that the planned hires nearly close, five months late', () => {
    const t = team('team-implementation');
    expect(t.peakMonth).toBe('2027-05');
    expect(t.peakWorkforceGap).toBeGreaterThanOrEqual(8);
    expect(t.peakWorkforceGap).toBeLessThanOrEqual(15);
    expect(t.months[5].hiresLanded).toBe(10);
    expect(status('team-implementation').slice(1, 6).every((s) => s === 'constrained')).toBe(true);
    // Not every month after the hires land is clear any more. Strain through the first
    // half costs the team people, and it slips back over capacity in September on its own.
    // That is the loop working, so it is pinned rather than allowed.
    expect(status('team-implementation').slice(6).filter((s) => s === 'constrained').length).toBe(1);
    expect(status('team-implementation')[8]).toBe('constrained');
    expect(status('team-implementation').slice(6).some((s) => s === 'severe')).toBe(false);
  });
  it('the first thing that breaks is Implementation, in February', () => {
    expect(base.summary.firstBreakTeamId).toBe('team-implementation');
    expect(base.summary.firstBreakMonth).toBe('2027-02');
    expect(status('team-implementation')[0]).toBe('watch');
  });
  it('International Expansion cannot start in March: the dependency pushes it to December', () => {
    const intl = base.initiatives.find((i) => i.initiativeId === 'init-international-expansion')!;
    expect(intl.effectiveStart).toBe('2027-12');
    expect(intl.pushedBy?.predecessorId).toBe('init-platform-scale');
    expect(base.constraints[0].kind).toBe('sequencing');
    expect(base.constraints[0].initiativeId).toBe('init-international-expansion');
  });
  it('the plan is under budget in the base case', () => {
    expect(base.financials.annualVarianceUsd).toBeLessThan(0);
  });
  it('headcount ends the year lower than it started because the plan has no backfill', () => {
    expect(base.summary.endingFte).toBeLessThan(base.summary.startingFte);
  });
});

describe('Atlas Systems scenarios', () => {
  it('a hiring freeze leaves Implementation constrained from February through November', () => {
    const r = run(model, { scenario: 'scenario-hiring-freeze' });
    expect(status('team-implementation', r).slice(1, 11).every((s) => s === 'constrained' || s === 'severe')).toBe(true);
    expect(team('team-implementation', r).months.some((m) => m.status === 'severe')).toBe(true);
  });
  it('a 10% budget cut opens a gap and names the levers', () => {
    const r = run(model, { scenario: 'scenario-budget-cut' });
    expect(r.financials.annualVarianceUsd).toBeGreaterThan(0);
    expect(r.constraints.some((c) => c.kind === 'budget')).toBe(true);
    expect(r.financials.budgetLevers.length).toBeGreaterThanOrEqual(4);
  });
  it('growth of 20% pushes most operational teams over capacity', () => {
    const r = run(model, { scenario: 'scenario-growth-20' });
    expect(r.summary.teamsConstrained).toBeGreaterThanOrEqual(5);
  });
});

describe('Atlas Systems interventions', () => {
  it('expediting the hires shortens the constrained window without adding people', () => {
    const r = run(model, { interventions: ['intervention-expedite-implementation'] });
    expect(team('team-implementation', r).monthsConstrained).toBeLessThan(team('team-implementation').monthsConstrained);
    expect(team('team-implementation', r).months.reduce((s, m) => s + m.hiresLanded, 0)).toBe(10);
    expect(Math.abs(team('team-implementation', r).endingFte - team('team-implementation').endingFte)).toBeLessThan(0.5);
  });
  it('reallocation relieves Implementation and pushes Customer Operations into constrained', () => {
    const r = run(model, { interventions: ['intervention-reallocate-to-implementation'] });
    expect(team('team-implementation', r).monthsConstrained).toBeLessThan(team('team-implementation').monthsConstrained);
    expect(team('team-customer-ops', r).worstStatus).toBe('constrained');
  });
  it('deferring International by three months changes nothing, because the dependency already pushed it further', () => {
    const r = run(model, { interventions: ['intervention-defer-international'] });
    expect(r.teams.reduce((s, t) => s + t.totalGapHours, 0)).toBeCloseTo(base.teams.reduce((s, t) => s + t.totalGapHours, 0), 6);
  });
});
