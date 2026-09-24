import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../state/store';
import type { ModelResult, TeamMonth } from '../models/results';
import { bindingConstraints } from '../lib/constraint';
import { receipt, type ReceiptLine } from '../lib/receipt';
import { pipelineAt, type Decision } from '../lib/edits';
import { movesFor, type Move } from '../lib/options';
import { feedFor } from '../lib/feed';
import { pressureOf, PRESSURE_WORD, workloadOf, yearShape, asUnits } from '../lib/workload';
import { impactFor } from '../lib/chain';
import { briefAt, verdictOf } from '../lib/brief';
import { tiesFor } from '../lib/ties';
import { leadsFor } from '../lib/leads';
import { ledgerFor } from '../lib/ledger';
import { tracksFor, divergesAt, type Track } from '../lib/replay';
import { Replay } from '../components/Replay';
import { MONTHS, pct, pp, signed } from '../lib/format';
import { FlowCanvas, layout, type Sel } from '../components/FlowCanvas';
import { YearSpine } from '../components/YearSpine';
import { Why } from '../components/Why';
import { headlineOf } from '../lib/headline';
import { RUN_WORLDS } from '../data/templates';
import { WorldMark } from '../components/WorldMark';

/**
 * You are not using a simulator. You are running this company for a year.
 *
 * Four things on the screen and nothing else: the organisation, the year, what is
 * happening right now, and what you can do about it. Everything the interface used to
 * print at the reader all at once is behind one of those four, reached by asking.
 *
 * The verb is advance. A scrubber invites you to inspect twelve precomputed months; a
 * month that moves forward when you press it makes the consequences yours. The engine does
 * not care which one you use, and the reader cares about nothing else.
 */

/** The one thing most worth knowing about this month, and what it costs. */
function situationOf(model: { teams: { id: string; name: string }[] }, result: ModelResult, month: number) {
  const rows = result.teams.map((t) => ({ id: t.teamId, m: t.months[month] as TeamMonth }));
  const name = (id: string) => model.teams.find((t) => t.id === id)?.name ?? id;
  const shedding = rows.filter((r) => r.m.shedHours > 0).sort((a, b) => b.m.shedHours - a.m.shedHours);
  const buried = rows.filter((r) => r.m.utilization > 1).sort((a, b) => b.m.utilization - a.m.utilization);
  const over = rows.filter((r) => r.m.utilization > r.m.targetUtilization)
    .sort((a, b) => b.m.utilization - a.m.utilization);
  const worst = shedding[0] ?? buried[0] ?? over[0] ?? null;
  const overCount = over.length;
  return {
    teamId: worst?.id ?? null,
    row: worst?.m ?? null,
    name: worst ? name(worst.id) : null,
    tone: shedding.length ? 'bad' : buried.length ? 'bad' : over.length ? 'warn' : 'good',
    overCount,
    teams: rows.length,
  } as const;
}

/**
 * Open straight into a running year: `#/?play` starts it, `#/?at=7` starts it in August.
 *
 * Read at module load, not in an effect, because writeQuery rebuilds the hash from a
 * fixed list of keys it knows about and runs before anything else gets a look in. The
 * parameter is gone from the URL a moment later, which is the right behaviour: it is an
 * instruction for the first render, not a piece of state.
 */
const OPEN_AT: number | null = (() => {
  if (typeof window === 'undefined') return null;
  try {
    const q = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
    if (q.get('at') !== null) {
      const n = Number(q.get('at'));
      return Number.isFinite(n) ? Math.max(0, Math.min(11, Math.trunc(n))) : 0;
    }
    return q.has('play') ? 0 : null;
  } catch { return null; }
})();

