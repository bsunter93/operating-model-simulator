/**
 * Model files leave the app and come back: they are exported, edited, mailed around and
 * re-imported. So a change to the schema has to meet the files that already exist, or the
 * change quietly costs somebody the work they had saved.
 *
 * Version 2 named every amount after a currency it was never required to be in
 * (`monthlyFteCostUsd`). The currency is declared once on the model now, and a field name
 * that disagrees with it is worse than one that says nothing, so the suffix is gone.
 */
export const MODEL_VERSION = '3.0';

/** Every amount field version 2 spelled with a currency in its name. */
export const RENAMED_IN_V3: Readonly<Record<string, string>> = Object.freeze(Object.fromEntries(
  ['annualBudget', 'annualBudgetVariance', 'annualChangeCost', 'annualRunCost', 'annualTotalCost',
   'annualVariance', 'budgetCap', 'businessImpact', 'cashReleased', 'changeCost', 'exposure',
   'financialValue', 'implementationCost', 'incrementalCost', 'modeledAnnualBudget',
   'monthlyFteCost', 'oneTimeCost', 'operatingCostTarget', 'peakMonthlyVariance', 'portfolioValue',
   'recruitingCostPerHead', 'residualExposure', 'revenueAtRisk', 'revenueExposure', 'revenueTarget',
   'runCost', 'totalCost', 'total', 'variance'].map((n) => [n + 'Usd', n]),
));

/**
 * Brings an imported file up to the current shape. Only the keys named above are touched,
 * so a file carrying its own `somethingUsd` of a different meaning is left alone rather
 * than being helpfully corrupted.
 */
export function migrateModel(raw: unknown): { model: unknown; changed: number } {
  let changed = 0;
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        const to = RENAMED_IN_V3[k];
        // A file that already has the new name keeps it: renaming on top would drop one.
        if (to && !(to in (v as Record<string, unknown>))) { out[to] = walk(val); changed++; }
        else out[k] = walk(val);
      }
      return out;
    }
    return v;
  };
  const model = walk(raw);
  if (changed && model && typeof model === 'object') {
    (model as Record<string, unknown>).modelVersion = MODEL_VERSION;
  }
  return { model, changed };
}
