import type { ModelResult } from '../models/results';
import type { Binding } from './constraint';

/**
 * What a change actually bought, and what it cost.
 *
 * Two runs of the same year, one with the change and one without, read against each
 * other. Nothing here is estimated or annotated by hand: every line is a field the engine
 * produced twice.
 *
 * Two of these matter more than the rest. `firstMonth` is when the change starts showing
 * up, which is how somebody learns that hiring in March does not fix March. And `moved`
 * is Goldratt's point made concrete: relieving the constraint does not remove the
 * constraint, it hands the title to whoever is next.
 */

export type Unit = 'money' | 'hours' | 'points' | 'people';

export interface ReceiptLine {
  key: string;
  label: string;
  unit: Unit;
  from: number;
  to: number;
  delta: number;
  /** True when the change moved this in the direction a reader would want. */
  good: boolean;
}

export interface Receipt {
  lines: ReceiptLine[];
  /** Index of the first month the two years differ at all. Null when they never do. */
  firstMonth: number | null;
  /** Where the binding constraint sat before and after. Null when it did not move. */
  moved: { metric: 'queue' | 'money'; from: string | null; to: string | null } | null;
}

/* A change smaller than this is the engine's own arithmetic, not a decision's effect. */
const FLOOR: Record<Unit, number> = { money: 50_000, hours: 50, points: 0.005, people: 0.5 };

export function receipt(base: ModelResult, mine: ModelResult, baseBind: Binding, myBind: Binding): Receipt {
  const b = base.summary, m = mine.summary;
  const raw: Omit<ReceiptLine, 'delta' | 'good'>[] = [
    { key: 'people', label: 'People at year end', unit: 'people', from: b.endingFte, to: m.endingFte },
    { key: 'cost', label: 'Cost for the year', unit: 'money', from: b.annualTotalCost, to: m.annualTotalCost },
    { key: 'service', label: 'Answered in time', unit: 'points', from: b.serviceLevelPct ?? 0, to: m.serviceLevelPct ?? 0 },
    { key: 'shed', label: 'Work turned away', unit: 'hours', from: b.shedHours, to: m.shedHours },
    { key: 'backlog', label: 'Still waiting at year end', unit: 'hours', from: b.closingBacklogHours, to: m.closingBacklogHours },
    { key: 'risk', label: 'Revenue at risk', unit: 'money', from: b.revenueExposure, to: m.revenueExposure },
  ];
  /* Up is good for one of these and bad for the rest, and getting that backwards would
     paint a worse year green. People are left neutral on purpose: the cost line already
     says what they cost, and a reader decides for themselves whether more of them is a win. */
  const upIsGood = new Set(['service']);
  const neutral = new Set(['people']);

  const lines: ReceiptLine[] = [];
  for (const r of raw) {
    const delta = r.to - r.from;
    if (Math.abs(delta) < FLOOR[r.unit]) continue;
    lines.push({ ...r, delta, good: neutral.has(r.key) ? true : upIsGood.has(r.key) === delta > 0 });
  }

  let firstMonth: number | null = null;
  const n = Math.min(base.teams[0]?.months.length ?? 0, mine.teams[0]?.months.length ?? 0);
  outer: for (let i = 0; i < n; i++) {
    for (const t of mine.teams) {
      const was = base.teams.find((x) => x.teamId === t.teamId)?.months[i];
      const now = t.months[i];
      if (!was) continue;
      if (Math.abs(now.utilization - was.utilization) > 0.002 || now.status !== was.status) {
        firstMonth = i;
        break outer;
      }
    }
  }

  let moved: Receipt['moved'] = null;
  if ((baseBind.service?.teamId ?? null) !== (myBind.service?.teamId ?? null)) {
    moved = { metric: 'queue', from: baseBind.service?.teamId ?? null, to: myBind.service?.teamId ?? null };
  } else if ((baseBind.portfolio?.teamId ?? null) !== (myBind.portfolio?.teamId ?? null)) {
    moved = { metric: 'money', from: baseBind.portfolio?.teamId ?? null, to: myBind.portfolio?.teamId ?? null };
  }

  return { lines, firstMonth, moved };
}
