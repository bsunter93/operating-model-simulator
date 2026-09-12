import { useMemo, useState } from 'react';
import type { OperatingModel } from '../models/types';
import { FIXTURE, parseImportedModel, useStore } from '../state/store';
import { TEMPLATES } from '../data/templates';
import { Controls } from '../components/Controls';
import { verdict } from '../lib/verdict';
import { money, monthLabel, num, pct } from '../lib/format';

function N({ value, onChange, step = 1, min = 0, width = 64 }: { value: number; onChange: (v: number) => void; step?: number; min?: number; width?: number }) {
  return <input className="cellin" type="number" value={value} step={step} min={min} style={{ width }} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= min) onChange(v); }} />;
}

/** Your numbers: one screen, no scrolling. Inputs on the left in labeled cards, the answer on the right. */
export function Mine() {
  const { model, dispatch, result, state, teamName, initName, isBase } = useStore();
  const [errors, setErrors] = useState<string[]>([]);
  const focus = state.teamId ?? result.summary.firstBreakTeamId ?? model.teams[0].id;
  const v = verdict(result, teamName, initName);
  const edit = (fn: (m: OperatingModel) => void) => { const m = structuredClone(model); fn(m); m.id = m.id.replace(/(-edited)?$/, '-edited'); m.status = 'provisional'; dispatch({ type: 'editModel', model: m }); };
  const top3 = useMemo(() => [...result.constraints].slice(0, 3), [result.constraints]);
  const totalFte = model.teams.reduce((s, t) => s + t.currentFte, 0);
  const exportJson = () => { const blob = new Blob([JSON.stringify(model, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${model.id}.json`; a.click(); URL.revokeObjectURL(a.href); };
  const importJson = async (f: File) => { const r = parseImportedModel(await f.text()); if ('errors' in r) { setErrors(r.errors); return; } setErrors([]); dispatch({ type: 'model', model: r.model }); };

  return (
    <div className="mine">
      <div className="mine-top">
        <div>
          <div className="eyebrow">Your numbers</div>
          <h1 className="mine-title">Put your organization in.</h1>
        </div>
        <div className="tpl-row">
          <span className="lbl">Start from</span>
          {TEMPLATES.map((t) => <button key={t.id} className={'chipbtn' + (model.id === t.id || model.id === `${t.id}-edited` ? ' on' : '')} onClick={() => dispatch({ type: 'model', model: t.build() })} title={t.blurb}>{t.name}</button>)}
          <button className="chipbtn" onClick={exportJson}>Export JSON</button>
          <label className="chipbtn">Import JSON<input type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importJson(f); e.target.value = ''; }} /></label>
          {model.id !== FIXTURE.id && <button className="chipbtn" onClick={() => dispatch({ type: 'model', model: FIXTURE })}>Reset</button>}
        </div>
      </div>
      {errors.length > 0 && <div className="errors"><b>That file did not load.</b><ul>{errors.slice(0, 6).map((e) => <li key={e}>{e}</li>)}</ul></div>}

      <div className="mine-grid">
        <div className="mine-inputs">
          <section className="card tight">
            <h5>Teams <span>{num(totalFte)} people</span></h5>
            <div className="scroll">
              <table className="tbl edit mini"><thead><tr><th>Team</th><th>People</th><th>Target %</th><th>Attrition %</th></tr></thead>
                <tbody>{model.teams.map((t, i) => <tr key={t.id}><td className="ink left">{t.name}</td><td><N value={t.currentFte} onChange={(x) => edit((m) => { m.teams[i].currentFte = x; })} /></td><td><N value={Math.round(t.targetUtilization * 100)} min={1} width={54} onChange={(x) => edit((m) => { m.teams[i].targetUtilization = Math.min(100, x) / 100; })} /></td><td><N value={Math.round(t.annualAttrition * 100)} width={54} onChange={(x) => edit((m) => { m.teams[i].annualAttrition = Math.min(99, x) / 100; })} /></td></tr>)}</tbody>
              </table>
            </div>
          </section>
          <section className="card tight">
            <h5>Work coming in</h5>
            <div className="scroll">
              <table className="tbl edit mini"><thead><tr><th>Stream</th><th>Units / yr</th><th>Minutes each</th></tr></thead>
                <tbody>{model.demandStreams.map((s, i) => <tr key={s.id}><td className="ink left">{s.name}</td><td><N value={s.annualVolume} width={84} onChange={(x) => edit((m) => { m.demandStreams[i].annualVolume = x; })} /></td><td><N value={s.handlingMinutesPerUnit} width={74} onChange={(x) => edit((m) => { m.demandStreams[i].handlingMinutesPerUnit = x; })} /></td></tr>)}</tbody>
              </table>
            </div>
          </section>
          <section className="card tight">
            <h5>Hiring plan</h5>
            <table className="tbl edit mini"><thead><tr><th>Team</th><th>People</th><th>Lead, months</th></tr></thead>
              <tbody>{model.hiringPlan.map((h, i) => <tr key={h.id}><td className="ink left">{teamName(h.teamId)}</td><td><N value={h.headcount} width={54} onChange={(x) => edit((m) => { m.hiringPlan[i].headcount = x; })} /></td><td><N value={h.leadTimeMonths} width={54} onChange={(x) => edit((m) => { m.hiringPlan[i].leadTimeMonths = x; })} /></td></tr>)}</tbody>
            </table>
          </section>
        </div>

        <div className="mine-answer">
          <section className="card tight answer">
            <h5>The answer {!isBase && <span>with your scenario and levers</span>}</h5>
            <p className="mine-verdict"><b>{v.headline}</b> {v.sentences[0]}</p>
            <div className="mini-map">
              <table className="strip-t"><thead><tr><th></th>{result.months.map((m) => <th key={m}>{monthLabel(m).slice(0, 1)}</th>)}</tr></thead>
                <tbody>{result.teams.map((t) => <tr key={t.teamId} className={t.teamId === focus ? 'focus' : ''}><td><button className="teamlink" onClick={() => dispatch({ type: 'team', id: t.teamId })}>{teamName(t.teamId)}</button></td>{t.months.map((m) => <td key={m.month}><span className="cell sm" data-s={m.status} title={`${monthLabel(m.month)}: ${pct(m.utilization)}`}></span></td>)}</tr>)}</tbody>
              </table>
            </div>
            <ol className="top3">
              {top3.length === 0 ? <li className="dim">Nothing breaks. Every team stays within capacity.</li> : top3.map((c) => <li key={c.id} data-kind={c.kind}><b>{c.firstMonth ? monthLabel(c.firstMonth) : '—'}</b> {c.title}{c.businessImpactUsd > 0 ? <span> · {money(c.businessImpactUsd)}</span> : null}</li>)}
            </ol>
          </section>
          <Controls teamId={focus} onTeam={(id) => dispatch({ type: 'team', id })} compact />
        </div>
      </div>
      <p className="mine-foot">Nothing leaves your browser. Every figure recomputes as you type. <a href="#/">Back to the story</a></p>
    </div>
  );
}
