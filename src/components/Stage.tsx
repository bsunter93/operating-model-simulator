import { useMemo } from 'react';
import type { ModelResult } from '../models/results';
import { compareOptions, run } from '../engine';
import { useStore } from '../state/store';
import { TeamTimeline } from './charts/TeamTimeline';
import { StatusPill } from './StatusPill';
import { Term } from './Term';
import { money, monthLabel, num, pct } from '../lib/format';
import { verdict } from '../lib/verdict';
import { Portfolio } from '../views/Portfolio';
import { Workforce } from '../views/Workforce';
import { Cost } from '../views/Cost';
import { Organization } from '../views/Organization';
import { ModelView } from '../views/ModelView';
import { About } from '../views/About';

export type StageView =
  | { kind: 'map'; focusTeam?: string | null }
  | { kind: 'team'; teamId: string; ghost?: boolean }
  | { kind: 'initiatives' }
  | { kind: 'workforce' }
  | { kind: 'cost' }
  | { kind: 'organization' }
  | { kind: 'scenarios' }
  | { kind: 'ranking' }
  | { kind: 'record'; text: string; thresholds: string[] }
  | { kind: 'plan' }
  | { kind: 'about' };

const people = (n: number) => (Math.round(n) === 1 ? '1 person' : `${Math.round(n)} people`);

function peakShortfall(r: ModelResult): number {
  let best = 0;
  for (const t of r.teams) for (const m of t.months) best = Math.max(best, m.workforceGap);
  return best;
}

