import { useEffect, useMemo, useState } from 'react';
import { run } from '../engine';
import { FIXTURE } from '../state/store';
import type { ModelResult } from '../models/results';

/**
 * The run: three decisions, and whatever they add up to.
 *
 * This view exists because the board next door answers "what can this model do", and
 * the question worth answering is "do you now understand how one of these works". So
 * there is one question on screen at a time, no settings, and nothing to configure.
 * The modelling underneath is the same engine at full strength; none of it surfaces.
 *
 * Every consequence is computed by running the model with and without the choice. The
 * writing frames each decision; it never states an outcome. If the fixture changes,
 * the sentences follow it, and they cannot drift from the arithmetic.
 */

const M = FIXTURE;

type Option = {
  /** null is the do-nothing branch, which is a real answer and stays available. */
  iv: string | null;
  label: string;
  price: string;
  why: string;
};
type Decision = { id: string; when: string; question: string; setup: string; options: Option[] };

const DECISIONS: Decision[] = [
  {
    id: 'd1',
    when: 'February',
    question: 'Implementation cannot absorb the year in front of it.',
    setup:
      'Fifty people, and the work arriving needs closer to sixty. Ten more are already approved, but recruiting takes five months, so they land in June and the problem starts now.',
    options: [
      { iv: 'intervention-expedite-implementation', label: 'Pull the hires forward', price: '$120K',
        why: 'Agency sourcing and a signing bonus. Five months becomes three.' },
      { iv: 'intervention-reallocate-to-implementation', label: 'Move five people across', price: '$150K',
        why: 'Account people cross-train and move within a month. Faster than hiring, and they come from somewhere.' },
      { iv: null, label: 'Live with it', price: 'nothing',
        why: 'Run the team hot and deal with what breaks.' },
    ],
  },
  {
    id: 'd2',
    when: 'March',
    question: 'Two programmes are drawing on the same engineers.',
    setup:
      'Platform Scale and Enterprise Growth both staff out of Platform Engineering and Data Platform, and Data Platform is the tightest team in the company.',
    options: [
      { iv: 'intervention-stretch-platform', label: 'Run Platform Scale leaner', price: 'nothing',
        why: 'Thirty percent fewer people on it, running half again as long. It lands later and earns a little less.' },
      { iv: 'intervention-crash-enterprise', label: 'Crash Enterprise Growth', price: '$400K',
        why: 'Forty percent more people for a shorter run, on contractors. It lands sooner and it strains the teams doing it.' },
      { iv: null, label: 'Leave both as planned', price: 'nothing',
        why: 'The schedule stands.' },
    ],
  },
  {
    id: 'd3',
    when: 'Mid-year',
    question: 'Consumer Operations is the next one to go.',
    setup:
      'A hundred and fifty people against four hundred thousand cases, and twelve more already approved to start in May. The question is whether you still want them.',
    options: [
      { iv: 'intervention-automate-consumer', label: 'Buy the self-service tool', price: '$1.2M',
        why: 'Auto-resolution for the commonest case types. Three months before it touches anything.' },
      { iv: 'intervention-cancel-self-service', label: 'Cancel the portal project', price: 'nothing',
        why: 'Drop it and give two teams their people back. You lose what it was going to earn.' },
      { iv: null, label: 'Hire the twelve', price: 'nothing',
        why: 'Keep the plan as written.' },
    ],
  },
  {
    id: 'd4',
    when: 'Q3',
    question: 'The portfolio is bigger than the year.',
    setup:
      'Four programmes, all committed, all staffed from teams that are already tight. You do not have to drop one to take pressure off.',
    options: [
      { iv: 'intervention-half-portal', label: 'Ship half the portal', price: 'nothing',
        why: 'Build the half that handles the commonest cases. Half the people on it, half the return.' },
      { iv: 'intervention-core-markets-only', label: 'Three markets, not five', price: 'nothing',
        why: 'International Expansion at sixty percent of its scope, and sixty percent of its upside.' },
      { iv: null, label: 'Keep the full scope', price: 'nothing',
        why: 'Everything ships as written, and everyone stays busy.' },
    ],
  },
  {
    id: 'd5',
    when: 'The last call',
    question: 'One more move before the year closes.',
    setup:
      'International Expansion is the biggest thing left, staffed out of four teams that are all running tight.',
    options: [
      { iv: 'intervention-defer-international', label: 'Defer it three months', price: 'nothing',
        why: 'Push the start out and give those four teams some air.' },
      { iv: 'intervention-expedite-implementation', label: 'Pull the Implementation hires in', price: '$120K',
        why: 'If you have not already, buying three months of lead time still helps the team that broke first.' },
      { iv: null, label: 'Hold the line', price: 'nothing',
        why: 'Change nothing else and take the year as it stands.' },
    ],
  },
];
/*
 * Cost, scope and time: where a run has put you, and how it got there.
 *
 * Each axis scores how much of that dimension survived your decisions, normalised over
 * what is actually reachable in this model rather than over an invented scale. The point
 * is the weighted centre of the three, so protecting everything sits in the middle and
 * every trade pulls it toward a corner. Doing nothing scores 1/1/1 and sits dead centre,
 * which is the honest reading of doing nothing.
 */
