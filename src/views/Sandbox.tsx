import { useEffect, useMemo, useRef, useState } from 'react';
import { run } from '../engine';
import { useStore } from '../state/store';
import type { ModelResult, TeamMonth } from '../models/results';
import type { MonthKey, OperatingModel } from '../models/types';
import { bindingConstraints } from '../lib/constraint';
import { receipt, type ReceiptLine } from '../lib/receipt';
import { pct, pp, signed } from '../lib/format';
import { FlowCanvas, shareLabel, type Sel } from '../components/FlowCanvas';
import { YearSpine } from '../components/YearSpine';
import { Why } from '../components/Why';
import { workloadOf, yearShape } from '../lib/workload';
import { MONTHS } from './Run';

/**
 * The sandbox: the work network, running.
 *
 * It was a rail of sliders next to a stack of bars, which showed one number per team and
 * hid everything that makes an operating model interesting: where work comes from, what
 * one team's handling creates for another, what waits, and what is quietly turned away.
 * All four were already in the engine's arithmetic. Now they are on the canvas.
 *
 * Editing happens on the thing being edited. Click the block, change its people; click
 * the source, change what arrives. A global dial could never say "this team" or "this
 * stream", and those are the only edits an operating model is ever actually given.
 */

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export interface Edits {
  /** teamId -> people added or cut, and the month it was asked for. */
  people: Record<string, { add: number; month: MonthKey }>;
  /** teamId -> absolute planned utilisation. */
  target: Record<string, number>;
  /** streamId -> multiplier on annual volume. */
  vol: Record<string, number>;
}
const NONE: Edits = { people: {}, target: {}, vol: {} };
const touched = (e: Edits) => Object.keys(e.people).length + Object.keys(e.target).length + Object.keys(e.vol).length;

/**
 * How long this model thinks it takes to put somebody in a seat. Taken from the team's own
 * requests where it has them and the plan's average where it does not, so an imported
 * model uses its own number rather than one of mine.
 */
export function leadTimeFor(model: OperatingModel, teamId: string): number {
  const own = model.hiringPlan.filter((h) => h.teamId === teamId).map((h) => h.leadTimeMonths);
  const any = model.hiringPlan.map((h) => h.leadTimeMonths);
  const from = own.length ? own : any;
  return from.length ? Math.max(0, Math.round(from.reduce((a, b) => a + b, 0) / from.length)) : 3;
}

/**
 * People added are requested, not conjured. A stepper that raised the starting headcount
 * taught that hiring is a dial you turn, and every receipt then said the change showed up
 * in January, which is the opposite of the most useful thing this model knows.
 *
 * Cuts are immediate on purpose. Losing people is fast and replacing them is slow, and
 * that asymmetry is most of why an operating model is hard to run.
 */
function withEdits(model: OperatingModel, e: Edits): OperatingModel {
  if (!touched(e)) return model;
  const hires = Object.entries(e.people)
    .filter(([, p]) => p.add > 0)
    .map(([teamId, p]) => ({
      id: `sandbox-hire-${teamId}`,
      teamId,
      requestMonth: p.month,
      headcount: p.add,
      leadTimeMonths: leadTimeFor(model, teamId),
    }));
  return {
    ...model,
    teams: model.teams.map((t) => {
      const cut = Math.max(0, -(e.people[t.id]?.add ?? 0));
      return {
        ...t,
        currentFte: Math.max(1, t.currentFte - cut),
        targetUtilization: e.target[t.id] ?? t.targetUtilization,
      };
    }),
    hiringPlan: [...model.hiringPlan, ...hires],
    demandStreams: model.demandStreams.map((s) => ({
      ...s,
      annualVolume: Math.max(0, Math.round(s.annualVolume * (e.vol[s.id] ?? 1))),
    })),
  };
}

