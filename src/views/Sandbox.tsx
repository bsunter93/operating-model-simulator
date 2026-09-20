import { useEffect, useMemo, useRef, useState } from 'react';
import { run } from '../engine';
import { useStore } from '../state/store';
import type { ModelResult, TeamMonth } from '../models/results';
import type { OperatingModel } from '../models/types';
import { bindingConstraints } from '../lib/constraint';
import { MONTHS } from './Run';

/**
 * The sandbox: three dials and a year you can scrub through.
 *
 * The run makes an argument. This does the other job, which the run cannot: it lets
 * somebody feel the shape of the thing in a few seconds. Move a dial, watch the year
 * change under it, find the month it breaks.
 *
 * It exists because the engine already knew something the app was throwing away. Every
 * team's utilisation and answer rate is computed for all twelve months and the whole
 * interface showed one number per team: the peak. Consumer Support's answer rate goes
 * 100, 70, 18, 0 across four months of a demand shock. That collapse is Kingman's cliff
 * in real data and it is the most teachable thing here, and it was invisible.
 */

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

type Dials = { demand: number; target: number; people: number };
const NEUTRAL: Dials = { demand: 1, target: 1, people: 1 };

/** The dials are applied to the model itself, not through a scenario, so the response is
    immediate and there is no vocabulary between the hand and the number. */
function withDials(model: OperatingModel, d: Dials): OperatingModel {
  return {
    ...model,
    teams: model.teams.map((t) => ({
      ...t,
      currentFte: Math.max(1, Math.round(t.currentFte * d.people)),
      targetUtilization: clamp(t.targetUtilization * d.target, 0.4, 0.99),
    })),
    demandStreams: model.demandStreams.map((s) => ({
      ...s,
      annualVolume: Math.max(0, Math.round(s.annualVolume * d.demand)),
    })),
  };
}

/** The first month anything goes past what it can hold, which is the question people ask. */
function breaksAt(r: ModelResult): { month: string; teamId: string } | null {
  for (let m = 0; m < (r.teams[0]?.months.length ?? 0); m++) {
    for (const t of r.teams) {
      const row = t.months[m];
      if (row.utilization > row.targetUtilization) return { month: row.month, teamId: t.teamId };
    }
  }
  return null;
}

/*
 * Chosen by running them. A tenth more work takes the worst month from 97% answered to
 * 32%, and a seventh takes it to nothing: that is the whole of Kingman's law and it needs
 * no explaining once somebody has seen it happen.
 *
 * The last one is the opposite lesson and the more useful one for an executive. Raising
 * every target changes nothing about the work; it moves the line you measure against, so
 * five teams stop being "over capacity" and not one thing improves.
 */
const PRESETS: { id: string; label: string; note: string; dials: Dials }[] = [
  { id: 'calm', label: 'The plan as written', note: 'Every dial where the model left it.', dials: NEUTRAL },
  { id: 'more', label: 'A tenth more work', note: 'Not a crisis. A normal year that went slightly better than forecast.', dials: { demand: 1.1, target: 1, people: 1 } },
  { id: 'fewer', label: 'A tenth fewer people', note: 'A hiring freeze, or a bad quarter for attrition. Same work.', dials: { demand: 1, target: 1, people: 0.9 } },
  { id: 'sweat', label: 'Raise every target instead', note: 'Change nothing real and ask everyone to run at 95%. Watch what happens to the dashboard, and to the work.', dials: { demand: 1, target: 1.2, people: 1 } },
];

