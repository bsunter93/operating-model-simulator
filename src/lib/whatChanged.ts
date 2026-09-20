/**
 * "What changed?": a causal chain from the current configuration against the
 * base plan, in the order the model computes it: cause, work, people, hires,
 * capacity, timing, money. Every step is built from the two results.
 */
import type { Intervention, OperatingModel, Scenario, ScenarioEffect } from '../models/types';
import type { ModelResult } from '../models/results';
import { fmtFor, monthLabel, pct } from './format';

export interface Step { label: string; from: string; to: string; note?: string }
export interface Changed { cause: string; steps: Step[] }

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
  const { money, num } = fmtFor(model);
  const causes: string[] = [];
  if (scenario.type === 'combined') causes.push(...scenario.effects.map((e) => effectCause(e, model, teamName)));
  else if (scenario.type !== 'base') causes.push(effectCause(scenario, model, teamName));
  for (const iv of levers) causes.push(iv.name);
  if (!causes.length) return null;

  const steps: Step[] = [];
  const t = (r: ModelResult, id: string) => r.teams.find((x) => x.teamId === id)!;
  const workB = base.teams.reduce((s, x) => s + x.annualWorkloadHours, 0), workC = cur.teams.reduce((s, x) => s + x.annualWorkloadHours, 0);
  if (Math.abs(workC - workB) / workB > 0.005) steps.push({ label: 'Work', from: `${num(workB)} h`, to: `${num(workC)} h`, note: pct((workC - workB) / workB) });
  if (Math.round(cur.summary.endingFte) !== Math.round(base.summary.endingFte)) steps.push({ label: 'People in December', from: `${Math.round(base.summary.endingFte)}`, to: `${Math.round(cur.summary.endingFte)}` });
  const land = (r: ModelResult) => r.teams.flatMap((x) => x.months.filter((m) => m.hiresLanded > 0).map((m) => `${teamName(x.teamId)} ${monthLabel(m.month)}`));
  const lb = land(base), lc = land(cur);
  if (lb.join() !== lc.join()) steps.push({ label: 'Hires land', from: lb.length ? lb.join(', ') : 'none', to: lc.length ? lc.join(', ') : 'none' });
  const moved = cur.teams.filter((c) => c.monthsConstrained !== t(base, c.teamId).monthsConstrained)
    .sort((a, b) => Math.abs(b.monthsConstrained - t(base, b.teamId).monthsConstrained) - Math.abs(a.monthsConstrained - t(base, a.teamId).monthsConstrained));
  if (moved.length) {
    const top = moved.slice(0, 4), more = moved.length - top.length;
    steps.push({ label: 'Months over capacity', from: top.map((c) => `${teamName(c.teamId)} ${t(base, c.teamId).monthsConstrained}`).join(', '), to: top.map((c) => `${teamName(c.teamId)} ${c.monthsConstrained}`).join(', ') + (more ? `, and ${more} more team${more > 1 ? 's' : ''}` : '') });
  }
  if (cur.summary.firstBreakMonth !== base.summary.firstBreakMonth || cur.summary.firstBreakTeamId !== base.summary.firstBreakTeamId) {
    const f = (r: ModelResult) => (r.summary.firstBreakTeamId ? `${teamName(r.summary.firstBreakTeamId)}, ${monthLabel(r.summary.firstBreakMonth!)}` : 'none');
    steps.push({ label: 'First break', from: f(base), to: f(cur) });
  }
  for (const s of cur.initiatives) {
    const b = base.initiatives.find((x) => x.initiativeId === s.initiativeId)!;
    if (s.effectiveStart !== b.effectiveStart || s.status !== b.status) steps.push({ label: initName(s.initiativeId), from: b.status === 'cancelled' ? 'cancelled' : `starts ${monthLabel(b.effectiveStart!)}`, to: s.status === 'cancelled' ? 'cancelled' : `starts ${monthLabel(s.effectiveStart!)}` });
  }
  const dc = cur.financials.annualTotalCost - base.financials.annualTotalCost;
  if (Math.abs(dc) > 5e4) steps.push({ label: 'Cost', from: money(base.financials.annualTotalCost), to: money(cur.financials.annualTotalCost), note: money(dc, { sign: true }) });
  if (Math.sign(cur.financials.annualVariance) !== Math.sign(base.financials.annualVariance) || Math.abs(cur.financials.annualVariance - base.financials.annualVariance) > 5e5) steps.push({ label: 'Against budget', from: money(base.financials.annualVariance, { sign: true }), to: money(cur.financials.annualVariance, { sign: true }) });
  const de = cur.summary.revenueExposure - base.summary.revenueExposure;
  if (Math.abs(de) > 1e5) steps.push({ label: 'Revenue exposure', from: money(base.summary.revenueExposure), to: money(cur.summary.revenueExposure), note: money(de, { sign: true }) });
  if (!steps.length) steps.push({ label: 'Result', from: 'base plan', to: 'no material change' });
  return { cause: causes.join(' + '), steps };
}
