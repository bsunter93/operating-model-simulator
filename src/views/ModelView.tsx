import { useRef, useState } from 'react';
import type { OperatingModel } from '../models/types';
import { FIXTURE, parseImportedModel, useStore } from '../state/store';
import { TEMPLATES } from '../data/templates';
import { modelWarnings } from '../engine';
import { Term } from '../components/Term';
import { num } from '../lib/format';

function NumberCell({ value, onChange, step = 1, min = 0, width = 84 }: { value: number; onChange: (v: number) => void; step?: number; min?: number; width?: number }) {
  return <input className="cellin" type="number" value={value} step={step} min={min} style={{ width }} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= min) onChange(v); }} />;
}

export function ModelView() {
  const { model, dispatch, isFixture } = useStore();
  const [errors, setErrors] = useState<string[]>([]);
  const [scale, setScale] = useState(1);
  const file = useRef<HTMLInputElement>(null);

  const edit = (fn: (m: OperatingModel) => void) => {
    const m = structuredClone(model);
    fn(m);
    m.id = m.id.replace(/(-edited)?$/, '-edited');
    m.status = 'provisional';
    dispatch({ type: 'editModel', model: m });
  };

  const applyScale = (k: number) => {
    setScale(k);
    const tpl = TEMPLATES.find((t) => model.id === t.id || model.id === `${t.id}-edited`) ?? TEMPLATES[0];
    const base = tpl.build();
    const m = structuredClone(model);
    for (const t of m.teams) t.currentFte = Math.max(1, Math.round((base.teams.find((x) => x.id === t.id)?.currentFte ?? t.currentFte) * k));
    for (const s of m.demandStreams) s.annualVolume = Math.max(1, Math.round((base.demandStreams.find((x) => x.id === s.id)?.annualVolume ?? s.annualVolume) * k));
    for (const h of m.hiringPlan) h.headcount = Math.max(0, Math.round((base.hiringPlan.find((x) => x.id === h.id)?.headcount ?? h.headcount) * k));
    for (const i of m.initiatives) for (const tid of Object.keys(i.requiredFteByTeam)) i.requiredFteByTeam[tid] = Math.max(0, Math.round((base.initiatives.find((x) => x.id === i.id)?.requiredFteByTeam[tid] ?? i.requiredFteByTeam[tid]) * k));
    m.budget.modeledAnnualBudgetUsd = Math.round(base.budget.modeledAnnualBudgetUsd * k);
    m.id = tpl.id + (k === 1 ? '' : '-edited');
    m.status = k === 1 && tpl.id === FIXTURE.id ? 'calibrated' : 'provisional';
    dispatch({ type: 'editModel', model: m });
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(model, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${model.id}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (f: File) => {
    const text = await f.text();
    const r = parseImportedModel(text);
    if ('errors' in r) { setErrors(r.errors); return; }
    setErrors([]);
    setScale(1);
    dispatch({ type: 'model', model: r.model });
  };

  const totalFte = model.teams.reduce((s, t) => s + t.currentFte, 0);
  const warnings = modelWarnings(model);

  return (
    <main className="main">
      <div className="eyebrow">Your numbers</div>
      <h1 className="title">Make it your organization</h1>
      <p className="lede">
        Every page runs on the numbers below. Change a team's headcount or a stream's volume and the whole model recomputes. For a different organization altogether, export this model as JSON, edit it, and import it back.
      </p>

      {warnings.length > 0 && (
        <div className="errors warn">
          <b>These numbers disagree with each other.</b> The model still runs; the results may not mean what you intend.
          <ul>{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </div>
      )}
      <section className="sec" data-tour="templates">
        <h2>Start from a template</h2>
        <p className="sub">Each one repopulates every field below with a different organization. All are fictional and fully editable.</p>
        <div className="tpl">
          {TEMPLATES.map((t) => {
            const on = model.id === t.id || model.id === `${t.id}-edited`;
            return (
              <button key={t.id} className={'tpl-card' + (on ? ' on' : '')} onClick={() => { setScale(1); setErrors([]); dispatch({ type: 'model', model: t.build() }); }}>
                <b>{t.name}</b>
                <span>{t.blurb}</span>
                {on && <em>loaded</em>}
              </button>
            );
          })}
        </div>
      </section>

      <section className="sec">
        <h2>Scale</h2>
        <p className="sub">Drag to resize the whole organization. Headcount, volumes, hiring, initiative staffing, and budget all scale together, so the same story plays out at your size. Currently <b>{num(totalFte)} people</b>.</p>
        {isFixture || model.id.startsWith('atlas') ? (
          <label className="wrow scale" data-tour="scale">
            <span className="wl">×{scale.toFixed(2)}</span>
            <input type="range" min={0.1} max={10} step={0.05} value={scale} onChange={(e) => applyScale(Number(e.target.value))} />
            <span className="wv">{num(totalFte)} people</span>
          </label>
        ) : <p className="note">Scaling applies to the Atlas model. Your imported model keeps its own numbers; edit them below.</p>}
      </section>

      <section className="sec">
        <h2>Teams</h2>
        <div className="tbl-wrap">
          <table className="tbl edit">
            <thead><tr><th>Team</th><th>Type</th><th>People</th><th><Term k="target">Target</Term> %</th><th><Term k="shrinkage">Shrinkage</Term> %</th><th><Term k="attrition">Attrition</Term> %/yr</th><th>Cost / person / mo</th></tr></thead>
            <tbody>
              {model.teams.map((t, i) => (
                <tr key={t.id}>
                  <td className="ink left">{t.name}</td>
                  <td className="dim left">{t.teamType.replace('-', ' ')}</td>
                  <td><NumberCell value={t.currentFte} onChange={(v) => edit((m) => { m.teams[i].currentFte = v; })} /></td>
                  <td><NumberCell value={Math.round(t.targetUtilization * 100)} min={1} onChange={(v) => edit((m) => { m.teams[i].targetUtilization = Math.min(100, v) / 100; })} width={64} /></td>
                  <td><NumberCell value={Math.round(t.shrinkage * 100)} onChange={(v) => edit((m) => { m.teams[i].shrinkage = Math.min(99, v) / 100; })} width={64} /></td>
                  <td><NumberCell value={Math.round(t.annualAttrition * 100)} onChange={(v) => edit((m) => { m.teams[i].annualAttrition = Math.min(99, v) / 100; })} width={64} /></td>
                  <td><NumberCell value={t.monthlyFteCostUsd} step={500} onChange={(v) => edit((m) => { m.teams[i].monthlyFteCostUsd = v; })} width={96} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="sec">
        <h2>Work coming in</h2>
        <p className="sub">Annual volume and how long each unit takes. Seasonality spreads the year's volume across months.</p>
        <div className="tbl-wrap">
          <table className="tbl edit">
            <thead><tr><th>Stream</th><th>Team</th><th>Units / year</th><th>Minutes each</th><th>Hours / year</th></tr></thead>
            <tbody>
              {model.demandStreams.map((s, i) => (
                <tr key={s.id}>
                  <td className="ink left">{s.name}</td>
                  <td className="dim left">{model.teams.find((t) => t.id === s.teamId)?.name}</td>
                  <td><NumberCell value={s.annualVolume} onChange={(v) => edit((m) => { m.demandStreams[i].annualVolume = v; })} width={96} /></td>
                  <td><NumberCell value={s.handlingMinutesPerUnit} onChange={(v) => edit((m) => { m.demandStreams[i].handlingMinutesPerUnit = v; })} width={96} /></td>
                  <td className="dim">{num(s.annualVolume * s.handlingMinutesPerUnit / 60 * s.complexityFactor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="sec">
        <h2>Hiring plan</h2>
        <div className="tbl-wrap">
          <table className="tbl edit">
            <thead><tr><th>Team</th><th>Requested</th><th>People</th><th><Term k="leadTime">Lead time</Term>, months</th></tr></thead>
            <tbody>
              {model.hiringPlan.map((h, i) => (
                <tr key={h.id}>
                  <td className="ink left">{model.teams.find((t) => t.id === h.teamId)?.name}</td>
                  <td className="dim">{h.requestMonth}</td>
                  <td><NumberCell value={h.headcount} onChange={(v) => edit((m) => { m.hiringPlan[i].headcount = v; })} width={72} /></td>
                  <td><NumberCell value={h.leadTimeMonths} onChange={(v) => edit((m) => { m.hiringPlan[i].leadTimeMonths = v; })} width={72} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="sec">
        <h2>The whole model</h2>
        <p className="sub">Initiatives, dependencies, seasonality, scenarios, and interventions live in the JSON. Export it, edit anything, import it back. Nothing leaves your browser.</p>
        <div className="btns">
          <button className="btn" onClick={exportJson}>Export JSON</button>
          <button className="btn ghost" onClick={() => file.current?.click()}>Import JSON</button>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importJson(f); e.target.value = ''; }} />
          {!isFixture && <button className="btn ghost" onClick={() => { setScale(1); dispatch({ type: 'model', model: FIXTURE }); }}>Back to Atlas</button>}
        </div>
        {errors.length > 0 && (
          <div className="errors">
            <b>That file did not load.</b>
            <ul>{errors.slice(0, 12).map((e) => <li key={e}>{e}</li>)}</ul>
            {errors.length > 12 && <p>…and {errors.length - 12} more.</p>}
          </div>
        )}
      </section>
    </main>
  );
}
