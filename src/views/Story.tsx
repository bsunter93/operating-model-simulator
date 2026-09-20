import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { monthIndex, run } from '../engine';
import type { DecisionWeights } from '../models/types';
import { customIntervention, isCustomId, knobFor, useStore } from '../state/store';
import { Board } from '../components/Board';
import type { Detail } from '../components/Board';
import { Term } from '../components/Term';
import { Loop } from '../components/Loop';
import { Tornado } from '../components/Tornado';
import { verdict } from '../lib/verdict';
import { thresholds } from '../lib/thresholds';
import { whatChanged } from '../lib/whatChanged';
import { money, monthLabel, num, pct } from '../lib/format';

const people = (n: number) => (Math.round(n) === 1 ? '1 person' : `${Math.round(n)} people`);

function Weights({ weights, onChange }: { weights: DecisionWeights; onChange: (w: DecisionWeights) => void }) {
  const set = (key: keyof DecisionWeights, v: number) => {
    const others = (['cost', 'speed', 'revenueExposure'] as const).filter((k) => k !== key);
    const rest = 1 - v, sum = others.reduce((s, k) => s + weights[k], 0);
    const next = { ...weights, [key]: v } as DecisionWeights;
    for (const k of others) next[k] = sum > 0 ? (weights[k] / sum) * rest : rest / 2;
    onChange(next);
  };
  const row = (key: keyof DecisionWeights, label: string, term: 'cost' | 'speed' | 'exposure') => (
    <label className="wrow" key={key}>
      <span className="wl"><Term k={term}>{label}</Term></span>
      <input type="range" min={0} max={100} value={Math.round(weights[key] * 100)} onChange={(e) => set(key, Number(e.target.value) / 100)} />
      <span className="wv">{Math.round(weights[key] * 100)}%</span>
    </label>
  );
  return <div className="weights">{row('cost', 'Cost', 'cost')}{row('speed', 'Speed', 'speed')}{row('revenueExposure', 'Revenue at risk', 'exposure')}</div>;
}

