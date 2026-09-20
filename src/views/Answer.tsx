import { useMemo, useState } from 'react';
import { run } from '../engine';
import { FIXTURE } from '../state/store';
import type { ModelResult } from '../models/results';
import { DECISIONS, mUsd } from './Run';

/**
 * The short version, for anyone who does not want to play.
 *
 * It was tempting to write "the decisions that reach the optimal outcome". There is no
 * such list. Ranking all 243 paths against six different objectives produces six
 * different winners with no overlap at all, and every one of them is bad at something
 * the others protect. So the page asks what you are protecting first, and only then has
 * an answer, which is the actual lesson and not a way around it.
 *
 * Every path, ranking and figure here is computed from the model at render time.
 */

const M = FIXTURE;

type Objective = {
  id: string;
  label: string;
  /** Who tends to walk in with this one. Rough, and said as rough. */
  who: string;
  /** Lower is better. */
  score: (r: ModelResult) => number;
  read: (r: ModelResult) => string;
};

const strain = (r: ModelResult) =>
  r.teams.reduce((a, t) => a + t.months.filter((m) => m.utilization > m.targetUtilization).length, 0);
const spend = (r: ModelResult) => r.financials.monthly.reduce((a, m) => a + m.changeCostUsd, 0);
const lateness = (r: ModelResult) => r.initiatives.reduce((a, i) => a + (i.delayMonths ?? 0), 0);

const OBJECTIVES: Objective[] = [
  { id: 'revenue', label: 'Revenue', who: 'a sales or GTM organisation',
    score: (r) => r.summary.revenueExposureUsd,
    read: (r) => `${mUsd(r.summary.revenueExposureUsd)} of revenue still at risk` },
  { id: 'people', label: 'Your people', who: 'anyone who has watched a team burn out',
    score: strain,
    read: (r) => `${strain(r)} team-months over capacity, and ${Math.round(r.summary.peopleLostToAttrition)} people gone by December` },
  { id: 'retention', label: 'Keeping people', who: 'anywhere the job market is the constraint',
    score: (r) => -r.summary.retentionRate,
    // One decimal, because the spread between the best and worst path here is under a
    // point and whole percents made every answer read as "87% against 87%".
    read: (r) => `${(r.summary.retentionRate * 100).toFixed(1)}% of the people you started with, still there` },
  { id: 'headcount', label: 'Headcount', who: 'a company under a hiring freeze',
    score: (r) => r.summary.endingFte, read: (r) => `${Math.round(r.summary.endingFte)} people at year end` },
  { id: 'budget', label: 'The budget', who: 'a non-profit, or anyone with a hard cap',
    score: spend, read: (r) => `${mUsd(spend(r))} spent on changes` },
  { id: 'portfolio', label: 'What you promised', who: 'a product or delivery organisation',
    score: (r) => -r.summary.portfolioValueUsd,
    read: (r) => `${mUsd(r.summary.portfolioValueUsd)} of the portfolio delivered` },
  { id: 'schedule', label: 'The schedule', who: 'anyone who has committed to a date',
    score: lateness, read: (r) => `${lateness(r)} months of delay across the portfolio` },
];

type Path = { picks: (string | null)[]; result: ModelResult };

function allPaths(): Path[] {
  const out: Path[] = [];
  const walk = (i: number, ivs: string[], picks: (string | null)[]) => {
    if (i === DECISIONS.length) { out.push({ picks, result: run(M, { interventions: ivs }) }); return; }
    for (const o of DECISIONS[i].options) {
      walk(i + 1, o.iv && !ivs.includes(o.iv) ? [...ivs, o.iv] : ivs, [...picks, o.iv]);
    }
  };
  walk(0, [], []);
  return out;
}

