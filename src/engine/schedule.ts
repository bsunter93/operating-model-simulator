/**
 * Initiative scheduling with dependency propagation.
 *
 * Completion month = start + duration, i.e. the first month after the last
 * active month. A successor may start at predecessor completion + lag, so a
 * lag of 0 means "the month after the predecessor finishes".
 */
import type { Dependency, Initiative, MonthKey } from '../models/types';
import type { InitiativeSchedule } from '../models/results';
import { addMonths, monthIndex } from './calendar';

export interface ScheduleInput {
  horizonStart: MonthKey;
  horizonMonths: number;
  initiatives: Initiative[];
  dependencies: Dependency[];
  /** Deferral in months by initiative id (from interventions). */
  deferrals: Map<string, number>;
  cancelled: Set<string>;
}

export function scheduleInitiatives(input: ScheduleInput): InitiativeSchedule[] {
  const { horizonStart, horizonMonths, initiatives, dependencies, deferrals, cancelled } = input;
  const byId = new Map(initiatives.map((i) => [i.id, i]));
  const preds = new Map<string, Dependency[]>();
  const succs = new Map<string, string[]>();
  for (const d of dependencies) {
    if (cancelled.has(d.predecessorId) || cancelled.has(d.successorId)) continue;
    preds.set(d.successorId, [...(preds.get(d.successorId) ?? []), d]);
    succs.set(d.predecessorId, [...(succs.get(d.predecessorId) ?? []), d.successorId]);
  }

  // Kahn's algorithm. Validation already rejected cycles; guard anyway.
  const indeg = new Map<string, number>();
  for (const i of initiatives) if (!cancelled.has(i.id)) indeg.set(i.id, (preds.get(i.id) ?? []).length);
  const queue = [...indeg.entries()].filter(([, n]) => n === 0).map(([id]) => id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const s of succs.get(id) ?? []) {
      indeg.set(s, indeg.get(s)! - 1);
      if (indeg.get(s) === 0) queue.push(s);
    }
  }
  if (order.length !== indeg.size) throw new Error('scheduleInitiatives: dependency graph has a cycle');

  const startIdx = new Map<string, number>();
  const completionIdx = new Map<string, number>();
  const pushedBy = new Map<string, { dependencyId: string; predecessorId: string }>();
  const plannedIdx = new Map<string, number>();

  for (const id of order) {
    const init = byId.get(id)!;
    const planned = monthIndex(horizonStart, init.startMonth) + (deferrals.get(id) ?? 0);
    plannedIdx.set(id, planned);
    let start = planned;
    for (const d of preds.get(id) ?? []) {
      const earliest = completionIdx.get(d.predecessorId)! + d.lagMonths;
      if (earliest > start) { start = earliest; pushedBy.set(id, { dependencyId: d.id, predecessorId: d.predecessorId }); }
    }
    startIdx.set(id, start);
    completionIdx.set(id, start + init.durationMonths);
  }

  const out: InitiativeSchedule[] = [];
  for (const init of initiatives) {
    if (cancelled.has(init.id)) {
      out.push({ initiativeId: init.id, status: 'cancelled', plannedStart: init.startMonth, effectiveStart: null, completion: null, delayMonths: 0, pushedBy: null, truncated: false, activeMonthIndexes: [] });
      continue;
    }
    const s = startIdx.get(init.id)!;
    const c = completionIdx.get(init.id)!;
    const originalPlanned = monthIndex(horizonStart, init.startMonth);
    const active: number[] = [];
    for (let m = s; m < c; m++) if (m >= 0 && m < horizonMonths) active.push(m);
    out.push({
      initiativeId: init.id,
      status: deferrals.has(init.id) ? 'deferred' : 'planned',
      plannedStart: init.startMonth,
      effectiveStart: addMonths(horizonStart, s),
      completion: addMonths(horizonStart, c),
      delayMonths: s - originalPlanned,
      pushedBy: pushedBy.get(init.id) ?? null,
      truncated: c > horizonMonths,
      activeMonthIndexes: active,
    });
  }
  return out;
}
