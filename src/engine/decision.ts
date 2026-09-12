/**
 * Preference-weighted comparison of explicit options. Not an optimizer.
 *
 * cost   = incremental total cost versus Do Nothing over the horizon
 * speed  = residual capacity-gap hours across all teams and months, measured
 *          against the plan's own utilization targets (captures both when an
 *          intervention lands and how much it closes; a service-level change
 *          moves the target, not the work, so it cannot score here)
 * exposure = residual expected revenue exposure
 *
 * Each metric is min-max normalized across the options being compared,
 * including Do Nothing, then inverted so lower is better. Adding or removing
 * an option changes the others' scores; the UI must say so.
 */
import type { DecisionWeights } from '../models/types';
import type { ModelResult } from '../models/results';

export interface DecisionOption {
  id: string;
  label: string;
  result: ModelResult;
}

export interface DecisionRow {
  id: string;
  label: string;
  incrementalCostUsd: number;
  residualGapHours: number;
  residualExposureUsd: number;
  costUtility: number;
  speedUtility: number;
  exposureUtility: number;
  score: number;
  rank: number;
}

function utility(values: number[]): number[] {
  const lo = Math.min(...values), hi = Math.max(...values);
  if (!(hi > lo)) return values.map(() => 1);
  return values.map((v) => 1 - (v - lo) / (hi - lo));
}

export function compareOptions(doNothing: ModelResult, options: DecisionOption[], weights: DecisionWeights): DecisionRow[] {
  const all: DecisionOption[] = [{ id: 'do-nothing', label: 'Do nothing', result: doNothing }, ...options];
  const base = doNothing.financials.annualTotalCostUsd;
  const cost = all.map((o) => o.result.financials.annualTotalCostUsd - base);
  const gap = all.map((o) => o.result.teams.reduce((s, t) => s + t.totalGapVsPlanHours, 0));
  const exp = all.map((o) => o.result.exposure.totalUsd);
  const cu = utility(cost), su = utility(gap), eu = utility(exp);
  const rows = all.map((o, i) => ({
    id: o.id,
    label: o.label,
    incrementalCostUsd: cost[i],
    residualGapHours: gap[i],
    residualExposureUsd: exp[i],
    costUtility: cu[i],
    speedUtility: su[i],
    exposureUtility: eu[i],
    score: cu[i] * weights.cost + su[i] * weights.speed + eu[i] * weights.revenueExposure,
    rank: 0,
  }));
  const sorted = [...rows].sort((a, b) => b.score - a.score);
  sorted.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}
