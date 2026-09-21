import type { ModelResult, TeamMonth } from '../models/results';

/**
 * What a team was handed this month, where it came from, and what happened to it.
 *
 * The engine reports a team-month as a utilisation percentage, which is a true number
 * nobody thinks in. A person running a team thinks: this many things showed up, we got to
 * this many, this many are still sitting there. That is the same arithmetic read the other
 * way round, and it is what this produces.
 *
 * Hours convert to countable work at the rate the team's own inbound work implies. If a
 * team's month is 18,400 hours covering 40,300 cases, an hour is 2.19 cases, and 5,300
 * hours of backlog is about 11,600 cases waiting. That is a derived figure, not a second
 * model: the same two numbers the engine already produced, divided.
 */

export type SourceKind = 'arrival' | 'route' | 'change' | 'waiting';

export interface WorkSource {
  key: string;
  label: string;
  kind: SourceKind;
  hours: number;
  /** Share of everything the team was handed this month. */
  share: number;
}

export interface Workload {
  teamId: string;
  month: number;
  /** Everything it was handed: arriving work, routed work, change work, and last month's queue. */
  given: number;
  sources: WorkSource[];
  capacityHours: number;
  people: number;
  hoursEach: number;
  /** Hours it actually got through. */
  gotTo: number;
  /** Still waiting at the end of the month. */
  waits: number;
  /** Gone: turned away rather than queued. */
  lost: number;
  utilization: number;
  targetUtilization: number;
  /** The unit its inbound work is counted in, when it has one. */
  unit: string | null;
  /** Units per hour, from this month's own arrivals. Zero when nothing countable arrived. */
  perHour: number;
}

export function workloadOf(result: ModelResult, teamId: string, month: number): Workload | null {
  const t = result.teams.find((x) => x.teamId === teamId);
  const row = t?.months[month] as TeamMonth | undefined;
  if (!row) return null;

  const into = result.flow.filter((f) => f.toTeamId === teamId);
  const sources: WorkSource[] = [];
  for (const f of into) {
    const hours = f.hoursByMonth[month] ?? 0;
    if (hours <= 0) continue;
    sources.push({ key: f.id, label: f.label, kind: f.kind, hours, share: 0 });
  }
  if (row.portfolioHours > 0) {
    /* Change work has no stream behind it, so it is named for what it is rather than
       left out. A team can be over capacity entirely on initiatives. */
    sources.push({ key: 'change', label: 'Change work', kind: 'change', hours: row.portfolioHours, share: 0 });
  }
  if (row.carriedInHours > 0) {
    sources.push({ key: 'waiting', label: 'Waiting from last month', kind: 'waiting', hours: row.carriedInHours, share: 0 });
  }

  const given = sources.reduce((a, s) => a + s.hours, 0);
  for (const s of sources) s.share = given > 0 ? s.hours / given : 0;
  sources.sort((a, b) => b.hours - a.hours);

  /* One unit or the other: a team fed by referrals and imaging requests at once is counted
     in whichever of them is most of its month, because "items" is not a word anybody uses
     about their own work.

     The rate must then be built from THAT unit alone. A first cut summed units across every
     inbound stream and divided by the hours of all of them, which quietly added four
     projects to six hundred cases and reported the total in projects: a team taking four
     projects a month was said to have three hundred of them waiting. */
  let unit: string | null = null;
  let best = 0;
  for (const f of into) {
    const h = f.hoursByMonth[month] ?? 0;
    if (h > best && (f.unitsByMonth[month] ?? 0) > 0) { best = h; unit = f.unit; }
  }
  /* Count only the reported unit, but divide by ALL the hours that arrived. Dividing by
     just its own hours over-reports whenever a second unit is also feeding the team: the
     count then exceeds what that unit actually brought, which is a number that cannot be
     true. This way "N cases" means the work here comes to N cases' worth, and it can never
     claim more cases than arrived. */
  let units = 0, unitHours = 0;
  for (const f of into) {
    const h = f.hoursByMonth[month] ?? 0;
    if (h <= 0) continue;
    unitHours += h;
    if (f.unit === unit) units += f.unitsByMonth[month] ?? 0;
  }

  return {
    teamId, month, given, sources,
    capacityHours: row.availableProductiveHours,
    people: row.availableFte,
    hoursEach: row.productiveHoursPerFte,
    gotTo: Math.min(given, row.availableProductiveHours),
    waits: row.carriedOutHours,
    lost: row.shedHours,
    utilization: row.utilization,
    targetUtilization: row.targetUtilization,
    unit,
    perHour: unitHours > 0 ? units / unitHours : 0,
  };
}

/** Hours as a count of the thing the team actually handles. Null when it has no unit. */
export function asUnits(w: Workload, hours: number): number | null {
  return w.perHour > 0 ? hours * w.perHour : null;
}

export type Pressure = 'holding' | 'tight' | 'over' | 'buried';

/**
 * Plain words before the percentage. "112% of capacity" is a number a reader has to
 * convert before it means anything; "over capacity" is the thing it means.
 */
export function pressureOf(w: { utilization: number; targetUtilization: number }): Pressure {
  if (w.utilization > 1) return 'buried';
  if (w.utilization > w.targetUtilization) return 'over';
  if (w.utilization > w.targetUtilization - 0.08) return 'tight';
  return 'holding';
}

export const PRESSURE_WORD: Record<Pressure, string> = {
  holding: 'Holding',
  tight: 'Close to its limit',
  over: 'Over capacity',
  buried: 'Past what it can do',
};

/** One row per month: how much of the organisation was over capacity, and how it answered. */
export interface YearPoint {
  month: number;
  over: number;
  teams: number;
  worstService: number | null;
  shedHours: number;
}

export function yearShape(result: ModelResult): YearPoint[] {
  const n = result.teams[0]?.months.length ?? 0;
  const out: YearPoint[] = [];
  for (let i = 0; i < n; i++) {
    const rows = result.teams.map((t) => t.months[i]);
    const queues = rows.filter((r) => r.serviceLevel !== null).map((r) => r.serviceLevel!);
    out.push({
      month: i,
      over: rows.filter((r) => r.utilization > r.targetUtilization).length,
      teams: rows.length,
      worstService: queues.length ? Math.min(...queues) : null,
      shedHours: rows.reduce((a, r) => a + r.shedHours, 0),
    });
  }
  return out;
}
