import { useEffect, useMemo, useState } from 'react';
import { monthIndex, run } from '../engine';
import { useStore } from '../state/store';
import type { ModelResult } from '../models/results';
import type { OperatingModel, RunDecision, RunSpec } from '../models/types';
import type { Fmt } from '../lib/format';
import { OBJECTIVES, rankAmong, type Objective } from '../lib/objectives';
import { RUN_WORLDS } from '../data/templates';
import { bindingConstraints, type Binding } from '../lib/constraint';

/**
 * The run: five decisions, and whatever they add up to.
 *
 * This view exists because the board next door answers "what can this model do", and
 * the question worth answering is "do you now understand how one of these works". So
 * there is one question on screen at a time, no settings, and nothing to configure.
 * The modelling underneath is the same engine at full strength; none of it surfaces.
 *
 * Nothing here is written against a particular set of numbers. The decisions, the year
 * they are played on and the explainer all come from the model, and every consequence is
 * computed by running that model with and without the choice. The writing frames each
 * decision; it never states an outcome. Load a different model and this page is that
 * model's run, or tells you it has not got one.
 */

export const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_LONG = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];

export const runWith = (model: OperatingModel, spec: RunSpec, interventions: string[] = []) =>
  run(model, { scenario: spec.scenarioId, interventions });

/**
 * Every ending the decisions can reach. One engine run each, and the whole of the rest
 * of this file is measured against the set: it is the cloud behind the triangle, and it
 * is what the triangle is calibrated on.
 */
export function allEndings(model: OperatingModel, spec: RunSpec): ModelResult[] {
  const out: ModelResult[] = [];
  const walk = (i: number, picked: string[]) => {
    if (i === spec.decisions.length) { out.push(runWith(model, spec, picked)); return; }
    for (const o of spec.decisions[i].options) {
      walk(i + 1, o.interventionId && !picked.includes(o.interventionId)
        ? [...picked, o.interventionId] : picked);
    }
  };
  walk(0, []);
  return out;
}

/*
 * Cost, scope and time: where a run has put you, and how it got there.
 *
 * Each axis scores how much of that dimension survived your decisions, normalised over
 * what is actually reachable in this model rather than over an invented scale. The point
 * is the weighted centre of the three, so protecting everything sits in the middle and
 * every trade pulls it toward a corner.
 *
 * The bounds are measured from the endings, not typed in. They used to be four constants
 * calibrated by hand against one fixture, which meant any other model drew positions that
 * clamped silently at a corner: the one failure of this visual a reader cannot see.
 */
export type TriCal = { spend: [number, number]; value: [number, number]; late: [number, number] };
export type TriPos = { x: number; y: number; cost: number; scope: number; time: number };

const spendOf = (r: ModelResult) => r.financials.monthly.reduce((a, m) => a + m.changeCost, 0);
const lateOf = (r: ModelResult) => r.initiatives.reduce((a, i) => a + (i.delayMonths ?? 0), 0);

export function calibrate(endings: ModelResult[]): TriCal {
  const span = (f: (r: ModelResult) => number): [number, number] => {
    const v = endings.map(f);
    return [Math.min(...v), Math.max(...v)];
  };
  return { spend: span(spendOf), value: span((r) => r.summary.portfolioValue), late: span(lateOf) };
}

