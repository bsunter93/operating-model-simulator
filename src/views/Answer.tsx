import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import type { ModelResult } from '../models/results';
import type { OperatingModel, RunSpec } from '../models/types';
import type { Fmt } from '../lib/format';
import { Word, runWith, word } from './Run';

/**
 * The short version, for anyone who does not want to play.
 *
 * It was tempting to write "the decisions that reach the optimal outcome". There is no
 * such list. Ranking every path against each objective in turn produces a different
 * winner almost every time, and every one of them is bad at something the others protect.
 * So the page asks what you are protecting first, and only then has an answer, which is
 * the actual lesson and not a way around it.
 *
 * Every path, ranking, figure and count here is computed from the model at render time,
 * including the ones the prose talks about. Nothing is typed in, because everything typed
 * in went stale the first time the run changed underneath it.
 */

type Objective = {
  id: string;
  label: string;
  /** Who tends to walk in with this one. Rough, and said as rough. */
  who: string;
  /** Lower is better. */
  score: (r: ModelResult) => number;
  /* Takes the formatter, because what a figure reads as depends on the model's currency
     and there is no sensible default to fall back on. */
  read: (r: ModelResult, fmt: Fmt) => string;
};

const strain = (r: ModelResult) =>
  r.teams.reduce((a, t) => a + t.months.filter((m) => m.utilization > m.targetUtilization).length, 0);
const spend = (r: ModelResult) => r.financials.monthly.reduce((a, m) => a + m.changeCost, 0);
const lateness = (r: ModelResult) => r.initiatives.reduce((a, i) => a + (i.delayMonths ?? 0), 0);
const shedByTeam = (r: ModelResult) => r.teams
  .map((t) => ({ id: t.teamId, hours: t.months.reduce((a, m) => a + m.shedHours, 0) }))
  .sort((a, b) => b.hours - a.hours);
const svcPct = (r: ModelResult) => Math.round((r.summary.serviceLevelPct ?? 1) * 100);
const cash = (fmt: Fmt, n: number) => fmt.money(n, { precise: true });

const OBJECTIVES: Objective[] = [
  { id: 'revenue', label: 'Revenue', who: 'a sales or GTM organisation',
    score: (r) => r.summary.revenueExposure,
    read: (r, fmt) => `${cash(fmt, r.summary.revenueExposure)} of revenue still at risk` },
  { id: 'people', label: 'Your people', who: 'anyone who has watched a team burn out',
    score: strain,
    read: (r) => `${strain(r)} team-months over capacity, and ${Math.round(r.summary.peopleLostToAttrition)} people gone by year end` },
  { id: 'retention', label: 'Keeping people', who: 'anywhere the job market is the constraint',
    score: (r) => -r.summary.retentionRate,
    // One decimal, because the spread between the best and worst path here is under a
    // point and whole percents made every answer read as "87% against 87%".
    read: (r) => `${(r.summary.retentionRate * 100).toFixed(1)}% of the people you started with, still there` },
  { id: 'headcount', label: 'Headcount', who: 'a company under a hiring freeze',
    score: (r) => r.summary.endingFte, read: (r) => `${Math.round(r.summary.endingFte)} people at year end` },
  { id: 'budget', label: 'The budget', who: 'a non-profit, or anyone with a hard cap',
    score: spend, read: (r, fmt) => `${cash(fmt, spend(r))} spent on changes` },
  { id: 'portfolio', label: 'What you promised', who: 'a product or delivery organisation',
    score: (r) => -r.summary.portfolioValue,
    read: (r, fmt) => `${cash(fmt, r.summary.portfolioValue)} of the portfolio delivered` },
  { id: 'service', label: 'The customer', who: 'anyone whose queue is somebody waiting',
    score: (r) => -(r.summary.serviceLevelPct ?? 1),
    read: (r) => r.summary.serviceLevelPct === null ? 'no queueing work in this model'
      : `${(r.summary.serviceLevelPct * 100).toFixed(1)}% of requests picked up in time, worst month ${((r.summary.worstServiceLevel ?? 1) * 100).toFixed(0)}%` },
  { id: 'schedule', label: 'The schedule', who: 'anyone who has committed to a date',
    score: lateness, read: (r) => `${lateness(r)} months of delay across the portfolio` },
];

type Path = { picks: (string | null)[]; result: ModelResult };

