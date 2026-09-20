import type { OperatingModel, ScenarioEffect } from '../models/types';
import { isMonthKey, expandMonths, monthIndex } from './calendar';

export class ModelValidationError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`Model failed validation:\n  - ${problems.join('\n  - ')}`);
    this.name = 'ModelValidationError';
    this.problems = problems;
  }
}

const MONTH_NAMES = ['01','02','03','04','05','06','07','08','09','10','11','12'];

function inRange(v: number, lo: number, hi: number): boolean {
  return Number.isFinite(v) && v >= lo && v <= hi;
}

/** Returns a list of readable problems. Empty means valid. */
export function validateModel(m: OperatingModel): string[] {
  const p: string[] = [];
  const say = (s: string) => p.push(s);

  if (!isMonthKey(m.calendar.startMonth)) say(`calendar.startMonth "${m.calendar.startMonth}" is not YYYY-MM`);
  if (!isMonthKey(m.calendar.endMonth)) say(`calendar.endMonth "${m.calendar.endMonth}" is not YYYY-MM`);
  if (p.length) return p;
  const months = expandMonths(m.calendar.startMonth, m.calendar.endMonth);
  if (months.length < 1) say('calendar has no months');
  if (!(m.calendar.workHoursPerFteMonth > 0)) say('calendar.workHoursPerFteMonth must be positive');

  const teamIds = new Set<string>();
  for (const t of m.teams) {
    if (teamIds.has(t.id)) say(`duplicate team id "${t.id}"`);
    teamIds.add(t.id);
    if (!(t.currentFte >= 0)) say(`team ${t.id}: currentFte cannot be negative`);
    if (!inRange(t.shrinkage, 0, 0.99)) say(`team ${t.id}: shrinkage must be between 0 and 0.99`);
    if (!inRange(t.targetUtilization, 0.01, 1)) say(`team ${t.id}: targetUtilization must be between 0.01 and 1`);
    if (!inRange(t.annualAttrition, 0, 0.99)) say(`team ${t.id}: annualAttrition must be between 0 and 0.99`);
    if (!(t.monthlyFteCostUsd >= 0)) say(`team ${t.id}: monthlyFteCostUsd cannot be negative`);
  }

  // Seasonality: the model-level profile must name all twelve calendar months.
  const seasonKeys = Object.keys(m.seasonality);
  const seasonMonths = new Set(seasonKeys.map((k) => k.slice(5)));
  for (const mm of MONTH_NAMES) if (!seasonMonths.has(mm)) say(`seasonality is missing calendar month ${mm}`);
  for (const [k, v] of Object.entries(m.seasonality)) {
    if (!isMonthKey(k)) say(`seasonality key "${k}" is not YYYY-MM`);
    if (!(v >= 0)) say(`seasonality[${k}] cannot be negative`);
  }

  const streamsByTeam = new Map<string, number>();
  const streamIds = new Set<string>();
  for (const s of m.demandStreams) {
    if (streamIds.has(s.id)) say(`duplicate demand stream id "${s.id}"`);
    streamIds.add(s.id);
    if (!teamIds.has(s.teamId)) say(`demand stream ${s.id} references unknown team "${s.teamId}"`);
    streamsByTeam.set(s.teamId, (streamsByTeam.get(s.teamId) ?? 0) + 1);
    if (!(s.annualVolume >= 0)) say(`demand stream ${s.id}: annualVolume cannot be negative`);
    if (!(s.handlingMinutesPerUnit >= 0)) say(`demand stream ${s.id}: handlingMinutesPerUnit cannot be negative`);
    if (!(s.complexityFactor > 0)) say(`demand stream ${s.id}: complexityFactor must be positive`);
    const mix = s.workMix.reusable + s.workMix.configurable + s.workMix.bespoke;
    if (Math.abs(mix - 1) > 1e-6) say(`demand stream ${s.id}: workMix sums to ${mix.toFixed(3)}, must be 1`);
    if (s.seasonality !== 'default') {
      const own = new Set(Object.keys(s.seasonality).map((k) => k.slice(5)));
      for (const mm of MONTH_NAMES) if (!own.has(mm)) say(`demand stream ${s.id}: seasonality override is missing month ${mm}`);
    }
  }
  for (const t of m.teams) {
    const n = streamsByTeam.get(t.id) ?? 0;
    if (t.teamType === 'portfolio-only' && n > 0) say(`team ${t.id} is portfolio-only but has ${n} demand stream(s)`);
    if (t.teamType !== 'portfolio-only' && n === 0) say(`team ${t.id} is ${t.teamType} but has no demand stream (it would read as healthy for the wrong reason)`);
  }

  const hireIds = new Set<string>();
  for (const h of m.hiringPlan) {
    if (hireIds.has(h.id)) say(`duplicate hiring request id "${h.id}"`);
    hireIds.add(h.id);
    if (!teamIds.has(h.teamId)) say(`hiring request ${h.id} references unknown team "${h.teamId}"`);
    if (!isMonthKey(h.requestMonth)) say(`hiring request ${h.id}: requestMonth "${h.requestMonth}" is not YYYY-MM`);
    if (!(h.headcount >= 0)) say(`hiring request ${h.id}: headcount cannot be negative`);
    if (!(h.leadTimeMonths >= 0)) say(`hiring request ${h.id}: leadTimeMonths cannot be negative`);
  }

  const initIds = new Set<string>();
  for (const i of m.initiatives) {
    if (initIds.has(i.id)) say(`duplicate initiative id "${i.id}"`);
    initIds.add(i.id);
    if (!isMonthKey(i.startMonth)) say(`initiative ${i.id}: startMonth "${i.startMonth}" is not YYYY-MM`);
    if (!(i.durationMonths >= 1)) say(`initiative ${i.id}: durationMonths must be at least 1`);
    for (const [tid, fte] of Object.entries(i.requiredFteByTeam)) {
      if (!teamIds.has(tid)) say(`initiative ${i.id} requires FTE from unknown team "${tid}"`);
      if (!(fte >= 0)) say(`initiative ${i.id}: required FTE for ${tid} cannot be negative`);
    }
    if (!inRange(i.executionFailureProbability, 0, 1)) say(`initiative ${i.id}: executionFailureProbability must be between 0 and 1`);
    if (!inRange(i.confidence, 0, 1)) say(`initiative ${i.id}: confidence must be between 0 and 1`);
    if (!(i.revenueAtRiskUsd >= 0)) say(`initiative ${i.id}: revenueAtRiskUsd cannot be negative`);
    if (typeof i.discretionary !== 'boolean') say(`initiative ${i.id}: discretionary must be true or false`);
  }

  const depIds = new Set<string>();
  const edges = new Map<string, string[]>();
  for (const d of m.dependencies) {
    if (depIds.has(d.id)) say(`duplicate dependency id "${d.id}"`);
    depIds.add(d.id);
    if (!initIds.has(d.predecessorId)) say(`dependency ${d.id} references unknown predecessor "${d.predecessorId}"`);
    if (!initIds.has(d.successorId)) say(`dependency ${d.id} references unknown successor "${d.successorId}"`);
    if (d.predecessorId === d.successorId) say(`dependency ${d.id} points an initiative at itself`);
    if (!(d.lagMonths >= 0)) say(`dependency ${d.id}: lagMonths cannot be negative`);
    edges.set(d.predecessorId, [...(edges.get(d.predecessorId) ?? []), d.successorId]);
  }
  // Cycle check (DFS with colors).
  const color = new Map<string, 0 | 1 | 2>();
  const visit = (n: string, path: string[]): void => {
    const c = color.get(n) ?? 0;
    if (c === 1) { say(`circular dependency: ${[...path, n].join(' -> ')}`); return; }
    if (c === 2) return;
    color.set(n, 1);
    for (const s of edges.get(n) ?? []) visit(s, [...path, n]);
    color.set(n, 2);
  };
  for (const id of initIds) visit(id, []);

  if (!(m.budget.modeledAnnualBudgetUsd >= 0)) say('budget.modeledAnnualBudgetUsd cannot be negative');

  const w = m.decisionWeights;
  const wsum = w.cost + w.speed + w.revenueExposure;
  if (Math.abs(wsum - 1) > 1e-6) say(`decisionWeights sum to ${wsum.toFixed(3)}, must be 1`);

  const pool = m.pooling;
  if (!(pool.clientCount >= 1)) say('pooling.clientCount must be at least 1');
  if (!(pool.workloadPerClient > 0)) say('pooling.workloadPerClient must be positive');
  if (!inRange(pool.serviceLevel, 0, 1)) say('pooling.serviceLevel must be between 0 and 1');
  if (!inRange(pool.bespokeShare, 0, 1)) say('pooling.bespokeShare must be between 0 and 1');
  if (!(pool.contextPenalty >= 0)) say('pooling.contextPenalty cannot be negative');

  const scenIds = new Set<string>();
  const checkEffect = (id: string, e: ScenarioEffect) => {
    if ('fromMonth' in e && e.fromMonth !== undefined && !isMonthKey(e.fromMonth)) say(`scenario ${id}: fromMonth is not YYYY-MM`);
    if (e.type === 'demandMultiplier') {
      if (!(e.demandMultiplier >= 0)) say(`scenario ${id}: demandMultiplier cannot be negative`);
      for (const sid of e.streamIds ?? []) if (!streamIds.has(sid)) say(`scenario ${id} references unknown demand stream "${sid}"`);
    }
    if (e.type === 'budgetConstraint' && !(e.budgetMultiplier >= 0)) say(`scenario ${id}: budgetMultiplier cannot be negative`);
    if (e.type === 'productivityMultiplier' && !(e.multiplier > 0)) say(`scenario ${id}: productivity multiplier must be positive`);
    if ((e.type === 'productivityMultiplier' || e.type === 'attritionMultiplier') && e.teamIds) for (const tid of e.teamIds) if (!teamIds.has(tid)) say(`scenario ${id} references unknown team "${tid}"`);
    if (e.type === 'attritionMultiplier' && !(e.multiplier >= 0)) say(`scenario ${id}: attrition multiplier cannot be negative`);
  };
  for (const s of m.scenarios) {
    if (scenIds.has(s.id)) say(`duplicate scenario id "${s.id}"`);
    scenIds.add(s.id);
    if (s.type === 'combined') { if (!s.effects.length) say(`scenario ${s.id}: combined scenario has no effects`); s.effects.forEach((e) => checkEffect(s.id, e)); }
    else if (s.type !== 'base') checkEffect(s.id, s);
  }
  if (m.scenarios.filter((s) => s.type === 'base').length !== 1) say('exactly one scenario of type "base" is required');

  const intIds = new Set<string>();
  for (const iv of m.interventions) {
    if (intIds.has(iv.id)) say(`duplicate intervention id "${iv.id}"`);
    intIds.add(iv.id);
    if (iv.startMonth !== undefined) {
      if (!isMonthKey(iv.startMonth)) say(`intervention ${iv.id}: startMonth is not YYYY-MM`);
      else if (monthIndex(m.calendar.startMonth, iv.startMonth) < 0) say(`intervention ${iv.id}: startMonth is before the horizon`);
    }
    switch (iv.type) {
      case 'expediteHiring':
        if (!hireIds.has(iv.hiringRequestId)) say(`intervention ${iv.id} references unknown hiring request "${iv.hiringRequestId}"`);
        if (!(iv.newLeadTimeMonths >= 0)) say(`intervention ${iv.id}: newLeadTimeMonths cannot be negative`);
        break;
      case 'hire':
        if (!teamIds.has(iv.teamId)) say(`intervention ${iv.id} references unknown team "${iv.teamId}"`);
        break;
      case 'automation':
        if (!teamIds.has(iv.teamId)) say(`intervention ${iv.id} references unknown team "${iv.teamId}"`);
        if (!inRange(iv.workloadReductionRate, 0, 1)) say(`intervention ${iv.id}: workloadReductionRate must be between 0 and 1`);
        break;
      case 'reallocation':
        if (!teamIds.has(iv.fromTeamId)) say(`intervention ${iv.id} references unknown team "${iv.fromTeamId}"`);
        if (!teamIds.has(iv.toTeamId)) say(`intervention ${iv.id} references unknown team "${iv.toTeamId}"`);
        if (iv.fromTeamId === iv.toTeamId) say(`intervention ${iv.id} reallocates a team to itself`);
        break;
      case 'defer':
      case 'cancel':
        if (!initIds.has(iv.initiativeId)) say(`intervention ${iv.id} references unknown initiative "${iv.initiativeId}"`);
        break;
      case 'serviceLevelChange':
        if (!teamIds.has(iv.teamId)) say(`intervention ${iv.id} references unknown team "${iv.teamId}"`);
        if (!inRange(iv.newTargetUtilization, 0.01, 1)) say(`intervention ${iv.id}: newTargetUtilization must be between 0.01 and 1`);
        break;
    }
  }

  /* The guided run, if the model carries one. Every reference has to resolve or the run
     offers a choice that does nothing and says nothing about why. */
  if (m.run) {
    if (m.run.scenarioId && !scenIds.has(m.run.scenarioId)) {
      say(`run references unknown scenario "${m.run.scenarioId}"`);
    }
    if (!Array.isArray(m.run.decisions) || m.run.decisions.length === 0) {
      say('run has no decisions');
    } else {
      const seen = new Set<string>();
      for (const d of m.run.decisions) {
        if (seen.has(d.id)) say(`duplicate run decision id "${d.id}"`);
        seen.add(d.id);
        if (!Number.isInteger(d.monthIndex) || d.monthIndex < 0 || d.monthIndex >= months.length) {
          say(`run decision ${d.id}: monthIndex ${d.monthIndex} is outside the plan year`);
        }
        if (d.focusTeamId && !teamIds.has(d.focusTeamId)) {
          say(`run decision ${d.id} references unknown team "${d.focusTeamId}"`);
        }
        if (!d.options?.length) say(`run decision ${d.id} has no options`);
        for (const o of d.options ?? []) {
          if (o.interventionId && !intIds.has(o.interventionId)) {
            say(`run decision ${d.id} offers unknown intervention "${o.interventionId}"`);
          }
        }
        if (!d.options?.some((o) => o.interventionId === null)) {
          say(`run decision ${d.id} has no do-nothing option, which is always a real answer`);
        }
      }
    }
  }
  return p;
}

