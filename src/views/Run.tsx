import { useMemo, useState } from 'react';
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
  if (!moved.length) out.push('Nothing moved.');

  const dOver = after.summary.teamsConstrained - before.summary.teamsConstrained;
  if (dOver > 0) out.push(`Teams over capacity went from ${before.summary.teamsConstrained} to ${after.summary.teamsConstrained}: you fixed one and started another.`);
  if (dOver < 0) out.push(`Teams over capacity: ${before.summary.teamsConstrained} down to ${after.summary.teamsConstrained}.`);

  const dFte = Math.round(after.summary.endingFte) - Math.round(before.summary.endingFte);
  if (dFte < 0) out.push(`${-dFte} fewer people at year end, because the work behind ${after.summary.hiresDroppedFte} of the approved hires went away.`);

  const dRisk = after.summary.revenueExposureUsd - before.summary.revenueExposureUsd;
  if (Math.abs(dRisk) > 50000) out.push(`Revenue at risk ${dRisk < 0 ? 'falls' : 'rises'} to ${mUsd(after.summary.revenueExposureUsd)}.`);

  return out;
}

export function Run() {
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
  const d = DECISIONS[Math.min(step, DECISIONS.length - 1)];
  const lastLines = step > 0 && !done ? consequence(previous, current) : [];

  return (
    <main className="runv">
      <header className="rb-head">
        <div>
          <b>Atlas Systems</b>
          <span>2027 &middot; a fictional company, real arithmetic</span>
        </div>
        <a className="rb-exit" href="#/">The full model &rarr;</a>
      </header>

      <Kpis result={shown} prev={previewResult ? current : undefined} />

      <div className="rb-body">
        <section className="rb-ask">
          {!done ? (
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
            <Scorecard picks={picks} result={current} doNothing={doNothing} onReset={() => setPicks([])} />
          )}
        </section>

        <section className="rb-board">
          <span className="rb-board-h">Every team, at its busiest month</span>
          <TeamBars result={shown} />
          <p className="rb-legend">The mark on each bar is what that team can sustain. Past it, someone is working late all year.</p>
          <span className="rb-board-h" style={{ marginTop: 20 }}>What that puts at risk</span>
          <InitiativeRisk result={shown} />
          <p className="rb-legend">Every programme can miss on its own. A team running short makes it likelier, and the money is what that costs.</p>
        </section>
      </div>
    </main>
  );
}

function Scorecard({ picks, result, doNothing, onReset }:
  { picks: (string | null)[]; result: ModelResult; doNothing: ModelResult; onReset: () => void }) {
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
        <a className="rb-opt" href="#/"><b>Open the full model</b><span>Every team, month, scenario and assumption behind this.</span></a>
      </div>
    </>
  );
}
