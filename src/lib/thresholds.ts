/**
 * "What would change my mind": thresholds found by scanning the model.
 * Each one is a sentence with the number the model found, never a fixed claim.
 */
import { monthIndex, run } from '../engine';
import type { Intervention, OperatingModel } from '../models/types';
import { monthLabel, pct } from './format';

export interface Threshold { variable: string; text: string }

export function thresholds(model: OperatingModel, scenarioId: string, active: Intervention[], teamName: (id: string) => string): Threshold[] {
  const out: Threshold[] = [];
  const cur = run(model, { scenario: scenarioId, interventions: active });
  const over = cur.summary.teamsConstrained;
  const scen = model.scenarios.find((s) => s.id === scenarioId)!;
  const baseMult = scen.type === 'demandMultiplier' ? scen.demandMultiplier : 1;

  // Demand growth until another team goes over capacity.
  for (let k = 0.02; k <= 0.6; k += 0.02) {
    const r = run(model, { scenario: { id: 'x', name: 'x', type: 'demandMultiplier', demandMultiplier: baseMult * (1 + k) }, interventions: active });
    if (r.summary.teamsConstrained > over) {
      const newly = r.teams.find((t) => (t.worstStatus === 'constrained' || t.worstStatus === 'severe') && cur.teams.find((c) => c.teamId === t.teamId)!.worstStatus !== 'constrained' && cur.teams.find((c) => c.teamId === t.teamId)!.worstStatus !== 'severe');
      out.push({ variable: 'demand', text: `Demand can run ${pct(k)} above ${scen.type === 'base' ? 'plan' : 'this scenario'} before another team goes over capacity${newly ? ` (${teamName(newly.teamId)})` : ''}.` });
      break;
    }
  }
  if (!out.some((t) => t.variable === 'demand')) out.push({ variable: 'demand', text: `Demand can run 60% above ${scen.type === 'base' ? 'plan' : 'this scenario'} without another team going over capacity.` });

  // Hiring lead time until an expedite or hire stops changing the picture.
  for (const iv of active) {
    if (iv.type !== 'expediteHiring' && iv.type !== 'hire') continue;
    const teamId = iv.type === 'hire' ? iv.teamId : model.hiringPlan.find((h) => h.id === iv.hiringRequestId)?.teamId;
    if (!teamId) continue;
    const without = active.filter((x) => x.id !== iv.id);
    const before = run(model, { scenario: scenarioId, interventions: without }).teams.find((t) => t.teamId === teamId)!.monthsConstrained;
    const lead0 = iv.type === 'hire' ? iv.leadTimeMonths : iv.newLeadTimeMonths;
    for (let lead = lead0; lead <= 12; lead++) {
      const alt: Intervention = iv.type === 'hire' ? { ...iv, leadTimeMonths: lead } : { ...iv, newLeadTimeMonths: lead };
      const after = run(model, { scenario: scenarioId, interventions: [...without, alt] }).teams.find((t) => t.teamId === teamId)!.monthsConstrained;
      if (after >= before) { out.push({ variable: 'leadTime', text: `“${iv.name}” stops helping ${teamName(teamId)} if the lead time slips to ${lead} months.` }); break; }
    }
  }

  // Automation: the smallest reduction that keeps the team within capacity.
  for (const iv of active) {
    if (iv.type !== 'automation') continue;
    const without = active.filter((x) => x.id !== iv.id);
    let found: number | null = null;
    for (let rate = 0.02; rate <= 0.6; rate += 0.02) {
      const r = run(model, { scenario: scenarioId, interventions: [...without, { ...iv, workloadReductionRate: rate }] }).teams.find((t) => t.teamId === iv.teamId)!;
      if (r.monthsConstrained === 0) { found = rate; break; }
    }
    if (found !== null) {
      out.push({ variable: 'automation', text: `${teamName(iv.teamId)} stays within capacity all year once the reduction reaches ${pct(found)}; below that, some months remain over.` });
    } else {
      const at60 = run(model, { scenario: scenarioId, interventions: [...without, { ...iv, workloadReductionRate: 0.6 }] }).teams.find((t) => t.teamId === iv.teamId)!;
      const s0 = iv.startMonth ? Math.max(0, monthIndex(model.calendar.startMonth, iv.startMonth)) : 0;
      const landIdx = s0 + iv.timeToImpactMonths;
      const early = at60.months.filter((m) => (m.status === 'constrained' || m.status === 'severe') && m.monthIndex < landIdx);
      out.push({ variable: 'automation', text: early.length && early.length === at60.monthsConstrained
        ? `“${iv.name}” lands in ${monthLabel(at60.months[Math.min(landIdx, at60.months.length - 1)].month)}; the ${early.length === 1 ? 'month' : `${early.length} months`} over capacity before that cannot be fixed by any reduction, only by something faster.`
        : `No reduction up to 60% keeps ${teamName(iv.teamId)} within capacity all year on its own.` });
    }
  }

  // Pooling crossover from the article's model.
  const pool = model.pooling;
  if (pool.contextPenalty > 0) {
    // Computed in the engine's pooled module; surfaced here as a threshold sentence.
    out.push({ variable: 'pooling', text: `Pooling support stays cheaper than dedicated pods until pooled work runs about ${pct(poolCrossover(model))} slower on every task.` });
  }
  return out;
}

import { comparePooling } from '../engine';
function poolCrossover(model: OperatingModel): number {
  return comparePooling(model.pooling).crossoverPenalty ?? 5;
}
