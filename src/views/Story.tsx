import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { monthIndex } from '../engine';
import type { DecisionWeights } from '../models/types';
import { customIntervention, useStore } from '../state/store';
import { Board } from '../components/Board';
import type { Detail } from '../components/Board';
import { Term } from '../components/Term';
import { Loop } from '../components/Loop';
import { Tornado } from '../components/Tornado';
import { verdict } from '../lib/verdict';
import { thresholds } from '../lib/thresholds';
import { effectsFor } from '../lib/effects';
import { whatChanged } from '../lib/whatChanged';
import { money, monthLabel, num, pct } from '../lib/format';

interface Beat { id: string; eyebrow: string; body: ReactNode }

function WeightSliders({ weights, onChange }: { weights: DecisionWeights; onChange: (w: DecisionWeights) => void }) {
  const set = (key: keyof DecisionWeights, v: number) => {
    const others = (['cost', 'speed', 'revenueExposure'] as const).filter((k) => k !== key);
    const rest = 1 - v; const sumOthers = others.reduce((s, k) => s + weights[k], 0);
    const next = { ...weights, [key]: v } as DecisionWeights;
    for (const k of others) next[k] = sumOthers > 0 ? (weights[k] / sumOthers) * rest : rest / 2;
    onChange(next);
  };
  const row = (key: keyof DecisionWeights, label: string, term: 'cost' | 'speed' | 'exposure') => (
    <label className="wrow" key={key}><span className="wl"><Term k={term}>{label}</Term></span><input type="range" min={0} max={100} step={1} value={Math.round(weights[key] * 100)} onChange={(e) => set(key, Number(e.target.value) / 100)} /><span className="wv">{Math.round(weights[key] * 100)}%</span></label>
  );
  return <div className="weights">{row('cost', 'Cost', 'cost')}{row('speed', 'Speed', 'speed')}{row('revenueExposure', 'Revenue exposure', 'exposure')}</div>;
}