export function Story() {
  const { state, dispatch, model, result, base, doNothing, interventions, teamName, initName, isFixture, isBase } = useStore();
  const s = result.summary;
  const team = state.teamId ?? s.firstBreakTeamId ?? model.teams[0].id;
  const [step, setStep] = useState(0);
  const [detail, setDetail] = useState<Detail>(null);
  const [copied, setCopied] = useState(false);
  const v = verdict(result, teamName, initName, isBase ? undefined : base);
  const year = model.calendar.startMonth.slice(0, 4);
  const idx = (k: string) => monthIndex(model.calendar.startMonth, k);
  const active = useMemo(() => interventions.filter((iv) => state.interventionIds.includes(iv.id)), [interventions, state.interventionIds]);
  const scen = model.scenarios.find((x) => x.id === state.scenarioId)!;
  const th = useMemo(() => thresholds(model, state.scenarioId, active, teamName), [model, state.scenarioId, active, teamName]);
  const changed = useMemo(() => (isBase ? null : whatChanged(model, scen, active, result, base, teamName, initName)), [isBase, model, scen, active, result, base, teamName, initName]);
  const dated = useMemo(() => [...result.constraints].sort((a, b) => ((a.firstMonth ? idx(a.firstMonth) : 99) - (b.firstMonth ? idx(b.firstMonth) : 99)) || b.businessImpactUsd - a.businessImpactUsd), [result.constraints, model.calendar.startMonth]);
  const rank = (id: string) => { const i = result.constraints.findIndex((c) => c.id === id); return i === 0 ? 'primary' : i === 1 ? 'secondary' : null; };
  const q = window.location.hash.includes('?') ? '?' + window.location.hash.split('?')[1] : '';

  // Levers offered for the team on screen. One place, sizes inline.
  const levers = useMemo(() => {
    const out: { id: string; label: string }[] = [];
    const exp = model.interventions.find((iv) => iv.type === 'expediteHiring' && model.hiringPlan.find((h) => h.id === iv.hiringRequestId)?.teamId === team);
    if (exp) out.push({ id: exp.id, label: 'Get the planned hires in sooner' });
    out.push({ id: `${team}:hire`, label: 'Hire more people' });
    out.push({ id: `${team}:automate`, label: 'Take work out of the team' });
    const mv = model.interventions.find((iv): iv is Extract<typeof iv, { type: 'reallocation' }> => iv.type === 'reallocation' && iv.toTeamId === team);
    if (mv) out.push({ id: mv.id, label: `Move people in from ${teamName(mv.fromTeamId)}` });
    const rel = model.interventions.find((iv) => iv.type === 'defer' || iv.type === 'cancel');
    if (rel) out.push({ id: rel.id, label: rel.type === 'defer' ? `Push ${initName(rel.initiativeId)} back` : `Cancel ${initName(rel.initiativeId)}` });
    out.push({ id: `${team}:target`, label: 'Accept running the team hotter' });
    return out;
  }, [model, team, teamName, initName]);
  const ivFor = (id: string) => interventions.find((x) => x.id === id) ?? (isCustomId(id) ? customIntervention(model, id.split(':')[0], id.split(':')[1] as 'hire' | 'automate' | 'target') : null);
  const others = interventions.filter((iv) => !isCustomId(iv.id) && !levers.some((l) => l.id === iv.id));

  const leverEffect = useMemo(() => {
    const out = new Map<string, string>();
    const before = doNothing.teams.find((t) => t.teamId === team)!;
    for (const l of levers) {
      const iv = ivFor(l.id);
      if (!iv) continue;
      const after = run(model, { scenario: state.scenarioId, interventions: [iv] }).teams.find((t) => t.teamId === team)!;
      if (after.monthsConstrained === before.monthsConstrained && Math.abs(after.peakUtilization - before.peakUtilization) < 0.005) out.set(l.id, 'No change here');
      else out.set(l.id, `${before.monthsConstrained} → ${after.monthsConstrained} months over, peak ${pct(before.peakUtilization)} → ${pct(after.peakUtilization)}`);
    }
    return out;
  }, [levers, interventions, model, state.scenarioId, doNothing, team]);

  const record = useMemo(() => {
    const l: string[] = [`DECISION RECORD · ${model.name} · ${year} plan · scenario: ${scen.name}`, ''];
    l.push(`Decision: ${active.length ? active.map((iv) => iv.name).join(' + ') : 'no lever selected yet'}.`);
    l.push(`Read: ${v.headline} ${v.sentences.join(' ')}${v.versus ? ' ' + v.versus : ''}`, '', 'What would change my mind:');
    for (const t of th) l.push(`  - ${t.text}`);
    l.push('', `Generated ${new Date().toISOString().slice(0, 10)}. Recomputable from the exported JSON.`);
    return l.join('\n');
  }, [model, year, scen, active, v, th]);

  const t0 = doNothing.teams.find((x) => x.teamId === team)!;
  const t1 = result.teams.find((x) => x.teamId === team)!;
  const firstOver = t0.months.find((m) => m.status === 'constrained' || m.status === 'severe');
  const land = t0.months.find((m) => m.hiresLanded > 0);
  const plannedN = model.hiringPlan.filter((h) => h.teamId === team).reduce((a, h) => a + h.headcount, 0);

  const steps: { id: string; label: string; title: ReactNode; body: ReactNode }[] = [
    {
      id: 'situation', label: 'The situation',
      title: <>{model.name} plans {pct(model.strategy.growthTargetPct)} growth with {num(model.teams.reduce((a, t) => a + t.currentFte, 0))} people.</>,
      body: (
        <>
          <p>{model.teams.length} teams, {model.initiatives.length} initiatives, {model.hiringPlan.length} hiring requests, a {money(model.budget.modeledAnnualBudgetUsd)} budget.{isFixture ? ' A fictional company.' : ''}</p>
          <Loop />
          <details className="tuck"><summary>How the model works</summary>
            <p>Strategy becomes work, work becomes hours, hours become people, month by month. Decisions change the strategy and the loop runs again. Every number on the board is computed from the inputs; none is typed in.</p>
            <p><a href="/simulator-flow.html">Watch a year of this plan run →</a></p>
            <button className="linkbtn" onClick={() => setDetail('about')}>Full method and assumptions →</button>
          </details>
        </>
      ),
    },
    {
      id: 'year', label: 'The year',
      title: <>{num(Math.round(result.teams.reduce((a, t) => a + t.annualWorkloadHours, 0)))} hours of work across twelve months.</>,
      body: (
        <>
          <p>Each cell on the board is one team's month, as a share of the hours its people can actually work. Colored cells are over that team's capacity.</p>
          <p className="hint">Click any team on the board to see its year in the chart below the map.</p>
          <details className="tuck"><summary>Where the hours come from</summary>
            <p>Volume × handling time per stream, spread across months by seasonality, plus the people assigned to initiatives. Headcount moves every month: attrition comes off, hires land after their lead time.</p>
          </details>
        </>
      ),
    },
    {
      id: 'constraints', label: 'Constraints',
      title: <>What if the world is different?</>,
      /* Eleven buttons at the first choice point is a menu, not a question. The four the
         model leads with stay in view and the rest sit under the same tuck the other
         beats already use, so nothing is lost and the narrative keeps its shape. The
         tuck opens itself when the chosen scenario is inside it. */
      body: (() => {
        const pick = (sc: typeof model.scenarios[number]) => (
          <button key={sc.id} className={'pk' + (state.scenarioId === sc.id ? ' on' : '')}
                  onClick={() => dispatch({ type: 'scenario', id: sc.id })}
                  title={sc.description}>{sc.name}</button>
        );
        const lead = model.scenarios.slice(0, 4);
        const rest = model.scenarios.slice(4);
        return (
          <>
            <p className="hint">Pick one. The board marks every cell that moves.</p>
            <div className="pick">{lead.map(pick)}</div>
            {rest.length > 0 && (
              <details className="tuck" open={rest.some((sc) => sc.id === state.scenarioId)}>
                <summary>{rest.length} more ways the year could go</summary>
                <div className="pick">{rest.map(pick)}</div>
              </details>
            )}
            {scen.description && <p className="hint">{scen.description}</p>}
          </>
        );
      })(),
    },
    {
      id: 'levers', label: 'Levers',
      title: firstOver
        ? <>{teamName(team)} runs out of people in {monthLabel(firstOver.month)}.</>
        : <>{teamName(team)} holds all year.</>,
      body: (
        <>
          {firstOver
            ? <p>{people(t0.peakWorkforceGap)} short at the worst point.{plannedN > 0 && land ? <> The plan hires {plannedN}, landing {monthLabel(land.month)}. The gap is everything before that.</> : plannedN > 0 ? <> Its {plannedN} hires are cancelled here.</> : <> No hires planned for it.</>}</p>
            : <p className="hint">Pick another team on the board, or a harder constraint.</p>}
          <div className="levs">
            {levers.map((l) => {
              const iv = ivFor(l.id); if (!iv) return null;
              const on = state.interventionIds.includes(l.id);
              const k = knobFor(iv);
              return (
                <div key={l.id} className={'lev' + (on ? ' on' : '')}>
                  <button className="lev-pick" onClick={() => dispatch({ type: 'toggleIntervention', id: l.id })}>
                    <b>{l.label}</b><small>{leverEffect.get(l.id) ?? ''}</small>
                  </button>
                  {k && <label className="lev-knob"><input type="number" min={k.min} max={k.max} step={k.step} value={k.get(iv)} aria-label={k.label}
                    onChange={(e) => dispatch({ type: 'override', id: l.id, value: Math.min(k.max, Math.max(k.min, Number(e.target.value))) })} /><em>{k.unit}</em></label>}
                </div>
              );
            })}
          </div>
          {active.length > 0 && <p className="hint">{teamName(team)} now {t1.monthsConstrained} months over, was {t0.monthsConstrained}. <button className="linkbtn" onClick={() => dispatch({ type: 'setInterventions', ids: [] })}>clear</button></p>}
          {others.length > 0 && (
            <details className="tuck"><summary>Options elsewhere in the plan ({others.length})</summary>
              <div className="levs">
                {others.map((iv) => {
                  const on = state.interventionIds.includes(iv.id);
                  return <div key={iv.id} className={'lev' + (on ? ' on' : '')}><button className="lev-pick" onClick={() => dispatch({ type: 'toggleIntervention', id: iv.id })}><b>{iv.name}</b></button></div>;
                })}
              </div>
            </details>
          )}
        </>
      ),
    },
    {
      id: 'result', label: 'Result',
      title: <span className="big-verdict">{v.headline}</span>,
      body: (
        <>
          <p>{v.sentences.slice(0, 2).join(' ')}</p>
          {changed && (
            <details className="tuck" open><summary>What changed</summary>
              <ol className="chain-v">
                <li className="cause"><span className="cl">Cause</span><span className="cv">{changed.cause}</span></li>
                {changed.steps.map((st) => <li key={st.label}><span className="cl">{st.label}</span><span className="cv"><s>{st.from}</s> → <em>{st.to}</em>{st.note ? <i> {st.note}</i> : null}</span></li>)}
              </ol>
            </details>
          )}
          <ol className="beat-cons">
            {dated.length === 0 && <li className="hint">Nothing breaks.</li>}
            {dated.map((c) => (
              <li key={c.id} className={'bc' + (c.teamId === team ? ' on' : '')} data-kind={c.kind}>
                <button onClick={() => { if (c.teamId) dispatch({ type: 'team', id: c.teamId }); else setDetail('initiatives'); }}>
                  <span className="bc-when">{c.firstMonth ? monthLabel(c.firstMonth) : '—'}</span>
                  <span className="bc-t">{c.title}{rank(c.id) && <em className="bc-tag">{rank(c.id)}</em>}</span>
                  <span className="bc-i">{c.businessImpactUsd > 0 ? money(c.businessImpactUsd) : ''}</span>
                </button>
              </li>
            ))}
          </ol>
        </>
      ),
    },
    {
      id: 'decide', label: 'Decide',
      title: <>What matters to you?</>,
      body: (
        <>
          <Weights weights={state.weights} onChange={(w) => dispatch({ type: 'weights', weights: w })} />
          <details className="tuck"><summary>What would change my mind</summary>
            <ul className="th small">{th.map((t) => <li key={t.text}>{t.text}</li>)}</ul>
          </details>
          <details className="tuck"><summary>What actually moves the answer</summary><Tornado /></details>
          <div className="btns">
            <button className="btn small" onClick={() => { void navigator.clipboard.writeText(record).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}>{copied ? 'Copied' : 'Copy the record'}</button>
            <a className="btn ghost small" href={'#/summary' + q}>One page →</a>
          </div>
        </>
      ),
    },
    {
      id: 'yours', label: 'Your numbers',
      title: <>Try it with your own numbers.</>,
      body: (
        <>
          <p>Your teams, your work, your hires, on one screen.</p>
          <a className="btn" href={'#/mine' + q}>Open Your numbers →</a>
        </>
      ),
    },
  ];

  // Links from detail panels act on the board or the step.
  useEffect(() => {
    const on = () => {
      const qs = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
      const p = qs.get('p'), go = qs.get('go'), tm = qs.get('team');
      if (!p && !go && !tm) return;
      if (tm) dispatch({ type: 'team', id: tm });
      if (p?.startsWith('team:')) dispatch({ type: 'team', id: p.slice(5) });
      else if (p === 'initiatives' || p === 'workforce' || p === 'cost' || p === 'organization' || p === 'about') setDetail(p);
      if (go === 'sec-options') setStep(3);
      if (go === 'sec-whatif') setStep(2);
      if (go === 'sec-decide') setStep(5);
      qs.delete('p'); qs.delete('go'); qs.delete('team');
      const str = qs.toString();
      history.replaceState(null, '', '#/' + (str ? '?' + str : ''));
    };
    on();
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, [dispatch]);

  const cur = steps[step];
  return (
    <div className="shell">
      <nav className="dots" aria-label="Steps">
        {steps.map((b, i) => <button key={b.id} className={i === step ? 'on' : i < step ? 'done' : ''} onClick={() => setStep(i)} title={b.label} aria-label={b.label} />)}
      </nav>

      <section className="stepper" aria-live="polite">
        <header className="st-head">
          <span className="st-n">{step + 1} of {steps.length} · {cur.label}</span>
          <h2>{cur.title}</h2>
        </header>
        <div className="st-body">{cur.body}</div>
        <footer className="st-foot">
          <button className="btn ghost small" onClick={() => setStep((n) => Math.max(0, n - 1))} disabled={step === 0}>Back</button>
          <span className="st-dots">{steps.map((b, i) => <i key={b.id} className={i === step ? 'on' : ''} />)}</span>
          <button className="btn small" onClick={() => setStep((n) => Math.min(steps.length - 1, n + 1))} disabled={step === steps.length - 1}>
            {step === steps.length - 1 ? 'Done' : `Next: ${steps[step + 1].label}`}
          </button>
        </footer>
      </section>

      <div className="stage">
        <Board teamId={team} onTeam={(id) => dispatch({ type: 'team', id })} detail={detail} onDetail={setDetail} />
      </div>
    </div>
  );
}