const AXIS_RANGE = { spendMax: 1_870_000, valueMin: 68_400_000, valueMax: 92_000_000, lateMin: 9, lateMax: 13 };

export type TriPos = { x: number; y: number; cost: number; scope: number; time: number };

export function triangleOf(r: ModelResult): TriPos {
  const spend = r.financials.monthly.reduce((a, m) => a + m.changeCostUsd, 0);
  const late = r.initiatives.reduce((a, i) => a + (i.delayMonths ?? 0), 0);
  const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const cost = clamp(1 - spend / AXIS_RANGE.spendMax);
  const scope = clamp((r.summary.portfolioValueUsd - AXIS_RANGE.valueMin) / (AXIS_RANGE.valueMax - AXIS_RANGE.valueMin));
  const time = clamp(1 - (late - AXIS_RANGE.lateMin) / (AXIS_RANGE.lateMax - AXIS_RANGE.lateMin));
  const sum = cost + scope + time || 1;
  // cost at the apex, scope bottom-left, time bottom-right
  const x = (cost * 0.5 + scope * 0 + time * 1) / sum;
  const y = (cost * 0 + scope * 1 + time * 1) / sum;
  return { x, y, cost, scope, time };
}

/** Pixel geometry for the drawn triangle. */
const TW = 168, TH = 146, PAD = 15;
const px = (p: TriPos) => ({ cx: PAD + p.x * (TW - PAD * 2), cy: PAD + p.y * (TH - PAD * 2) });

function Triangle({ trail, cloud, size = 1 }: { trail: TriPos[]; cloud?: TriPos[]; size?: number }) {
  const here = trail[trail.length - 1];
  const w = TW * size, h = TH * size;
  const apex = `${PAD + 0.5 * (TW - PAD * 2)},${PAD}`;
  const bl = `${PAD},${TH - PAD}`;
  const br = `${TW - PAD},${TH - PAD}`;
  return (
    <svg className="rb-tri" width={w} height={h} viewBox={`0 0 ${TW} ${TH}`} role="img"
         aria-label={`Cost ${pct(here.cost)}, scope ${pct(here.scope)}, schedule ${pct(here.time)} of what this model can protect.`}>
      <polygon points={`${apex} ${br} ${bl}`} className="tri-face" />
      {cloud?.map((p, i) => { const q = px(p); return <circle key={i} cx={q.cx} cy={q.cy} r={1.6} className="tri-cloud" />; })}
      {trail.length > 1 && (
        <polyline className="tri-trail"
          points={trail.map((p) => { const q = px(p); return `${q.cx},${q.cy}`; }).join(' ')} />
      )}
      {trail.slice(0, -1).map((p, i) => { const q = px(p); return <circle key={i} cx={q.cx} cy={q.cy} r={2.4} className="tri-was" />; })}
      <circle cx={px(here).cx} cy={px(here).cy} r={4.6} className="tri-now" />
      <text x={PAD + 0.5 * (TW - PAD * 2)} y={PAD - 5} className="tri-lab" textAnchor="middle">COST</text>
      <text x={PAD - 3} y={TH - PAD + 11} className="tri-lab" textAnchor="start">SCOPE</text>
      <text x={TW - PAD + 3} y={TH - PAD + 11} className="tri-lab" textAnchor="end">TIME</text>
    </svg>
  );
}

const pct = (n: number) => Math.round(n * 100) + '%';
/** "a", "a and b", "a, b and c". Joining three names with two "and"s reads like a list
    nobody proofread. */
const list = (xs: string[]) =>
  xs.length < 3 ? xs.join(' and ') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1];
const mUsd = (n: number) => '$' + (n / 1e6).toFixed(2) + 'M';

