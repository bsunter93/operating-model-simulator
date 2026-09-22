import type { ModelResult } from '../models/results';
import type { OperatingModel } from '../models/types';
import type { Fmt } from './format';

/**
 * The things an organisation might be trying to protect, and how to score a year against
 * each one. Lower is always better, so the comparisons never have to remember a direction.
 *
 * These live here rather than in a view because two pages need the same list: the short
 * version ranks every ending against them, and the run reads a finished year back against
 * all of them at once. Which is the whole lesson in one table. You came third on one thing
 * and two hundredth on another, and both were the same five decisions.
 */

export type Objective = {
  id: string;
  label: (m: OperatingModel) => string;
  /** Who tends to walk in with this one. Rough, and said as rough. */
  who: string;
  /** Lower is better. */
  score: (r: ModelResult) => number;
  read: (r: ModelResult, fmt: Fmt) => string;
};

export const strain = (r: ModelResult) =>
  r.teams.reduce((a, t) => a + t.months.filter((m) => m.utilization > m.targetUtilization).length, 0);
export const spend = (r: ModelResult) => r.financials.monthly.reduce((a, m) => a + m.changeCost, 0);
export const lateness = (r: ModelResult) => r.initiatives.reduce((a, i) => a + (i.delayMonths ?? 0), 0);
const cash = (fmt: Fmt, n: number) => fmt.money(n, { precise: true });

/**
 * A few nouns the model gets to choose. "Revenue at risk" is the wrong phrase for a health
 * service and the wrong phrase for a charity, and a model that cannot say so will always
 * read as somebody else's. This is deliberately tiny: two words, not a translation layer.
 */
const money = (m: OperatingModel) => m.lexicon?.revenueNoun ?? 'Revenue';
const served = (m: OperatingModel) => m.lexicon?.customerNoun ?? 'The customer';

export const OBJECTIVES: Objective[] = [
  { id: 'revenue', label: money, who: 'whoever answers for the money',
    score: (r) => r.summary.revenueExposure,
    read: (r, f) => `${cash(f, r.summary.revenueExposure)} still at risk` },
  { id: 'people', label: () => 'Your people', who: 'anyone who has watched a team burn out',
    score: strain,
    read: (r) => `${strain(r)} team-months over capacity, and ${Math.round(r.summary.peopleLostToAttrition)} people gone by year end` },
  { id: 'retention', label: () => 'Keeping people', who: 'anywhere the job market is the constraint',
    score: (r) => -r.summary.retentionRate,
    // One decimal, because the spread between the best and worst path is under a point
    // and whole percents made every answer read as "87% against 87%".
    read: (r) => `${(r.summary.retentionRate * 100).toFixed(1)}% of the people you started with, still there` },
  { id: 'headcount', label: () => 'Headcount', who: 'a company under a hiring freeze',
    score: (r) => r.summary.endingFte,
    read: (r) => `${Math.round(r.summary.endingFte)} people at year end` },
  { id: 'budget', label: () => 'The budget', who: 'a non-profit, or anyone with a hard cap',
    score: spend, read: (r, f) => `${cash(f, spend(r))} spent on changes` },
  { id: 'portfolio', label: () => 'What you promised', who: 'a product or delivery organization',
    score: (r) => -r.summary.portfolioValue,
    read: (r, f) => `${cash(f, r.summary.portfolioValue)} of the portfolio delivered` },
  { id: 'service', label: served, who: 'anyone whose queue is somebody waiting',
    score: (r) => -(r.summary.serviceLevelPct ?? 1),
    read: (r) => r.summary.serviceLevelPct === null ? 'no queueing work in this model'
      : `${(r.summary.serviceLevelPct * 100).toFixed(1)}% of requests picked up in time, worst month ${((r.summary.worstServiceLevel ?? 1) * 100).toFixed(0)}%` },
  { id: 'schedule', label: () => 'The schedule', who: 'anyone who has committed to a date',
    score: lateness, read: (r) => `${lateness(r)} months of delay across the portfolio` },
];

/**
 * Where one year lands among all the years the same decisions could have produced.
 *
 * Ties share a place, so a lever that changes nothing does not quietly move you up the
 * table: if two hundred endings score the same, they are all joint first.
 */
export function rankAmong(mine: ModelResult, all: ModelResult[], o: Objective): { place: number; of: number } {
  const s = o.score(mine);
  const better = all.filter((r) => o.score(r) < s - 1e-9).length;
  return { place: better + 1, of: all.length };
}
