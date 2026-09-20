import { useCallback, useEffect, useMemo, useState } from 'react';
import type { OperatingModel } from '../models/types';
import { FIXTURE, parseImportedModel, useStore } from '../state/store';
import { TEMPLATES } from '../data/templates';
import { Controls } from '../components/Controls';
import { verdict } from '../lib/verdict';
import { monthLabel, pct } from '../lib/format';
import { encodeShare, type SavedModel } from '../state/persistence';

function N({ value, onChange, step = 1, min = 0, width = 64 }: { value: number; onChange: (v: number) => void; step?: number; min?: number; width?: number }) {
  return <input className="cellin" type="number" value={value} step={step} min={min} style={{ width }} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= min) onChange(v); }} />;
}

/** Your numbers: one screen, no scrolling. Inputs on the left in labeled cards, the answer on the right. */
export function Mine() {
  const { model, dispatch, result, state, teamName, initName, isBase, fmt,
          store, restoredFrom, dismissRestored } = useStore();
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState<SavedModel[]>([]);
  const [naming, setNaming] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);

  const refresh = useCallback(() => { void store.list().then(setSaved); }, [store]);
  useEffect(refresh, [refresh]);
  /* Say what happened, then stop saying it. A status line that never clears stops being
     read, and this one is the only feedback a save gives. */
  useEffect(() => {
    if (!said) return;
    const t = setTimeout(() => setSaid(null), 4000);
    return () => clearTimeout(t);
  }, [said]);

  const saveAs = async (name: string) => {
    if (!name.trim()) return;
    const meta = await store.save(name, model);
    setNaming(null);
    refresh();
    setSaid(`Saved as ${meta.name}.`);
  };
  const shareLink = async () => {
    const token = await encodeShare(model);
    const url = `${location.origin}${location.pathname}#/mine?m=${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setSaid(`Link copied. ${(url.length / 1024).toFixed(1)}k of URL, which carries the whole model.`);
    } catch {
      // Clipboard needs a permission this page may not have. Give them the link instead.
      setSaid(url);
    }
  };
  const focus = state.teamId ?? result.summary.firstBreakTeamId ?? model.teams[0].id;
  const v = verdict(result, fmt, teamName, initName);
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
          <button className="chipbtn" onClick={() => setNaming(model.name)}>Save</button>
          <button className="chipbtn" onClick={() => void shareLink()}>Copy link</button>
          <button className="chipbtn" onClick={exportJson}>Export JSON</button>
          <label className="chipbtn">Import JSON<input type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importJson(f); e.target.value = ''; }} /></label>
          {model.id !== FIXTURE.id && <button className="chipbtn" onClick={() => dispatch({ type: 'model', model: FIXTURE })}>Reset</button>}
        </div>
      </div>
      {errors.length > 0 && <div className="errors"><b>That file did not load.</b><ul>{errors.slice(0, 6).map((e) => <li key={e}>{e}</li>)}</ul></div>}

      {restoredFrom && (
        <p className="keepline">
          {restoredFrom === 'link'
            ? 'Opened from a shared link. Nothing was sent anywhere: the whole model travelled in the URL.'
            : 'Picked up where you left off. This is kept in this browser only.'}
          <button className="linkbtn" onClick={() => { dismissRestored(); dispatch({ type: 'model', model: FIXTURE }); }}>Back to Atlas</button>
          <button className="linkbtn" onClick={dismissRestored}>Keep it</button>
        </p>
      )}

      {naming !== null && (
        <form className="keepline" onSubmit={(e) => { e.preventDefault(); void saveAs(naming); }}>
          <label>Save this model as
            <input className="cellin" autoFocus value={naming} onChange={(e) => setNaming(e.target.value)} style={{ width: 200, marginLeft: 8 }} />
          </label>
          <button className="chipbtn" type="submit">Save</button>
          <button className="chipbtn" type="button" onClick={() => setNaming(null)}>Cancel</button>
        </form>
      )}

      {saved.length > 0 && (
        <p className="keepline">
          <span className="lbl">Saved here</span>
          {saved.map((m) => (
            <span key={m.id} className="savedchip">
              <button className="linkbtn" onClick={() => void store.load(m.id).then((x) => x && dispatch({ type: 'model', model: x }))}
                      title={`${(m.bytes / 1024).toFixed(1)}k, saved ${m.updatedAt.slice(0, 10)}`}>{m.name}</button>
              <button className="linkbtn dim" aria-label={`Delete ${m.name}`}
                      onClick={() => void store.remove(m.id).then(refresh)}>&times;</button>
            </span>
          ))}
          {store.kind === 'memory' && <em className="dim"> This browser is not letting the page keep anything, so these go when the tab does.</em>}
        </p>
      )}

      {said && <p className="keepline said">{said}</p>}

      <div className="mine-grid">
        <div className="mine-inputs five">
          <section className="card tight">
            <h5>Business</h5>
            <div className="kv">
              <label>Revenue target<N value={Math.round(model.strategy.revenueTarget / 1e6)} width={72} onChange={(x) => edit((m) => { m.strategy.revenueTarget = x * 1e6; })} /><em>$M</em></label>
              <label>Growth<N value={Math.round(model.strategy.growthTargetPct * 100)} width={54} onChange={(x) => edit((m) => { m.strategy.growthTargetPct = x / 100; })} /><em>% y/y</em></label>
              <label>Employees<N value={model.strategy.employeeCount} width={72} onChange={(x) => edit((m) => { m.strategy.employeeCount = x; })} /><em>total</em></label>
            </div>
          </section>
          <section className="card tight">
            <h5>Economics</h5>
            <div className="kv">
              <label>Budget, modeled teams<N value={Math.round(model.budget.modeledAnnualBudget / 1e6)} width={72} onChange={(x) => edit((m) => { m.budget.modeledAnnualBudget = x * 1e6; })} /><em>$M / yr</em></label>
              <label>Paid hours<N value={model.calendar.workHoursPerFteMonth} width={54} onChange={(x) => edit((m) => { m.calendar.workHoursPerFteMonth = Math.max(1, x); })} /><em>per person / mo</em></label>
            </div>
            <div className="scroll">
              <table className="tbl edit mini"><thead><tr><th>Team</th><th>$ / person / mo</th></tr></thead>
                <tbody>{model.teams.map((t, i) => <tr key={t.id}><td className="ink left">{t.name}</td><td><N value={t.monthlyFteCost} step={500} width={84} onChange={(x) => edit((m) => { m.teams[i].monthlyFteCost = x; })} /></td></tr>)}</tbody>
              </table>
            </div>
          </section>
          <section className="card tight">
            <h5>Customer demand</h5>
            <div className="scroll">
              <table className="tbl edit mini"><thead><tr><th>Stream</th><th>Units / yr</th></tr></thead>
                <tbody>{model.demandStreams.map((s, i) => <tr key={s.id}><td className="ink left">{s.name}</td><td><N value={s.annualVolume} width={84} onChange={(x) => edit((m) => { m.demandStreams[i].annualVolume = x; })} /></td></tr>)}</tbody>
              </table>
            </div>
          </section>
          <section className="card tight">
            <h5>Work</h5>
            <div className="scroll">
              <table className="tbl edit mini"><thead><tr><th>Stream</th><th>Minutes each</th></tr></thead>
                <tbody>{model.demandStreams.map((s, i) => <tr key={s.id}><td className="ink left">{s.name}</td><td><N value={s.handlingMinutesPerUnit} width={74} onChange={(x) => edit((m) => { m.demandStreams[i].handlingMinutesPerUnit = x; })} /></td></tr>)}</tbody>
              </table>
            </div>
          </section>
          <section className="card tight span2">
            <h5>People <span>{fmt.num(totalFte)} today</span></h5>
            <div className="scroll">
              <table className="tbl edit mini"><thead><tr><th>Team</th><th>People</th><th>Target %</th><th>Attrition %</th><th>Hiring</th><th>Lead, mo</th></tr></thead>
                <tbody>{model.teams.map((t, i) => { const hi = model.hiringPlan.findIndex((h) => h.teamId === t.id); const h = hi >= 0 ? model.hiringPlan[hi] : null; return (
                  <tr key={t.id}><td className="ink left">{t.name}</td>
                    <td><N value={t.currentFte} onChange={(x) => edit((m) => { m.teams[i].currentFte = x; })} /></td>
                    <td><N value={Math.round(t.targetUtilization * 100)} min={1} width={54} onChange={(x) => edit((m) => { m.teams[i].targetUtilization = Math.min(100, x) / 100; })} /></td>
                    <td><N value={Math.round(t.annualAttrition * 100)} width={54} onChange={(x) => edit((m) => { m.teams[i].annualAttrition = Math.min(99, x) / 100; })} /></td>
                    <td>{h ? <N value={h.headcount} width={54} onChange={(x) => edit((m) => { m.hiringPlan[hi].headcount = x; })} /> : <span className="dim">—</span>}</td>
                    <td>{h ? <N value={h.leadTimeMonths} width={54} onChange={(x) => edit((m) => { m.hiringPlan[hi].leadTimeMonths = x; })} /> : <span className="dim">—</span>}</td>
                  </tr>); })}</tbody>
              </table>
            </div>
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
              {top3.length === 0 ? <li className="dim">Nothing breaks. Every team stays within capacity.</li> : top3.map((c) => <li key={c.id} data-kind={c.kind}><b>{c.firstMonth ? monthLabel(c.firstMonth) : '—'}</b> {c.title}{c.businessImpact > 0 ? <span> · {fmt.money(c.businessImpact)}</span> : null}</li>)}
            </ol>
          </section>
          <Controls teamId={focus} onTeam={(id) => dispatch({ type: 'team', id })} compact />
        </div>
      </div>
      <p className="mine-foot">Nothing leaves your browser. Every figure recomputes as you type. <a href="#/">Back to the story</a></p>
    </div>
  );
}