export function Answer() {
  const [objId, setObjId] = useState(OBJECTIVES[0].id);
  const paths = useMemo(allPaths, []);
  const obj = OBJECTIVES.find((o) => o.id === objId)!;

  /* Ties break toward the cheaper path, then the kinder one. Without this, protecting
     the portfolio returned a plan that spent $1.72M to deliver exactly what doing nothing
     delivers, which is a true statement and a useless recommendation. */
  const rank = (o: Objective) => (a: Path, b: Path) =>
    o.score(a.result) - o.score(b.result)
    || spend(a.result) - spend(b.result)
    || strain(a.result) - strain(b.result);
  const best = useMemo(() => [...paths].sort(rank(obj))[0], [paths, objId]);

  /* Counted rather than claimed. The copy used to say "seven different winners" and that
     was simply wrong: two objectives share an answer, which is worth saying out loud. */
  const winners = useMemo(() => {
    const keys = OBJECTIVES.map((o) => [...paths].sort(rank(o))[0].picks.join('|'));
    return { distinct: new Set(keys).size, total: OBJECTIVES.length };
  }, [paths]);
  const doNothing = useMemo(() => run(M), []);

  /* What this winner gives up. Said by comparing it against whoever wins the other
     objectives, because "it costs you something" is only worth reading with a number. */
  const costs = OBJECTIVES.filter((o) => o.id !== obj.id).map((o) => {
    const champ = [...paths].sort(rank(o))[0];
    return { o, mine: o.read(best.result), theirs: o.read(champ.result),
             worse: o.score(best.result) > o.score(champ.result) };
  }).filter((c) => c.worse);

  const label = (i: number) =>
    DECISIONS[i].options.find((o) => o.iv === best.picks[i])?.label
    ?? DECISIONS[i].options[DECISIONS[i].options.length - 1].label;

  return (
    <main className="answerv">
      <span className="rb-when">The short version</span>
      <h1>There is no best plan. There is a best plan for something.</h1>
      <p className="ans-lede">
        This model can run a year {paths.length} different ways. Ranked against {winners.total} things
        a company might be trying to protect, it produces <b>{winners.distinct} different sets of
        five decisions</b>. Every one of them is bad at something the others protect, and the only
        two that share an answer are the two you would expect: looking after your people and
        keeping them are the same five calls. So the useful question is the first one.
      </p>

      <p className="ans-ask">What are you protecting?</p>
      <div className="ans-picks">
        {OBJECTIVES.map((o) => (
          <button key={o.id} className={'ans-pick' + (o.id === objId ? ' on' : '')}
                  onClick={() => setObjId(o.id)}>
            <b>{o.label}</b><span>{o.who}</span>
          </button>
        ))}
      </div>

      <div className="ans-out">
        <p className="ans-h">The five calls that get you there</p>
        <ol className="ans-steps">
          {DECISIONS.map((d, i) => (
            <li key={d.id}><span>{d.when}</span><b>{label(i)}</b></li>
          ))}
        </ol>

        <p className="ans-h">What that buys</p>
        <p className="ans-body">
          {obj.score(best.result) === obj.score(doNothing) ? (
            <><b>{obj.read(best.result)}</b>, which is exactly what leaving the plan alone gets
              you. On this measure nothing here beats doing nothing
              {spend(best.result) > 0 ? `, and the cheapest way to tie still costs ${mUsd(spend(best.result))}.` : '.'}</>
          ) : (
            <><b>{obj.read(best.result)}</b>, against <b>{obj.read(doNothing)}</b> if you leave
              the plan alone. {spend(best.result) > 0
                ? `It costs ${mUsd(spend(best.result))} to get there.`
                : 'It costs nothing to get there, which is its own kind of answer.'}</>
          )}
        </p>

        {costs.length > 0 && (
          <>
            <p className="ans-h">What it costs you elsewhere</p>
            <ul className="ans-costs">
              {costs.map((c) => (
                <li key={c.o.id}>
                  <b>{c.o.label}.</b> You end on {c.mine}. The plan that protects this instead
                  ends on {c.theirs}.
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="ans-lesson">
        <p className="ans-h">The whole thing, in three lines</p>
        <ol>
          <li><b>Name what you are protecting before you look at options.</b> Seven objectives,
              six different answers, and nothing in this model tells you which objective is right.
              That part is a judgement, and it is the one that matters most.</li>
          <li><b>Every lever moves more than the thing you aimed it at.</b> Moving five people
              fixes one team and breaks another. Buying a tool cancels a hire nobody revisited.
              A model that cannot show you the second effect is not worth running.</li>
          <li><b>Some levers do nothing, and you want to know which.</b> Deferring the biggest
              programme here changes not one number, because a dependency had already moved it.
              Finding that out in a model costs an afternoon; finding out in the year costs the year.</li>
        </ol>
      </div>

      <div className="ans-go">
        <a className="rb-opt" href="#/"><b>Run it yourself &rarr;</b>
          <span>Five decisions, and see where you land against all {paths.length} endings.</span></a>
        <a className="rb-opt" href="#/model"><b>Open the full model</b>
          <span>Every team, month, scenario and assumption behind this.</span></a>
      </div>
    </main>
  );
}
