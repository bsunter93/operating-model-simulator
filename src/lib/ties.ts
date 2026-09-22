import type { OperatingModel } from '../models/types';

/**
 * Who a team is committed to, as opposed to who hands it work.
 *
 * The canvas drew one kind of connection: work routed from one team to another. That is
 * the visible half. The other half is that an initiative is staffed out of several teams
 * at once, so hiring into one of them, or letting one of them slip, reaches every other
 * team on the same programme without a single case ever passing between them. With only
 * the routes drawn, eight teams on four shared programmes read as eight silos.
 */
export interface Tie {
  teamId: string;
  /** The programmes both teams are staffing. */
  shared: { id: string; name: string }[];
}

/** Every team that staffs a programme this one also staffs. */
export function tiesFor(model: OperatingModel, teamId: string): Tie[] {
  const byTeam = new Map<string, { id: string; name: string }[]>();
  for (const init of model.initiatives) {
    const teams = Object.keys(init.requiredFteByTeam).filter((t) => init.requiredFteByTeam[t] > 0);
    if (!teams.includes(teamId)) continue;
    for (const t of teams) {
      if (t === teamId) continue;
      const list = byTeam.get(t) ?? [];
      list.push({ id: init.id, name: init.name });
      byTeam.set(t, list);
    }
  }
  return [...byTeam].map(([id, shared]) => ({ teamId: id, shared }))
    .sort((a, b) => b.shared.length - a.shared.length);
}

/** Just the ids, for deciding what stays lit when something is selected. */
export function tiedTo(model: OperatingModel, teamId: string): Set<string> {
  return new Set(tiesFor(model, teamId).map((t) => t.teamId));
}