export function Answer() {
  const { model } = useStore();
  return model.run && model.run.decisions.length > 0
    ? <AnswerFor model={model} spec={model.run} />
    : (
      <main className="answerv">
        <span className="rb-when">The short version</span>
        <h1>{model.name} does not carry a run.</h1>
        <p className="ans-lede">This page ranks the endings of a guided run against the things a
          company might be protecting. The model needs a run for there to be endings to rank.</p>
        <div className="ans-go">
          <a className="rb-opt" href="#/model"><b>Open the full model</b>
            <span>Every team, month, scenario and assumption behind this.</span></a>
        </div>
      </main>
    );
}

function AnswerFor({ model, spec }: { model: OperatingModel; spec: RunSpec }) {
  const { fmt } = useStore();
  const [objId, setObjId] = useState(OBJECTIVES[0].id);
  const obj = OBJECTIVES.find((o) => o.id === objId)!;

  const paths = useMemo(() => {
    const out: Path[] = [];
    const walk = (i: number, ivs: string[], picks: (string | null)[]) => {
      if (i === spec.decisions.length) { out.push({ picks, result: runWith(model, spec, ivs) }); return; }
      for (const o of spec.decisions[i].options) {
        walk(i + 1, o.interventionId && !ivs.includes(o.interventionId) ? [...ivs, o.interventionId] : ivs,
             [...picks, o.interventionId]);
      }
    };
    walk(0, [], []);
    return out;
  }, [model, spec]);

  const doNothing = useMemo(() => runWith(model, spec), [model, spec]);

  /*
   * Every lever the run offers, applied on its own to the same year, ranked by how much
   * work it saves from never being done. The ranking is the whole argument and none of it
   * is authored.
   */
  const levers = useMemo(() => {
    const seen = new Map<string, string>();
    for (const d of spec.decisions) {
      for (const o of d.options) if (o.interventionId && !seen.has(o.interventionId)) seen.set(o.interventionId, o.label);
    }
    const rows: { iv: string; label: string; type?: string; r: ModelResult }[] =
      [...seen].map(([iv, label]) => ({
        iv, label,
        type: model.interventions.find((x) => x.id === iv)?.type,
        r: runWith(model, spec, [iv]),
      }));
    rows.push({ iv: 'none', label: 'Leave the plan alone', type: undefined, r: doNothing });
    /* Ties at the precision the reader is shown break toward the better answer rate. Two
       levers both saving 10.3k hours read as equally good until you notice one of them
       takes the queue from 42% to 33%, and a list that ranked it second was saying the
       opposite of what its own second column said. */
    return rows.sort((a, b) =>
      Math.round(a.r.summary.shedHours / 100) - Math.round(b.r.summary.shedHours / 100)
      || (b.r.summary.serviceLevelPct ?? 0) - (a.r.summary.serviceLevelPct ?? 0));
  }, [model, spec, doNothing]);

  /* Ties break toward the cheaper path, then the kinder one. Without this, protecting
     the portfolio returned a plan that spent $1.72M to deliver exactly what doing nothing
     delivers, which is a true statement and a useless recommendation. */
  const rank = (o: Objective) => (a: Path, b: Path) =>
    o.score(a.result) - o.score(b.result)
    || spend(a.result) - spend(b.result)
    || strain(a.result) - strain(b.result);
  const best = useMemo(() => [...paths].sort(rank(obj))[0], [paths, objId]);

  /* Counted rather than claimed. The copy used to name which two objectives shared an
     answer; they stopped sharing one the day the run changed year, and the sentence went
     on saying it. */
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

  /* What this winner gives up. Said by comparing it against whoever wins the other
     objectives, because "it costs you something" is only worth reading with a number. */
  const costs = OBJECTIVES.filter((o) => o.id !== obj.id).map((o) => {
    const champ = [...paths].sort(rank(o))[0];
    return { o, mine: o.read(best.result, fmt), theirs: o.read(champ.result, fmt),
             worse: o.score(best.result) > o.score(champ.result) };
  }).filter((c) => c.worse);

  const label = (i: number) =>
    spec.decisions[i].options.find((o) => o.interventionId === best.picks[i])?.label
    ?? spec.decisions[i].options[spec.decisions[i].options.length - 1].label;

  const scenario = spec.scenarioId ? model.scenarios.find((s) => s.id === spec.scenarioId) : undefined;

  return (
    <main className="answerv">
      <span className="rb-when">The short version</span>
      <h1>There is no best plan. There is a best plan for something.</h1>
      <p className="ans-lede">
        This model can run a year {paths.length} different ways. Ranked against {winners.total} things
        a company might be trying to protect, it produces <b>{winners.distinct} different sets of
        {' '}{word(spec.decisions.length)} decisions</b>. Every one of them is bad at something the others protect
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
        <p className="ans-h">The {word(spec.decisions.length)} calls that get you there</p>
        <ol className="ans-steps">
          {spec.decisions.map((d, i) => (
            <li key={d.id}><span>{d.when}</span><b>{label(i)}</b></li>
          ))}
        </ol>

        <p className="ans-h">What that buys</p>
        <p className="ans-body">
          {obj.score(best.result) === obj.score(doNothing) ? (
            <><b>{obj.read(best.result, fmt)}</b>, which is exactly what leaving the plan alone gets
              you. On this measure nothing here beats doing nothing
              {spend(best.result) > 0 ? `, and the cheapest way to tie still costs ${cash(fmt, spend(best.result))}.` : '.'}</>
          ) : (
            <><b>{obj.read(best.result, fmt)}</b>, against <b>{obj.read(doNothing, fmt)}</b> if you leave
              the plan alone. {spend(best.result) > 0
                ? `It costs ${cash(fmt, spend(best.result))} to get there.`
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
        const worstName = model.teams.find((t) => t.id === worst.id)?.name ?? worst.id;
        const share = Math.round((worst.hours / doNothing.summary.shedHours) * 100);
        const top = levers[0];
        /* By what the lever does, not by its id. A model with different levers still gets
           the right sentence, and this stops the page naming ids that may not exist. */
        const byType = (...ts: string[]) => levers.find((l) => l.type && ts.includes(l.type));
        const hire = byType('expediteHiring', 'hire');
        const move = byType('reallocation');
        const max = Math.max(...levers.map((l) => l.r.summary.shedHours)) || 1;
        return (
          <div className="ans-levers">
            <p className="ans-h">Why the year answers to some calls and not others</p>
            <p className="ans-body">
              {scenario?.description ? <>{scenario.description} </> : null}
              Leaving the plan alone ends the year with <b>{fmt.hours(doNothing.summary.shedHours)}</b> of
              work never done, and {share}% of that lands on one team: <b>{worstName}</b>. Every
              lever the run offers, each applied on its own to that same year:
            </p>
            <ol className="lev-rank">
              {levers.map((l) => (
                <li key={l.iv} className={l.iv === top.iv ? 'top' : l.iv === 'none' ? 'nil' : ''}>
                  <span className="lev-name">{l.label}</span>
                  <span className="lev-track"><i style={{ width: (l.r.summary.shedHours / max) * 100 + '%' }} /></span>
                  <span className="lev-num">{fmt.hours(l.r.summary.shedHours)} undone</span>
                  <span className="lev-num">{svcPct(l.r)}% answered</span>
                </li>
              ))}
            </ol>
            <p className="ans-body">
              <b>{top.label}</b> takes work off {worstName} directly, and it is the only call
              that changes what the customer sees: {svcPct(top.r)}% of requests answered in
              time against {svcPct(doNothing)}% for leaving it alone.
              {hire && hire.iv !== top.iv && <> Pulling hires forward only
                saves {fmt.hours(doNothing.summary.shedHours - hire.r.summary.shedHours)}, because it adds
                people to a team the pressure did not land on.</>}
              {move && move.iv !== top.iv && <> Moving people across takes the answer rate
                to {svcPct(move.r)}%, because the people come out of a queue that was already
                answering somebody.</>}
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
          <li><b>Some levers do nothing, and you want to know which.</b> At least one call here
              changes not a single number, because a dependency had already moved the thing it
              was aimed at. Finding that out in a model costs an afternoon; finding out in the
              year costs the year.</li>
        </ol>
      </div>

      <div className="ans-go">
        <a className="rb-opt" href="#/"><b>Run it yourself &rarr;</b>
          <span>{Word(spec.decisions.length)} decisions, and see where you land against all {paths.length} endings.</span></a>
        <a className="rb-opt" href="#/model"><b>Open the full model</b>
          <span>Every team, month, scenario and assumption behind this.</span></a>
      </div>
    </main>
  );
}