/** One grammar for every team: a bar, and the line it should not cross. */
function TeamBars({ result, highlight }: { result: ModelResult; highlight?: string[] }) {
  return (
    <ul className="rb-teams">
      {result.teams.map((t) => {
        const team = M.teams.find((x) => x.id === t.teamId)!;
        const u = t.peakUtilization;
        const cap = t.months[0].targetUtilization;
        const state = u > cap ? 'over' : u > cap - 0.06 ? 'near' : 'ok';
        return (
          <li key={t.teamId} className={'rb-team s-' + state + (highlight?.includes(t.teamId) ? ' lit' : '')}>
            <span className="rb-name">{team.name}</span>
            <span className="rb-track">
              <i style={{ width: Math.min(100, u * 100) + '%' }} />
              <b style={{ left: cap * 100 + '%' }} />
            </span>
            <span className="rb-pct">{pct(u)}</span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * What the strain is doing to the odds. The engine computes this already: a team running
 * short lifts the chance the work it is staffing misses, as 1-(1-p)(1-shortfall). Showing
 * it beats adding a dice roll, which would be the only invented number on the page.
 */
function InitiativeRisk({ result }: { result: ModelResult }) {
  const named = (id: string) => M.initiatives.find((i) => i.id === id)?.name ?? id;
  const items = [...result.exposure.items].sort((a, b) => b.exposureUsd - a.exposureUsd);
  return (
    <ul className="rb-risks">
      {items.map((e) => {
        const added = e.effectiveProbability - e.baseProbability;
        return (
          <li key={e.initiativeId} className={added > 0.05 ? 'hot' : ''}>
            <span className="rb-rname">{named(e.initiativeId)}</span>
            <span className="rb-rodds">
              {pct(e.baseProbability)}
              {added > 0.005 && <i> &rarr; {pct(e.effectiveProbability)}</i>}
            </span>
            <span className="rb-rcash">{mUsd(e.exposureUsd)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function Kpis({ result, prev }: { result: ModelResult; prev?: ModelResult }) {
  const s = result.summary;
  const p = prev?.summary;
  const cell = (label: string, value: string, delta?: number, goodIsDown = true) => {
    const dir = delta === undefined || Math.abs(delta) < 0.005 ? '' : delta < 0 === goodIsDown ? ' up' : ' down';
    return (
      <div className={'rb-kpi' + dir} key={label}>
        <b>{value}</b>
        <span>{label}</span>
      </div>
    );
  };
  return (
    <div className="rb-kpis">
      {cell('Teams over capacity', String(s.teamsConstrained), p && s.teamsConstrained - p.teamsConstrained)}
      {cell('People, year end', String(Math.round(s.endingFte)), p && s.endingFte - p.endingFte)}
      {cell('Revenue at risk', mUsd(s.revenueExposureUsd), p && s.revenueExposureUsd - p.revenueExposureUsd)}
      {cell('Spent on changes', mUsd(changeSpend(result)), undefined)}
    </div>
  );
}

/** What the decisions cost, as opposed to what running the company costs. */
function changeSpend(r: ModelResult): number {
  return r.financials.monthly.reduce((a, m) => a + m.changeCostUsd, 0);
}

/** Said in sentences, computed from the two runs. Never authored. */
function consequence(before: ModelResult, after: ModelResult): string[] {
  const out: string[] = [];
  const moved = after.teams
    .map((t, i) => ({
      name: M.teams.find((x) => x.id === t.teamId)!.name,
      d: (t.peakUtilization - before.teams[i].peakUtilization) * 100,
    }))
    .filter((x) => Math.abs(x.d) > 0.4);
  const better = moved.filter((m) => m.d < 0);
  const worse = moved.filter((m) => m.d > 0);

  if (better.length) out.push(`${list(better.map((b) => b.name))} came down.`);
  if (worse.length) out.push(`${list(worse.map((b) => b.name))} went up, which is where those people came from.`);
  // "Nothing moved" was being said about team load and then immediately contradicted by a
  // line about money. It is specific now, and the no-change-at-all case is decided at the
  // end, once everything else has had its say.
  if (!moved.length) out.push('No team\u2019s load changed.');

  const dOver = after.summary.teamsConstrained - before.summary.teamsConstrained;
  if (dOver > 0) out.push(`Teams over capacity went from ${before.summary.teamsConstrained} to ${after.summary.teamsConstrained}: you fixed one and started another.`);
  if (dOver < 0) out.push(`Teams over capacity: ${before.summary.teamsConstrained} down to ${after.summary.teamsConstrained}.`);

  const dFte = Math.round(after.summary.endingFte) - Math.round(before.summary.endingFte);
  if (dFte < 0) out.push(`${-dFte} fewer people at year end, because the work behind ${after.summary.hiresDroppedFte} of the approved hires went away.`);

  const dRisk = after.summary.revenueExposureUsd - before.summary.revenueExposureUsd;
  if (Math.abs(dRisk) > 50000) out.push(`Revenue at risk ${dRisk < 0 ? 'falls' : 'rises'} to ${mUsd(after.summary.revenueExposureUsd)}.`);

  return out.length === 1 && !moved.length ? ['Nothing changed. That is an answer too.'] : out;
}

/**
 * Every ending reachable from these decisions. 3^5 runs of the engine, computed once and
 * held, so the scorecard can show where your year sits among the years you did not have.
 */
let REACHABLE: TriPos[] | null = null;
function reachable(): TriPos[] {
  if (REACHABLE) return REACHABLE;
  const out: TriPos[] = [];
  const walk = (i: number, picked: string[]) => {
    if (i === DECISIONS.length) { out.push(triangleOf(run(M, { interventions: picked }))); return; }
    for (const o of DECISIONS[i].options) {
      walk(i + 1, o.iv && !picked.includes(o.iv) ? [...picked, o.iv] : picked);
    }
  };
  walk(0, []);
  REACHABLE = out;
  return out;
}

export function Run() {
  const [started, setStarted] = useState(false);
  const [picks, setPicks] = useState<(string | null)[]>([]);
  const [preview, setPreview] = useState<string | null | undefined>(undefined);

  const chosen = picks.filter((p): p is string => !!p);
  const step = picks.length;
  const done = step >= DECISIONS.length;

  const current = useMemo(() => run(M, { interventions: chosen }), [chosen.join('|')]);
  const doNothing = useMemo(() => run(M), []);
  const previous = useMemo(
    () => run(M, { interventions: picks.slice(0, -1).filter((p): p is string => !!p) }),
    [picks.length, chosen.join('|')],
  );

  const previewResult = useMemo(
    () => (preview === undefined ? null : run(M, { interventions: preview ? [...chosen, preview] : chosen })),
    [preview, chosen.join('|')],
  );

  const shown = previewResult ?? current;

  /* One position per state the run has been in, ending on whatever is on screen now,
     so hovering a choice moves the marker before you commit to it. */
  const trail = useMemo(() => {
    const steps: TriPos[] = [];
    for (let i = 0; i <= picks.length; i++) {
      steps.push(triangleOf(run(M, { interventions: picks.slice(0, i).filter((p): p is string => !!p) })));
    }
    if (previewResult) steps.push(triangleOf(previewResult));
    return steps;
  }, [picks.join('|'), preview]);
  const triNow = trail[trail.length - 1];
  const d = DECISIONS[Math.min(step, DECISIONS.length - 1)];
  const lastLines = step > 0 && !done ? consequence(previous, current) : [];

  return (
    <main className="runv">
      {/* Sticky, and the same shape on every screen of the run. The triangle keeps its
          trail so you can see the path your decisions took, not just where they left you. */}
      <header className="rb-dash">
        <div className="rb-dash-in">
          <div className="rb-dash-id">
            <b>Atlas Systems</b>
            <span>2027 &middot; fictional company, real arithmetic</span>
            <div className="rb-dots" aria-label={`Decision ${Math.min(step + 1, DECISIONS.length)} of ${DECISIONS.length}`}>
              {DECISIONS.map((dd, i) => (
                <i key={dd.id} className={i < step ? 'done' : i === step ? 'now' : ''} />
              ))}
            </div>
          </div>
          <div className="rb-dash-tri">
            <Triangle trail={trail} />
            <ul className="rb-tri-read">
              <li><b>{pct(triNow.cost)}</b><span>budget kept</span></li>
              <li><b>{pct(triNow.scope)}</b><span>scope kept</span></li>
              <li><b>{pct(triNow.time)}</b><span>schedule kept</span></li>
            </ul>
          </div>
          <Kpis result={shown} prev={previewResult ? current : undefined} />
        </div>
      </header>

      <div className={'rb-body' + (started ? '' : ' solo')}>
        <section className="rb-ask">
          {!started ? (
            <>
              <span className="rb-when">Before you start</span>
              <h1>One decision, followed all the way through.</h1>
              <p className="rb-setup">This is a year of one company's plan. Before you run it,
                 here is what the model does with a single choice: a support tool, the team it
                 helps, the teams downstream of that team, the hire it makes unnecessary, and
                 what that is worth. Then you make five calls of your own.</p>
              <figure className="rb-intro">
                <iframe src="/simulator-flow.html?embed=1" loading="eager"
                        title="One efficiency followed from the tool that buys it to the money it frees" />
              </figure>
              <div className="rb-opts">
                <button className="rb-opt rb-go" onClick={() => setStarted(true)}>
                  <b>Start the year &rarr;</b>
                  <span>Five decisions. Nothing to configure, and no way to lose.</span>
                </button>
              </div>
            </>
          ) : !done ? (
            <>
              <span className="rb-when">{d.when} &middot; decision {step + 1} of {DECISIONS.length}</span>
              <h1>{d.question}</h1>
              <p className="rb-setup">{d.setup}</p>

              {lastLines.length > 0 && (
                <div className="rb-result">
                  <span>What your last call did</span>
                  {lastLines.map((l) => <p key={l}>{l}</p>)}
                </div>
              )}

              <div className="rb-opts">
                {d.options.map((o) => {
                  const spent = !!o.iv && chosen.includes(o.iv);
                  return (
                    <button
                      key={o.label}
                      className={'rb-opt' + (spent ? ' spent' : '')}
                      disabled={spent}
                      onMouseEnter={() => !spent && setPreview(o.iv)}
                      onMouseLeave={() => setPreview(undefined)}
                      onFocus={() => !spent && setPreview(o.iv)}
                      onBlur={() => setPreview(undefined)}
                      onClick={() => { setPreview(undefined); setPicks([...picks, o.iv]); }}
                    >
                      <b>{o.label}</b>
                      <em>{spent ? 'already done' : o.price}</em>
                      <span>{spent ? 'You made this call earlier in the year.' : o.why}</span>
                    </button>
                  );
                })}
              </div>
              <p className="rb-hint">Hover a choice to see the board move before you commit.</p>
            </>
          ) : (
            <Scorecard picks={picks} result={current} doNothing={doNothing} trail={trail} onReset={() => setPicks([])} />
          )}
        </section>

        {started && <section className="rb-board">
          <span className="rb-board-h">Every team, at its busiest month</span>
          <TeamBars result={shown} />
          <p className="rb-legend">The mark on each bar is what that team can sustain. Past it, someone is working late all year.</p>
          <span className="rb-board-h" style={{ marginTop: 20 }}>What that puts at risk</span>
          <InitiativeRisk result={shown} />
          <p className="rb-legend">Every programme can miss on its own. A team running short makes it likelier, and the money is what that costs.</p>
        </section>}
      </div>
    </main>
  );
}

/**
 * The year you actually ran, played back.
 *
 * The opening animation is a fixed story, because it has to be: it runs before you have
 * made a decision. This one is yours. Every frame is a real engine state, one per call
 * you made, and the captions are the same computed sentences the run showed you at the
 * time. Nothing here is authored per path.
 */
function Replay({ picks, trail }: { picks: (string | null)[]; trail: TriPos[] }) {
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(true);

  const states = useMemo(() => {
    const out: ModelResult[] = [];
    for (let i = 0; i <= picks.length; i++) {
      out.push(run(M, { interventions: picks.slice(0, i).filter((p): p is string => !!p) }));
    }
    return out;
  }, [picks.join('|')]);

  useEffect(() => {
    if (!playing) return;
    if (at >= states.length - 1) { setPlaying(false); return; }
    const t = setTimeout(() => setAt((i) => i + 1), at === 0 ? 1400 : 2600);
    return () => clearTimeout(t);
  }, [at, playing, states.length]);

  const chosenAt = (i: number) => {
    const d = DECISIONS[i];
    const iv = picks[i];
    return d.options.find((o) => o.iv === iv) ?? d.options[d.options.length - 1];
  };
  const lines = at > 0 ? consequence(states[at - 1], states[at]) : [];
  const head = at === 0
    ? { when: 'January', what: 'The plan as written' }
    : { when: DECISIONS[at - 1].when, what: chosenAt(at - 1).label };

  return (
    <div className="rb-replay">
      <div className="rb-replay-top">
        <div>
          <span className="rb-when">{head.when}</span>
          <p className="rb-replay-what">{head.what}</p>
        </div>
        <div className="rb-replay-ctl">
          {states.map((_, i) => (
            <button key={i} className={'rb-step' + (i === at ? ' on' : i < at ? ' past' : '')}
                    aria-label={`Step ${i + 1}`}
                    onClick={() => { setPlaying(false); setAt(i); }} />
          ))}
          <button className="rb-replay-play"
                  onClick={() => { if (at >= states.length - 1) setAt(0); setPlaying((p) => !p); }}>
            {playing ? 'Pause' : at >= states.length - 1 ? 'Replay' : 'Play'}
          </button>
        </div>
      </div>
      <div className="rb-replay-body">
        <TeamBars result={states[at]} />
        <div className="rb-replay-side">
          <Triangle trail={trail.slice(0, at + 1)} size={1.1} />
          <ul className="rb-replay-kpi">
            <li><b>{states[at].summary.teamsConstrained}</b><span>over capacity</span></li>
            <li><b>{Math.round(states[at].summary.endingFte)}</b><span>people</span></li>
            <li><b>{mUsd(states[at].summary.revenueExposureUsd)}</b><span>at risk</span></li>
          </ul>
        </div>
      </div>
      <div className="rb-replay-say">
        {lines.length ? lines.map((l) => <p key={l}>{l}</p>) : <p className="dim">Eight teams, four programmes, and nothing decided yet.</p>}
      </div>
    </div>
  );
}

function Scorecard({ picks, result, doNothing, onReset, trail }:
  { picks: (string | null)[]; result: ModelResult; doNothing: ModelResult; onReset: () => void; trail: TriPos[] }) {
  const s = result.summary, n = doNothing.summary;
  const spent = changeSpend(result);
  const took = picks.filter(Boolean).length;

  /* No win state. The run is read back as what it protected and what that cost. */
  const riskCut = n.revenueExposureUsd - s.revenueExposureUsd;
  const capBetter = n.teamsConstrained - s.teamsConstrained;
  const verdict =
    took === 0 ? 'You changed nothing, which is the cheapest year available and leaves every constraint exactly where it was.'
    : capBetter > 0 && riskCut > 0 ? 'You bought capacity and revenue protection, and you paid for both.'
    : capBetter < 0 ? 'You protected revenue by moving people, and left more teams over capacity than you started with. That is a real trade, not a mistake.'
    : riskCut > 0 ? 'You protected revenue without fixing the capacity picture.'
    : 'You spent money and the constraints stayed where they were.';

  return (
    <>
      <span className="rb-when">The year, as you ran it</span>
      <h1>{verdict}</h1>
      <Replay picks={picks} trail={trail} />
      <div className="rb-final">
        <Triangle trail={trail} cloud={reachable()} size={1.55} />
        <div>
          <p className="rb-final-h">Every year you could have had</p>
          <p className="rb-setup">Each faint mark is one of the {reachable().length} ways these five
             decisions could have gone. Yours is the filled one, and the line is how it got there.
             Nothing sits in the middle of all three corners, because nothing protects
             budget, scope and schedule at once.</p>
        </div>
      </div>
      <table className="rb-score">
        <thead><tr><th></th><th>Doing nothing</th><th>Your run</th></tr></thead>
        <tbody>
          <tr><td>Teams over capacity</td><td>{n.teamsConstrained}</td><td>{s.teamsConstrained}</td></tr>
          <tr><td>People at year end</td><td>{Math.round(n.endingFte)}</td><td>{Math.round(s.endingFte)}</td></tr>
          <tr><td>Revenue at risk</td><td>{mUsd(n.revenueExposureUsd)}</td><td>{mUsd(s.revenueExposureUsd)}</td></tr>
          <tr><td>Spent on changes</td><td>{mUsd(0)}</td><td>{mUsd(spent)}</td></tr>
        </tbody>
      </table>
      <p className="rb-setup">
        {s.hiresDroppedFte > 0
          ? `${s.hiresDroppedFte} approved hires were never made, because the work behind them stopped existing.`
          : 'Every approved hire still happened; nothing you did removed the work behind one.'}
      </p>
      <div className="rb-opts">
        <button className="rb-opt" onClick={onReset}><b>Run it again</b><span>Different calls, different year.</span></button>
        <a className="rb-opt" href="#/model"><b>Open the full model</b><span>Every team, month, scenario and assumption behind this.</span></a>
      </div>
    </>
  );
}
