import { useMemo, useState } from 'react';
import { compareOptions, run } from '../engine';
import type { DecisionWeights } from '../models/types';
import { href, useStore } from '../state/store';
import { Term } from '../components/Term';
import { verdict } from '../lib/verdict';
import { thresholds } from '../lib/thresholds';
import { money, monthLabel, num, pct } from '../lib/format';

function WeightSliders({ weights, onChange }: { weights: DecisionWeights; onChange: (w: DecisionWeights) => void }) {
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
  return <div className="weights" data-tour="weights">{row('cost', 'Cost', 'cost')}{row('speed', 'Speed', 'speed')}{row('revenueExposure', 'Revenue exposure', 'exposure')}</div>;
}

export function Decide() {
  const { state, dispatch, model, interventions, result, doNothing, base, teamName, initName } = useStore();
  const active = useMemo(() => interventions.filter((iv) => state.interventionIds.includes(iv.id)), [interventions, state.interventionIds]);
  const scen = model.scenarios.find((s) => s.id === state.scenarioId)!;
  const [copied, setCopied] = useState(false);

  const rows = useMemo(() => {
    const candidates = interventions.filter((iv) => !iv.id.includes(':') || state.interventionIds.includes(iv.id));
    const options = candidates.map((iv) => ({ id: iv.id, label: iv.name, result: run(model, { scenario: state.scenarioId, interventions: [iv] }) }));
    if (active.length > 1) options.push({ id: 'stack', label: `Your combination (${active.length} on)`, result });
    return compareOptions(doNothing, options, state.weights).sort((a, b) => a.rank - b.rank);
  }, [model, interventions, active, state.interventionIds, state.scenarioId, state.weights, doNothing, result]);

  const th = useMemo(() => thresholds(model, state.scenarioId, active, teamName), [model, state.scenarioId, active, teamName]);
  const v = verdict(result, teamName, initName, base);
  const top = rows[0];

  const record = useMemo(() => {
    const lines: string[] = [];
    lines.push(`DECISION RECORD · ${model.name} · ${model.calendar.startMonth.slice(0, 4)} plan · scenario: ${scen.name}`);
    lines.push('');
    lines.push(`Decision: ${active.length ? active.map((iv) => iv.name).join(' + ') : 'no intervention selected yet'}.`);
    lines.push(`Read: ${v.headline} ${v.sentences.join(' ')}${v.versus ? ' ' + v.versus : ''}`);
    lines.push(`Ranking (cost ${pct(state.weights.cost)}, speed ${pct(state.weights.speed)}, exposure ${pct(state.weights.revenueExposure)}): ${rows.slice(0, 3).map((r) => `${r.rank}. ${r.label}`).join('; ')}.`);
    lines.push('');
    lines.push('What has to be true:');
    if (active.length === 0) lines.push('  - Nothing beyond the plan as written.');
    for (const iv of active) {
      if (iv.type === 'expediteHiring') lines.push(`  - The planned hires can be brought in with a ${iv.newLeadTimeMonths}-month lead time for ${money(iv.oneTimeCostUsd)}.`);
      if (iv.type === 'hire') lines.push(`  - ${iv.headcount} more people for ${teamName(iv.teamId)} can be hired and land after ${iv.leadTimeMonths} months.`);
      if (iv.type === 'automation') lines.push(`  - ${pct(iv.workloadReductionRate)} of ${teamName(iv.teamId)}'s hours can be removed, live ${iv.timeToImpactMonths} months after kickoff, for ${money(iv.implementationCostUsd)}.`);
      if (iv.type === 'reallocation') lines.push(`  - ${iv.headcount} people from ${teamName(iv.fromTeamId)} can do ${teamName(iv.toTeamId)}'s work after ${iv.timeToImpactMonths} month${iv.timeToImpactMonths === 1 ? '' : 's'}, and ${teamName(iv.fromTeamId)} can absorb their absence.`);
      if (iv.type === 'defer') lines.push(`  - ${initName(iv.initiativeId)} can move by ${iv.months} months without losing its value.`);
      if (iv.type === 'cancel') lines.push(`  - ${initName(iv.initiativeId)} can be dropped, along with its ${money(model.initiatives.find((i) => i.id === iv.initiativeId)!.financialValueUsd)} of value.`);
      if (iv.type === 'serviceLevelChange') lines.push(`  - ${teamName(iv.teamId)} can run at ${pct(iv.newTargetUtilization)} and the service level can take it.`);
    }
    lines.push('');
    lines.push('What would change my mind:');
    for (const t of th) lines.push(`  - ${t.text}`);
    lines.push('');
    lines.push(`Generated from the model on ${new Date().toISOString().slice(0, 10)}. Every figure is recomputable from the exported JSON.`);
    return lines.join('\n');
  }, [model, scen, active, v, rows, state.weights, th, teamName, initName]);

  return (
    <section className="page-sec" id="sec-decide">
      <div className="eyebrow">5 · Decide</div>
      <h1 className="title">Which option, given what matters to you?</h1>
      <p className="lede">Every option is compared on three things: what it adds in cost, how much of the problem is still there and for how long, and revenue at risk. Set the weights; the ranking follows them. Under <b>{scen.name}</b>{active.length ? `, with ${active.length} lever${active.length > 1 ? 's' : ''} on` : ''}.</p>

      <WeightSliders weights={state.weights} onChange={(w) => dispatch({ type: 'weights', weights: w })} />

      <div className="tbl-wrap">
        <table className="tbl dec">
          <thead>
            <tr><th>#</th><th>Option</th><th><Term k="cost">Added cost</Term></th><th><Term k="speed">Hours still over capacity</Term></th><th><Term k="exposure">Revenue exposure</Term></th><th><Term k="score">Score</Term></th></tr>
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
      <p className="note">Scores are relative to the options on this table, including doing nothing, so adding or removing one changes the others. An option that only moves the target scores like doing nothing: the work did not move. {top && top.id !== 'do-nothing' ? <>Top-ranked by your weights: <b>{top.label}</b>.</> : null}</p>

      <section className="sec" data-tour="record">
        <h2>The decision record</h2>
        <p className="sub">Written by the model from what you selected. Copy it into the deck; every number traces back to the JSON.</p>
        <pre className="record">{record}</pre>
        <div className="btns">
          <button className="btn" onClick={() => { void navigator.clipboard.writeText(record).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}>{copied ? 'Copied' : 'Copy the record'}</button>
          <a className="btn ghost" href={href(`#/options/${result.summary.firstBreakTeamId ?? model.teams[0].id}`)}>Change the levers</a>
        </div>
      </section>

      <section className="sec">
        <h2>What would change my mind</h2>
        <p className="sub">Thresholds found by rerunning the model until the answer flips. They move when you change anything above.</p>
        <ul className="th">{th.map((t) => <li key={t.text}>{t.text}</li>)}</ul>
        {result.summary.firstBreakMonth && <p className="note">Under this configuration the first team over capacity is {teamName(result.summary.firstBreakTeamId!)} in {monthLabel(result.summary.firstBreakMonth, true)}.</p>}
      </section>

      <nav className="next">
        <a className="btn ghost" href={href('#/plan')}>Next: make it your organization →</a>
      </nav>
    </section>
  );
}
