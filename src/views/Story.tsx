import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { monthIndex } from '../engine';
import type { DecisionWeights } from '../models/types';
import { customIntervention, useStore } from '../state/store';
import { Stage } from '../components/Stage';
import type { StageView } from '../components/Stage';
import { Controls } from '../components/Controls';
import { Term } from '../components/Term';
import { verdict } from '../lib/verdict';
import { thresholds } from '../lib/thresholds';
import { effectsFor } from '../lib/effects';
import { whatChanged } from '../lib/whatChanged';
import { money, monthLabel, num, pct } from '../lib/format';

const people = (n: number) => (Math.round(n) === 1 ? '1 person' : `${Math.round(n)} people`);

interface Beat { id: string; eyebrow: string; stage: (ctx: { team: string }) => StageView; body: ReactNode }

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
  const [override, setOverride] = useState<StageView | null>(null);
  const beatRefs = useRef<(HTMLElement | null)[]>([]);
  const v = verdict(result, teamName, initName, isBase ? undefined : base);
  const year = model.calendar.startMonth.slice(0, 4);
  const idx = (k: string) => monthIndex(model.calendar.startMonth, k);
  const activeLevers = useMemo(() => interventions.filter((iv) => state.interventionIds.includes(iv.id)), [interventions, state.interventionIds]);
  const th = useMemo(() => thresholds(model, state.scenarioId, activeLevers, teamName), [model, state.scenarioId, activeLevers, teamName]);
  const scen = model.scenarios.find((x) => x.id === state.scenarioId)!;
  const changed = useMemo(() => (isBase ? null : whatChanged(model, scen, activeLevers, result, base, teamName, initName)), [isBase, model, scen, activeLevers, result, base, teamName, initName]);

  // Constraints in date order for beat 3.
  const dated = useMemo(() => [...result.constraints].sort((a, b) => ((a.firstMonth ? idx(a.firstMonth) : 99) - (b.firstMonth ? idx(b.firstMonth) : 99)) || b.businessImpactUsd - a.businessImpactUsd), [result.constraints, model.calendar.startMonth]);
  const rankTag = (id: string) => { const i = result.constraints.findIndex((c) => c.id === id); return i === 0 ? 'primary' : i === 1 ? 'secondary' : null; };

  // The "what would you try first" choices, read from the model.
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

  // Decision record text.
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
  const recordRef = useRef(record); recordRef.current = record;
  const thRef = useRef(th.map((t) => t.text)); thRef.current = th.map((t) => t.text);

  const beats: Beat[] = [
    {
      id: 'verdict', eyebrow: `1 · Can ${model.name} execute the ${year} plan?`, stage: () => ({ kind: 'map', focusTeam: s.firstBreakTeamId }),
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
          <p className="small plan-line">{isFixture ? `${model.name} is fictional: ` : ''}{pct(model.strategy.growthTargetPct)} growth, {num(model.teams.reduce((a, t) => a + t.currentFte, 0))} people in {model.teams.length} teams, {model.initiatives.length} initiatives, {model.hiringPlan.length} hiring requests, a {money(model.budget.modeledAnnualBudgetUsd)} budget. Every number is computed from those inputs, month by month. <button className="linkbtn" onClick={() => setOverride({ kind: 'about' })}>How it works →</button></p>
        </>
      ),
    },
    {
      id: 'breaks', eyebrow: '2 · What breaks, and when', stage: () => ({ kind: 'map', focusTeam: focusTeam }),
      body: (
        <>
          <h2>{dated.length === 0 ? 'Nothing breaks.' : dated[0].teamId ? `${teamName(dated[0].teamId)}, in ${monthLabel(dated[0].firstMonth!)}.` : `${dated[0].title}.`}</h2>
          <p className="small">In date order. Primary and secondary are the two that cost the most. Click one to see it on the stage.</p>
          <ol className="beat-cons">
            {dated.map((c) => (
              <li key={c.id} className={'bc' + ((c.teamId && c.teamId === focusTeam) ? ' on' : '')} data-kind={c.kind}>
                <button onClick={() => { if (c.teamId) { dispatch({ type: 'team', id: c.teamId }); setOverride({ kind: 'team', teamId: c.teamId }); } else setOverride({ kind: 'initiatives' }); }}>
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
      id: 'why', eyebrow: '3 · Why', stage: ({ team }) => ({ kind: 'team', teamId: team, ghost: false }),
      body: (() => {
        const t = result.teams.find((x) => x.teamId === focusTeam)!;
        const land = t.months.find((m) => m.hiresLanded > 0);
        const planned = model.hiringPlan.filter((h) => h.teamId === focusTeam).reduce((a, h) => a + h.headcount, 0);
        return (
          <>
            <h2>{t.monthsConstrained ? 'The work arrives before the people do.' : `${teamName(focusTeam)} holds.`}</h2>
            <p>Bars are hours of work each month; the line is what {teamName(focusTeam)} can handle at its {pct(t.months[0].targetUtilization)} target. {t.monthsConstrained ? <>It peaks at <b>{pct(t.peakUtilization)}</b> in {monthLabel(t.peakMonth)}, {people(t.peakWorkforceGap)} short.</> : <>It peaks at {pct(t.peakUtilization)} in {monthLabel(t.peakMonth)} and stays under.</>}</p>
            {planned > 0 && land && <p>The plan already hires <b>{planned}</b> people for this team; they land in <b>{monthLabel(land.month)}</b>. Everything before that is the problem.</p>}
            {planned > 0 && !land && <p>The plan had {planned} hires for this team; this scenario cancels them.</p>}
            <p className="small">More on the stage: <button className="linkbtn" onClick={() => setOverride({ kind: 'workforce' })}>workforce</button> · <button className="linkbtn" onClick={() => setOverride({ kind: 'initiatives' })}>initiatives</button> · <button className="linkbtn" onClick={() => setOverride({ kind: 'cost' })}>cost</button></p>
          </>
        );
      })(),
    },
    {
      id: 'try', eyebrow: '4 · What would you try first?', stage: ({ team }) => ({ kind: 'team', teamId: team, ghost: true }),
      body: (
        <>
          <h2>Pick a lever.</h2>
          <p className="small">Each runs through the same model. Fine-tune or stack more in the Levers box under the stage.</p>
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
      id: 'whatif', eyebrow: '5 · What if', stage: () => ({ kind: 'scenarios' }),
      body: (
        <>
          <h2>Now make the world harder.</h2>
          <p className="small">Each one changes the conditions and reruns the model. Your levers stay on.</p>
          <div className="choices grid2">
            {model.scenarios.map((sc) => (
              <button key={sc.id} className={'choice' + (state.scenarioId === sc.id ? ' on' : '')} onClick={() => dispatch({ type: 'scenario', id: sc.id })} title={sc.description}><b>{sc.name}</b></button>
            ))}
          </div>
        </>
      ),
    },
    {
      id: 'weigh', eyebrow: '6 · Weigh it', stage: () => ({ kind: 'ranking' }),
      body: (
        <>
          <h2>Which option, given what matters to you?</h2>
          <p className="small">Cost, speed, revenue at risk. Drag; the ranking on the stage follows.</p>
          <WeightSliders weights={state.weights} onChange={(w) => dispatch({ type: 'weights', weights: w })} />
        </>
      ),
    },
    {
      id: 'decide', eyebrow: '7 · Decide', stage: () => ({ kind: 'record', text: record, thresholds: th.map((t) => t.text) }),
      body: (
        <>
          <h2>The record.</h2>
          <p className="small">Written by the model from what you selected, including what would change its mind.</p>
          <div className="btns"><button className="btn small" onClick={() => { void navigator.clipboard.writeText(record).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}>{copied ? 'Copied' : 'Copy the record'}</button><a className="btn ghost small" href={'#/summary' + (window.location.hash.includes('?') ? '?' + window.location.hash.split('?')[1] : '')}>One-page summary →</a></div>

        </>
      ),
    },
    {
      id: 'yours', eyebrow: '8 · Make it yours', stage: () => ({ kind: 'map', focusTeam: null }),
      body: (
        <>
          <h2>Try it with your own numbers.</h2>
          <p className="small">A fresh, one-screen version: your teams, your work, your hires, and the answer beside them.</p>
          <a className="btn" href="#/mine">Open Your numbers →</a>
          <p className="small" style={{ marginTop: 10 }}>Also: <button className="linkbtn" onClick={() => setOverride({ kind: 'organization' })}>pods or one pool</button> · <button className="linkbtn" onClick={() => setOverride({ kind: 'about' })}>how this works</button></p>
        </>
      ),
    },
  ];

  // Scroll-spy on the beats; an override clears when the active beat changes.
  useEffect(() => {
    const on = () => {
      // The current beat is the last one whose top has passed a line 140px below the viewport top.
      const y = window.scrollY + 140;
      let cur = 0;
      beatRefs.current.forEach((el, i) => { if (el && el.offsetTop <= y) cur = i; });
      setActive((prev) => { if (prev !== cur) setOverride(null); return cur; });
    };
    on();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('resize', on); };
  }, [model]);

  // Legacy links inside stage panels (#/?p=team:x, ?go=sec-options) become stage changes.
  useEffect(() => {
    const on = () => {
      const q = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
      const p = q.get('p'), go = q.get('go'), team = q.get('team');
      if (!p && !go && !team) return;
      if (team) dispatch({ type: 'team', id: team });
      if (p?.startsWith('team:')) { dispatch({ type: 'team', id: p.slice(5) }); setOverride({ kind: 'team', teamId: p.slice(5) }); }
      else if (p === 'initiatives' || p === 'workforce' || p === 'cost' || p === 'organization' || p === 'plan' || p === 'about' || p === 'scenarios' || p === 'ranking') setOverride({ kind: p });
      else if (p === 'record') setOverride({ kind: 'record', text: recordRef.current, thresholds: thRef.current });
      if (go === 'sec-options') beatRefs.current[3]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (go === 'sec-whatif') beatRefs.current[4]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (go === 'sec-decide') beatRefs.current[6]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      q.delete('p'); q.delete('go'); q.delete('team');
      const str = q.toString();
      history.replaceState(null, '', '#/' + (str ? '?' + str : ''));
    };
    on();
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, [dispatch]);

  // Deep links: #beat-<id> scrolls to that beat once the page exists.
  useEffect(() => {
    const m = /^#beat-([a-z]+)/.exec(window.location.hash);
    if (!m) return;
    const i = beats.findIndex((b) => b.id === m[1]);
    if (i >= 0) setTimeout(() => beatRefs.current[i]?.scrollIntoView({ block: 'start' }), 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const view: StageView = override ?? beats[active].stage({ team: focusTeam });
  const onTeam = (id: string) => { dispatch({ type: 'team', id }); setOverride({ kind: 'team', teamId: id, ghost: active >= 3 }); };
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
            {i < beats.length - 1 && <button className="next-beat" onClick={() => goTo(i + 1)}>Next: {beats[i + 1].eyebrow.replace(/^\d+ · /, '')} ↓</button>}
          </section>
        ))}
      </div>
      <div className="stage">
        <div className="stage-pic">
          {override && <button className="stage-back" onClick={() => setOverride(null)}>← back to the story's view</button>}
          <Stage view={view} onTeam={onTeam} onMap={() => setOverride({ kind: 'map', focusTeam })} />
        </div>
        <Controls teamId={focusTeam} onTeam={(id) => { dispatch({ type: 'team', id }); if (override?.kind === 'team') setOverride({ kind: 'team', teamId: id, ghost: override.ghost }); }} />
      </div>
    </div>
  );
}