export function assertValid(m: OperatingModel): void {
  const problems = validateModel(m);
  if (problems.length) throw new ModelValidationError(problems);
}

/**
 * Non-fatal inconsistencies between the model's own numbers. Shown to the
 * reader; they never stop a run.
 */
export function modelWarnings(m: OperatingModel): string[] {
  const w: string[] = [];
  const modeled = m.teams.reduce((s, t) => s + t.currentFte, 0);
  if (modeled > m.strategy.employeeCount) w.push(`The modeled teams hold ${Math.round(modeled)} people but the company is said to have ${m.strategy.employeeCount}.`);
  const cost = m.teams.reduce((s, t) => s + t.currentFte * t.monthlyFteCostUsd * 12, 0);
  if (m.budget.modeledAnnualBudgetUsd > m.strategy.operatingCostTargetUsd) w.push(`The budget for the modeled teams exceeds the company's whole operating cost target.`);
  if (cost > m.budget.modeledAnnualBudgetUsd * 1.25) w.push(`Starting headcount alone costs ${Math.round(cost / 1e6)}M a year against a ${Math.round(m.budget.modeledAnnualBudgetUsd / 1e6)}M budget; the plan is over budget before anything happens.`);
  const season = Object.values(m.seasonality);
  const avg = season.reduce((a, b) => a + b, 0) / season.length;
  if (Math.abs(avg - 1) > 0.02) w.push(`Seasonality multipliers average ${avg.toFixed(2)}, not 1.0; they are normalized to shares, so only the shape matters, but the numbers may not mean what you intended.`);
  for (const t of m.teams) {
    if (t.targetUtilization > 0.9) w.push(`${t.name} targets ${Math.round(t.targetUtilization * 100)}% utilization, which leaves almost no room for peaks.`);
    if (t.annualAttrition > 0.3) w.push(`${t.name} loses ${Math.round(t.annualAttrition * 100)}% of its people a year; check that is intended.`);
  }
  for (const h of m.hiringPlan) {
    const t = m.teams.find((x) => x.id === h.teamId);
    if (t && h.headcount > t.currentFte) w.push(`The hiring request for ${t.name} (${h.headcount}) is larger than the team (${t.currentFte}).`);
  }
  for (const i of m.initiatives) {
    for (const [tid, f] of Object.entries(i.requiredFteByTeam)) {
      const t = m.teams.find((x) => x.id === tid);
      if (t && f > t.currentFte * 0.5) w.push(`${i.name} takes ${f} of ${t.name}'s ${t.currentFte} people; more than half the team.`);
    }
    if (i.revenueAtRiskUsd > i.financialValueUsd) w.push(`${i.name} has more revenue at risk than value; check the two numbers.`);
  }
  return w;
}
