import { useMemo } from 'react';
import { compareOptions, run } from '../engine';
import type { DecisionWeights } from '../models/types';
import type { ModelResult } from '../models/results';
import { useStore } from '../state/store';
import { Term } from '../components/Term';
import { money, monthLabel, num, pct } from '../lib/format';

function peakShortfall(r: ModelResult): number {
  let best = 0;
  for (const t of r.teams) for (const m of t.months) best = Math.max(best, m.workforceGap);
  return best;
}

function WeightSliders({ weights, onChange }: { weights: DecisionWeights; onChange: (w: DecisionWeights) => void }) {
  // Moving one slider renormalizes the other two proportionally so the three always sum to 100%.
  const set = (key: keyof DecisionWeights, v: number) => {
    const others = (['cost', 'speed', 'revenueExposure'] as const).filter((k) => k !== key);
    const rest = 1 - v;
    const sumOthers = others.reduce((s, k) => s + weights[k], 0);
    const next = { ...weights, [key]: v } as DecisionWeights;
    for (const k of others) next[k] = sumOthers > 0 ? (weights[k] / sumOthers) * rest : rest / 2;
    onChange(next);
  };
  const row = (key: keyof DecisionWeights, label: string, term: 'cost' | 'speed' | 'exposure') => (
    <label className="wrow" key={key}>
      <span className="wl"><Term k={term}>{label}</Term></span>
      <input type="range" min={0} max={100} step={1} value={Math.round(weights[key] * 100)} onChange={(e) => set(key, Number(e.target.value) / 100)} />
      <span className="wv">{Math.round(weights[key] * 100)}%</span>
    </label>
  );
  return (
    <div className="weights">
      {row('cost', 'Cost', 'cost')}
      {row('speed', 'Speed', 'speed')}
      {row('revenueExposure', 'Revenue exposure', 'exposure')}
    </div>
  );
}

export function Scenarios() {
  const { state, dispatch, model, interventions, result, doNothing, teamName } = useStore();
  const active = interventions.filter((iv) => state.interventionIds.includes(iv.id));

  // Every scenario, with the current intervention stack applied.
  const byScenario = useMemo(() => model.scenarios.map((s) => ({ scenario: s, result: run(model, { scenario: s.id, interventions: active }) })), [model, active]);

  // Options under the current scenario: each intervention on its own, plus the current stack if it has more than one.
  const rows = useMemo(() => {
    const options = interventions.map((iv) => ({ id: iv.id, label: iv.name, result: run(model, { scenario: state.scenarioId, interventions: [iv] }) }));
    if (active.length > 1) options.push({ id: 'stack', label: `Your combination (${active.length} on)`, result });
    return compareOptions(doNothing, options, state.weights).sort((a, b) => a.rank - b.rank);
  }, [model, interventions, active, state.scenarioId, state.weights, doNothing, result]);

  const scen = model.scenarios.find((s) => s.id === state.scenarioId)!;

  return (
    <main className="main">
      <div className="eyebrow">Scenarios and options</div>
      <h1 className="title">What if, and what then</h1>
      <p className="lede">
        Two questions. <b>What if the world is different from the plan?</b> Each scenario changes the conditions and reruns the whole model. <b>What could we do about it?</b> The options below are compared under the scenario you have selected, weighted by what matters to you.
      </p>

      <section className="sec">
        <h2>How the plan holds up</h2>
        <p className="sub">Every scenario, {active.length ? `with your ${active.length} intervention${active.length > 1 ? 's' : ''} applied` : 'as planned'}. Click a column to make it the working scenario.</p>
        <div className="tbl-wrap">
          <table className="tbl cmp">
            <thead>
              <tr>
                <th>Measure</th>
                {byScenario.map(({ scenario }) => (
                  <th key={scenario.id} className={scenario.id === state.scenarioId ? 'sel' : ''}>
                    <button onClick={() => dispatch({ type: 'scenario', id: scenario.id })}>{scenario.name}</button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {([
                ['Teams over target', (r: ModelResult) => `${r.summary.teamsConstrained} of ${r.teams.length}`, 'constrained'],
                ['First break', (r: ModelResult) => (r.summary.firstBreakMonth ? `${teamName(r.summary.firstBreakTeamId!)}, ${monthLabel(r.summary.firstBreakMonth)}` : 'none'), null],
                ['Peak shortfall', (r: ModelResult) => { const n = Math.round(peakShortfall(r)); return n === 0 ? 'none' : n === 1 ? '1 person' : `${n} people`; }, 'peakShortfall'],
                ['Hours over target', (r: ModelResult) => num(r.teams.reduce((s, t) => s + t.totalGapVsPlanHours, 0)), 'gap'],
                ['Headcount, Dec', (r: ModelResult) => `${Math.round(r.summary.endingFte)}`, 'headcount'],
                ['Cost', (r: ModelResult) => money(r.financials.annualTotalCostUsd), null],
                ['Budget variance', (r: ModelResult) => money(r.financials.annualVarianceUsd, { sign: true }), 'budget'],
                ['Revenue exposure', (r: ModelResult) => money(r.summary.revenueExposureUsd), 'exposure'],
                ['Initiatives delayed', (r: ModelResult) => `${r.summary.initiativesDelayed}`, 'delayed'],
              ] as const).map(([label, fn, term]) => (
                <tr key={label}>
                  <td className="ink">{term ? <Term k={term}>{label}</Term> : label}</td>
                  {byScenario.map(({ scenario, result: r }) => <td key={scenario.id} className={scenario.id === state.scenarioId ? 'sel' : ''}>{fn(r)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="sec">
        <h2>What to do about it, under “{scen.name}”</h2>
        <p className="sub">Each option is run on its own against doing nothing. Set the weights; the ranking follows them. This is your preference, not the model's opinion.</p>
        <WeightSliders weights={state.weights} onChange={(w) => dispatch({ type: 'weights', weights: w })} />
        <div className="tbl-wrap">
          <table className="tbl dec">
            <thead>
              <tr><th>#</th><th>Option</th><th><Term k="cost">Added cost</Term></th><th><Term k="speed">Hours still over target</Term></th><th><Term k="exposure">Revenue exposure</Term></th><th><Term k="score">Score</Term></th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.id === 'stack' ? 'stack' : ''}>
                  <td className="dim">{r.rank}</td>
                  <td className="ink left">{r.label}</td>
                  <td>{r.incrementalCostUsd === 0 ? '—' : money(r.incrementalCostUsd, { sign: true })}</td>
                  <td>{num(r.residualGapHours)}</td>
                  <td>{money(r.residualExposureUsd)}</td>
                  <td><span className="scorebar" style={{ ['--w' as string]: `${Math.round(r.score * 100)}%` }}><i /><em>{pct(r.score)}</em></span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note">Scores are relative to the options on this table, including doing nothing, so adding or removing an option changes the others. An option that only moves the target (accepting higher utilization) scores like doing nothing: the work did not move.</p>
      </section>
    </main>
  );
}
