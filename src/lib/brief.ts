import type { ModelResult } from '../models/results';
import type { OperatingModel } from '../models/types';

/**
 * The months somebody wrote something about, and how the year ended.
 *
 * The run was a separate screen whose whole value was these two things: prose attached to
 * particular months of particular organisations, and a statement at the end about whether
 * the objective was met. Everything else it did, the sandbox already did better, and the
 * prose is authored per model rather than computed, so it could not be regenerated. This
 * is the part that was worth carrying over.
 */
export interface Brief {
  /** How the moment is named: "February", "Mid-year", "The last call". */
  when: string;
  question: string;
  setup: string;
  focusTeamId?: string;
}

/** What was written about this month, if anything was. */
export function briefAt(model: OperatingModel, month: number): Brief | null {
  const d = model.run?.decisions.find((x) => x.monthIndex === month);
  if (!d) return null;
  return { when: d.when, question: d.question, setup: d.setup, focusTeamId: d.focusTeamId };
}

export interface Verdict {
  /** A team was handed more than it could physically do, in any month. */
  pastCapacity: boolean;
  /** Worst utilisation reached across the year. */
  peak: number;
  overBudget: boolean;
  spent: number;
  budget: number;
  /** Work the year turned away for good, in hours. */
  shed: number;
  met: boolean;
}

/**
 * The objective the gate states, answered. "Get through the year without going past what
 * your teams can do, and without going past the budget" is two conditions, so the ending
 * is two conditions, and it is read off the year rather than scored against a curve.
 */
export function verdictOf(result: ModelResult): Verdict {
  let peak = 0, shed = 0;
  for (const t of result.teams) {
    for (const m of t.months) {
      if (m.utilization > peak) peak = m.utilization;
      shed += m.shedHours;
    }
  }
  const spent = result.financials.monthly.reduce((a, m) => a + m.totalCost, 0);
  const budget = result.financials.annualBudget;
  const pastCapacity = peak > 1;
  const overBudget = spent > budget;
  return { pastCapacity, peak, overBudget, spent, budget, shed, met: !pastCapacity && !overBudget };
}
