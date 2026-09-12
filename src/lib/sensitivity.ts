/**
 * What actually moves the answer: rerun the model with one assumption nudged
 * at a time and report the change in hours over capacity and peak shortfall.
 */
import { run } from '../engine';
import type { Intervention, OperatingModel, Scenario, ScenarioEffect } from '../models/types';
import type { ModelResult } from '../models/results';

export interface Sens { variable: string; change: string; gapHours: number; shortfall: number }

const gap = (r: ModelResult) => r.teams.reduce((s, t) => s + t.totalGapVsPlanHours, 0);
const peak = (r: ModelResult) => { let b = 0; for (const t of r.teams) for (const m of t.months) b = Math.max(b, m.workforceGap); return b; };

export function sensitivity(model: OperatingModel, scenario: Scenario, levers: Intervention[], cur: ModelResult): Sens[] {
  const out: Sens[] = [];
  const g0 = gap(cur), p0 = peak(cur);
  const withScenario = (extra: ScenarioEffect): Scenario => {
    const effects = scenario.type === 'combined' ? [...scenario.effects, extra] : scenario.type === 'base' ? [extra] : [scenario, extra];
    return { id: 'sens', name: 'sens', type: 'combined', effects };
  };
  const add = (variable: string, change: string, r: ModelResult) => out.push({ variable, change, gapHours: gap(r) - g0, shortfall: peak(r) - p0 });
  add('Demand', '+10%', run(model, { scenario: withScenario({ type: 'demandMultiplier', demandMultiplier: 1.1 }), interventions: levers }));
  add('Productivity', '+10%', run(model, { scenario: withScenario({ type: 'productivityMultiplier', multiplier: 1.1 }), interventions: levers }));
  add('Attrition', '×1.5', run(model, { scenario: withScenario({ type: 'attritionMultiplier', multiplier: 1.5 }), interventions: levers }));
  // Target utilization and lead time are model edits, not scenarios.
  const mT = structuredClone(model); for (const t of mT.teams) t.targetUtilization = Math.min(1, t.targetUtilization + 0.05);
  add('Target utilization', '+5 pts', run(mT, { scenario: scenario.id === 'sens' ? undefined : scenario, interventions: levers }));
  const mL = structuredClone(model); for (const h of mL.hiringPlan) h.leadTimeMonths += 2;
  add('Hiring lead time', '+2 months', run(mL, { scenario: scenario.id === 'sens' ? undefined : scenario, interventions: levers }));
  const mS = structuredClone(model); for (const s of mS.demandStreams) s.handlingMinutesPerUnit *= 1.1;
  add('Handling time', '+10%', run(mS, { scenario: scenario.id === 'sens' ? undefined : scenario, interventions: levers }));
  return out.sort((a, b) => Math.abs(b.gapHours) - Math.abs(a.gapHours));
}