function MapStage({ focusTeam, onTeam }: { focusTeam?: string | null; onTeam: (id: string) => void }) {
  const { result, teamName } = useStore();
  const now = new Date();
  const nowKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const nowIdx = result.months.indexOf(nowKey);
  return (
    <div className="stage-in">
      <div className="stage-head"><b>Where and when</b><span><Term k="utilization">Utilization</Term> by team and month. Colored cells are over each team's own target. Click a team to see its year.</span></div>
      <div className="tbl-wrap">
        <table className="strip-t big">
          <thead><tr><th>Team</th>{result.months.map((m, i) => <th key={m} className={i === nowIdx ? 'now' : ''}>{monthLabel(m)}{i === nowIdx && <em>now</em>}</th>)}</tr></thead>
          <tbody>
            {result.teams.map((t) => (
              <tr key={t.teamId} className={focusTeam === t.teamId ? 'focus' : ''}>
                <td><button className="teamlink" onClick={() => onTeam(t.teamId)}>{teamName(t.teamId)}{focusTeam === t.teamId ? ' ◀' : ''}</button></td>
                {t.months.map((m, i) => (
                  <td key={m.month} className={i === nowIdx ? 'now' : ''}><button className="cell" data-s={m.status} onClick={() => onTeam(t.teamId)} title={`${teamName(t.teamId)}, ${monthLabel(m.month, true)}: ${num(m.workloadHours)} h of ${num(m.availableProductiveHours)} h`}>{Number.isFinite(m.utilization) ? Math.round(m.utilization * 100) : '∞'}</button></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="legend"><span><i /> within capacity</span><span><i data-s="watch" /> <Term k="watch">watch</Term></span><span><i data-s="constrained" /> <Term k="constrained">over capacity</Term></span><span><i data-s="severe" /> <Term k="severe">over 100%</Term></span></div>
    </div>
  );
}

function TeamStage({ teamId, ghost, onTeam, onMap }: { teamId: string; ghost?: boolean; onTeam: (id: string) => void; onMap: () => void }) {
  const { result, doNothing, model, state } = useStore();
  const team = result.teams.find((t) => t.teamId === teamId)!;
  const g = doNothing.teams.find((t) => t.teamId === teamId)!;
  const def = model.teams.find((t) => t.id === teamId)!;
  const landing = team.months.filter((m) => m.hiresLanded > 0);
  const firstOver = team.months.find((m) => m.status === 'constrained' || m.status === 'severe');
  const lastOver = [...team.months].reverse().find((m) => m.status === 'constrained' || m.status === 'severe');
  const peak = team.months.find((m) => m.month === team.peakMonth)!;
  const planned = model.hiringPlan.filter((h) => h.teamId === teamId);
  const streams = model.demandStreams.filter((s) => s.teamId === teamId);
  const showGhost = ghost !== false && state.interventionIds.length > 0;
  return (
    <div className="stage-in">
      <div className="stage-head">
        <b><select className="teampick" value={teamId} onChange={(e) => onTeam(e.target.value)} aria-label="Team">{model.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select> <StatusPill status={team.worstStatus} /></b>
        <span><button className="linkbtn" onClick={onMap}>← all teams</button></span>
      </div>
      <div className="chart">
        <div className="chart-title"><b>Hours of work against what the team can handle</b><span>{streams.length ? streams.map((s) => { const h = s.handlingMinutesPerUnit / 60; return `${num(s.annualVolume)} ${s.unit} × ${h >= 1 ? `${parseFloat(h.toFixed(1))} h` : `${s.handlingMinutesPerUnit} min`}`; }).join(' · ') : 'initiative work only'}</span></div>
        <TeamTimeline team={team} ghost={showGhost ? g : undefined} />
        <div className="legend"><span><i className="bar" /> <Term k="run">run work</Term></span><span><i className="bar2" /> <Term k="initiative">initiative work</Term></span><span><i data-s="severe" /> <Term k="gap">over capacity</Term></span><span><i className="tline" /> <Term k="target">target capacity</Term></span><span><i className="aline" /> <Term k="productive">all productive hours</Term></span>{showGhost && <span><i className="ghost" /> before your levers</span>}</div>
      </div>
      {firstOver ? (
        <div className="callout">
          {planned.length > 0 && landing.length > 0 ? <><b>The plan already hires {planned.reduce((s, h) => s + h.headcount, 0)} people for this team.</b> They arrive in <b>{monthLabel(landing[0].month)}</b>. Between {monthLabel(firstOver.month)} and then it runs up to <b>{pct(peak.utilization)}</b> against a {pct(def.targetUtilization)} target, {people(peak.workforceGap)} short at the worst point.{lastOver && landing[0].monthIndex <= lastOver.monthIndex ? <> Even after they land it is over capacity through {monthLabel(lastOver.month)}.</> : <> Once they land it is back within capacity.</>} Hiring solves the capacity problem eventually. It does not solve the one that exists today.</>
            : planned.length > 0 ? <><b>This scenario cancels the {planned.reduce((s, h) => s + h.headcount, 0)} hires the plan had for this team.</b> It runs over capacity from {monthLabel(firstOver.month)}{lastOver ? ` through ${monthLabel(lastOver.month)}` : ''}, peaking at {pct(peak.utilization)}.</>
            : landing.length > 0 ? <><b>Your lever adds {landing.map((m) => `${Math.round(m.hiresLanded)} in ${monthLabel(m.month)}`).join(' and ')}.</b> It is still over capacity from {monthLabel(firstOver.month)}{lastOver && lastOver !== firstOver ? ` through ${monthLabel(lastOver.month)}` : ''}, peaking at {pct(peak.utilization)}.</>
            : <><b>The plan has no hires for this team.</b> It runs over capacity from {monthLabel(firstOver.month)}{lastOver && lastOver !== firstOver ? ` through ${monthLabel(lastOver.month)}` : ''}, peaking at {pct(peak.utilization)} with {people(peak.workforceGap)} short.</>}
        </div>
      ) : <div className="callout ok"><b>{def.name} stays within capacity all year</b>{state.interventionIds.length ? ' with your levers on.' : '.'}</div>}
    </div>
  );
}

function ScenariosStage() {
  const { state, dispatch, model, interventions, teamName, initName, base } = useStore();
  const active = interventions.filter((iv) => state.interventionIds.includes(iv.id));
  const rows = useMemo(() => model.scenarios.map((s) => ({ scenario: s, result: run(model, { scenario: s.id, interventions: active }) })), [model, active]);
  const cur = rows.find((x) => x.scenario.id === state.scenarioId)!;
  const v = verdict(cur.result, teamName, initName, cur.scenario.type === 'base' ? undefined : base);
  return (
    <div className="stage-in">
      <div className="stage-head"><b>Every scenario, side by side</b><span>{active.length ? `with your ${active.length} lever${active.length > 1 ? 's' : ''} on` : 'as planned'} · click a column to select it</span></div>
      <div className="callout"><b>Under “{cur.scenario.name}”: {v.headline}</b> {v.sentences.join(' ')} {v.versus ?? ''}</div>
      <div className="tbl-wrap">
        <table className="tbl cmp">
          <thead><tr><th>Measure</th>{rows.map(({ scenario }) => <th key={scenario.id} className={scenario.id === state.scenarioId ? 'sel' : ''}><button onClick={() => dispatch({ type: 'scenario', id: scenario.id })}>{scenario.name}</button></th>)}</tr></thead>
          <tbody>
            {([
              ['Verdict', (r: ModelResult) => verdict(r, teamName, initName).headline, null],
              ['Teams over capacity', (r: ModelResult) => `${r.summary.teamsConstrained} of ${r.teams.length}`, 'constrained'],
              ['First break', (r: ModelResult) => (r.summary.firstBreakMonth ? `${teamName(r.summary.firstBreakTeamId!)}, ${monthLabel(r.summary.firstBreakMonth)}` : 'none'), null],
              ['Peak shortfall', (r: ModelResult) => { const k = Math.round(peakShortfall(r)); return k === 0 ? 'none' : people(k); }, 'peakShortfall'],
              ['Hours over capacity', (r: ModelResult) => num(r.teams.reduce((s, t) => s + t.totalGapVsPlanHours, 0)), 'gap'],
              ['Headcount, Dec', (r: ModelResult) => `${Math.round(r.summary.endingFte)}`, 'headcount'],
              ['Cost', (r: ModelResult) => money(r.financials.annualTotalCostUsd), null],
              ['Budget variance', (r: ModelResult) => money(r.financials.annualVarianceUsd, { sign: true }), 'budget'],
              ['Revenue exposure', (r: ModelResult) => money(r.summary.revenueExposureUsd), 'exposure'],
            ] as const).map(([label, fn, term]) => (
              <tr key={label}><td className="ink">{term ? <Term k={term}>{label}</Term> : label}</td>{rows.map(({ scenario, result: r }) => <td key={scenario.id} className={scenario.id === state.scenarioId ? 'sel' : ''}>{fn(r)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RankingStage() {
  const { state, model, interventions, result, doNothing } = useStore();
  const active = interventions.filter((iv) => state.interventionIds.includes(iv.id));
  const rows = useMemo(() => {
    const candidates = interventions.filter((iv) => !iv.id.includes(':') || state.interventionIds.includes(iv.id));
    const options = candidates.map((iv) => ({ id: iv.id, label: iv.name, result: run(model, { scenario: state.scenarioId, interventions: [iv] }) }));
    if (active.length > 1) options.push({ id: 'stack', label: `Your combination (${active.length} on)`, result });
    return compareOptions(doNothing, options, state.weights).sort((a, b) => a.rank - b.rank);
  }, [model, interventions, active, state.interventionIds, state.scenarioId, state.weights, doNothing, result]);
  const scen = model.scenarios.find((s) => s.id === state.scenarioId)!;
  return (
    <div className="stage-in">
      <div className="stage-head"><b>Every option against doing nothing, under “{scen.name}”</b><span>ranked by the weights in the story · cost {pct(state.weights.cost)}, speed {pct(state.weights.speed)}, exposure {pct(state.weights.revenueExposure)}</span></div>
      <div className="tbl-wrap">
        <table className="tbl dec">
          <thead><tr><th>#</th><th>Option</th><th><Term k="cost">Added cost</Term></th><th><Term k="speed">Hours still over capacity</Term></th><th><Term k="exposure">Revenue exposure</Term></th><th><Term k="score">Score</Term></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={r.id === 'stack' ? 'stack' : ''}>
                <td className="dim">{r.rank}</td><td className="ink left">{r.label}</td>
                <td>{r.incrementalCostUsd === 0 ? '—' : money(r.incrementalCostUsd, { sign: true })}</td><td>{num(r.residualGapHours)}</td><td>{money(r.residualExposureUsd)}</td>
                <td><span className="scorebar" style={{ ['--w' as string]: `${Math.round(r.score * 100)}%` }}><i /><em>{pct(r.score)}</em></span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">Scores are relative to the options on this table, including doing nothing. An option that only moves the target scores like doing nothing: the work did not move.</p>
    </div>
  );
}

function RecordStage({ text, thresholds }: { text: string; thresholds: string[] }) {
  return (
    <div className="stage-in">
      <div className="stage-head"><b>The decision record</b><span>written by the model from what you selected</span></div>
      <pre className="record">{text}</pre>
      <h4 className="h4">What would change my mind</h4>
      <ul className="th">{thresholds.map((t) => <li key={t}>{t}</li>)}</ul>
    </div>
  );
}

export function Stage({ view, onTeam, onMap }: { view: StageView; onTeam: (id: string) => void; onMap: () => void }) {
  const key = view.kind + ('teamId' in view ? view.teamId : '');
  return (
    <div className="stage-body" key={key}>
      {view.kind === 'map' && <MapStage focusTeam={view.focusTeam} onTeam={onTeam} />}
      {view.kind === 'team' && <TeamStage teamId={view.teamId} ghost={view.ghost} onTeam={onTeam} onMap={onMap} />}
      {view.kind === 'initiatives' && <div className="stage-in embed"><Portfolio /></div>}
      {view.kind === 'workforce' && <div className="stage-in embed"><Workforce /></div>}
      {view.kind === 'cost' && <div className="stage-in embed"><Cost /></div>}
      {view.kind === 'organization' && <div className="stage-in embed"><Organization /></div>}
      {view.kind === 'scenarios' && <ScenariosStage />}
      {view.kind === 'ranking' && <RankingStage />}
      {view.kind === 'record' && <RecordStage text={view.text} thresholds={view.thresholds} />}
      {view.kind === 'plan' && <div className="stage-in embed"><ModelView /></div>}
      {view.kind === 'about' && <div className="stage-in embed"><About /></div>}
    </div>
  );
}
