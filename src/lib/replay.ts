import type { ModelResult } from '../models/results';

/**
 * The year twice, month by month, so the two can be watched pulling apart.
 *
 * A single end-of-year comparison says which plan was better. This says when it started
 * being better, which is the thing an operating model is actually about: a decision in
 * April and the same decision in July are not the same decision.
 */

export type TrackUnit = 'count' | 'pct' | 'money';

export interface Track {
  key: string;
  label: string;
  unit: TrackUnit;
  base: number[];
  mine: number[];
  /** Top of the axis, so both series are drawn against the same scale. */
  max: number;
  /** True when more of this is better. */
  upIsGood: boolean;
}

const overBy = (r: ModelResult) =>
  r.months.map((_, i) => r.teams.filter((t) => {
    const m = t.months[i];
    return m.utilization > m.targetUtilization;
  }).length);

/** Work picked up inside target, weighted by how much work there was, as the engine does it. */
const answeredBy = (r: ModelResult) =>
  r.months.map((_, i) => {
    let num = 0, den = 0;
    for (const t of r.teams) {
      const m = t.months[i];
      if (m.serviceLevel === null) continue;
      num += m.serviceLevel * m.workloadHours;
      den += m.workloadHours;
    }
    return den > 0 ? num / den : 1;
  });

const committedBy = (r: ModelResult) => {
  let run = 0;
  return r.financials.monthly.map((m) => (run += m.totalCost));
};

export function tracksFor(base: ModelResult, mine: ModelResult): Track[] {
  const out: Track[] = [];
  const teams = Math.max(base.teams.length, mine.teams.length, 1);

  out.push({
    key: 'over', label: 'Teams over capacity', unit: 'count',
    base: overBy(base), mine: overBy(mine), max: teams, upIsGood: false,
  });

  const ab = answeredBy(base), am = answeredBy(mine);
  /* A model whose work never queues has no answer rate, and a flat line at 100% teaches
     a reader to ignore the chart it is on. */
  if (ab.some((v) => v < 0.999) || am.some((v) => v < 0.999)) {
    out.push({
      key: 'answered', label: 'Picked up in time', unit: 'pct',
      base: ab, mine: am, max: 1, upIsGood: true,
    });
  }

  const cb = committedBy(base), cm = committedBy(mine);
  out.push({
    key: 'cash', label: 'Committed against budget', unit: 'money',
    base: cb, mine: cm,
    max: Math.max(base.financials.annualBudget, cb[cb.length - 1] ?? 0, cm[cm.length - 1] ?? 0, 1),
    upIsGood: false,
  });
  return out;
}

/** The first month the two years are visibly different on any track. */
export function divergesAt(tracks: Track[]): number | null {
  const n = Math.min(...tracks.map((t) => Math.min(t.base.length, t.mine.length)));
  for (let i = 0; i < n; i++) {
    for (const t of tracks) {
      const scale = t.max || 1;
      if (Math.abs(t.mine[i] - t.base[i]) / scale > 0.004) return i;
    }
  }
  return null;
}