export function triangleOf(r: ModelResult, cal: TriCal): TriPos {
  /* An axis with no range is an axis nothing on the table trades away. Scoring it 1
     keeps it out of the picture instead of dividing by zero and putting every run in
     the same wrong place. */
  const norm = (v: number, [lo, hi]: [number, number], goodIsLow: boolean) => {
    if (!(hi > lo)) return 1;
    const t = (v - lo) / (hi - lo);
    return goodIsLow ? 1 - t : t;
  };
  const cost = norm(spendOf(r), cal.spend, true);
  const scope = norm(r.summary.portfolioValue, cal.value, false);
  const time = norm(lateOf(r), cal.late, true);
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

/**
 * The year, always on screen. A model that runs on an annual cycle and never shows you a
 * calendar leaves you guessing where "mid-year" is relative to the hire that lands in May.
 * Months already decided are filled; the one you are being asked about is marked; and the
 * month the year changes under you, if the scenario has one, carries an arrow.
 */
function YearStrip({ at, decided, spike, months }:
  { at: number | null; decided: number[]; spike: number | null; months: string[] }) {
  return (
    <ol className="rb-year" aria-label="The plan year">
      {months.map((m, i) => (
        <li key={m + i}
            className={[i === at ? 'now' : decided.some((d) => d === i) ? 'done' : i < (at ?? -1) ? 'past' : '',
                        i === spike ? 'spike' : ''].filter(Boolean).join(' ')}
            title={i === spike ? 'The year changes here' : undefined}>
          <i /><span>{m}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * What a person is worth, and where.
 *
 * The most useful thing this model knows, and the hardest to get from looking at it: five
 * more people on one team move the year and on another move nothing at all. Measured by
 * running the year again with them, not inferred from whichever bar is reddest, because
 * on a real model those are different teams.
 */
function ConstraintLine({ model, binding, fmt }:
  { model: OperatingModel; binding: Binding; fmt: Fmt }) {
  const name = (id: string) => model.teams.find((t) => t.id === id)?.name ?? id;
  const answers = binding.service ? `answers ${Math.round(binding.service.gain * 100)} points more` : '';
  const risk = binding.portfolio ? `puts ${cash(fmt, binding.portfolio.gain)} less at risk` : '';
  /* One team binding both is worth saying out loud rather than naming twice. It is the
     shape of a physical bottleneck: the same people are the answer to two different
     questions, which is rarer and more useful than the usual split. */
  const together = binding.service && binding.portfolio
    && binding.service.teamId === binding.portfolio.teamId;
  const parts: string[] = together
    ? [`${name(binding.service!.teamId)} ${answers} and ${risk}, and no other team moves either`]
    : [
        binding.service ? `${name(binding.service.teamId)} ${answers}` : '',
        binding.portfolio ? `${name(binding.portfolio.teamId)} ${risk}` : '',
      ].filter(Boolean);
  const idle = binding.idle.length;
  return (
    <p className="rb-bind">
      <span className="rb-bind-k">Five more people:</span>
      {parts.length === 0
        ? <> nowhere would that move this year. Capacity is not what is short.</>
        : <>{' '}{parts.join(', or ')}.</>}
      {idle > 0 && (
        <span className="rb-bind-idle">
          {' '}On {idle === model.teams.length ? 'every team' : `${idle} of the ${model.teams.length} teams`}, nothing at all.
        </span>
      )}
    </p>
  );
}

const pct = (n: number) => Math.round(n * 100) + '%';
/* Small counts read as words in a sentence and as digits in a label. "Two of your 5
   calls" is neither. */
const WORDS = ['no','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve'];
export const word = (n: number) => WORDS[n] ?? String(n);
export const Word = (n: number) => word(n).replace(/^./, (c) => c.toUpperCase());
/* A scenario description is written as its own sentence. Spliced after a colon it needs
   to start lower case, or the line reads as two sentences jammed together. */
const uncap = (t: string) => (t ? t[0].toLowerCase() + t.slice(1) : t);
/** 1st, 2nd, 3rd, 11th. Places are read aloud, so they get read aloud here too. */
const ord = (n: number) => {
  const t = n % 100;
  const suffix = t >= 11 && t <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return n + suffix;
};
/** "a", "a and b", "a, b and c". Joining three names with two "and"s reads like a list
    nobody proofread. */
const list = (xs: string[]) =>
  xs.length < 3 ? xs.join(' and ') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1];
/* Two decimals, because these sit next to each other on a dashboard and the difference
   between $47.04M and $43.57M is the whole point of showing them. */
const cash = (fmt: Fmt, n: number) => fmt.money(n, { precise: true });

/** One grammar for every team: a bar, and the line it should not cross. */
function TeamBars({ model, result, highlight }:
  { model: OperatingModel; result: ModelResult; highlight?: string[] }) {
  return (
    <ul className="rb-teams">
      {result.teams.map((t) => {
        const team = model.teams.find((x) => x.id === t.teamId)!;
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
 * Where the team a question is about actually stands, read off the model as it is right
 * now. The questions used to carry these numbers in their prose, and every one of them
 * was quietly wrong the day the run moved onto a different year.
 */
function FocusLine({ model, result, teamId }:
  { model: OperatingModel; result: ModelResult; teamId: string }) {
  const t = result.teams.find((x) => x.teamId === teamId);
  if (!t || t.months.length === 0) return null;
  const worst = t.months.reduce((a, b) => (b.utilization > a.utilization ? b : a));
  const name = model.teams.find((x) => x.id === teamId)?.name ?? teamId;
  return (
    <p className="rb-focus">
      <b>{name}</b> peaks in {MONTHS_LONG[worst.monthIndex] ?? worst.month}: the work needs{' '}
      <b>{Math.round(worst.requiredFte)}</b> people at a pace they can hold, against{' '}
      <b>{Math.round(worst.availableFte)}</b> on the team. That is {pct(worst.utilization)} of what they have.
    </p>
  );
}

/**
 * What the strain is doing to the odds. The engine computes this already: a team running
 * short lifts the chance the work it is staffing misses, as 1-(1-p)(1-shortfall). Showing
 * it beats adding a dice roll, which would be the only invented number on the page.
 */
function InitiativeRisk({ model, result }: { model: OperatingModel; result: ModelResult }) {
  const { fmt } = useStore();
  const named = (id: string) => model.initiatives.find((i) => i.id === id)?.name ?? id;
  const items = [...result.exposure.items].sort((a, b) => b.exposure - a.exposure);
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
            <span className="rb-rcash">{cash(fmt, e.exposure)}</span>
          </li>
        );
      })}
    </ul>
  );
}

type Headline = 'service' | 'over' | 'undone' | 'unfunded';

function Kpis({ result, prev, headline, riskNoun }:
  { result: ModelResult; prev?: ModelResult; headline: Headline; riskNoun: string }) {
  const { fmt } = useStore();
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
      {/* Not "teams over capacity": on a year with real pressure in it that reads the same
          number whatever you do, and a dashboard cell that never moves teaches the reader
          to stop looking at it. The board below still shows every team. */}
      {headline === 'unfunded'
        ? cell('Cost with no funder', cash(fmt, s.unfundedCost), p && s.unfundedCost - p.unfundedCost)
        : headline === 'service' && s.serviceLevelPct !== null
        ? cell('Answered in time', Math.round(s.serviceLevelPct * 100) + '%',
               p?.serviceLevelPct != null ? s.serviceLevelPct - p.serviceLevelPct : undefined, false)
        : headline === 'undone'
          ? cell('Work never done', fmt.hours(s.shedHours), p && s.shedHours - p.shedHours)
          : cell('Teams over capacity', String(s.teamsConstrained), p && s.teamsConstrained - p.teamsConstrained)}
      {cell('People, year end', String(Math.round(s.endingFte)), p && s.endingFte - p.endingFte)}
      {cell(`${riskNoun} at risk`, cash(fmt, s.revenueExposure), p && s.revenueExposure - p.revenueExposure)}
      {cell('Spent on changes', cash(fmt, spendOf(result)), undefined)}
    </div>
  );
}

/** Said in sentences, computed from the two runs. Never authored. */
function consequence(model: OperatingModel, fmt: Fmt, before: ModelResult, after: ModelResult): string[] {
  const out: string[] = [];
  const moved = after.teams
    .map((t, i) => ({
      name: model.teams.find((x) => x.id === t.teamId)!.name,
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
  if (!moved.length) out.push('No team’s load changed.');

  const dOver = after.summary.teamsConstrained - before.summary.teamsConstrained;
  if (dOver > 0) out.push(`Teams over capacity went from ${before.summary.teamsConstrained} to ${after.summary.teamsConstrained}: you fixed one and started another.`);
  if (dOver < 0) out.push(`Teams over capacity: ${before.summary.teamsConstrained} down to ${after.summary.teamsConstrained}.`);

  const dFte = Math.round(after.summary.endingFte) - Math.round(before.summary.endingFte);
  if (dFte < 0) out.push(`${-dFte} fewer people at year end, because the work behind ${after.summary.hiresDroppedFte} of the approved hires went away.`);

  const dSvc = (after.summary.serviceLevelPct ?? 0) - (before.summary.serviceLevelPct ?? 0);
  if (Math.abs(dSvc) > 0.005) out.push(`Requests answered in time ${dSvc > 0 ? 'rise' : 'fall'} to ${Math.round((after.summary.serviceLevelPct ?? 0) * 100)}%.`);

  const dShed = after.summary.shedHours - before.summary.shedHours;
  if (Math.abs(dShed) > 100) out.push(`Work that never gets done ${dShed < 0 ? 'falls' : 'rises'} to ${fmt.hours(after.summary.shedHours)}.`);

  const dRisk = after.summary.revenueExposure - before.summary.revenueExposure;
  if (Math.abs(dRisk) > 50000) out.push(`${model.lexicon?.revenueNoun ?? 'Revenue'} at risk ${dRisk < 0 ? 'falls' : 'rises'} to ${cash(fmt, after.summary.revenueExposure)}.`);

  return out.length === 1 && !moved.length ? ['Nothing changed. That is an answer too.'] : out;
}

/** A model can arrive without a run. Say so, rather than rendering an empty board. */
function NoRun({ name }: { name: string }) {
  return (
    <main className="runv">
      <div className="rb-body solo">
        <section className="rb-ask">
          <span className="rb-when">No guided run</span>
          <h1>{name} does not carry a run.</h1>
          <p className="rb-setup">A run is a short list of decisions a reader is walked through,
             and it lives in the model file beside the scenarios and the levers it is made of.
             This model has not got one, which changes nothing about the model itself.</p>
          <div className="rb-opts rb-opts-lead">
            <a className="rb-opt rb-go" href="#/model"><b>Open the full model &rarr;</b>
              <span>Every team, month, scenario and assumption, with nothing skipped.</span></a>
          </div>
        </section>
      </div>
    </main>
  );
}

export function Run() {
  const { model } = useStore();
  return model.run && model.run.decisions.length > 0
    ? <RunFor model={model} spec={model.run} />
    : <NoRun name={model.name} />;
}

function RunFor({ model, spec }: { model: OperatingModel; spec: RunSpec }) {
  /* Whether these are the sample numbers or somebody's own. "Calibrated" is a statement
     about a model's internal consistency, not about whether the company exists, and
     reading it as the latter had this page calling a fictional company real. */
  const { isFixture, fmt, dispatch } = useStore();
  /* What the reader said they were protecting. It is the question the short version asks
     at the end, and asking it first is the difference between a demo about a fictional
     software company and a demo about whatever the reader actually runs. */
  const [objId, setObjId] = useState(OBJECTIVES[0].id);
  const [picks, setPicks] = useState<(string | null)[]>([]);
  const [started, setStarted] = useState(false);
  const [preview, setPreview] = useState<string | null | undefined>(undefined);

  const decisions = spec.decisions;
  const chosen = picks.filter((p): p is string => !!p);
  const step = picks.length;
  const done = step >= decisions.length;

  const months = useMemo(
    () => MONTHS.slice(0, 12).map((_, i) => MONTHS[i]),
    [],
  );
  /* The month the year changes under you, taken from the scenario rather than typed in. */
  const scenario = spec.scenarioId ? model.scenarios.find((s) => s.id === spec.scenarioId) : undefined;
  const spike = useMemo(() => {
    const from = (scenario as { fromMonth?: string } | undefined)?.fromMonth;
    if (!from) return null;
    const i = monthIndex(model.calendar.startMonth, from);
    return i >= 0 && i < months.length ? i : null;
  }, [scenario, model.calendar.startMonth, months.length]);

  const go = (ivs: string[] = []) => runWith(model, spec, ivs);
  const current = useMemo(() => go(chosen), [model, spec, chosen.join('|')]);
  const doNothing = useMemo(() => go(), [model, spec]);
  const previous = useMemo(
    () => go(picks.slice(0, -1).filter((p): p is string => !!p)),
    [model, spec, picks.length, chosen.join('|')],
  );
  const previewResult = useMemo(
    () => (preview === undefined ? null : go(preview ? [...chosen, preview] : chosen)),
    [model, spec, preview, chosen.join('|')],
  );
  const shown = previewResult ?? current;

  /* Computed once per model: the cloud behind the triangle, and the bounds every
     position on it is measured against. */
  const endings = useMemo(() => allEndings(model, spec), [model, spec]);
  const cal = useMemo(() => calibrate(endings), [endings]);
  const cloud = useMemo(() => endings.map((r) => triangleOf(r, cal)), [endings, cal]);

  /* Measured, not assumed: the spread each candidate shows across every ending this model
     can reach. */
  const headline: Headline = useMemo(() => {
    const span = (f: (r: ModelResult) => number) => {
      const v = endings.map(f).filter((x) => Number.isFinite(x));
      if (!v.length) return 0;
      const lo = Math.min(...v), hi = Math.max(...v);
      return hi > lo && Math.abs(hi) > 0 ? (hi - lo) / Math.abs(hi) : 0;
    };
    const svc = endings[0].summary.serviceLevelPct === null ? -1 : span((r) => r.summary.serviceLevelPct ?? 1);
    const undone = span((r) => r.summary.shedHours);
    const over = span((r) => r.summary.teamsConstrained);
    /* Service level wins whenever it genuinely moves, even if another measure moves more.
       "42% of requests answered in time" is a sentence about a person waiting; "12k hours
       never done" is a sentence about a spreadsheet, and only one of them makes somebody
       care what they decided. */
    /* Where income is restricted, the cost nobody is allowed to pay for is the number
       that decides the year, and it is not one any other model has. */
    if (model.funds?.length && span((r) => r.summary.unfundedCost) > 0) return 'unfunded';
    if (svc > 0.25) return 'service';
    const best = Math.max(svc, undone, over);
    return best <= 0 ? 'over' : best === undone ? 'undone' : 'over';
  }, [endings, model]);

  /* One position per state the run has been in, ending on whatever is on screen now,
     so hovering a choice moves the marker before you commit to it. */
  const trail = useMemo(() => {
    const steps: TriPos[] = [];
    for (let i = 0; i <= picks.length; i++) {
      steps.push(triangleOf(go(picks.slice(0, i).filter((p): p is string => !!p)), cal));
    }
    if (previewResult) steps.push(triangleOf(previewResult, cal));
    return steps;
  }, [model, spec, cal, picks.join('|'), preview]);

  /* Recomputed as the run goes, because the constraint moves when you act on it. Eight
     extra engine runs, a few milliseconds, and the only number on the page that tells
     somebody what to do next rather than what already happened. */
  const binding = useMemo(
    () => bindingConstraints(model, spec, chosen, shown),
    [model, spec, chosen.join('|'), shown],
  );

  const d: RunDecision = decisions[Math.min(step, decisions.length - 1)];
  const lastLines = step > 0 && !done ? consequence(model, fmt, previous, current) : [];
  const beforeSpike = spike === null ? 0 : decisions.filter((x) => x.monthIndex < spike).length;

  return (
    <main className="runv">
      {/* Sticky, and the same shape on every screen of the run. The triangle keeps its
          trail so you can see the path your decisions took, not just where they left you. */}
      <header className="rb-dash">
        <div className="rb-dash-in">
          <div className="rb-dash-id">
            <b>{model.name}</b>
            <span>{model.calendar.startMonth.slice(0, 4)} &middot; {isFixture ? 'fictional company' : 'your numbers'}, real arithmetic</span>
            {/* Nothing is pending before you begin, so nothing is marked. Highlighting
                February on the opening screen implied a decision you had not been asked for. */}
            <YearStrip
              at={!started || done ? null : d.monthIndex}
              decided={started ? decisions.slice(0, step).map((dd) => dd.monthIndex) : []}
              spike={spike} months={months} />
          </div>
          {/* The picture stays, and keeps the trail, which is what it was for: where the
              decisions have taken you, visible the whole way through. The three percentages
              that used to sit beside it are gone from here. They quantified a position on a
              normalised scale, which is the most abstract thing this page had, and they were
              standing where the constraint belongs. They are on the scorecard now, next to
              the cloud, where there is room to say what they mean. */}
          <div className="rb-dash-tri">
            <Triangle trail={trail} size={0.78} />
          </div>
          <Kpis result={shown} prev={previewResult ? current : undefined} headline={headline}
                riskNoun={model.lexicon?.revenueNoun ?? 'Revenue'} />
          {started && <ConstraintLine model={model} binding={binding} fmt={fmt} />}
        </div>
      </header>

      <div className={'rb-body' + (started ? '' : ' solo')}>
        <section className="rb-ask">
          {!started ? (
            <>
              <span className="rb-when">Before you start</span>
              <h1>One decision, followed all the way through.</h1>
              <p className="rb-setup">
                This is a year of {isFixture ? 'a fictional organisation’s' : 'your'} plan
                {scenario?.description
                  ? <>, with one thing in it the plan did not budget for: {uncap(scenario.description)}</>
                  : '.'}
                {beforeSpike > 0
                  ? <> {Word(beforeSpike)} of your {word(decisions.length)} calls
                      come{beforeSpike === 1 ? 's' : ''} before it lands.</>
                  : <> You make {word(decisions.length)} calls of your own.</>}
              </p>
              {/* Two questions, on one screen, both answerable by anybody about their own
                  work. Not a wizard: everything has a default, so a reader who does not
                  care can press Start and get exactly what they got before. */}
              <div className="rb-pick">
                <p className="rb-pick-q">Which of these is closest to what you run?</p>
                <div className="rb-worlds">
                  {RUN_WORLDS.map((w) => (
                    <button key={w.id} className={'rb-world' + (model.id === w.id ? ' on' : '')}
                            onClick={() => dispatch({ type: 'model', model: w.build() })}>
                      <b>{w.name}</b><span>{w.shapeLine}</span>
                    </button>
                  ))}
                </div>
                <p className="rb-pick-q">And what are you protecting this year?</p>
                <div className="rb-objs">
                  {OBJECTIVES.map((o) => (
                    <button key={o.id} title={o.who}
                            className={'rb-obj' + (o.id === objId ? ' on' : '')}
                            onClick={() => setObjId(o.id)}>{o.label(model)}</button>
                  ))}
                </div>
                <p className="rb-legend">Neither answer changes the arithmetic. The first picks
                   whose year you are running, the second decides what the scoreboard at the end
                   is measured against.</p>
              </div>

              {/* Above the board, not below it. At 900px the button sat under a 380px
                  animation and the only thing you could do on the page was off screen. */}
              <div className="rb-opts rb-opts-lead">
                <button className="rb-opt rb-go" onClick={() => setStarted(true)}>
                  <b>Start the year &rarr;</b>
                  <span>{Word(decisions.length)} decisions, {months[0]} to {months[months.length - 1]}. Nothing to configure, and no way to lose.</span>
                </button>
                <a className="rb-opt" href="#/sandbox">
                  <b>Or just turn the dials</b>
                  <span>Three controls and a year you can scrub through. Find the month it breaks.</span>
                </a>
                <a className="rb-opt" href="#/answer">
                  <b>Or skip to the answer</b>
                  <span>Tell it what you are protecting and it will tell you which calls get you there.</span>
                </a>
              </div>
              {spec.introEmbedUrl && (
                <>
                  <p className="rb-intro-h">First, what the model does with one decision</p>
                  <figure className="rb-intro">
                    <iframe src={spec.introEmbedUrl} loading="eager"
                            title="One efficiency followed from the tool that buys it to the money it frees" />
                  </figure>
                </>
              )}
            </>
          ) : !done ? (
            <>
              <span className="rb-when">
                {d.when} &middot; decision {step + 1} of {decisions.length}
                {/* The page invites you to hover a choice and watch the board move before
                    committing, and then made every commitment permanent. Misclick the
                    second call and you played out three you did not choose. */}
                {step > 0 && (
                  <button className="rb-undo" onClick={() => setPicks(picks.slice(0, -1))}>
                    &larr; change the last call
                  </button>
                )}
              </span>
              <h1>{d.question}</h1>
              <p className="rb-setup">{d.setup}</p>
              {d.focusTeamId && <FocusLine model={model} result={current} teamId={d.focusTeamId} />}

              {/* Announced, not just drawn. These sentences are the whole feedback loop of
                  the run, and to anyone using a screen reader they did not exist. The
                  container is always here so the region is registered before it changes. */}
              <div className="rb-result" role="status" aria-live="polite">
                {lastLines.length > 0 && (
                  <>
                    <span>What your last call did</span>
                    {lastLines.map((l) => <p key={l}>{l}</p>)}
                  </>
                )}
              </div>

              <div className="rb-opts">
                {d.options.map((o) => {
                  const spent = !!o.interventionId && chosen.includes(o.interventionId);
                  return (
                    <button
                      key={o.label}
                      className={'rb-opt' + (spent ? ' spent' : '')}
                      disabled={spent}
                      onMouseEnter={() => !spent && setPreview(o.interventionId)}
                      onMouseLeave={() => setPreview(undefined)}
                      onFocus={() => !spent && setPreview(o.interventionId)}
                      onBlur={() => setPreview(undefined)}
                      onClick={() => { setPreview(undefined); setPicks([...picks, o.interventionId]); }}
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
            <Scorecard model={model} spec={spec} picks={picks} result={current}
                       doNothing={doNothing} trail={trail} cloud={cloud} cal={cal}
                       endings={endings} objId={objId}
                       onReset={() => setPicks([])} />
          )}
        </section>

        {started && <section className="rb-board">
          <span className="rb-board-h">Every team, at its busiest month</span>
          <TeamBars model={model} result={shown} />
          <p className="rb-legend">The mark on each bar is what that team can sustain. Past it, someone is working late all year.</p>
          <span className="rb-board-h" style={{ marginTop: 20 }}>What that puts at risk</span>
          <InitiativeRisk model={model} result={shown} />
          <p className="rb-legend">Every programme can miss on its own. A team running short makes it likelier, and the money is what that costs.</p>
          {shown.summary.serviceLevelPct !== null && (
            <>
              <span className="rb-board-h" style={{ marginTop: 20 }}>What the customer sees</span>
              <p className="rb-service">
                <b>{(shown.summary.serviceLevelPct * 100).toFixed(1)}%</b> of requests picked up
                inside their target. Worst month{' '}
                <b>{((shown.summary.worstServiceLevel ?? 1) * 100).toFixed(0)}%</b>.
              </p>
              {shown.summary.shedHours > 0 && (
                <p className="rb-service">
                  <b>{fmt.hours(shown.summary.shedHours)}</b> of work never got done at all
                  {shown.summary.closingBacklogHours > 0
                    ? <>, and <b>{fmt.hours(shown.summary.closingBacklogHours)}</b> was still waiting at year end.</>
                    : '.'}
                </p>
              )}
              <p className="rb-legend">Queues do not degrade in a line. They hold, and then they
                 fall over, and a team half the size falls over sooner at the same load. Work
                 nobody reaches waits, and next month starts behind; past a month of it, the
                 team is turning work away whether or not anyone decided to.</p>
            </>
          )}
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
function Replay({ model, spec, picks, trail }:
  { model: OperatingModel; spec: RunSpec; picks: (string | null)[]; trail: TriPos[] }) {
  const { fmt } = useStore();
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(true);

  const states = useMemo(() => {
    const out: ModelResult[] = [];
    for (let i = 0; i <= picks.length; i++) {
      out.push(runWith(model, spec, picks.slice(0, i).filter((p): p is string => !!p)));
    }
    return out;
  }, [model, spec, picks.join('|')]);

  useEffect(() => {
    if (!playing) return;
    if (at >= states.length - 1) { setPlaying(false); return; }
    const t = setTimeout(() => setAt((i) => i + 1), at === 0 ? 1400 : 2600);
    return () => clearTimeout(t);
  }, [at, playing, states.length]);

  const chosenAt = (i: number) => {
    const d = spec.decisions[i];
    const iv = picks[i];
    return d.options.find((o) => o.interventionId === iv) ?? d.options[d.options.length - 1];
  };
  const lines = at > 0 ? consequence(model, fmt, states[at - 1], states[at]) : [];
  const head = at === 0
    ? { when: MONTHS_LONG[0], what: 'The plan as written' }
    : { when: spec.decisions[at - 1].when, what: chosenAt(at - 1).label };

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
        <TeamBars model={model} result={states[at]} />
        <div className="rb-replay-side">
          <Triangle trail={trail.slice(0, at + 1)} size={1.1} />
          <ul className="rb-replay-kpi">
            <li><b>{Math.round((states[at].summary.serviceLevelPct ?? 1) * 100)}%</b><span>answered in time</span></li>
            <li><b>{Math.round(states[at].summary.endingFte)}</b><span>people</span></li>
            <li><b>{cash(fmt, states[at].summary.revenueExposure)}</b><span>at risk</span></li>
            <li><b>{(states[at].summary.retentionRate * 100).toFixed(1)}%</b><span>retention</span></li>
          </ul>
        </div>
      </div>
      <div className="rb-replay-say">
        {lines.length ? lines.map((l) => <p key={l}>{l}</p>)
          : <p className="dim">{model.teams.length} teams, {model.initiatives.length} programmes, and nothing decided yet.</p>}
      </div>
    </div>
  );
}

function Scorecard({ model, spec, picks, result, doNothing, onReset, trail, cloud, endings, objId }:
  { model: OperatingModel; spec: RunSpec; picks: (string | null)[]; result: ModelResult;
    doNothing: ModelResult; onReset: () => void; trail: TriPos[]; cloud: TriPos[]; cal: TriCal;
    endings: ModelResult[]; objId: string }) {
  const { fmt } = useStore();

  /* Where this year placed against every year the same five decisions could have made.
     Not a score out of ten: a place in a field, on each of the things somebody might have
     been protecting. Coming third on one and two hundredth on another, off one set of
     calls, is the entire lesson of this page in a table. */
  const ranked = useMemo(
    () => OBJECTIVES.map((o: Objective) => ({ o, ...rankAmong(result, endings, o) })),
    [result, endings],
  );
  const mine = ranked.find((r) => r.o.id === objId) ?? ranked[0];
  const best = ranked.reduce((a, b) => (b.place < a.place ? b : a));
  const worst = ranked.reduce((a, b) => (b.place > a.place ? b : a));
  const s = result.summary, n = doNothing.summary;
  const spent = spendOf(result);
  const took = picks.filter(Boolean).length;

  /* No win state. The run is read back as what it protected and what that cost. Read off
     service level and revenue, not the count of teams over capacity: on a year with real
     pressure in it that count barely moves, so a verdict hung on it said the same sentence
     about materially different years. */
  const riskCut = n.revenueExposure - s.revenueExposure;
  const svcUp = (s.serviceLevelPct ?? 0) - (n.serviceLevelPct ?? 0);
  /* In the organisation's own nouns. A studio does not have customers and a health
     service does not have revenue, and a verdict that says otherwise is talking about
     somebody else's year. */
  const money = (model.lexicon?.revenueNoun ?? 'revenue').toLowerCase();
  const served = (model.lexicon?.customerNoun ?? 'the customer').toLowerCase();
  const verdict =
    took === 0 ? 'You changed nothing, which is the cheapest year available and leaves every constraint exactly where it was.'
    : svcUp > 0.05 && riskCut > 0 ? 'You got the work answered and protected the money behind it, and you paid for both.'
    : svcUp > 0.05 ? 'You got the queue answered. What the portfolio was worth is roughly where it started.'
    : svcUp < -0.05 ? `You protected the portfolio by taking people off the queue, and ${served} waited for it. That is a real trade, not a mistake.`
    : riskCut > 0 ? `You protected ${money} without changing what ${served} experienced.`
    : 'You spent money and the year came out much as it would have anyway.';

  return (
    <>
      <span className="rb-when">The year, as you ran it</span>
      <h1>{verdict}</h1>
      <Replay model={model} spec={spec} picks={picks} trail={trail} />
      <div className="rb-final">
        <Triangle trail={trail} cloud={cloud} size={1.55} />
        <div>
          <ul className="rb-tri-read wide">
            <li><b>{pct(trail[trail.length - 1].cost)}</b><span>budget kept</span></li>
            <li><b>{pct(trail[trail.length - 1].scope)}</b><span>scope kept</span></li>
            <li><b>{pct(trail[trail.length - 1].time)}</b><span>schedule kept</span></li>
          </ul>
          <p className="rb-final-h">Every year you could have had</p>
          <p className="rb-setup">Each faint mark is one of the {cloud.length} ways these
             {' '}{spec.decisions.length} decisions could have gone. Yours is the filled one, and the
             line is how it got there. Leaving the plan alone sits dead centre, because it gives
             up none of the three. Every mark away from the centre is one of them traded for another.</p>
        </div>
      </div>
      <div className="rb-ranks-wrap">
        <p className="rb-final-h">Where this year placed</p>
        <p className="rb-setup">
          You said you were protecting <b>{mine.o.label(model).toLowerCase()}</b>, and on that you
          came <b>{ord(mine.place)}</b> of {mine.of}. The same five decisions came {ord(best.place)}
          {' '}on {best.o.label(model).toLowerCase()} and {ord(worst.place)} on {worst.o.label(model).toLowerCase()}.
          {best.place !== worst.place && ' Nothing was traded away by accident; every one of those is the same year read a different way.'}
        </p>
        <ol className="rb-ranks">
          {ranked.map((r) => (
            <li key={r.o.id} className={r.o.id === objId ? 'mine' : ''}>
              <span className="rank-name">{r.o.label(model)}</span>
              <span className="rank-track">
                <i style={{ width: (r.of > 1 ? (1 - (r.place - 1) / (r.of - 1)) * 100 : 100) + '%' }} />
              </span>
              <span className="rank-place">{r.place} of {r.of}</span>
            </li>
          ))}
        </ol>
      </div>

      <table className="rb-score">
        <thead><tr><th></th><th>Doing nothing</th><th>Your run</th></tr></thead>
        <tbody>
          <tr><td>Teams over capacity</td><td>{n.teamsConstrained}</td><td>{s.teamsConstrained}</td></tr>
          <tr><td>People at year end</td><td>{Math.round(n.endingFte)}</td><td>{Math.round(s.endingFte)}</td></tr>
          <tr><td>{model.lexicon?.revenueNoun ?? 'Revenue'} at risk</td><td>{cash(fmt, n.revenueExposure)}</td><td>{cash(fmt, s.revenueExposure)}</td></tr>
          <tr><td>Kept their people</td><td>{(n.retentionRate * 100).toFixed(1)}%</td><td>{(s.retentionRate * 100).toFixed(1)}%</td></tr>
          <tr><td>Months a team ran over</td><td>{n.strainMonths}</td><td>{s.strainMonths}</td></tr>
          {s.serviceLevelPct !== null && (
            <tr><td>Requests picked up in time</td>
              <td>{(n.serviceLevelPct! * 100).toFixed(1)}%</td>
              <td>{(s.serviceLevelPct * 100).toFixed(1)}%</td></tr>
          )}
          {(n.shedHours > 0 || s.shedHours > 0) && (
            <tr><td>Work never done</td><td>{fmt.hours(n.shedHours)}</td><td>{fmt.hours(s.shedHours)}</td></tr>
          )}
          {model.funds?.length ? (
            <>
              <tr><td>Cost with no funder</td><td>{cash(fmt, n.unfundedCost)}</td><td>{cash(fmt, s.unfundedCost)}</td></tr>
              <tr><td>Held, and not allowed to spend it</td><td>{cash(fmt, n.strandedFunds)}</td><td>{cash(fmt, s.strandedFunds)}</td></tr>
            </>
          ) : null}
          <tr><td>Spent on changes</td><td>{cash(fmt, 0)}</td><td>{cash(fmt, spent)}</td></tr>
        </tbody>
      </table>
      {result.financials.byFund.length > 0 && (
        <div className="rb-funds">
          <p className="rb-final-h">Where the money came from, and what it was allowed to pay for</p>
          <ul className="fundlist">
            {result.financials.byFund.map((f) => (
              <li key={f.fundId} className={f.stranded > 0 ? 'stuck' : ''}>
                <span className="fund-name">{f.name}{f.restricted ? '' : ' (unrestricted)'}</span>
                <span className="fund-track">
                  <i style={{ width: (f.amount > 0 ? Math.min(100, (f.spent / f.amount) * 100) : 0) + '%' }} />
                </span>
                <span className="fund-num">{cash(fmt, f.spent)} of {cash(fmt, f.amount)}</span>
              </li>
            ))}
          </ul>
          <p className="rb-legend">Restricted money pays for the thing it names and nothing else. That
             is why the unspent bar and the shortfall can grow at the same time: the money left over
             is not allowed anywhere near what ran out.</p>
        </div>
      )}

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