export function Story() {
  const { state, dispatch, model, result, base, doNothing, interventions, teamName, initName, isFixture, isBase } = useStore();
  const s = result.summary;
  const focusTeam = state.teamId ?? s.firstBreakTeamId ?? model.teams[0].id;
  const [active, setActive] = useState(0);
  const [detail, setDetail] = useState<Detail>(null);
  const beatRefs = useRef<(HTMLElement | null)[]>([]);
  const v = verdict(result, teamName, initName, isBase ? undefined : base);
  const year = model.calendar.startMonth.slice(0, 4);
  const idx = (k: string) => monthIndex(model.calendar.startMonth, k);
  const activeLevers = useMemo(() => interventions.filter((iv) => state.interventionIds.includes(iv.id)), [interventions, state.interventionIds]);
  const th = useMemo(() => thresholds(model, state.scenarioId, activeLevers, teamName), [model, state.scenarioId, activeLevers, teamName]);
  const scen = model.scenarios.find((x) => x.id === state.scenarioId)!;
  const changed = useMemo(() => (isBase ? null : whatChanged(model, scen, activeLevers, result, base, teamName, initName)), [isBase, model, scen, activeLevers, result, base, teamName, initName]);
  const totalFte = model.teams.reduce((a, t) => a + t.currentFte, 0);
  const totalHours = result.teams.reduce((a, t) => a + t.annualWorkloadHours, 0);

  const dated = useMemo(() => [...result.constraints].sort((a, b) => ((a.firstMonth ? idx(a.firstMonth) : 99) - (b.firstMonth ? idx(b.firstMonth) : 99)) || b.businessImpactUsd - a.businessImpactUsd), [result.constraints, model.calendar.startMonth]);
  const rankTag = (id: string) => { const i = result.constraints.findIndex((c) => c.id === id); return i === 0 ? 'primary' : i === 1 ? 'secondary' : null; };

  const choices = useMemo(() => {
    const out: { id: string; label: string; ids: string[] }[] = [];
    const exp = model.interventions.find((iv) => iv.type === 'expediteHiring' && model.hiringPlan.find((h) => h.id === iv.hiringRequestId)?.teamId === focusTeam);
    if (exp) out.push({ id: 'expedite', label: 'Get the planned hires in sooner', ids: [exp.id] });
    out.push({ id: 'hire', label: 'Hire more people', ids: [`${focusTeam}:hire`] });
    out.push({ id: 'automate', label: 'Take work out of the team', ids: [`${focusTeam}:automate`] });
    const move = model.interventions.find((iv): iv is Extract<typeof iv, { type: 'reallocation' }> => iv.type === 'reallocation' && iv.toTeamId === focusTeam);
    if (move) out.push({ id: 'move', label: `Move people in from ${teamName(move.fromTeamId)}`, ids: [move.id] });
    const rel = model.interventions.find((iv) => iv.type === 'defer' || iv.type === 'cancel');
    if (rel) out.push({ id: 'portfolio', label: rel.type === 'defer' ? `Push ${initName(rel.initiativeId)} back` : `Cancel ${initName(rel.initiativeId)}`, ids: [rel.id] });
    out.push({ id: 'target', label: 'Accept running the team hotter', ids: [`${focusTeam}:target`] });
    return out;
  }, [model, focusTeam, teamName, initName]);
  const choiceEffects = useMemo(() => {
    const cands = choices.map((c) => interventions.find((iv) => iv.id === c.ids[0]) ?? customIntervention(model, c.ids[0].split(':')[0], c.ids[0].split(':')[1] as 'hire' | 'automate' | 'target')!).filter(Boolean);
    return effectsFor(model, state.scenarioId, cands, [], doNothing, teamName, focusTeam);
  }, [choices, interventions, model, state.scenarioId, doNothing, teamName, focusTeam]);
  const chosen = choices.find((c) => c.ids.every((id) => state.interventionIds.includes(id)) && state.interventionIds.length === c.ids.length)?.id ?? null;

  const record = useMemo(() => {
    const lines: string[] = [];
    lines.push(`DECISION RECORD · ${model.name} · ${year} plan · scenario: ${scen.name}`, '');
    lines.push(`Decision: ${activeLevers.length ? activeLevers.map((iv) => iv.name).join(' + ') : 'no lever selected yet'}.`);
    lines.push(`Read: ${v.headline} ${v.sentences.join(' ')}${v.versus ? ' ' + v.versus : ''}`, '');
    lines.push('What has to be true:');
    if (!activeLevers.length) lines.push('  - Nothing beyond the plan as written.');
    for (const iv of activeLevers) {
      if (iv.type === 'expediteHiring') lines.push(`  - The planned hires can be brought in with a ${iv.newLeadTimeMonths}-month lead time for ${money(iv.oneTimeCostUsd)}.`);
      if (iv.type === 'hire') lines.push(`  - ${iv.headcount} more people for ${teamName(iv.teamId)} can be hired and land after ${iv.leadTimeMonths} months.`);
      if (iv.type === 'automation') lines.push(`  - ${pct(iv.workloadReductionRate)} of ${teamName(iv.teamId)}'s hours can be removed, live ${iv.timeToImpactMonths} months after kickoff, for ${money(iv.implementationCostUsd)}.`);
      if (iv.type === 'reallocation') lines.push(`  - ${iv.headcount} people from ${teamName(iv.fromTeamId)} can do ${teamName(iv.toTeamId)}'s work after ${iv.timeToImpactMonths} month${iv.timeToImpactMonths === 1 ? '' : 's'}.`);
      if (iv.type === 'defer') lines.push(`  - ${initName(iv.initiativeId)} can move by ${iv.months} months without losing its value.`);
      if (iv.type === 'cancel') lines.push(`  - ${initName(iv.initiativeId)} can be dropped.`);
      if (iv.type === 'serviceLevelChange') lines.push(`  - ${teamName(iv.teamId)} can run at ${pct(iv.newTargetUtilization)} and the service level can take it.`);
    }
    lines.push('', 'What would change my mind:');
    for (const t of th) lines.push(`  - ${t.text}`);
    lines.push('', `Generated from the model on ${new Date().toISOString().slice(0, 10)}. Every figure is recomputable from the exported JSON.`);
    return lines.join('\n');
  }, [model, year, scen, activeLevers, v, th, teamName, initName]);
  const [copied, setCopied] = useState(false);
  const q = window.location.hash.includes('?') ? '?' + window.location.hash.split('?')[1] : '';

  const beats: Beat[] = [
    {
      id: 'situation', eyebrow: '1 · The situation',
      body: (
        <>
          <h2>{model.name} plans {pct(model.strategy.growthTargetPct)} growth with {num(totalFte)} people.</h2>
          <p>{isFixture ? 'A fictional company. ' : ''}{model.teams.length} teams, {model.demandStreams.length} streams of work, {model.initiatives.length} initiatives, {model.hiringPlan.length} planned hiring requests, a {money(model.budget.modeledAnnualBudgetUsd)} budget for these teams.</p>
          <p>This page turns that plan into hours of work and people, month by month, and shows where it holds and where it does not. The board on the right stays the same all the way down; what you choose below changes what it shows.</p>
          <Loop />
          <p className="small">Strategy becomes work, work becomes hours, hours become people. Decisions change the strategy and the loop runs again. <button className="linkbtn" onClick={() => setDetail('about')}>How it works →</button></p>
        </>
      ),
    },
    {
      id: 'year', eyebrow: '2 · The year',
      body: (
        <>
          <h2>{num(Math.round(totalHours))} hours of work, spread across twelve months.</h2>
          <p>The map on the right is the whole plan at a glance: each cell is one team's month, as a share of the hours its people can actually work. Colored cells are above that team's own target. Click any team to see its year in the chart beneath.</p>
          <p className="small">Hours come from volume × handling time per stream, plus people assigned to initiatives. People change every month: attrition comes off, hires land after their lead time.</p>
        </>
      ),
    },
    {
      id: 'constraints', eyebrow: '3 · Constraints',
      body: (
        <>
          <h2>Pick the conditions.</h2>
          <p className="small">Each one changes the plan's conditions and reruns the model. The map marks every cell that moved.</p>
          <div className="choices grid2">
            {model.scenarios.map((sc) => (
              <button key={sc.id} className={'choice' + (state.scenarioId === sc.id ? ' on' : '')} onClick={() => dispatch({ type: 'scenario', id: sc.id })} title={sc.description}><b>{sc.name}</b></button>
            ))}
          </div>
        </>
      ),
    },
    {
      id: 'levers', eyebrow: '4 · Levers',
      body: (
        <>
          <h2>Pick what you would do for {teamName(focusTeam)}.</h2>
          <p className="small">Each option runs through the same model; the line under it says what it does. They stack. Sizes and the plan's own options are in the Levers box under the board.</p>
          <div className="choices">
            {choices.map((c) => (
              <button key={c.id} className={'choice' + (chosen === c.id ? ' on' : '')} onClick={() => dispatch({ type: 'setInterventions', ids: c.ids })}>
                <b>{c.label}</b><small>{choiceEffects.get(c.ids[0]) ?? ''}</small>
              </button>
            ))}
          </div>
        </>
      ),
    },
    {
      id: 'result', eyebrow: `5 · Result: can ${model.name} execute the ${year} plan?`,
      body: (
        <>
          <h2 className="verdict-big">{v.headline}</h2>
          <p className="verdict-read">{v.sentences.slice(0, 2).join(' ')}</p>
          {changed && (
            <div className="changed">
              <b>What changed</b>
              <ol className="chain-v">
                <li className="cause"><span className="cl">Cause</span><span className="cv">{changed.cause}</span></li>
                {changed.steps.map((st) => (
                  <li key={st.label}><span className="cl">{st.label}</span><span className="cv"><s>{st.from}</s> → <em>{st.to}</em>{st.note ? <i> {st.note}</i> : null}</span></li>
                ))}
              </ol>
              <button className="linkbtn small" onClick={() => dispatch({ type: 'reset' })}>Back to the base plan</button>
            </div>
          )}
          <h3 className="h3">What breaks, and when</h3>
          <p className="small">In date order. Primary and secondary are the two that cost the most. Click one to put that team on the board.</p>
          <ol className="beat-cons">
            {dated.length === 0 && <li className="dim">Nothing breaks. Every team stays within capacity and every initiative starts when planned.</li>}
            {dated.map((c) => (
              <li key={c.id} className={'bc' + ((c.teamId && c.teamId === focusTeam) ? ' on' : '')} data-kind={c.kind}>
                <button onClick={() => { if (c.teamId) dispatch({ type: 'team', id: c.teamId }); else setDetail('initiatives'); }}>
                  <span className="bc-when">{c.firstMonth ? monthLabel(c.firstMonth) : '—'}</span>
                  <span className="bc-t">{c.title}{rankTag(c.id) && <em className="bc-tag">{rankTag(c.id)}</em>}</span>
                  <span className="bc-i">{c.businessImpactUsd > 0 ? `${money(c.businessImpactUsd)} at stake` : ''}</span>
                </button>
              </li>
            ))}
          </ol>
        </>
      ),
    },
    {
      id: 'decide', eyebrow: '6 · Decide',
      body: (
        <>
          <h2>Which option, given what matters to you?</h2>
          <p className="small">Cost, speed, revenue at risk. The record below is written by the model from what you selected, including what would change its mind.</p>
          <WeightSliders weights={state.weights} onChange={(w) => dispatch({ type: 'weights', weights: w })} />
          <div className="btns"><button className="btn small" onClick={() => { void navigator.clipboard.writeText(record).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}>{copied ? 'Copied' : 'Copy the record'}</button><a className="btn ghost small" href={'#/summary' + q}>One-page summary →</a></div>
          <details className="fold small"><summary>The record</summary><pre className="record">{record}</pre></details>
          <h3 className="h3">What would change my mind</h3>
          <ul className="th small">{th.map((t) => <li key={t.text}>{t.text}</li>)}</ul>
          <h3 className="h3">What actually moves the answer</h3>
          <Tornado />
        </>
      ),
    },
    {
      id: 'yours', eyebrow: '7 · Your numbers',
      body: (
        <>
          <h2>Try it with your own numbers.</h2>
          <p className="small">A one-screen version: your teams, your work, your hires, and the answer beside them.</p>
          <a className="btn" href={'#/mine' + q}>Open Your numbers →</a>
        </>
      ),
    },
  ];

  // Scroll-spy: the current beat is the last one whose top has passed 140px below the viewport top.
  useEffect(() => {
    const on = () => {
      const y = window.scrollY + 140;
      let cur = 0;
      beatRefs.current.forEach((el, i) => { if (el && el.offsetTop <= y) cur = i; });
      setActive(cur);
    };
    on();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('resize', on); };
  }, [model]);

  // Links from detail panels (#/?p=team:x, ?p=workforce, ?go=...) act on the board.
  useEffect(() => {
    const on = () => {
      const qs = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
      const p = qs.get('p'), go = qs.get('go'), team = qs.get('team');
      if (!p && !go && !team) return;
      if (team) dispatch({ type: 'team', id: team });
      if (p?.startsWith('team:')) dispatch({ type: 'team', id: p.slice(5) });
      else if (p === 'initiatives' || p === 'workforce' || p === 'cost' || p === 'organization' || p === 'about') setDetail(p);
      if (go === 'sec-options') beatRefs.current[3]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (go === 'sec-whatif') beatRefs.current[2]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (go === 'sec-decide') beatRefs.current[5]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      qs.delete('p'); qs.delete('go'); qs.delete('team');
      const str = qs.toString();
      history.replaceState(null, '', '#/' + (str ? '?' + str : ''));
    };
    on();
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, [dispatch]);

  useEffect(() => {
    const m = /^#beat-([a-z]+)/.exec(window.location.hash);
    if (!m) return;
    const i = beats.findIndex((b) => b.id === m[1]);
    if (i >= 0) setTimeout(() => beatRefs.current[i]?.scrollIntoView({ block: 'start' }), 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goTo = (i: number) => beatRefs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="shell">
      <nav className="dots" aria-label="Story">
        {beats.map((b, i) => <button key={b.id} className={i === active ? 'on' : i < active ? 'done' : ''} onClick={() => goTo(i)} title={b.eyebrow} aria-label={b.eyebrow} />)}
      </nav>
      <div className="story">
        {beats.map((b, i) => (
          <section key={b.id} ref={(el) => { beatRefs.current[i] = el; }} className={'beat' + (i === active ? ' on' : '')} id={`beat-${b.id}`}>
            <div className="eyebrow">{b.eyebrow}</div>
            {b.body}
            {i < beats.length - 1 && <button className="next-beat" onClick={() => goTo(i + 1)}>Next: {beats[i + 1].eyebrow.replace(/^\d+ · /, '').replace(/:.*$/, '')} ↓</button>}
          </section>
        ))}
      </div>
      <div className="stage">
        <Board teamId={focusTeam} onTeam={(id) => dispatch({ type: 'team', id })} detail={detail} onDetail={setDetail} />
      </div>
    </div>
  );
}
