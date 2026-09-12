/**
 * "What changed?": a causal reading of the current configuration against the
 * base plan, in the order the model computes it: work, people, timing, money.
 * Every sentence is built from the two results; nothing is fixed text.
 */
import type { Intervention, OperatingModel, Scenario, ScenarioEffect } from '../models/types';
import type { ModelResult } from '../models/results';
import { money, monthLabel, pct } from './format';

export interface Changed { cause: string; effects: string[] }

function effectCause(e: ScenarioEffect, model: OperatingModel, teamName: (id: string) => string): string {
  switch (e.type) {
    case 'demandMultiplier': {
      const which = e.streamIds ? e.streamIds.map((id) => model.demandStreams.find((s) => s.id === id)?.name ?? id).join(', ') : 'every stream';
      return `Demand ${e.demandMultiplier >= 1 ? 'up' : 'down'} ${pct(Math.abs(e.demandMultiplier - 1))} on ${which}${e.fromMonth ? ` from ${monthLabel(e.fromMonth)}` : ''}`;
    }
    case 'hiringFreeze': { const n = model.hiringPlan.reduce((s, h) => s + h.headcount, 0); return `Hiring freeze: ${n} planned hires cancelled`; }
    case 'budgetConstraint': return `Budget cap ${e.budgetMultiplier < 1 ? 'cut' : 'raised'} to ${pct(e.budgetMultiplier)} of plan`;
    case 'failureProbabilityMultiplier': return `Execution risk ×${e.multiplier} on every initiative`;
    case 'productivityMultiplier': return `Productivity ×${e.multiplier}${e.teamIds ? ` on ${e.teamIds.map(teamName).join(', ')}` : ''}`;
    case 'attritionMultiplier': return `Attrition ×${e.multiplier}${e.teamIds ? ` on ${e.teamIds.map(teamName).join(', ')}` : ' everywhere'}`;
  }
}

export function whatChanged(model: OperatingModel, scenario: Scenario, levers: Intervention[], cur: ModelResult, base: ModelResult, teamName: (id: string) => string, initName: (id: string) => string): Changed | null {
  const causes: string[] = [];
  if (scenario.type === 'combined') causes.push(...scenario.effects.map((e) => effectCause(e, model, teamName)));
  else if (scenario.type !== 'base') causes.push(effectCause(scenario, model, teamName));
  for (const iv of levers) causes.push(iv.name);
  if (!causes.length) return null;

  const fx: string[] = [];
  const t = (r: ModelResult, id: string) => r.teams.find((x) => x.teamId === id)!;
  // Work
  const workB = base.teams.reduce((s, x) => s + x.annualWorkloadHours, 0), workC = cur.teams.reduce((s, x) => s + x.annualWorkloadHours, 0);
  if (Math.abs(workC - workB) / workB > 0.005) fx.push(`Work: ${Math.round(workB).toLocaleString()} → ${Math.round(workC).toLocaleString()} hours for the year (${pct((workC - workB) / workB)}).`);
  // People
  if (Math.round(cur.summary.endingFte) !== Math.round(base.summary.endingFte)) fx.push(`People: ${Math.round(base.summary.endingFte)} → ${Math.round(cur.summary.endingFte)} in December.`);
  const landB = base.teams.flatMap((x) => x.months.filter((m) => m.hiresLanded > 0).map((m) => `${teamName(x.teamId)} ${monthLabel(m.month)}`));
  const landC = cur.teams.flatMap((x) => x.months.filter((m) => m.hiresLanded > 0).map((m) => `${teamName(x.teamId)} ${monthLabel(m.month)}`));
  if (landB.join() !== landC.join()) fx.push(`Hires land: ${landC.length ? landC.join(', ') : 'none'}${landB.length ? ` (was ${landB.join(', ')})` : ''}.`);
  // Capacity, team by team where it moved
  const moved: string[] = [];
  for (const c of cur.teams) {
    const b = t(base, c.teamId);
    if (c.monthsConstrained !== b.monthsConstrained) moved.push(`${teamName(c.teamId)} ${b.monthsConstrained} → ${c.monthsConstrained} months over capacity`);
  }
  if (moved.length) fx.push(`Capacity: ${moved.join('; ')}.`);
  if (cur.summary.firstBreakMonth !== base.summary.firstBreakMonth || cur.summary.firstBreakTeamId !== base.summary.firstBreakTeamId) {
    fx.push(`First break: ${cur.summary.firstBreakTeamId ? `${teamName(cur.summary.firstBreakTeamId)} in ${monthLabel(cur.summary.firstBreakMonth!)}` : 'none'} (was ${base.summary.firstBreakTeamId ? `${teamName(base.summary.firstBreakTeamId)} in ${monthLabel(base.summary.firstBreakMonth!)}` : 'none'}).`);
  }
  // Timing of initiatives
  for (const s of cur.initiatives) {
    const b = base.initiatives.find((x) => x.initiativeId === s.initiativeId)!;
    if (s.effectiveStart !== b.effectiveStart || s.status !== b.status) fx.push(`${initName(s.initiativeId)}: ${s.status === 'cancelled' ? 'cancelled' : `starts ${monthLabel(s.effectiveStart!)}`} (was ${b.status === 'cancelled' ? 'cancelled' : monthLabel(b.effectiveStart!)}).`);
  }
  // Money
  const dc = cur.financials.annualTotalCostUsd - base.financials.annualTotalCostUsd;
  if (Math.abs(dc) > 5e4) fx.push(`Cost: ${money(base.financials.annualTotalCostUsd)} → ${money(cur.financials.annualTotalCostUsd)} (${money(dc, { sign: true })}).`);
  if (Math.sign(cur.financials.annualVarianceUsd) !== Math.sign(base.financials.annualVarianceUsd) || Math.abs(cur.financials.annualVarianceUsd - base.financials.annualVarianceUsd) > 5e5) fx.push(`Budget: ${money(base.financials.annualVarianceUsd, { sign: true })} → ${money(cur.financials.annualVarianceUsd, { sign: true })} against the cap.`);
  const de = cur.summary.revenueExposureUsd - base.summary.revenueExposureUsd;
  if (Math.abs(de) > 1e5) fx.push(`Revenue exposure: ${money(base.summary.revenueExposureUsd)} → ${money(cur.summary.revenueExposureUsd)} (${money(de, { sign: true })}).`);
  if (!fx.length) fx.push('No material change from the base plan.');
  return { cause: causes.join(' + '), effects: fx };
}
