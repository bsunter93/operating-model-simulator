import type { Decision } from './edits';
import type { OperatingModel } from '../models/types';

/**
 * A change made here, showing up there, later.
 *
 * The canvas had two kinds of connection and both were about the present: work routed
 * between teams, and teams staffing the same programme. Neither can say the thing a
 * reader most needs to see after acting, which is that something they did over here
 * arrives over there, and when.
 *
 * Two different facts turn out to be the same shape. Moving people is a change the reader
 * made, with a giving end and a receiving end and a month. A dependency is a change the
 * plan already contains: one programme cannot start until another lands, plus a lag, so
 * every team on the first reaches every team on the second without a single case passing
 * between them. Drawn as one thing, because to a reader they are one thing.
 */
export interface Lead {
  kind: 'move' | 'waits-on';
  fromTeamId: string;
  toTeamId: string;
  /** Month index the effect arrives, or null when it is immediate. */
  landsAt: number | null;
  /** What the canvas tags the landing end with. */
  tag: string;
  /** What the panel says about it. */
  detail: string;
}

const teamsOn = (model: OperatingModel, initiativeId: string) => {
  const init = model.initiatives.find((i) => i.id === initiativeId);
  if (!init) return [] as string[];
  return Object.keys(init.requiredFteByTeam).filter((t) => init.requiredFteByTeam[t] > 0);
};

/**
 * `selected` widens the plan's own dependencies, which are drawn only when the reader is
 * looking at a team on one end of one. The reader's own moves are always drawn: there are
 * never many, and they are the whole reason the question gets asked.
 */
export function leadsFor(
  model: OperatingModel,
  decisions: Decision[],
  months: string[],
  selected: string | null,
  /** Month names, so the prose says "August" rather than the key's "08". */
  labels: string[] = [],
): Lead[] {
  const out: Lead[] = [];
  const name = (id: string) => model.teams.find((t) => t.id === id)?.name ?? id;

  for (const d of decisions) {
    if (d.kind !== 'move' || !d.fromTeamId || !d.teamId) continue;
    const at = months.indexOf(d.month);
    out.push({
      kind: 'move',
      fromTeamId: d.fromTeamId,
      toTeamId: d.teamId,
      landsAt: at >= 0 ? at : null,
      tag: `${Math.round(d.amount)}`,
      detail: `You moved ${Math.round(d.amount)} from ${name(d.fromTeamId)}`
        + `${labels[at] ? ` in ${labels[at]}` : ''}. They left one team and arrived at the`
        + ` other the same month.`,
    });
  }

  for (const dep of model.dependencies ?? []) {
    const from = teamsOn(model, dep.predecessorId);
    const to = teamsOn(model, dep.successorId);
    if (!from.length || !to.length) continue;
    if (!selected || !(from.includes(selected) || to.includes(selected))) continue;
    const pre = model.initiatives.find((i) => i.id === dep.predecessorId)!;
    const post = model.initiatives.find((i) => i.id === dep.successorId)!;
    /* From the team being looked at to the far end, so a selection produces a handful of
       leads rather than every pairing of two whole programmes. */
    const heads = from.includes(selected) ? [selected] : to.includes(selected) ? from : [];
    const tails = from.includes(selected) ? to.filter((t) => t !== selected) : [selected];
    for (const a of heads) for (const b of tails) {
      if (a === b) continue;
      out.push({
        kind: 'waits-on',
        fromTeamId: a,
        toTeamId: b,
        landsAt: null,
        tag: dep.lagMonths > 0 ? `+${dep.lagMonths}` : '',
        detail: `${post.name} cannot start until ${pre.name} lands`
          + (dep.lagMonths > 0 ? `, plus ${dep.lagMonths} month${dep.lagMonths === 1 ? '' : 's'}` : '')
          + `. Slip one and the other moves with it.`,
      });
    }
  }
  return out;
}
