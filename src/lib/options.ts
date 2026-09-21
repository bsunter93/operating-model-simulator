import { run } from '../engine';
import type { ModelResult } from '../models/results';
import type { MonthKey, OperatingModel } from '../models/types';
import { applyDecisions, leadTimeFor, type Decision } from './edits';

/**
 * What can you actually do about it.
 *
 * Not a settings panel. Three or four moves a person running this company would recognise,
 * each one costed by running the year with it in and reading the difference. Nothing here
 * is a rule of thumb: if an option says it buys six points, the engine was asked.
 *
 * The moves are deliberately the ones an operating model actually offers. You can buy
 * capacity and wait for it, you can move capacity and have it now at somebody else's
 * expense, or you can take work off the table. There is no fourth thing.
 */

export interface Move {
  decision: Decision;
  title: string;
  /** What it does to the thing that is hurting, measured. */
  servicePoints: number;
  exposure: number;
  cost: number;
  /** Index of the first month the year differs, or null when it never does. */
  landsAt: number | null;
  when: string;
}

const firstDivergence = (base: ModelResult, after: ModelResult): number | null => {
  const n = Math.min(base.teams[0]?.months.length ?? 0, after.teams[0]?.months.length ?? 0);
  for (let i = 0; i < n; i++) {
    for (const t of after.teams) {
      const was = base.teams.find((x) => x.teamId === t.teamId)?.months[i];
      if (!was) continue;
      if (Math.abs(t.months[i].utilization - was.utilization) > 0.002
        || t.months[i].status !== was.status) return i;
    }
  }
  return null;
};

/** The team with the most room to give: lowest peak load against its own plan. */
function slackest(model: OperatingModel, result: ModelResult, notTeamId: string): string | null {
  let best: string | null = null, room = 0;
  for (const t of result.teams) {
    if (t.teamId === notTeamId) continue;
    const team = model.teams.find((x) => x.id === t.teamId)!;
    if (team.currentFte < 8) continue;
    const head = Math.max(...t.months.map((m) => m.utilization));
    const r = t.months[0].targetUtilization - head;
    if (r > room) { room = r; best = t.teamId; }
  }
  return room > 0.1 ? best : null;
}

export function movesFor(
  model: OperatingModel, taken: Decision[], scenarioId: string, current: ModelResult,
  teamId: string, monthIndex: number, months: MonthKey[], monthLabels: string[],
): Move[] {
  const team = model.teams.find((t) => t.id === teamId);
  const row = current.teams.find((t) => t.teamId === teamId)?.months[monthIndex];
  if (!team || !row) return [];
  const month = months[monthIndex];
  const applied = applyDecisions(model, taken);
  const live = applied.teams.find((t) => t.id === teamId)!;

  /* Enough people to bring this month's work inside the line the team plans to run at,
     which is a number the month already contains rather than a round one I picked. */
  const need = Math.max(1, Math.ceil(
    (row.workloadHours / Math.max(row.targetUtilization, 0.01) - row.availableProductiveHours)
    / Math.max(row.productiveHoursPerFte, 1)));
  const hire = Math.min(need, Math.max(1, Math.round(live.currentFte * 0.5)));

  const candidates: { d: Decision; title: string }[] = [];
  candidates.push({
    d: {
      id: `hire-${teamId}-${month}`, kind: 'hire', month, teamId, amount: hire,
      label: `Hire ${hire} into ${team.name}`,
    },
    title: `Hire ${hire}`,
  });

  const from = slackest(applied, current, teamId);
  if (from) {
    const fromTeam = model.teams.find((t) => t.id === from)!;
    const moveN = Math.max(1, Math.min(Math.round(hire / 2), Math.floor(fromTeam.currentFte * 0.12)));
    candidates.push({
      d: {
        id: `move-${teamId}-${month}`, kind: 'move', month, teamId, fromTeamId: from, amount: moveN,
        label: `Move ${moveN} from ${fromTeam.name} to ${team.name}`,
      },
      title: `Move ${moveN} from ${fromTeam.name}`,
    });
  }

  /* Taking work off the table. Only discretionary initiatives, because deferring the ones
     the business is not allowed to defer is not a move anybody can make. */
  const init = model.initiatives
    .filter((i) => i.discretionary && (i.requiredFteByTeam[teamId] ?? 0) > 0)
    .sort((a, b) => (b.requiredFteByTeam[teamId] ?? 0) - (a.requiredFteByTeam[teamId] ?? 0))[0];
  if (init) {
    candidates.push({
      d: {
        id: `defer-${init.id}-${month}`, kind: 'defer', month, initiativeId: init.id, amount: 3,
        label: `Push ${init.name} back three months`,
      },
      title: `Defer ${init.name}`,
    });
  }

  return candidates.map(({ d, title }) => {
    const after = run(applyDecisions(model, [...taken, d]), { scenario: scenarioId });
    const lands = firstDivergence(current, after);
    return {
      decision: d,
      title,
      servicePoints: (after.summary.serviceLevelPct ?? 0) - (current.summary.serviceLevelPct ?? 0),
      exposure: current.summary.revenueExposure - after.summary.revenueExposure,
      cost: after.summary.annualTotalCost - current.summary.annualTotalCost,
      landsAt: lands,
      when: d.kind === 'hire'
        ? (monthIndex + leadTimeFor(model, teamId) < months.length
          ? `in their seats in ${monthLabels[monthIndex + leadTimeFor(model, teamId)]}`
          : 'not in their seats before the year ends')
        : 'takes effect at once',
    };
  });
}
