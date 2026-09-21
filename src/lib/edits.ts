import type { Intervention, MonthKey, OperatingModel } from '../models/types';

/**
 * What the reader has done to this company, in the order they did it.
 *
 * This was three maps of the shape teamId -> value, which is a fine way to hold state and
 * a useless way to hold decisions. A decision has a time, an order and a reason, and the
 * moment you want a receipt stack, an undo of the last thing only, or the marginal effect
 * of the third decision given the first two, the maps cannot answer.
 */

export type DecisionKind = 'hire' | 'move' | 'defer' | 'demand' | 'target';

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

export interface Applied {
  model: OperatingModel;
  /** Ids of the interventions this produced, to hand to run(). */
  interventionIds: string[];
}

/**
 * People asked for are requested, not conjured: they arrive after this model's own lead
 * time. People moved arrive at once, because losing people is fast and replacing them is
 * slow, and that asymmetry is most of why this is hard to run.
 *
 * Moving and deferring go through the engine's own interventions rather than by rewriting
 * the model, because an intervention has a month and a rewrite does not. A move made in
 * July used to reduce the giving team's STARTING headcount, so a decision taken in July
 * changed January, and the receipt dutifully reported that it showed up in January. The
 * engine already knew how to do this properly; the shortcut did not.
 */
export function applyDecisions(model: OperatingModel, decisions: Decision[]): Applied {
  if (!decisions.length) return { model, interventionIds: [] };
  const fte = new Map(model.teams.map((t) => [t.id, t.currentFte]));
  const target = new Map(model.teams.map((t) => [t.id, t.targetUtilization]));
  const vol = new Map(model.demandStreams.map((s) => [s.id, 1]));
  const hires = [...model.hiringPlan];
  const extra: Intervention[] = [];

  decisions.forEach((d, i) => {
    const id = `sandbox-${d.id}-${i}`;
    switch (d.kind) {
      case 'hire':
        hires.push({
          id, teamId: d.teamId!, requestMonth: d.month,
          headcount: d.amount, leadTimeMonths: leadTimeFor(model, d.teamId!),
        });
        break;
      case 'move':
        extra.push({
          id, name: d.label, type: 'reallocation', startMonth: d.month,
          fromTeamId: d.fromTeamId!, toTeamId: d.teamId!, headcount: d.amount,
          timeToImpactMonths: 0, implementationCost: 0,
        });
        break;
      case 'defer':
        extra.push({
          id, name: d.label, type: 'defer', startMonth: d.month,
          initiativeId: d.initiativeId!, months: d.amount,
        });
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
    model: {
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
      interventions: [...model.interventions, ...extra],
    },
    interventionIds: extra.map((x) => x.id),
  };
}

/** The people a team has asked for who are not in their seats yet, at this month. */
export function pipelineAt(
  model: OperatingModel, decisions: Decision[], teamId: string, monthIndex: number, months: MonthKey[],
): { headcount: number; landsAt: number } | null {
  const applied = applyDecisions(model, decisions).model;
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
