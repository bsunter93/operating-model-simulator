import type { MonthKey, OperatingModel } from '../models/types';
import { addMonths } from '../engine/calendar';

/**
 * What the reader has done to this company, in the order they did it.
 *
 * This was three maps of the shape teamId -> value, which is a fine way to hold state and
 * a useless way to hold decisions. A decision has a time, an order and a reason, and the
 * moment you want a receipt stack, an undo of the last thing only, or the marginal effect
 * of the third decision given the first two, the maps cannot answer.
 */

export type DecisionKind = 'hire' | 'cut' | 'move' | 'defer' | 'demand' | 'target';

export interface Decision {
  id: string;
  kind: DecisionKind;
  /** The month it was taken in, which is not the month it lands. */
  month: MonthKey;
  teamId?: string;
  fromTeamId?: string;
  initiativeId?: string;
  streamId?: string;
  amount: number;
  label: string;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/**
 * How long this model thinks it takes to put somebody in a seat. From the team's own
 * requests where it has them and the plan's average where it does not, so an imported
 * model uses its own number rather than one of mine.
 */
export function leadTimeFor(model: OperatingModel, teamId: string): number {
  const own = model.hiringPlan.filter((h) => h.teamId === teamId).map((h) => h.leadTimeMonths);
  const any = model.hiringPlan.map((h) => h.leadTimeMonths);
  const from = own.length ? own : any;
  return from.length ? Math.max(0, Math.round(from.reduce((a, b) => a + b, 0) / from.length)) : 3;
}

/**
 * People asked for are requested, not conjured: they arrive after this model's own lead
 * time. People moved or cut arrive and leave at once, because losing people is fast and
 * replacing them is slow, and that asymmetry is most of why this is hard to run.
 */
export function applyDecisions(model: OperatingModel, decisions: Decision[]): OperatingModel {
  if (!decisions.length) return model;
  const fte = new Map(model.teams.map((t) => [t.id, t.currentFte]));
  const target = new Map(model.teams.map((t) => [t.id, t.targetUtilization]));
  const vol = new Map(model.demandStreams.map((s) => [s.id, 1]));
  const shift = new Map<string, number>();
  const hires = [...model.hiringPlan];

  decisions.forEach((d, i) => {
    switch (d.kind) {
      case 'hire':
        hires.push({
          id: `sandbox-${d.id}-${i}`, teamId: d.teamId!, requestMonth: d.month,
          headcount: d.amount, leadTimeMonths: leadTimeFor(model, d.teamId!),
        });
        break;
      case 'cut':
        fte.set(d.teamId!, Math.max(1, fte.get(d.teamId!)! - d.amount));
        break;
      case 'move':
        fte.set(d.fromTeamId!, Math.max(1, fte.get(d.fromTeamId!)! - d.amount));
        fte.set(d.teamId!, fte.get(d.teamId!)! + d.amount);
        break;
      case 'defer':
        shift.set(d.initiativeId!, (shift.get(d.initiativeId!) ?? 0) + d.amount);
        break;
      case 'demand':
        vol.set(d.streamId!, clamp(vol.get(d.streamId!)! * d.amount, 0.3, 3));
        break;
      case 'target':
        target.set(d.teamId!, clamp(Number((target.get(d.teamId!)! + d.amount).toFixed(2)), 0.4, 0.99));
        break;
    }
  });

  return {
    ...model,
    teams: model.teams.map((t) => ({
      ...t,
      currentFte: Math.round(fte.get(t.id)!),
      targetUtilization: target.get(t.id)!,
    })),
    demandStreams: model.demandStreams.map((s) => ({
      ...s,
      annualVolume: Math.max(0, Math.round(s.annualVolume * vol.get(s.id)!)),
    })),
    hiringPlan: hires,
    initiatives: model.initiatives.map((x) => {
      const by = shift.get(x.id);
      return by ? { ...x, startMonth: addMonths(x.startMonth, by) } : x;
    }),
  };
}

/** The people a team has asked for who are not in their seats yet, at this month. */
export function pipelineAt(
  model: OperatingModel, decisions: Decision[], teamId: string, monthIndex: number, months: MonthKey[],
): { headcount: number; landsAt: number } | null {
  const applied = applyDecisions(model, decisions);
  let headcount = 0, landsAt = Infinity;
  for (const h of applied.hiringPlan) {
    if (h.teamId !== teamId) continue;
    const lands = months.indexOf(h.requestMonth) + h.leadTimeMonths;
    if (lands > monthIndex && months.indexOf(h.requestMonth) <= monthIndex) {
      headcount += h.headcount;
      landsAt = Math.min(landsAt, lands);
    }
  }
  return headcount > 0 ? { headcount, landsAt } : null;
}
