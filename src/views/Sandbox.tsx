import { useEffect, useMemo, useState } from 'react';
import { run } from '../engine';
import { useStore } from '../state/store';
import type { ModelResult, TeamMonth } from '../models/results';
import { bindingConstraints } from '../lib/constraint';
import { receipt, type ReceiptLine } from '../lib/receipt';
import { applyDecisions, pipelineAt, type Decision } from '../lib/edits';
import { movesFor, type Move } from '../lib/options';
import { feedFor } from '../lib/feed';
import { pressureOf, PRESSURE_WORD, workloadOf, yearShape, asUnits } from '../lib/workload';
import { pct, pp, signed } from '../lib/format';
import { FlowCanvas, shareLabel, type Sel } from '../components/FlowCanvas';
import { YearSpine } from '../components/YearSpine';
import { Why } from '../components/Why';
import { MONTHS } from './Run';

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
  const { model, fmt, isFixture } = useStore();
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [sel, setSel] = useState<Sel>(null);
  const [panel, setPanel] = useState<'why' | 'decide' | 'log'>('log');
  const baseId = model.scenarios.find((x) => x.type === 'base')?.id ?? model.scenarios[0].id;
  const [scenarioId, setScenarioId] = useState(baseId);
  const scenario = model.scenarios.find((x) => x.id === scenarioId) ?? model.scenarios[0];
  const [at, setAt] = useState(0);

  const tuned = useMemo(() => applyDecisions(model, decisions), [model, decisions]);
  const result = useMemo(() => run(tuned, { scenario: scenarioId }), [tuned, scenarioId]);
  const months = result.teams[0]?.months.length ?? 12;
  const month = Math.min(at, months - 1);
  const name = (id: string) => model.teams.find((t) => t.id === id)?.name ?? id;

  const baseResult = useMemo(() => run(model, { scenario: scenarioId }), [model, scenarioId]);
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
    () => (panel === 'decide' && focus
      ? movesFor(model, decisions, scenarioId, result, focus, month, result.months, MONTHS)
      : []),
    [panel, focus, model, decisions, scenarioId, result, month],
  );

  useEffect(() => { if (sel?.kind === 'team' && panel === 'log') setPanel('why'); }, [sel]);

  const take = (d: Decision) => {
    setDecisions((xs) => [...xs, { ...d, month: result.months[month] }]);
    setPanel('log');
  };
  const undo = () => setDecisions((xs) => xs.slice(0, -1));
  const advance = () => setAt((m) => Math.min(m + 1, months - 1));

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

  return (
    <main className="sandbox">
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

      <div className="fc-tools">
        <label className="fc-pick">
          <span>Year</span>
          <select value={scenarioId} title={scenario.description}
                  onChange={(e) => { setScenarioId(e.target.value); setAt(0); }}>
            {model.scenarios.map((sc) => (
              <option key={sc.id} value={sc.id} title={sc.description}>{sc.name}</option>
            ))}
          </select>
        </label>
        {decisions.length > 0 && (
          <button type="button" className="fc-reset" onClick={undo}>Undo the last decision</button>
        )}
      </div>

      <FlowCanvas model={tuned} result={result} month={month} selected={sel} onSelect={setSel}
                  compact={(n) => fmt.count(n)}
                  pipeline={(teamId) => pipelineAt(model, decisions, teamId, month, result.months)}
                  monthLabels={MONTHS} />
      <p className="fc-hint">The canvas is wider than this screen. Drag it sideways to follow the work.</p>

      <YearSpine shape={shape} base={baseShape} month={month} labels={MONTHS} playing={false}
                 onPick={(m) => setAt(m)} onPlay={advance} cash={cash} />

      {/* What is happening, and the three things a person can do about it. */}
      <section className={'om-sit s-' + sit.tone}>
        <p className="om-sit-h">
          {sit.row && sit.name ? (
            <>
              <b>{sit.name}</b> is {PRESSURE_WORD[pressureOf(sit.row)].toLowerCase()}
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
          <button type="button" className={panel === 'why' ? 'on' : ''}
                  disabled={!focus}
                  onClick={() => { if (focus) { setSel({ kind: 'team', id: focus }); setPanel('why'); } }}>
            Investigate
          </button>
          <button type="button" className={panel === 'decide' ? 'on' : ''}
                  disabled={!focus}
                  onClick={() => { if (focus) { setSel({ kind: 'team', id: focus }); setPanel('decide'); } }}>
            Make a decision
          </button>
          <button type="button" className="om-adv" onClick={advance} disabled={month >= months - 1}>
            {month >= months - 1 ? 'The year is over' : `Advance to ${MONTHS[month + 1]}`}
          </button>
          {month > 0 && (
            <button type="button" className="om-back" onClick={() => setAt(0)}>Back to {MONTHS[0]}</button>
          )}
        </div>
      </section>

      <section className="om-panel">
        <nav className="om-tabs">
          <button type="button" className={panel === 'why' ? 'on' : ''} onClick={() => setPanel('why')}>Why</button>
          <button type="button" className={panel === 'decide' ? 'on' : ''} onClick={() => setPanel('decide')}>Decide</button>
          <button type="button" className={panel === 'log' ? 'on' : ''} onClick={() => setPanel('log')}>
            Your year{decisions.length ? ` (${decisions.length})` : ''}
          </button>
        </nav>

        {panel === 'why' && (() => {
          if (sel?.kind === 'stream') {
            const s = tuned.demandStreams.find((x) => x.id === sel.id)!;
            const f = result.flow.find((x) => x.sourceId === sel.id && x.kind === 'arrival')!;
            return (
              <div className="om-why">
                <p className="fi-sub"><b>{s.name}</b> lands on {name(s.teamId)}, {s.handlingMinutesPerUnit} minutes each.
                  {' '}{fmt.count(f.unitsByMonth[month])} {s.unit} this month, {fmt.count(s.annualVolume)} across the year.</p>
              </div>
            );
          }
          const id = focus;
          const w = id ? workloadOf(result, id, month) : null;
          const m = id ? result.teams.find((t) => t.teamId === id)?.months[month] : null;
          if (!id || !w || !m) return <p className="fi-idle">Pick a team on the canvas.</p>;
          const feeds = result.flow.filter((f) => f.kind === 'route' && f.sourceId === id);
          return (
            <>
              <Why w={w} team={name(id)} month={MONTHS[month]} answered={m.serviceLevel} fmt={fmt} />
              {feeds.length > 0 && (
                <p className="om-onward">
                  What it cannot hold moves on: {feeds.map((f) =>
                    `${shareLabel(f.share)} of its work goes to ${name(f.toTeamId)}`).join(', ')}.
                </p>
              )}
            </>
          );
        })()}

        {panel === 'decide' && (
          !focus ? <p className="fi-idle">Pick a team on the canvas.</p> : (
            <>
              <p className="om-q">What can you do about {name(focus)}?</p>
              <ul className="om-moves">
                {moves.map((mv) => (
                  <li key={mv.decision.id}>
                    <button type="button" onClick={() => take(mv.decision)}>
                      <b>{mv.title}</b>
                      <span className="om-move-w">{mv.when}</span>
                      <span className="om-move-i">{moveLine(mv)}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="om-note">
                Every number above came from running the year with that move in it. Nothing is
                a rule of thumb.
              </p>
            </>
          )
        )}

        {panel === 'log' && (
          <>
            {decisions.length === 0 ? (
              <p className="fi-idle">
                Nothing decided yet. Advance the months and watch where it goes wrong, or click a
                team and make a call.
              </p>
            ) : (
              <>
                <ol className="om-log">
                  {decisions.map((d, i) => (
                    <li key={d.id + i}>
                      <span className="om-log-m">{MONTHS[result.months.indexOf(d.month)] ?? d.month}</span>
                      <b>{d.label}</b>
                    </li>
                  ))}
                </ol>
                <div className="om-vs">
                  <h3>Your year against the plan as written</h3>
                  {rec.lines.length === 0 ? (
                    <p className="fc-rcpt-none">Nothing measurable moved.</p>
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
                    {rec.moved
                      ? rec.moved.to
                        ? <>The {rec.moved.metric === 'queue' ? 'queue' : 'money'} now turns on{' '}
                            <b>{name(rec.moved.to)}</b>{rec.moved.from ? <> instead of {name(rec.moved.from)}</> : null}.</>
                        : <>Nothing binds the {rec.moved.metric === 'queue' ? 'queue' : 'money'} any more.</>
                      : <>The constraint has not moved.</>}
                  </p>
                </div>
              </>
            )}
          </>
        )}
      </section>

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
    </main>
  );
}