/** The first month anything goes past what it can hold, which is the question people ask. */
function breaksAt(r: ModelResult): { month: string; teamId: string; index: number } | null {
  for (let m = 0; m < (r.teams[0]?.months.length ?? 0); m++) {
    for (const t of r.teams) {
      const row = t.months[m];
      if (row.utilization > row.targetUtilization) return { month: row.month, teamId: t.teamId, index: m };
    }
  }
  return null;
}

export function Sandbox() {
  const { model, fmt, isFixture } = useStore();
  const [edits, setEdits] = useState<Edits>(NONE);
  const [sel, setSel] = useState<Sel>(null);
  const baseId = model.scenarios.find((x) => x.type === 'base')?.id ?? model.scenarios[0].id;
  const [scenarioId, setScenarioId] = useState(baseId);
  const scenario = model.scenarios.find((x) => x.id === scenarioId) ?? model.scenarios[0];
  const [at, setAt] = useState(0);
  const [touchedScrub, setTouchedScrub] = useState(false);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<number | null>(null);

  const tuned = useMemo(() => withEdits(model, edits), [model, edits]);
  const result = useMemo(() => run(tuned, { scenario: scenarioId }), [tuned, scenarioId]);
  const months = result.teams[0]?.months.length ?? 12;
  const month = Math.min(at, months - 1);

  /* No decisions: the edits are the scenario here. Probing against the run's year would
     measure a different world from the one on screen and report it with a straight face. */
  const binding = useMemo(
    () => bindingConstraints(tuned, { decisions: [], scenarioId }, [], result),
    [tuned, scenarioId, result],
  );
  const broke = useMemo(() => breaksAt(result), [result]);

  /* The same year without the reader's changes in it. Every number in the receipt is this
     run read against theirs, so nothing there is estimated or written down by hand. */
  const baseResult = useMemo(() => run(model, { scenario: scenarioId }), [model, scenarioId]);
  const baseBinding = useMemo(
    () => bindingConstraints(model, { decisions: [], scenarioId }, [], baseResult),
    [model, scenarioId, baseResult],
  );
  const rec = useMemo(
    () => receipt(baseResult, result, baseBinding, binding),
    [baseResult, result, baseBinding, binding],
  );
  const name = (id: string) => model.teams.find((t) => t.id === id)?.name ?? id;

  /* Open on the month with something in it. January on a flat plan is eight teams inside
     their limits and a diagram with nothing to notice, which teaches a reader that there
     is nothing to notice. Their own scrubbing wins from then on. */
  useEffect(() => {
    if (touchedScrub) return;
    let worst = 0, score = -1;
    for (let i = 0; i < months; i++) {
      const at = result.teams.map((t) => t.months[i]);
      const over = at.filter((m) => m.utilization > m.targetUtilization).length;
      const answered = at.reduce((a, m) => Math.min(a, m.serviceLevel ?? 1), 1);
      const s = over * 2 + (1 - answered);
      if (s > score) { score = s; worst = i; }
    }
    setAt(worst);
  }, [result, months, touchedScrub]);

  useEffect(() => {
    if (!playing) return;
    timer.current = window.setInterval(() => setAt((m) => (m + 1) % months), 700);
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, [playing, months]);

  const shape = useMemo(() => yearShape(result), [result]);
  const baseShape = useMemo(() => (touched(edits) ? yearShape(baseResult) : null), [edits, baseResult]);

  const rows = result.teams.map((t) => ({ team: t.teamId, m: t.months[month] as TeamMonth }));
  const overNow = rows.filter((r) => r.m.utilization > r.m.targetUtilization).length;
  const queues = rows.filter((r) => r.m.serviceLevel !== null);
  const worstQueue = queues.length
    ? queues.reduce((a, b) => (b.m.serviceLevel! < a.m.serviceLevel! ? b : a))
    : null;
  const shedNow = rows.reduce((a, r) => a + r.m.shedHours, 0);

  /* The request keeps the month it was first asked in. Moving the playhead afterwards
     scrubs the year; it does not quietly re-date a decision already taken. */
  const setPeople = (id: string, v: number) => setEdits((e) => {
    const was = e.people[id];
    const t = model.teams.find((x) => x.id === id)!;
    const add = clamp((was?.add ?? 0) + v, -(t.currentFte - 1), 5000);
    if (add === 0) {
      const { [id]: _drop, ...rest } = e.people;
      return { ...e, people: rest };
    }
    return { ...e, people: { ...e.people, [id]: { add, month: was?.month ?? result.months[month] } } };
  });
  const setTarget = (id: string, v: number) => {
    const t = tuned.teams.find((x) => x.id === id)!;
    setEdits((e) => ({ ...e, target: { ...e.target, [id]: clamp(Number((t.targetUtilization + v).toFixed(2)), 0.4, 0.99) } }));
  };
  const setVol = (id: string, mult: number) =>
    setEdits((e) => ({ ...e, vol: { ...e.vol, [id]: clamp((e.vol[id] ?? 1) * mult, 0.3, 3) } }));

  const asValue = (v: number, unit: ReceiptLine['unit']) =>
    unit === 'money' ? fmt.money(v) : unit === 'hours' ? fmt.hours(v)
      : unit === 'points' ? pct(v) : String(Math.round(v));
  const asDelta = (l: ReceiptLine) =>
    l.unit === 'money' ? fmt.money(l.delta, { sign: true })
      : l.unit === 'hours' ? signed(l.delta, fmt.hours)
        : l.unit === 'points' ? pp(l.delta)
          : signed(l.delta, (n) => String(Math.round(n)));

  const step = (label: string, value: string, onDown: () => void, onUp: () => void, sub?: string) => (
    <div className="fi-step">
      <span className="fi-step-l">{label}</span>
      <span className="fi-step-c">
        <button type="button" onClick={onDown} aria-label={`${label}: less`}>&minus;</button>
        <b>{value}</b>
        <button type="button" onClick={onUp} aria-label={`${label}: more`}>+</button>
      </span>
      {sub && <span className="fi-step-s">{sub}</span>}
    </div>
  );

  const inspector = () => {
    if (sel?.kind === 'team') {
      const t = tuned.teams.find((x) => x.id === sel.id)!;
      const m = rows.find((r) => r.team === sel.id)!.m;
      const pending = edits.people[sel.id];
      const askedAt = pending ? result.months.indexOf(pending.month) : -1;
      const landing = { asked: askedAt, lands: askedAt + leadTimeFor(model, sel.id) };
      const w = workloadOf(result, sel.id, month);
      const feeds = result.flow.filter((f) => f.kind === 'route' && f.sourceId === sel.id);
      const fedBy = result.flow.filter((f) => f.toTeamId === sel.id);
      return (
        <>
          <div className="fi-id">
            <span className="fi-kind">Team</span>
            <b>{t.name}</b>
            <span className="fi-sub">
              {fedBy.length ? `fed by ${fedBy.map((f) => f.label).join(', ')}` : 'change work only'}
              {feeds.length > 0 && `; ${feeds.map((f) => `${shareLabel(f.share)} goes on to ${name(f.toTeamId)}`).join(', ')}`}
            </span>
          </div>
          <div className="fi-steps">
            {step('People', String(Math.round(m.availableFte)), () => setPeople(t.id, -1), () => setPeople(t.id, 1),
                  pending
                    ? pending.add > 0
                      ? `${pending.add} asked for in ${MONTHS[landing.asked]}, in their seats ${MONTHS[landing.lands] ?? 'after this year'}`
                      : `${-pending.add} fewer from the start`
                    : `${fmt.money(t.monthlyFteCost)} each a month, and new ones take ${leadTimeFor(model, t.id)} months to arrive`)}
            {step('Plans to run at', `${Math.round(t.targetUtilization * 100)}%`, () => setTarget(t.id, -0.05), () => setTarget(t.id, 0.05),
                  'of the hours it has')}
          </div>
          {w && <Why w={w} team={t.name} month={MONTHS[month]} answered={m.serviceLevel} fmt={fmt} />}
        </>
      );
    }
    if (sel?.kind === 'stream') {
      const s = tuned.demandStreams.find((x) => x.id === sel.id)!;
      const f = result.flow.find((x) => x.sourceId === sel.id && x.kind === 'arrival')!;
      const mult = edits.vol[sel.id] ?? 1;
      return (
        <>
          <div className="fi-id">
            <span className="fi-kind">Arriving work</span>
            <b>{s.name}</b>
            <span className="fi-sub">lands on {name(s.teamId)}, {s.handlingMinutesPerUnit} minutes each</span>
          </div>
          <div className="fi-steps">
            {step('Work arriving', `${Math.round(mult * 100)}%`, () => setVol(s.id, 1 / 1.1), () => setVol(s.id, 1.1),
                  'of the plan')}
          </div>
          <dl className="fi-facts">
            <div><dt>This month</dt><dd>{fmt.count(f.unitsByMonth[month])} {s.unit}</dd></div>
            <div><dt>Across the year</dt><dd>{fmt.count(s.annualVolume)} {s.unit}</dd></div>
            <div><dt>Hours it makes</dt><dd>{fmt.hours(f.hoursByMonth[month])}</dd></div>
            {s.answerWithinSeconds && <div><dt>Meant to be picked up in</dt><dd>{s.answerWithinSeconds}s</dd></div>}
          </dl>
        </>
      );
    }
    return (
      <div className="fi-legend">
        <p className="fi-legend-h">Click anything on the canvas to change it.</p>
        <ul>
          <li><i className="lg-src" /> Work arriving, with how much lands this month</li>
          <li><i className="lg-node" /> A team: how full it is against the line it plans to run at</li>
          <li><i className="lg-q" /> Work waiting in front of it, one mark to the week</li>
          <li><i className="lg-shed" /> Work turned away, which never comes back</li>
        </ul>
      </div>
    );
  };

  return (
    <main className="sandbox">
      <header className="sb-top">
        <div>
          <span className="rb-when">The sandbox</span>
          <h1>{isFixture ? model.name : 'Your model'}, {result.months[0]?.slice(0, 4)}</h1>
          <p className="sb-lede">
            Change anything and the year recomputes. Same engine the run uses, answering in
            about a third of a millisecond.
          </p>
        </div>
        {/* What a person running this would want on the wall: what they have, how long they
            have, and where it is currently binding. All measured, none authored. */}
        <dl className="sb-facts">
          <div><dt>Budget</dt><dd>{fmt.money(result.financials.annualBudget)}</dd></div>
          <div><dt>People</dt><dd>{Math.round(result.summary.startingFte)}</dd></div>
          <div><dt>Months</dt><dd>{months}</dd></div>
          <div className="sb-facts-w">
            <dt>The constraint</dt>
            <dd>{binding.service ? name(binding.service.teamId)
              : binding.portfolio ? name(binding.portfolio.teamId)
                : 'nowhere this year'}</dd>
          </div>
        </dl>
      </header>

      <div className="fc-tools">
        <label className="fc-pick">
          <span>Year</span>
          <select value={scenarioId} onChange={(e) => setScenarioId(e.target.value)}>
            {model.scenarios.map((sc) => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
          </select>
        </label>
        <p className="fc-pick-note">{scenario.description}</p>
        {touched(edits) > 0 && (
          <button type="button" className="fc-reset" onClick={() => setEdits(NONE)}>
            Undo my changes ({touched(edits)})
          </button>
        )}
      </div>

      <YearSpine shape={shape} base={baseShape} month={month} labels={MONTHS} playing={playing}
                 onPick={(m) => { setPlaying(false); setTouchedScrub(true); setAt(m); }}
                 onPlay={() => { setTouchedScrub(true); setPlaying((x) => !x); }} />

      <div className="fc-head">
        {broke && (
          <em className={overNow > 0 ? 'mid' : ''}>
            first past what it can hold: {name(broke.teamId)} in {MONTHS[broke.index] ?? broke.month}
          </em>
        )}
        {worstQueue && (
          <em className={worstQueue.m.serviceLevel! < 0.5 ? 'bad' : worstQueue.m.serviceLevel! < 0.85 ? 'mid' : ''}>
            {Math.round(worstQueue.m.serviceLevel! * 100)}% answered on {name(worstQueue.team)}, its worst queue
          </em>
        )}
        {shedNow > 0 && <em className="bad">{fmt.hours(shedNow)} turned away this month</em>}
      </div>

      <FlowCanvas model={tuned} result={result} month={month} selected={sel} onSelect={setSel}
                  compact={(n) => fmt.count(n)} />
      <p className="fc-hint">The canvas is wider than this screen. Drag it sideways to follow the work.</p>

      {touched(edits) > 0 && (
        <section className="fc-rcpt" aria-live="polite">
          <h2>What your changes bought</h2>
          {rec.lines.length === 0 ? (
            <p className="fc-rcpt-none">
              Nothing measurable moved. The year costs the same, answers the same share of its
              work in time and leaves the same amount undone.
            </p>
          ) : (
            <ul className="fc-rcpt-l">
              {rec.lines.map((l) => (
                <li key={l.key} className={l.good ? 'up' : 'down'}>
                  <span className="rc-k">{l.label}</span>
                  <b className="rc-d">{asDelta(l)}</b>
                  <span className="rc-v">{asValue(l.from, l.unit)} &rarr; {asValue(l.to, l.unit)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="fc-rcpt-f">
            {rec.firstMonth !== null
              ? <>It first shows up in <b>{MONTHS[rec.firstMonth]}</b>.</>
              : <>It changes nothing in any month of this year.</>}
            {' '}
            {/* Goldratt's whole point, made out of two measurements rather than asserted. */}
            {rec.moved
              ? rec.moved.to
                ? <>The {rec.moved.metric === 'queue' ? 'queue' : 'money'} now turns on{' '}
                    <b>{name(rec.moved.to)}</b>{rec.moved.from ? <> instead of {name(rec.moved.from)}</> : null}.</>
                : <>Nothing binds the {rec.moved.metric === 'queue' ? 'queue' : 'money'} any more.</>
              : <>The constraint has not moved.</>}
            <span className="fc-rcpt-vs"> Measured against the plan as written, on the same year.</span>
          </p>
        </section>
      )}

      <section className="fc-insp" aria-live="polite">{inspector()}</section>

      <p className="rb-bind sb-bind">
        <span className="rb-bind-k">Five more people:</span>
        {binding.service || binding.portfolio ? (
          <>
            {' '}{[
              binding.service ? `${name(binding.service.teamId)} answers ${Math.round(binding.service.gain * 100)} points more` : '',
              binding.portfolio ? `${name(binding.portfolio.teamId)} puts ${fmt.money(binding.portfolio.gain, { precise: true })} less at risk` : '',
            ].filter(Boolean).join(', or ')}.
          </>
        ) : <> nowhere would that move this year.</>}
        {binding.idle.length > 0 && (
          <span className="rb-bind-idle"> On {binding.idle.length} of the {model.teams.length} teams, nothing at all.</span>
        )}
      </p>

      <div className="rb-opts sb-go">
        <a className="rb-opt rb-go" href="#/run"><b>Take the run &rarr;</b>
          <span>Five decisions on a year with real pressure in it, and a scoreboard at the end.</span></a>
        <a className="rb-opt" href="#/model"><b>Open the full model</b>
          <span>Every team, month, scenario and assumption behind this.</span></a>
      </div>
    </main>
  );
}
