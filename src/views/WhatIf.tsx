import { useMemo } from 'react';
import { run } from '../engine';
import type { ModelResult } from '../models/results';
import { href, useStore } from '../state/store';
import { Term } from '../components/Term';
import { verdict } from '../lib/verdict';
import { money, monthLabel, num } from '../lib/format';

function peakShortfall(r: ModelResult): number {
  let best = 0;
  for (const t of r.teams) for (const m of t.months) best = Math.max(best, m.workforceGap);
  return best;
}

export function WhatIf() {
  const { state, dispatch, model, interventions, teamName, initName, base } = useStore();
  const active = interventions.filter((iv) => state.interventionIds.includes(iv.id));
  const byScenario = useMemo(() => model.scenarios.map((s) => ({ scenario: s, result: run(model, { scenario: s.id, interventions: active }) })), [model, active]);
  const cur = byScenario.find((x) => x.scenario.id === state.scenarioId)!;
  const v = verdict(cur.result, teamName, initName, cur.scenario.type === 'base' ? undefined : base);

  return (
    <main className="main one">
      <div className="eyebrow">3 · What if</div>
      <h1 className="title">What if the world is different from the plan?</h1>
      <p className="lede">Pick a scenario to see how the plan holds up when conditions change. The whole model reruns under it{active.length ? `, with your ${active.length} lever${active.length > 1 ? 's' : ''} still on` : ''}. It stays selected as you move through the other steps.</p>

      <div className="scen" data-tour="scenarios" role="radiogroup" aria-label="Scenario">
        {byScenario.map(({ scenario, result }) => {
          const on = scenario.id === state.scenarioId;
          const vv = verdict(result, teamName, initName);
          return (
            <button key={scenario.id} className={'scen-card' + (on ? ' on' : '')} role="radio" aria-checked={on} onClick={() => dispatch({ type: 'scenario', id: scenario.id })}>
              <b>{scenario.name}</b>
              <span className="scen-desc">{scenario.description}</span>
              <span className={'scen-v' + (vv.headline === 'Yes.' ? ' ok' : vv.headline === 'Not as written.' ? ' bad' : '')}>{vv.headline}</span>
              <span className="scen-n">{result.summary.teamsConstrained} of {result.teams.length} teams over target · {money(result.summary.revenueExposureUsd)} exposed</span>
            </button>
          );
        })}
      </div>

      <div className="callout">
        <b>Under “{cur.scenario.name}”: {v.headline}</b> {v.sentences.join(' ')} {v.versus ?? ''}
      </div>

      <section className="sec">
        <h2>Side by side</h2>
        <p className="sub">Every scenario on the same measures. The selected one is shaded.</p>
        <div className="tbl-wrap">
          <table className="tbl cmp">
            <thead>
              <tr>
                <th>Measure</th>
                {byScenario.map(({ scenario }) => <th key={scenario.id} className={scenario.id === state.scenarioId ? 'sel' : ''}><button onClick={() => dispatch({ type: 'scenario', id: scenario.id })}>{scenario.name}</button></th>)}
              </tr>
            </thead>
            <tbody>
              {([
                ['Teams over target', (r: ModelResult) => `${r.summary.teamsConstrained} of ${r.teams.length}`, 'constrained'],
                ['First break', (r: ModelResult) => (r.summary.firstBreakMonth ? `${teamName(r.summary.firstBreakTeamId!)}, ${monthLabel(r.summary.firstBreakMonth)}` : 'none'), null],
                ['Peak shortfall', (r: ModelResult) => { const k = Math.round(peakShortfall(r)); return k === 0 ? 'none' : k === 1 ? '1 person' : `${k} people`; }, 'peakShortfall'],
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

      <nav className="next">
        <a className="btn" href={href(`#/options/${cur.result.summary.firstBreakTeamId ?? model.teams[0].id}`)}>Next: what to do about it →</a>
      </nav>
    </main>
  );
}
