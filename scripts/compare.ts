/** Prints the preference-weighted intervention comparison for a scenario. */
import { compareOptions, run } from '../src/engine';
import type { OperatingModel } from '../src/models/types';
import fixture from '../src/data/atlas-systems-2027.json';

const model = fixture as unknown as OperatingModel;
const scenario = process.argv[2] ?? 'scenario-base';
const doNothing = run(model, { scenario });
const options = model.interventions.map((iv) => ({ id: iv.id, label: iv.name, result: run(model, { scenario, interventions: [iv.id] }) }));
const weightSets = [model.decisionWeights, { cost: 1, speed: 0, revenueExposure: 0 }, { cost: 0, speed: 1, revenueExposure: 0 }, { cost: 0, speed: 0, revenueExposure: 1 }];
for (const w of weightSets) {
  console.log(`\nweights cost=${w.cost} speed=${w.speed} exposure=${w.revenueExposure}`);
  const rows = compareOptions(doNothing, options, w).sort((a, b) => a.rank - b.rank);
  for (const r of rows) {
    const impl = r.id === 'do-nothing' ? doNothing : options.find((o) => o.id === r.id)!.result;
    const t = impl.teams.find((x) => x.teamId === 'team-implementation')!;
    console.log(`  ${String(r.rank).padStart(2)}. ${r.label.padEnd(52)} score ${r.score.toFixed(2)}  cost +$${Math.round(r.incrementalCost).toLocaleString().padStart(11)}  gapVsPlanH ${Math.round(r.residualGapHours).toString().padStart(6)}  exposure $${Math.round(r.residualExposure).toLocaleString()}  impl peak ${Math.round(t.peakUtilization * 100)}% (${t.monthsConstrained} mo)`);
  }
}