export function Sandbox() {
  const { model, fmt, isFixture } = useStore();
  const [dials, setDials] = useState<Dials>(NEUTRAL);
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<number | null>(null);

  const tuned = useMemo(() => withDials(model, dials), [model, dials]);
  const result = useMemo(() => run(tuned), [tuned]);
  const months = result.teams[0]?.months.length ?? 12;
  const month = Math.min(at, months - 1);

  /* No scenario: the dials are the scenario here. Passing the run's year would probe
     against a different world from the one on screen and report nonsense with a straight
     face, which it did, right up until a screenshot showed a queue at 32% next to a line
     saying nothing would move it. */
  const binding = useMemo(
    () => bindingConstraints(tuned, { decisions: [] }, [], result),
    [tuned, result],
  );
  const broke = useMemo(() => breaksAt(result), [result]);
  const name = (id: string) => model.teams.find((t) => t.id === id)?.name ?? id;

  useEffect(() => {
    if (!playing) return;
    timer.current = window.setInterval(() => setAt((m) => (m + 1) % months), 650);
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, [playing, months]);

  /* Read at the month on the playhead rather than at the peak. The peak is one number for
     a year; this is the year. */
  const rows = result.teams.map((t) => ({ team: t.teamId, m: t.months[month] as TeamMonth }));
  const overNow = rows.filter((r) => r.m.utilization > r.m.targetUtilization).length;
  /* The worst queue, not the average of them. A tenth more work takes one team to 32%
     answered while the mean across the queues reads 78%, and the mean is the number that
     lets a plan through a review. Averages are where this kind of collapse hides. */
  const queues = rows.filter((r) => r.m.serviceLevel !== null);
  const worstQueue = queues.length
    ? queues.reduce((a, b) => (b.m.serviceLevel! < a.m.serviceLevel! ? b : a))
    : null;

  const dial = (k: keyof Dials, label: string, lo: number, hi: number, fmtV: (v: number) => string) => (
    <label className="sb-dial" key={k}>
      <span className="sb-dial-h">{label}<b>{fmtV(dials[k])}</b></span>
      <input type="range" min={lo} max={hi} step={0.01} value={dials[k]}
             onChange={(e) => setDials({ ...dials, [k]: Number(e.target.value) })} />
    </label>
  );

  return (
    <main className="sandbox">
      <header className="sb-top">
        <div>
          <span className="rb-when">The sandbox</span>
          <h1>Move something. Watch the year.</h1>
          <p className="sb-lede">
            {isFixture ? model.name : 'Your model'}, {months} months, recomputed on every drag.
            Nothing here is a preview of the real thing; it is the same engine the run uses,
            answering in about a third of a millisecond.
          </p>
        </div>
        <div className="sb-verdict">
          {broke
            ? <><b>{name(broke.teamId)}</b> goes past what it can hold in <b>{MONTHS[result.teams[0].months.findIndex((x) => x.month === broke.month)] ?? broke.month}</b>.</>
            : <>Nothing goes past what it can hold this year.</>}
        </div>
      </header>

      <div className="sb-body">
        <aside className="sb-rail">
          <p className="sb-rail-h">Start from</p>
          <div className="sb-presets">
            {PRESETS.map((p) => (
              <button key={p.id}
                      className={'sb-preset' + (JSON.stringify(p.dials) === JSON.stringify(dials) ? ' on' : '')}
                      onClick={() => setDials(p.dials)}>
                <b>{p.label}</b><span>{p.note}</span>
              </button>
            ))}
          </div>
          <p className="sb-rail-h">Or turn these</p>
          {dial('demand', 'Work arriving', 0.6, 1.6, (v) => `${Math.round(v * 100)}%`)}
          {dial('people', 'People', 0.7, 1.4, (v) => `${Math.round(v * 100)}%`)}
          {dial('target', 'How hard you run them', 0.8, 1.25, (v) => `${Math.round(v * 100)}%`)}
          <p className="sb-note">
            Move work or people by a tenth and watch the worst month fall from nearly everything
            answered to almost nothing. Queues hold, and then they do not, and the distance
            between those two is smaller than anybody plans for.
          </p>
          <p className="sb-note">
            The third dial does something else. It changes no work and no people, only the line
            you are measured against, so teams stop counting as over capacity while doing exactly
            what they were doing before.
          </p>
        </aside>

        <section className="sb-canvas">
          {/* Two readings, because on a calm plan the answer rate is flat all year and a
              header that only shows a constant teaches the reader to ignore it. The count
              of teams past their limit moves from the first month. */}
          <div className="sb-canvas-h">
            <span>{MONTHS[month]}</span>
            <em className={overNow > 0 ? 'mid' : ''}>
              {overNow === 0 ? 'every team inside its limit' : `${overNow} of ${rows.length} past their limit`}
            </em>
            {worstQueue && (
              <em className={worstQueue.m.serviceLevel! < 0.5 ? 'bad' : worstQueue.m.serviceLevel! < 0.85 ? 'mid' : ''}>
                {Math.round(worstQueue.m.serviceLevel! * 100)}% answered on {name(worstQueue.team)}, its worst queue
              </em>
            )}
          </div>

          <ul className="sb-teams">
            {rows.map(({ team, m }) => {
              const over = m.utilization > m.targetUtilization;
              const hard = m.utilization > 1;
              return (
                <li key={team} className={hard ? 'hard' : over ? 'over' : ''}>
                  <span className="sb-name">{name(team)}</span>
                  <span className="sb-track">
                    <i style={{ width: Math.min(100, m.utilization * 100) + '%' }} />
                    <b style={{ left: Math.min(100, m.targetUtilization * 100) + '%' }} />
                  </span>
                  <span className="sb-pct">{Math.round(m.utilization * 100)}%</span>
                </li>
              );
            })}
          </ul>

          <div className="sb-scrub">
            <button className="sb-play" onClick={() => setPlaying((p) => !p)}>
              {playing ? 'Pause' : 'Play the year'}
            </button>
            <input type="range" min={0} max={months - 1} step={1} value={month}
                   aria-label="Month"
                   onChange={(e) => { setPlaying(false); setAt(Number(e.target.value)); }} />
            <ol className="sb-months">
              {Array.from({ length: months }, (_, i) => (
                <li key={i} className={i === month ? 'on' : ''}>{MONTHS[i]?.[0]}</li>
              ))}
            </ol>
          </div>

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
        </section>
      </div>

      <div className="rb-opts sb-go">
        <a className="rb-opt rb-go" href="#/"><b>Take the run &rarr;</b>
          <span>Five decisions on a year with real pressure in it, and a scoreboard at the end.</span></a>
        <a className="rb-opt" href="#/model"><b>Open the full model</b>
          <span>Every team, month, scenario and assumption behind this.</span></a>
      </div>
    </main>
  );
}
