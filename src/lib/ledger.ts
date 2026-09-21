import { run } from '../engine';
import type { ModelResult } from '../models/results';
import type { OperatingModel } from '../models/types';
import { bindingConstraints, type Binding } from './constraint';
import { applyDecisions, type Decision } from './edits';
import { receipt, type Receipt } from './receipt';

/**
 * What each decision bought, given the ones before it.
 *
 * A single receipt against the base plan answers "what did all of this do", which is the
 * question at the end of the year and not the one anybody asks in the middle. This answers
 * the middle one: the year run with the first N decisions, read against the year run with
 * the first N minus one.
 *
 * Marginal and ordered on purpose. Hiring into the team the queue turns on is worth a lot;
 * hiring into it again after you have already moved fourteen people across is worth much
 * less, and a per-decision figure computed in isolation would claim otherwise. The order
 * is the reader's own, so the arithmetic follows it.
 */

export interface LedgerEntry {
  decision: Decision;
  /** Its own contribution, not the total to date. */
  effect: Receipt;
}

export function ledgerFor(
  model: OperatingModel, decisions: Decision[], scenarioId: string,
): LedgerEntry[] {
  if (!decisions.length) return [];
  const at = (n: number): { r: ModelResult; b: Binding } => {
    const { model: m, interventionIds } = applyDecisions(model, decisions.slice(0, n));
    const r = run(m, { scenario: scenarioId, interventions: interventionIds });
    return { r, b: bindingConstraints(m, { decisions: [], scenarioId }, interventionIds, r) };
  };
  const out: LedgerEntry[] = [];
  let before = at(0);
  for (let i = 0; i < decisions.length; i++) {
    const after = at(i + 1);
    out.push({ decision: decisions[i], effect: receipt(before.r, after.r, before.b, after.b) });
    before = after;
  }
  return out;
}