export function Sandbox() {
  const { model, tuned, result, doNothing: baseResult, fmt, isFixture, dispatch, state } = useStore();
  /* The year the reader is playing lives in the store, not here. Holding it locally
     meant the full model was computing a different year from the sandbox: same company,
     same screen, two answers. */
  const decisions = state.decisions;
  const [sel, setSel] = useState<Sel>(null);
  /* One panel, not three tabs. Why something is happening and what you can do about it
     are one thought, and a tab bar between them is a filing cabinet. */
  const [started, setStarted] = useState(OPEN_AT !== null);
  /* The year is not something you pick. A demand shock, a winter, a grant that arrives
     three months late: those are things that happen to an organisation, and offering
     them in a dropdown asks the reader to choose the outcome before they have made a
     single decision. What a reader can honestly answer is what kind of work they run, so
     that is the question, and the store opens each world on the year its own model
     nominates. */
  const scenarioId = state.scenarioId;
  const [at, setAt] = useState(OPEN_AT ?? 0);

  const months = result.teams[0]?.months.length ?? 12;
  const month = Math.min(at, months - 1);
  const name = (id: string) => model.teams.find((t) => t.id === id)?.name ?? id;

  const binding = useMemo(
    () => bindingConstraints(tuned, { decisions: [], scenarioId }, [], result),
    [tuned, scenarioId, result],
  );
  const baseBinding = useMemo(
    () => bindingConstraints(model, { decisions: [], scenarioId }, [], baseResult),
    [model, scenarioId, baseResult],
  );
  const rec = useMemo(() => receipt(baseResult, result, baseBinding, binding),
    [baseResult, result, baseBinding, binding]);
  /* Both of these run the year several more times, so they are built only once the reader
     has actually decided something. */
  const ledger = useMemo(
    () => (decisions.length ? ledgerFor(model, decisions, scenarioId) : []),
    [model, decisions, scenarioId],
  );
  const tracks = useMemo(
    () => (decisions.length ? tracksFor(baseResult, result) : []),
    [decisions.length, baseResult, result],
  );
  const diverges = useMemo(() => (tracks.length ? divergesAt(tracks) : null), [tracks]);
  const trackValue = (t: Track, v: number) =>
    t.unit === 'money' ? fmt.money(v) : t.unit === 'pct' ? pct(v) : String(Math.round(v));

  const shape = useMemo(() => yearShape(result), [result]);
  const baseShape = useMemo(() => (decisions.length ? yearShape(baseResult) : null), [decisions, baseResult]);
  const feed = useMemo(() => feedFor(model, decisions, result, name).filter((f) => f.month <= month),
    [model, decisions, result, month]);

  /* Money to date against the budget, and against where even spending would have it by
     now. A year that holds its service level by outspending its budget has held nothing. */
  const cash = useMemo(() => {
    const spentToDate = result.financials.monthly.slice(0, month + 1)
      .reduce((a, m) => a + m.totalCost, 0);
    const budget = result.financials.annualBudget;
    return { spentToDate, budget, pace: (budget / months) * (month + 1), fmt: (n: number) => fmt.money(n) };
  }, [result, month, months, fmt]);

  /* The people actually in their seats this month. The title block used to print the
     starting figure all year, which never moved while attrition and hiring did. */
  const headcount = useMemo(
    () => result.teams.reduce((a, t) => a + (t.months[month]?.availableFte ?? 0), 0),
    [result, month],
  );

  /* The months somebody wrote something about, and the ending. Both came off the run,
     which was a separate screen built around exactly these two things. */
  const brief = useMemo(() => briefAt(model, month), [model, month]);
  const over = month >= months - 1;
  const verdict = useMemo(() => (over ? verdictOf(result) : null), [over, result]);

  /* What the year does, for a reader who has not picked anything yet.
     January is quiet on every one of these models, so the first screen after Start used
     to be a picture with nothing wrong in it and a rail holding one line. The shape of
     the year is already computed for the spine; said in words it gives the opening
     something to be about and a reason to press the button. */
  const ahead = useMemo(() => {
    let first: { at: number; teamId: string } | null = null;
    const ever = new Set<string>();
    for (let i = 0; i < months; i++) {
      for (const t of result.teams) {
        const m = t.months[i];
        if (!m || m.utilization <= m.targetUtilization) continue;
        ever.add(t.teamId);
        if (!first) first = { at: i, teamId: t.teamId };
      }
    }
    let worst = 0;
    for (let i = 1; i < shape.length; i++) if (shape[i].over > shape[worst].over) worst = i;
    return { first, count: ever.size, teams: result.teams.length, worst, worstOver: shape[worst]?.over ?? 0 };
  }, [result, months, shape]);

  const sit = useMemo(() => situationOf(model, result, month), [model, result, month]);
  /* Investigate and decide both act on whatever the reader has picked, falling back to
     whatever is loudest this month, so the buttons always do something. */
  const focus = sel?.kind === 'team' ? sel.id : sit.teamId;
  const moves = useMemo(
    () => (focus && started
      ? movesFor(model, decisions, scenarioId, result, focus, month, result.months, MONTHS)
      : []),
    [focus, started, model, decisions, scenarioId, result, month],
  );
  const impact = useMemo(
    () => (focus ? impactFor(model, result, focus, month, fmt) : []),
    [focus, model, result, month, fmt],
  );
  /* Who else this team's people are promised to. Two teams can be on the same programme
     and never hand each other a single case, which is exactly the connection a picture of
     work flowing cannot make. */
  const ties = useMemo(() => (focus ? tiesFor(model, focus) : []), [model, focus]);
  /* The reader's own moves, always, plus the plan's own waits when they are looking at a
     team on one end of one. Both are the same shape: something here, arriving there. */
  const leads = useMemo(
    () => leadsFor(model, decisions, result.months, sel?.kind === 'team' ? sel.id : null, MONTHS),
    [model, decisions, result.months, sel],
  );

  const take = (d: Decision) => {
    dispatch({ type: 'decide', decision: { ...d, month: result.months[month] } });
  };
  const undo = () => dispatch({ type: 'undoDecision' });
  const advance = () => setAt((m) => Math.min(m + 1, months - 1));

  const asValue = (v: number, unit: ReceiptLine['unit']) =>
    unit === 'money' ? fmt.money(v) : unit === 'hours' ? fmt.hours(v)
      : unit === 'points' ? pct(v) : String(Math.round(v));
  const asDelta = (l: ReceiptLine) =>
    l.unit === 'money' ? fmt.money(l.delta, { sign: true })
      : l.unit === 'hours' ? signed(l.delta, fmt.hours)
        : l.unit === 'points' ? pp(l.delta)
          : signed(l.delta, (n) => String(Math.round(n)));

  /* Each effect as its own chip, with the direction said in words: "−$633K less at risk"
     is a double negative that reads as an improvement and means the opposite. */
  const chipsOf = (mv: Move) => {
    const out: { text: string; tone: 'up' | 'down' | '' }[] = [];
    if (Math.abs(mv.servicePoints) > 0.005) {
      out.push({ text: `${pp(mv.servicePoints)} in time`, tone: mv.servicePoints > 0 ? 'up' : 'down' });
    }
    if (Math.abs(mv.exposure) > 50_000) {
      out.push({ text: `${fmt.money(Math.abs(mv.exposure))} ${mv.exposure > 0 ? 'less' : 'more'} at risk`,
        tone: mv.exposure > 0 ? 'up' : 'down' });
    }
    out.push(mv.cost > 50_000 ? { text: `costs ${fmt.money(mv.cost)}`, tone: 'down' }
      : mv.cost < -50_000 ? { text: `saves ${fmt.money(-mv.cost)}`, tone: 'up' }
        : { text: 'no extra cost', tone: '' });
    out.push({ text: mv.landsAt === null ? 'no effect this year'
      : mv.landsAt <= month ? 'takes effect now' : `lands in ${MONTHS[mv.landsAt]}`, tone: '' });
    return out;
  };

  /* The organisation gets the stage, whatever size the stage is.
     The canvas computes its own intrinsic box from the model, so rather than teaching
     the layout about viewports, it is measured once and drawn at whatever scale fills
     the space. The floor keeps a phone from rendering it as ants; the ceiling stops a
     wide monitor from blowing 11px type up into a poster. */
  /* The live sandbox pins the whole shell to the viewport. The gate before it is an
     ordinary document and must still be able to scroll on a short screen, so the frame
     is told which of the two it is holding rather than being switched on by the route. */
  useLayoutEffect(() => {
    document.body.classList.toggle('world', started);
    /* The start screen is a scrolled document; the year opens at its top. */
    if (started) window.scrollTo({ top: 0 });
    return () => document.body.classList.remove('world');
  }, [started]);

  /* A new month is a new headline, so the rail goes back to the top of it. */
  const railRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => { railRef.current?.scrollTo({ top: 0 }); }, [month]);
  /* On a phone the panel sits above the map, so picking a team further down the page
     brings its answer back into view. */
  const picked = sel?.kind === 'team' || sel?.kind === 'stream' ? sel.id : null;
  useLayoutEffect(() => {
    if (picked && window.matchMedia('(max-width:960px)').matches) {
      railRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [picked]);

  const stageRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  /* The content box, not the border box: fitting to the latter spends the stage's own
     padding twice. Returning the previous object when nothing moved is what lets the
     settle pass below run on every change without becoming a loop. */
  const measure = useCallback(() => {
    const el = stageRef.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    const w = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 1;
    const h = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 1;
    if (w <= 0 || h <= 0) return;
    setBox((b) => (b && Math.abs(b.w - w) < 0.5 && Math.abs(b.h - h) < 0.5 ? b : { w, h }));
  }, []);
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    /* The observer's notifications ride the frame loop, which a backgrounded or occluded
       tab does not run. A window resize while the page is not painting would otherwise
       leave the world sized for the window it was last drawn in. */
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [started, measure]);
  /* The deck and the rail take their height from what the month is doing: a situation
     sentence that wraps to a second line takes thirteen pixels off the stage, and the
     observer on the stage does not reliably see a change it did not cause. Re-measuring
     once after each render settles it. A timer rather than an animation frame, because a
     background or occluded tab stops painting and would leave the fit stale until the
     reader came back to it. */
  useLayoutEffect(() => {
    const id = setTimeout(measure, 0);
    return () => clearTimeout(id);
  });

  /* Spread first, then scale. The height of the network is fixed by the model, so the
     scale that fits the stage vertically is known before anything moves sideways; the
     columns are then widened to exactly the width that scale wants. Because spreading
     changes width only, the two settle in one pass instead of chasing each other. */
  /* Below this there is not enough width for the map, whatever it is scaled to, so the
     canvas builds a single column at the width there is instead of a wide picture the
     reader has to drag sideways. */
  const narrow = box && box.w < 560 ? Math.round(box.w) : null;
  const base = useMemo(() => layout(tuned, result), [tuned, result]);
  const spread = useMemo(() => {
    if (!box || narrow !== null) return 0;
    const want = box.w / (box.h / base.height);
    return Math.max(0, Math.min(200, (want - base.width) / base.cols));
  }, [box, base, narrow]);
  const geo = useMemo(
    () => layout(tuned, result, spread, narrow),
    [tuned, result, spread, narrow],
  );
  const fit = useMemo(() => {
    if (!box) return 1;
    /* The narrow layout is already built to the width it has, so it is drawn at its own
       size and the page scrolls down through it, which is what a phone is for. */
    if (narrow !== null) return 1;
    /* The floor is a legibility floor, not a fitting one. A short window was shrinking
       the world to 0.62, which is 7px type: the whole organisation on one screen and
       none of it readable. Below this the stage scrolls instead, because a readable
       world you move around beats an unreadable one you can see all of. */
    return Math.max(0.85, Math.min(1.45, Math.min(box.w / geo.width, box.h / geo.height)));
  }, [box, geo, narrow]);

  if (!started) {
    const first = situationOf(model, result, 0);
    const w0 = first.teamId ? workloadOf(result, first.teamId, 0) : null;
    const q0 = w0 && first.row ? asUnits(w0, first.row.carriedInHours) : null;
    return (
      <main className="sandbox">
        <section className="om-gate">
          <div className="om-pick">
            <p className="om-gate-k om-gate-k1">What do you run?</p>
            <ul className="om-worlds">
              {RUN_WORLDS.map((w, i) => (
                <li key={w.id}>
                  <button type="button" className={'w' + i + (w.id === model.id ? ' on' : '')}
                          aria-pressed={w.id === model.id}
                          onClick={() => dispatch({ type: 'model', model: w.build() })}>
                    {w.shape && <WorldMark shape={w.shape} />}
                    <b>{w.shapeLine}</b>
                    <span>{w.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="om-chosen">
          <h1>{isFixture ? model.name : 'Your model'}</h1>
          <p className="om-gate-sub">{result.months[0]?.slice(0, 4)} operating model</p>
          <dl className="om-gate-facts">
            <div><dt>People</dt><dd>{fmt.count(Math.round(result.summary.startingFte))}</dd></div>
            <div><dt>Budget</dt><dd>{fmt.money(result.financials.annualBudget)}</dd></div>
            <div><dt>Teams</dt><dd>{model.teams.length}</dd></div>
            <div><dt>Months</dt><dd>{months}</dd></div>
          </dl>

          <p className="om-gate-k">Your objective</p>
          <p className="om-gate-obj">
            Get through the year without going past what your teams can do, and without
            going past the budget.
          </p>

          <p className="om-gate-k">Where it stands in {MONTHS[0]}</p>
          <p className="om-gate-now">
            {first.row && first.name ? (
              <>
                <b>{first.name}</b> is already {PRESSURE_WORD[pressureOf(first.row)].toLowerCase()},
                at <b>{Math.round(first.row.utilization * 100)}%</b> of what it can do
                {q0 !== null && q0 >= 1 && <>, with <b>{fmt.count(Math.round(q0))} {w0!.unit}</b> waiting</>}.
              </>
            ) : (
              <>Every team is inside the line it plans to run at. It doesn't stay that way.</>
            )}
          </p>

          <button type="button" className="om-gate-go" onClick={() => setStarted(true)}>
            Start the year &rarr;
          </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="sandbox sb-live">
      <header className="om-top">
        <div className="tb-id">
          <h1>{isFixture ? model.name : 'Your model'}</h1>
          <p className="om-sub">{result.months[0]?.slice(0, 4)} plan{isFixture ? ' · fictional' : ''}</p>
        </div>
        <div className="tb-cell tb-clock">
          <span className="tb-k">Month</span>
          {/* Keyed on the month so it remounts, and marks the change, when the year moves. */}
          <p><b key={month}>{MONTHS[month]}</b><em>{month + 1} of {months}</em></p>
        </div>
        <div className={'tb-cell tb-state s-' + sit.tone}>
          <span className="tb-k">Over capacity</span>
          <p><b>{sit.overCount} of {sit.teams}</b><em>teams</em></p>
        </div>
        <div className="tb-cell tb-cash">
          <span className="tb-k">Budget used</span>
          <p><b>{fmt.money(cash.spentToDate)}</b><em>of {fmt.money(cash.budget)}</em></p>
          <span className="tb-meter" aria-hidden="true">
            <i style={{ width: `${Math.min(100, (cash.spentToDate / Math.max(cash.budget, 1)) * 100)}%` }}
               className={cash.spentToDate > cash.pace * 1.02 ? 'hot' : ''} />
            <u style={{ left: `${Math.min(100, (cash.pace / Math.max(cash.budget, 1)) * 100)}%` }} />
          </span>
        </div>
        <div className="tb-cell">
          <span className="tb-k">People</span>
          <p><b>{fmt.count(Math.round(headcount))}</b></p>
        </div>
      </header>

      {/* The world takes the stage, and the stage is whatever is left of the screen.
          Everything else is chrome around it: the year and the decision ride the deck
          along the bottom, why-and-what-now sits in the rail beside it, and nothing on
          the loop scrolls the organisation out of sight. */}
      <div className="sb-stage" ref={stageRef}>
        {/* The element that is measured must not be the element that scrolls. Fitting to
            a box whose own scrollbar appears and disappears as a result of the fit is a
            loop: the bar takes a dozen pixels, the next measurement is narrower, the
            canvas shrinks, the bar goes away, and the two sizes trade places forever. */}
        <div className="sb-stagebox">
          <FlowCanvas model={tuned} result={result} month={month} selected={sel} onSelect={setSel}
                      compact={(n) => fmt.count(n)}
                      pipeline={(teamId) => pipelineAt(model, decisions, teamId, month, result.months)}
                      monthLabels={MONTHS} fit={fit} spread={spread} leads={leads} narrow={narrow} />
        </div>
        <p className="fc-hint">Drag the map sideways to follow the work.</p>
      </div>

      <aside className="sb-rail" ref={railRef}>
        {verdict && (
          <section className="rl-card rl-end">
            <p className="rl-eyebrow">The year is over</p>
            <h2 className="rl-h">
              {verdict.met
                ? 'You got through it.'
                : verdict.pastCapacity && verdict.overBudget
                  ? 'You went past both.'
                  : verdict.pastCapacity
                    ? 'You went past what your teams could do.'
                    : 'You went past the budget.'}
            </h2>
            <dl className="rl-tiles">
              <div className={verdict.pastCapacity ? 't-bad' : 't-flat'}>
                <dd>{pct(verdict.peak)}</dd><dt>busiest month for any team</dt>
              </div>
              <div className={verdict.overBudget ? 't-bad' : 't-flat'}>
                <dd>{fmt.money(verdict.spent)}</dd><dt>spent of {fmt.money(verdict.budget)}</dt>
              </div>
              <div className={verdict.shed > 0 ? 't-bad' : 't-flat'}>
                <dd>{verdict.shed > 0 ? fmt.hours(verdict.shed) : 'None'}</dd><dt>work turned away</dt>
              </div>
            </dl>
            <p className="rl-note">The goal: stay inside what your teams can do, and inside the budget.</p>
          </section>
        )}

        {brief && (
          <section className="rl-card rl-brief">
            <p className="rl-eyebrow">{brief.when}</p>
            <h2 className="rl-h rl-h-s">{brief.question}</h2>
            <p className="rl-line">{brief.setup}</p>
            {brief.focusTeamId && brief.focusTeamId !== focus && (
              <button type="button" className="rl-link"
                      onClick={() => setSel({ kind: 'team', id: brief.focusTeamId! })}>
                Show me {name(brief.focusTeamId)} &rarr;
              </button>
            )}
          </section>
        )}

        {sel?.kind === 'stream' ? (() => {
          const st = tuned.demandStreams.find((x) => x.id === sel.id)!;
          const f = result.flow.find((x) => x.sourceId === sel.id && x.kind === 'arrival')!;
          return (
            <section className="rl-card">
              <p className="rl-eyebrow">{MONTHS[month]} · incoming work</p>
              <h2 className="rl-h rl-h-s">{st.name}</h2>
              <p className="rl-line">
                {fmt.count(f.unitsByMonth[month])} {st.unit} this month, {fmt.count(st.annualVolume)} across
                the year. Each takes {st.handlingMinutesPerUnit} minutes and lands on {name(st.teamId)}.
              </p>
            </section>
          );
        })() : !focus ? (
          ahead.first && !verdict ? (
            <section className="rl-card">
              <p className="rl-eyebrow">The year ahead</p>
              <h2 className="rl-h">
                {ahead.count} of {ahead.teams} teams go over capacity this year
              </h2>
              <p className="rl-line">
                First is <b>{name(ahead.first.teamId)}</b> in {MONTHS[ahead.first.at]}.
                {ahead.worstOver > 1 && <> Worst is {MONTHS[ahead.worst]}, with {ahead.worstOver} over at once.</>}
              </p>
              <p className="rl-note">Advance the month, or pick a team on the map.</p>
            </section>
          ) : !verdict && (
            <section className="rl-card">
              <p className="rl-line">Pick a team on the map to see what it's handling.</p>
            </section>
          )
        ) : (() => {
          const w = workloadOf(result, focus, month);
          const m = result.teams.find((t) => t.teamId === focus)?.months[month];
          if (!w || !m) return null;
          const head = headlineOf(w, fmt);
          return (
            <section className={'rl-card rl-focus p-' + head.press}>
              <p className="rl-eyebrow">{MONTHS[month]} · {name(focus)}</p>
              <h2 className="rl-h">
                {head.word}{head.by && <> by <em>{head.by}</em></>}
              </h2>
              <p className="rl-line">{head.line}</p>
              <Why w={w} answered={m.serviceLevel} fmt={fmt} />

              {impact.length > 0 && (
                <dl className="rl-tiles">
                  {impact.slice(0, 4).map((x) => (
                    <div key={x.label} className={'t-' + x.tone}><dd>{x.value}</dd><dt>{x.label}</dt></div>
                  ))}
                </dl>
              )}

              {moves.length > 0 && (
                <div className="rl-moves">
                  <h3 className="rl-sub">Your move <span>each one tested against the full year</span></h3>
                  <ul>
                    {moves.map((mv) => (
                      <li key={mv.decision.id}>
                        <div>
                          <b>{mv.title}</b>
                          <p className="rl-chips">
                            {chipsOf(mv).map((c) => <span key={c.text} className={c.tone}>{c.text}</span>)}
                          </p>
                        </div>
                        <button type="button" onClick={() => take(mv.decision)}>Commit</button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="rl-more">
                <details>
                  <summary>Where the hours go</summary>
                  <Why w={w} answered={m.serviceLevel} fmt={fmt} variant="detail" />
                </details>
                {leads.length > 0 && (
                  <details>
                    <summary>What reaches this team, and when</summary>
                    <ul className="rl-list">
                      {[...new Map(leads.map((l) => [l.detail, l])).values()].map((l, i) => (
                        <li key={i}>{l.detail}</li>
                      ))}
                    </ul>
                  </details>
                )}
                {ties.length > 0 && (
                  <details>
                    <summary>Shares people with {ties.length} {ties.length === 1 ? 'team' : 'teams'}</summary>
                    <ul className="rl-list">
                      {ties.map((t) => (
                        <li key={t.teamId}>
                          <button type="button" onClick={() => setSel({ kind: 'team', id: t.teamId })}>
                            {name(t.teamId)}
                          </button>
                          <span>{t.shared.map((x) => x.name).join(', ')}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="rl-note">Hiring here won't help them, and if one of them slips it
                      comes back to this team.</p>
                  </details>
                )}
              </div>
            </section>
          );
        })()}

        {decisions.length > 0 && (
          <section className="rl-card om-year">
            <p className="rl-eyebrow">Your year so far</p>
            <h2 className="rl-h rl-h-s">
              {rec.firstMonth !== null
                ? <>Your calls first show up in {MONTHS[rec.firstMonth]}</>
                : <>Nothing you've done changes this year yet</>}
            </h2>
            {rec.lines.length > 0 && (
              <table className="om-vs">
                <thead>
                  <tr><th scope="col" /><th scope="col">The plan</th><th scope="col">Yours</th><th scope="col" /></tr>
                </thead>
                <tbody>
                  {rec.lines.map((l) => (
                    <tr key={l.key}>
                      <th scope="row">{l.label}</th>
                      <td>{asValue(l.from, l.unit)}</td>
                      <td className="om-vs-mine">{asValue(l.to, l.unit)}</td>
                      <td className={l.good ? 'up' : 'down'}>{asDelta(l)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {rec.moved && (
              <p className="rl-line">
                {rec.moved.to
                  ? <>The {rec.moved.metric === 'queue' ? 'queue' : 'money'} now turns on{' '}
                      <b>{name(rec.moved.to)}</b>{rec.moved.from ? <> instead of {name(rec.moved.from)}</> : null}.</>
                  : <>Nothing binds the {rec.moved.metric === 'queue' ? 'queue' : 'money'} any more.</>}
              </p>
            )}
            <div className="rl-more">
              {tracks.length > 0 && (
                <details>
                  <summary>Month by month, against the plan</summary>
                  <Replay tracks={tracks} months={months} labels={MONTHS} diverges={diverges}
                          value={trackValue} />
                </details>
              )}
              <details>
                <summary>What each call bought ({ledger.length})</summary>
                {/* Each decision against the ones before it, not against the plan: the second
                    hire into a team you've already relieved isn't worth what the first was. */}
                <ol className="om-ledger">
                  {ledger.map((e, i) => (
                    <li key={e.decision.id + i}>
                      <p className="om-led-h">
                        <span className="om-log-m">{MONTHS[result.months.indexOf(e.decision.month)] ?? e.decision.month}</span>
                        <b>{e.decision.label}</b>
                      </p>
                      {e.effect.lines.length === 0 ? (
                        <p className="om-led-none">Bought nothing on top of what was already decided.</p>
                      ) : (
                        <ul className="om-led-l">
                          {e.effect.lines.map((l) => (
                            <li key={l.key} className={l.good ? 'up' : 'down'}>
                              <b>{asDelta(l)}</b>
                              <span>{l.label.toLowerCase()}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      <p className="om-led-f">
                        {e.effect.firstMonth !== null
                          ? <>Showed up in {MONTHS[e.effect.firstMonth]}.</>
                          : <>Never showed up this year.</>}
                        {e.effect.moved?.to && <> Moved the constraint to {name(e.effect.moved.to)}.</>}
                      </p>
                    </li>
                  ))}
                </ol>
              </details>
            </div>
          </section>
        )}

        <div className="rl-more rl-foot">
          {feed.length > 0 && (
            <details>
              <summary>What's happened so far ({feed.length})</summary>
              <ol className="om-feed-l">
                {feed.slice(-9).reverse().map((f, i) => (
                  <li key={i} className={'t-' + f.tone}>
                    <span>{MONTHS[f.month]}</span>{f.text}
                  </li>
                ))}
              </ol>
            </details>
          )}
          {model.run && (
            <a className="rl-row" href="#/answer">Skip the game and read the answer <span>&rarr;</span></a>
          )}
        </div>
      </aside>

      {/* The deck: the year, and the one button that moves it. Pinned, so advancing a
          month is never something you scroll to find. */}
      <footer className="sb-deck sb-deck2">
        <YearSpine shape={shape} base={baseShape} month={month} labels={MONTHS} playing={false}
                   onPick={(m) => setAt(m)} onPlay={advance} cash={cash} />
        <div className="om-acts">
          <button type="button" className="om-adv" onClick={advance} disabled={month >= months - 1}>
            {month >= months - 1 ? 'The year is over' : <>Advance to {MONTHS[month + 1]} &rarr;</>}
          </button>
          <p className="om-acts2">
            {decisions.length > 0 && <button type="button" onClick={undo}>Undo last move</button>}
            {month > 0 && <button type="button" onClick={() => setAt(0)}>Back to {MONTHS[0]}</button>}
          </p>
        </div>
      </footer>
    </main>
  );
}
