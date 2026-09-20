/** Prints the team-month utilization grid and constraint ranking for a fixture. */
import { run } from '../src/engine';
import type { OperatingModel } from '../src/models/types';
import fixture from '../src/data/atlas-systems-2027.json';

const model = fixture as unknown as OperatingModel;
const scenario = process.argv[2] ?? 'scenario-base';
const interventions = process.argv.slice(3);
const r = run(model, { scenario, interventions });
const names = new Map(model.teams.map((t) => [t.id, t.name]));

const pad = (s: string, n: number) => s.padEnd(n);
console.log(`\n${model.name}  scenario=${scenario}${interventions.length ? '  interventions=' + interventions.join(',') : ''}\n`);
console.log(pad('team', 22) + r.months.map((m) => m.slice(5)).map((m) => m.padStart(5)).join('') + '   peak  gapH   reqFTE(peak) start->end');
for (const t of r.teams) {
  const row = t.months.map((m) => (Number.isFinite(m.utilization) ? Math.round(m.utilization * 100) + '%' : 'inf').padStart(5)).join('');
  const peakReq = Math.max(...t.months.map((m) => m.requiredFte));
  console.log(pad(names.get(t.teamId)!, 22) + row + `  ${Math.round(t.peakUtilization * 100)}%`.padStart(6) + ` ${Math.round(t.totalGapHours)}`.padStart(7) + `  ${peakReq.toFixed(0)}`.padStart(8) + `  ${t.startingFte.toFixed(0)}->${t.endingFte.toFixed(0)}`);
}
console.log('\nInitiatives');
for (const i of r.initiatives) {
  const init = model.initiatives.find((x) => x.id === i.initiativeId)!;
  console.log(`  ${pad(init.name, 28)} ${i.status.padEnd(9)} planned ${i.plannedStart}  start ${i.effectiveStart ?? '-'}  done ${i.completion ?? '-'}  delay ${i.delayMonths}${i.pushedBy ? ' (pushed by ' + i.pushedBy.predecessorId + ')' : ''}${i.truncated ? ' TRUNCATED' : ''}`);
}
console.log('\nConstraints (ranked)');
for (const c of r.constraints) console.log(`  [${c.kind}] ${c.title}  impact $${Math.round(c.businessImpact).toLocaleString()}\n      ${c.detail}`);
console.log('\nFinancials');
console.log(`  run $${Math.round(r.financials.annualRunCost).toLocaleString()}  change $${Math.round(r.financials.annualChangeCost).toLocaleString()}  budget $${Math.round(r.financials.annualBudget).toLocaleString()}  variance $${Math.round(r.financials.annualVariance).toLocaleString()}`);
for (const l of r.financials.budgetLevers) console.log(`  lever: ${l.label}  cash $${Math.round(l.cashReleased).toLocaleString()}  ${l.fteMonthsReleased} FTE-months`);
console.log('\nRevenue exposure');
for (const e of r.exposure.items) console.log(`  ${pad(e.initiativeId, 30)} p=${e.baseProbability.toFixed(2)} scen=${e.scenarioProbability.toFixed(2)} shortfall=${e.capacityShortfall.toFixed(2)} pEff=${e.effectiveProbability.toFixed(2)}  $${Math.round(e.exposure).toLocaleString()}`);
console.log(`  total $${Math.round(r.exposure.total).toLocaleString()}`);
console.log('\nSummary', JSON.stringify(r.summary, null, 1).replace(/\n\s*/g, ' '));
