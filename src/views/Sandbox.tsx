import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { run } from '../engine';
import { useStore } from '../state/store';
import type { ModelResult, TeamMonth } from '../models/results';
import { bindingConstraints } from '../lib/constraint';
import { receipt, type ReceiptLine } from '../lib/receipt';
import { applyDecisions, pipelineAt, type Decision } from '../lib/edits';
import { movesFor, type Move } from '../lib/options';
import { feedFor } from '../lib/feed';
import { pressureOf, PRESSURE_WORD, workloadOf, yearShape, asUnits } from '../lib/workload';
import { chainFor } from '../lib/chain';
import { ledgerFor } from '../lib/ledger';
import { tracksFor, divergesAt, type Track } from '../lib/replay';
import { Replay } from '../components/Replay';
import { pct, pp, signed } from '../lib/format';
import { FlowCanvas, layout, type Sel } from '../components/FlowCanvas';
import { YearSpine } from '../components/YearSpine';
import { Why } from '../components/Why';
import { MONTHS } from './Run';
import { RUN_WORLDS } from '../data/templates';

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

export function Sandbox() {
  const { model, fmt, isFixture, dispatch } = useStore();
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [sel, setSel] = useState<Sel>(null);
  /* One panel, not three tabs. Why something is happening and what you can do about it
     are one thought, and a tab bar between them is a filing cabinet. */
  const [started, setStarted] = useState(false);
  const baseId = model.scenarios.find((x) => x.type === 'base')?.id ?? model.scenarios[0].id;
  /* The year is not something you pick. A demand shock, a winter, a grant that arrives
     three months late: those are things that happen to an organisation, and offering
     them in a dropdown asks the reader to choose the outcome before they have made a
     single decision. What a reader can honestly answer is what kind of work they run,
     so that is the question, and the year each world gets is the one its own model
     nominates. Falls back to the plan as written for a model that names none, which is
     also the only year in which nothing ever queues. */
  const scenarioId = model.run?.scenarioId
    && model.scenarios.some((x) => x.id === model.run!.scenarioId)
    ? model.run.scenarioId : baseId;
  const [at, setAt] = useState(0);

  const applied = useMemo(() => applyDecisions(model, decisions), [model, decisions]);
  const tuned = applied.model;
  const result = useMemo(
    () => run(tuned, { scenario: scenarioId, interventions: applied.interventionIds }),
    [tuned, scenarioId, applied.interventionIds],
  );
  const months = result.teams[0]?.months.length ?? 12;
  const month = Math.min(at, months - 1);
  const name = (id: string) => model.teams.find((t) => t.id === id)?.name ?? id;

  const baseResult = useMemo(() => run(model, { scenario: scenarioId }), [model, scenarioId]);
  const binding = useMemo(
    () => bindingConstraints(tuned, { decisions: [], scenarioId }, applied.interventionIds, result),
    [tuned, scenarioId, result, applied.interventionIds],
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
  const chain = useMemo(
    () => (focus ? chainFor(model, result, focus, month, fmt) : []),
    [focus, model, result, month, fmt],
  );

  /* A move is armed before it is taken. Clicking one used to apply it, which makes the
     panel a settings screen: you change a value and the world changes under you. Naming
     what it buys and then asking is the difference between configuring a model and
     deciding something. */
  const [armed, setArmed] = useState<string | null>(null);
  /* The rail scrolls, and the options sit near the bottom of it, so arming a move can
     open the thing you are being asked to read just off the end of the panel. */
  const commitRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (armed) commitRef.current?.scrollIntoView({ block: 'nearest' });
  }, [armed]);
  const take = (d: Decision) => {
    setDecisions((xs) => [...xs, { ...d, month: result.months[month] }]);
    setArmed(null);
  };
  const undo = () => setDecisions((xs) => xs.slice(0, -1));
  const advance = () => { setAt((m) => Math.min(m + 1, months - 1)); setArmed(null); };

  const asValue = (v: number, unit: ReceiptLine['unit']) =>
    unit === 'money' ? fmt.money(v) : unit === 'hours' ? fmt.hours(v)
      : unit === 'points' ? pct(v) : String(Math.round(v));
  const asDelta = (l: ReceiptLine) =>
    l.unit === 'money' ? fmt.money(l.delta, { sign: true })
      : l.unit === 'hours' ? signed(l.delta, fmt.hours)
        : l.unit === 'points' ? pp(l.delta)
          : signed(l.delta, (n) => String(Math.round(n)));

  /* Say which way each number goes in words. "−$633K less at risk" is a double negative
     that reads as an improvement and means the opposite. */
  const moveLine = (mv: Move) => {
    const bits = [
      Math.abs(mv.servicePoints) > 0.005 ? `${pp(mv.servicePoints)} answered in time` : null,
      Math.abs(mv.exposure) > 50_000
        ? `${fmt.money(Math.abs(mv.exposure))} ${mv.exposure > 0 ? 'less' : 'more'} at risk` : null,
      Math.abs(mv.cost) > 50_000
        ? (mv.cost > 0 ? `costs ${fmt.money(mv.cost)} more` : `saves ${fmt.money(-mv.cost)}`) : null,
    ].filter(Boolean);
    return bits.length ? bits.join(' · ') : 'nothing measurable this year';
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
    return () => document.body.classList.remove('world');
  }, [started]);

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
  const base = useMemo(() => layout(tuned, result), [tuned, result]);
  const spread = useMemo(() => {
    if (!box) return 0;
    const want = box.w / (box.h / base.height);
    return Math.max(0, Math.min(200, (want - base.width) / base.cols));
  }, [box, base]);
  const geo = useMemo(() => layout(tuned, result, spread), [tuned, result, spread]);
  const fit = useMemo(() => {
    if (!box) return 1;
    return Math.max(0.62, Math.min(1.45, Math.min(box.w / geo.width, box.h / geo.height)));
  }, [box, geo]);

  if (!started) {
    const first = situationOf(model, result, 0);
    const w0 = first.teamId ? workloadOf(result, first.teamId, 0) : null;
    const q0 = w0 && first.row ? asUnits(w0, first.row.carriedInHours) : null;
    return (
      <main className="sandbox">
        <section className="om-gate">
          <p className="om-gate-k om-gate-k1">What do you run?</p>
          <ul className="om-worlds">
            {RUN_WORLDS.map((w) => (
              <li key={w.id}>
                <button type="button" className={w.id === model.id ? 'on' : ''}
                        aria-pressed={w.id === model.id}
                        onClick={() => dispatch({ type: 'model', model: w.build() })}>
                  <b>{w.shapeLine}</b>
                  <span>{w.name}</span>
                </button>
              </li>
            ))}
          </ul>

          <h1>{isFixture ? model.name : 'Your model'}</h1>
          <p className="om-gate-sub">{result.months[0]?.slice(0, 4)} operating model</p>
          <p className="om-gate-facts">
            <span>{Math.round(result.summary.startingFte)} people</span>
            <span>{fmt.money(result.financials.annualBudget)} budget</span>
            <span>{months} months</span>
          </p>

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
              <>Every team is inside the line it plans to run at. It does not stay that way.</>
            )}
          </p>

          <button type="button" className="om-gate-go" onClick={() => setStarted(true)}>
            Start the year &rarr;
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="sandbox sb-live">
      <header className="om-top">
        <div>
          <h1>{isFixture ? model.name : 'Your model'}</h1>
          <p className="om-sub">{result.months[0]?.slice(0, 4)} operating model</p>
        </div>
        <p className="om-clock">
          <b>{MONTHS[month]}</b>
          <span>month {month + 1} of {months}</span>
        </p>
        <p className={'om-state s-' + sit.tone}>
          {sit.tone === 'good' ? 'On plan'
            : sit.overCount === 1 ? '1 team over' : `${sit.overCount} teams over`}
        </p>
        <p className="om-wall">
          <span>{fmt.money(result.financials.annualBudget)}</span>
          <span>{Math.round(result.summary.startingFte)} people</span>
        </p>
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
                      monthLabels={MONTHS} fit={fit} spread={spread} />
        </div>
        <p className="fc-hint">Drag the map sideways to follow the work.</p>
      </div>

      <aside className="sb-rail">

      {/* One panel. Why it is happening and what you can do about it are one thought, and
          a tab bar between them files them in different drawers. */}
      <section className="om-panel">
        {sel?.kind === 'stream' ? (() => {
          const st = tuned.demandStreams.find((x) => x.id === sel.id)!;
          const f = result.flow.find((x) => x.sourceId === sel.id && x.kind === 'arrival')!;
          return (
            <p className="fi-sub">
              <b>{st.name}</b> lands on {name(st.teamId)}, {st.handlingMinutesPerUnit} minutes each.
              {' '}{fmt.count(f.unitsByMonth[month])} {st.unit} this month,
              {' '}{fmt.count(st.annualVolume)} across the year.
            </p>
          );
        })() : !focus ? (
          <p className="fi-idle">Click a building to look inside it.</p>
        ) : (
          <>
            <h2 className="om-q">Why is {name(focus)} where it is in {MONTHS[month]}?</h2>
            <ol className="om-chain">
              {chain.map((l, i) => <li key={i} className={'t-' + l.tone}>{l.text}</li>)}
            </ol>
            {(() => {
              const w = workloadOf(result, focus, month);
              const m = result.teams.find((t) => t.teamId === focus)?.months[month];
              return w && m
                ? <Why w={w} team={name(focus)} month={MONTHS[month]} answered={m.serviceLevel} fmt={fmt} />
                : null;
            })()}
            <h2 className="om-q om-q2">What can you do about it?</h2>
            <ul className="om-moves">
              {moves.map((mv) => {
                const on = armed === mv.decision.id;
                return (
                  <li key={mv.decision.id} className={on ? 'on' : ''}>
                    <button type="button" aria-expanded={on}
                            onClick={() => setArmed(on ? null : mv.decision.id)}>
                      <b>{mv.title}</b>
                      <span className="om-move-w">{mv.when}</span>
                      <span className="om-move-i">{moveLine(mv)}</span>
                    </button>
                    {on && (
                      <div className="om-commit" ref={commitRef}>
                        <dl>
                          {Math.abs(mv.servicePoints) > 0.005 && (
                            <>
                              <dt>Answered in time</dt>
                              <dd className={mv.servicePoints > 0 ? 'up' : 'down'}>
                                {pp(mv.servicePoints)}
                              </dd>
                            </>
                          )}
                          {Math.abs(mv.exposure) > 50_000 && (
                            <>
                              <dt>At risk</dt>
                              <dd className={mv.exposure > 0 ? 'up' : 'down'}>
                                {fmt.money(Math.abs(mv.exposure))} {mv.exposure > 0 ? 'less' : 'more'}
                              </dd>
                            </>
                          )}
                          <dt>Cost</dt>
                          <dd className={mv.cost > 50_000 ? 'down' : mv.cost < -50_000 ? 'up' : ''}>
                            {mv.cost > 50_000 ? `${fmt.money(mv.cost)} more`
                              : mv.cost < -50_000 ? `${fmt.money(-mv.cost)} saved` : 'no change'}
                          </dd>
                          <dt>Shows up</dt>
                          <dd>{mv.landsAt !== null ? MONTHS[mv.landsAt] : 'not this year'}</dd>
                        </dl>
                        <p className="om-commit-a">
                          <button type="button" className="om-go"
                                  onClick={() => take(mv.decision)}>Commit</button>
                          <button type="button" className="om-no"
                                  onClick={() => setArmed(null)}>Cancel</button>
                        </p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="om-note">
              Every number on those came from running the year with that move in it.
            </p>
          </>
        )}
      </section>

      {decisions.length > 0 && (
        <section className="om-panel om-year">
          <h2 className="om-q">Your year, against the plan as written</h2>

          {rec.lines.length === 0 ? (
            <p className="fc-rcpt-none">Nothing measurable moved.</p>
          ) : (
            <table className="om-vs">
              <thead>
                <tr><th scope="col" /><th scope="col">The plan</th><th scope="col">Your year</th><th scope="col" /></tr>
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
          <p className="fc-rcpt-f">
            {rec.firstMonth !== null
              ? <>It first shows up in <b>{MONTHS[rec.firstMonth]}</b>.</>
              : <>It changes nothing in any month of this year.</>}
            {' '}
            {rec.moved
              ? rec.moved.to
                ? <>The {rec.moved.metric === 'queue' ? 'queue' : 'money'} now turns on{' '}
                    <b>{name(rec.moved.to)}</b>{rec.moved.from ? <> instead of {name(rec.moved.from)}</> : null}.</>
                : <>Nothing binds the {rec.moved.metric === 'queue' ? 'queue' : 'money'} any more.</>
              : <>The constraint has not moved.</>}
          </p>

          {tracks.length > 0 && (
            <Replay tracks={tracks} months={months} labels={MONTHS} diverges={diverges}
                    value={trackValue} />
          )}

          {/* Each decision against the ones before it, not against the plan, because the
              second hire into a team you have already relieved is not worth what the
              first one was. */}
          <h3 className="om-q om-q2">What each call bought</h3>
          <ol className="om-ledger">
            {ledger.map((e, i) => (
              <li key={e.decision.id + i}>
                <p className="om-led-h">
                  <span className="om-log-m">{MONTHS[result.months.indexOf(e.decision.month)] ?? e.decision.month}</span>
                  <b>{e.decision.label}</b>
                </p>
                {e.effect.lines.length === 0 ? (
                  <p className="om-led-none">Bought nothing measurable on top of what was already decided.</p>
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
        </section>
      )}

      <section className="om-feed">
        <h2>Operations feed</h2>
        {feed.length === 0 ? (
          <p className="om-feed-none">Quiet so far.</p>
        ) : (
          <ol>
            {feed.slice(-9).reverse().map((f, i) => (
              <li key={i} className={'t-' + f.tone}>
                <span>{MONTHS[f.month]}</span>{f.text}
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="rb-opts sb-go">
        <a className="rb-opt rb-go" href="#/run"><b>Take the run &rarr;</b>
          <span>Five decisions on a year with real pressure in it, and a scoreboard at the end.</span></a>
        <a className="rb-opt" href="#/model"><b>Open the full model</b>
          <span>Every team, month, scenario and assumption behind this.</span></a>
      </div>
      </aside>

      {/* The deck: the clock of this world, and the one button that moves it. Both are
          pinned, so advancing a month is never something you scroll to find. */}
      <footer className="sb-deck">
        <YearSpine shape={shape} base={baseShape} month={month} labels={MONTHS} playing={false}
                   onPick={(m) => setAt(m)} onPlay={advance} cash={cash} />
      {/* What is happening, and the three things a person can do about it. */}
      <section className={'om-sit s-' + sit.tone}>
        <p className="om-sit-h">
          {sit.row && sit.name ? (
            <>
              <b className="om-sit-who">{sit.name}</b> is {PRESSURE_WORD[pressureOf(sit.row)].toLowerCase()}
              {(() => {
                const w = workloadOf(result, sit.teamId!, month);
                const q = w ? asUnits(w, sit.row.carriedInHours) : null;
                const lost = w ? asUnits(w, sit.row.shedHours) : null;
                return (
                  <>
                    {q !== null && q >= 1 && <>, with <b>{fmt.count(Math.round(q))} {w!.unit}</b> waiting</>}
                    {lost !== null && lost >= 1 && <> and <b>{fmt.count(Math.round(lost))} {w!.unit}</b> turned away this month</>}
                  </>
                );
              })()}.
            </>
          ) : <>Every team is inside the line it plans to run at.</>}
        </p>
        <div className="om-acts">
          <button type="button" className="om-adv" onClick={advance} disabled={month >= months - 1}>
            {month >= months - 1 ? 'The year is over' : `Advance to ${MONTHS[month + 1]}`}
          </button>
          {month > 0 && (
            <button type="button" className="om-back" onClick={() => setAt(0)}>Back to {MONTHS[0]}</button>
          )}
          {decisions.length > 0 && (
            <button type="button" className="om-back" onClick={undo}>Undo the last decision</button>
          )}
        </div>
      </section>
      </footer>
    </main>
  );
}
