import { useMemo, useState } from 'react';
import { run } from '../engine';
import { FIXTURE } from '../state/store';
import type { ModelResult } from '../models/results';
import { DECISIONS, RUN_SCENARIO, mUsd } from './Run';
import { hours } from '../lib/format';

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
const shedByTeam = (r: ModelResult) => r.teams
  .map((t) => ({ id: t.teamId, hours: t.months.reduce((a, m) => a + m.shedHours, 0) }))
  .sort((a, b) => b.hours - a.hours);
const svcPct = (r: ModelResult) => Math.round((r.summary.serviceLevelPct ?? 1) * 100);

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
  { id: 'service', label: 'The customer', who: 'anyone whose queue is somebody waiting',
    score: (r) => -(r.summary.serviceLevelPct ?? 1),
    read: (r) => r.summary.serviceLevelPct === null ? 'no queueing work in this model'
      : `${(r.summary.serviceLevelPct * 100).toFixed(1)}% of requests picked up in time, worst month ${((r.summary.worstServiceLevel ?? 1) * 100).toFixed(0)}%` },
  { id: 'schedule', label: 'The schedule', who: 'anyone who has committed to a date',
    score: lateness, read: (r) => `${lateness(r)} months of delay across the portfolio` },
];

type Path = { picks: (string | null)[]; result: ModelResult };

/*
 * Every lever the run offers, applied on its own to the same year, ranked by how much
 * work it saves from never being done. The ranking is the whole argument and none of it
 * is authored: the levers that change how much work there is, or who is already there to
 * do it, beat the lever that adds people, because people approved in February arrive
 * after the spike has already happened.
 */
const LEVERS = (() => {
  const seen = new Map<string, string>();
  for (const d of DECISIONS) for (const o of d.options) if (o.iv && !seen.has(o.iv)) seen.set(o.iv, o.label);
  const rows = [...seen].map(([iv, label]) => ({ iv, label, r: run(M, { scenario: RUN_SCENARIO, interventions: [iv] }) }));
  rows.push({ iv: 'none', label: 'Leave the plan alone', r: run(M, { scenario: RUN_SCENARIO }) });
  /* Ties at the precision the reader is shown break toward the better answer rate. Two
     levers both saving 10.3k hours read as equally good until you notice one of them
     takes the queue from 42% to 33%, and a list that ranked it second was saying the
     opposite of what its own second column said. */
  return rows.sort((a, b) =>
    Math.round(a.r.summary.shedHours / 100) - Math.round(b.r.summary.shedHours / 100)
    || (b.r.summary.serviceLevelPct ?? 0) - (a.r.summary.serviceLevelPct ?? 0));
})();

function allPaths(): Path[] {
  const out: Path[] = [];
  const walk = (i: number, ivs: string[], picks: (string | null)[]) => {
    if (i === DECISIONS.length) { out.push({ picks, result: run(M, { scenario: RUN_SCENARIO, interventions: ivs }) }); return; }
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
    const groups = new Map<string, string[]>();
    OBJECTIVES.forEach((o) => {
      const k = [...paths].sort(rank(o))[0].picks.join('|');
      groups.set(k, [...(groups.get(k) ?? []), o.label.toLowerCase()]);
    });
    return {
      distinct: groups.size, total: OBJECTIVES.length,
      shared: [...groups.values()].filter((v) => v.length > 1),
    };
  }, [paths]);
  const doNothing = useMemo(() => run(M, { scenario: RUN_SCENARIO }), []);

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
        five decisions</b>. Every one of them is bad at something the others protect
        {winners.shared.length === 0
          ? ', and no two of them are the same plan'
          : `, and the only ones that share an answer are ${winners.shared.map((g) => g.join(' and ')).join('; ')}`}.
        So the useful question is the first one.
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

      {doNothing.summary.shedHours > 0 && (() => {
        const worst = shedByTeam(doNothing)[0];
        const worstName = M.teams.find((t) => t.id === worst.id)?.name ?? worst.id;
        const share = Math.round((worst.hours / doNothing.summary.shedHours) * 100);
        const best = LEVERS[0];
        const lev = (iv: string) => LEVERS.find((l) => l.iv === iv);
        const hire = lev('intervention-expedite-implementation');
        const move = lev('intervention-reallocate-to-implementation');
        const max = Math.max(...LEVERS.map((l) => l.r.summary.shedHours)) || 1;
        return (
          <div className="ans-levers">
            <p className="ans-h">Why the year answers to some calls and not others</p>
            <p className="ans-body">
              Demand steps up 30% in April. Leaving the plan alone ends the year
              with <b>{hours(doNothing.summary.shedHours)}</b> of work never done, and {share}% of
              that lands on one team: <b>{worstName}</b>. Every lever the run offers, each
              applied on its own to that same year:
            </p>
            <ol className="lev-rank">
              {LEVERS.map((l) => (
                <li key={l.iv} className={l.iv === best.iv ? 'top' : l.iv === 'none' ? 'nil' : ''}>
                  <span className="lev-name">{l.label}</span>
                  <span className="lev-track"><i style={{ width: (l.r.summary.shedHours / max) * 100 + '%' }} /></span>
                  <span className="lev-num">{hours(l.r.summary.shedHours)} undone</span>
                  <span className="lev-num">{svcPct(l.r)}% answered</span>
                </li>
              ))}
            </ol>
            <p className="ans-body">
              <b>{best.label}</b> takes work off {worstName} directly, and it is the only call
              that changes what the customer sees: {svcPct(best.r)}% of requests answered in
              time against {svcPct(doNothing)}% for leaving it alone.
              {hire && <> Pulling hires forward only saves {hours(doNothing.summary.shedHours - hire.r.summary.shedHours)},
                because it adds people to a team the spike did not land on.</>}
              {move && <> Moving people across saves about the same and takes the answer rate
                down to {svcPct(move.r)}%, because the people come out of a queue that was
                already answering somebody.</>}
            </p>
            <p className="ans-body">
              The lesson is not that tools beat people. It is that a response only works if it
              is pointed at the constraint, and the constraint is one team in one set of months.
              Knowing which team, before the year starts, is the whole job.
            </p>
          </div>
        );
      })()}

      <div className="ans-lesson">
        <p className="ans-h">The whole thing, in three lines</p>
        <ol>
          <li><b>Name what you are protecting before you look at options.</b> {winners.total} objectives,
              {' '}{winners.distinct} different answers, and nothing in this model tells you which objective
              is right. That part is a judgement, and it is the one that matters most.</li>
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
