import { useMemo, useState } from 'react';
import type { ModelResult } from '../models/results';
import type { OperatingModel } from '../models/types';
import { asUnits, pressureOf, PRESSURE_WORD, workloadOf } from '../lib/workload';
import { tiedTo } from '../lib/ties';
import type { Lead } from '../lib/leads';

/**
 * The work network as a map you read, not a dashboard you parse.
 *
 * The first version of this put a four-line card on every team: a name, a headcount, a
 * gauge, a percentage, an answer rate. Eight of those is thirty-two things to read before
 * anything is understood, and it scrolled for a screen and a half. So the blocks carry a
 * name and a gauge and nothing else, and everything else moves to the moment somebody
 * asks for it.
 *
 * The queue carries the load instead. Work waiting in front of a team is drawn as work,
 * one mark to half a week, stacking leftwards towards whatever is feeding it. A team two
 * months behind has a visibly long line in front of it and needs no number to say so.
 * That is the whole trick, and it is the one thing a percentage can never do.
 */

export type Sel = { kind: 'team' | 'stream'; id: string } | null;

const PAD_X = 8, PAD_Y = 10;
const SRC_W = 108, SRC_H = 36, SRC_GAP = 9;
const TEAM_W = 236;
/* Room for a readout: the number large, the bar beside it, the queue count after it, and
   the year underneath. The last pass stripped the numbers off entirely, which fixed the
   noise and took the instrument with it. Density is not the problem; density with no
   hierarchy is. */
const TEAM_H = 108;
/* The interior runs from nothing to half again what the team can do, so the ceiling is a
   line drawn inside the building rather than the top of it. Going past what you can do is
   then something you watch happen, with room above it, instead of a bar that fills up and
   has nowhere left to say anything. */
const LEVEL_TOP = 1.5;
const level = (u: number) => Math.max(0, Math.min(1, u / LEVEL_TOP)) * 100;
const ROW_GAP = 15;
/* Room for a queue to grow into before it reaches whatever is feeding it. */
const QUEUE_W = 68, WIRE_W = 52;
const COL_GAP = QUEUE_W + WIRE_W;

/** One mark to a day of the team's own capacity. At half a week the queues were three or
    four marks long, which is a number in disguise rather than a line you can read. */
const MARK_UNIT = 1 / 21;
const MARK_MAX = 40;
/* A pile grows up before it grows back. Five to a column means a fortnight behind is a
   stack that clears the block's shoulder, where four made it wrap into a tidy brick and
   read as a swatch. */
const MARK_ROWS = 5;

interface Placed { x: number; y: number; w: number; h: number }

export interface Layout {
  width: number;
  height: number;
  /** Columns of teams, so a caller sizing the canvas knows how many gaps it can widen. */
  cols: number;
  /** Room reserved in front of a block for its queue, which the wires stop short of. */
  queueW: number;
  sources: Map<string, Placed>;
  teams: Map<string, Placed>;
}

/** Every team gets the same card: one reading per card is easier to compare than a size. */
function teamHeights(model: OperatingModel): Map<string, number> {
  return new Map(model.teams.map((t) => [t.id, TEAM_H]));
}

/**
 * `spread` widens the gap between columns and nothing else. A stage is usually wider in
 * proportion than the network is, and the alternative to spending that width here is a
 * small picture floating in the middle of a large empty one. Queues keep their size
 * because they are measured back from the block they wait in front of, so the extra room
 * goes into the wires, which is where flow is legible anyway.
 */
/**
 * `narrow` is the width available, in pixels, when there is not enough of it for the map.
 *
 * A phone has about 340. The map wants 854, so fitting it meant a scale of 0.44 and type
 * at five pixels, and the floor that stopped that from happening left it scrolling
 * sideways instead. Neither is a layout. Given a narrow width it builds a different one:
 * every team in a single column at the full width available, routing depth carried by the
 * order they are stacked in rather than by a second column, and the sources left off,
 * because their volumes are one tap away in the panel and their column is a third of the
 * width the phone has. Vertical scrolling is what a phone is for; sideways is not.
 */
export function layout(
  model: OperatingModel,
  result: ModelResult,
  spread = 0,
  narrow: number | null = null,
): Layout {
  const rank = new Map<string, number>(model.teams.map((t) => [t.id, 1]));
  const routes = result.flow.filter((f) => f.kind === 'route');
  for (let pass = 0; pass < 6; pass++) {
    let moved = false;
    for (const r of routes) {
      const want = (rank.get(r.sourceId) ?? 1) + 1;
      if (want > (rank.get(r.toTeamId) ?? 1) && want <= model.teams.length) {
        rank.set(r.toTeamId, want);
        moved = true;
      }
    }
    if (!moved) break;
  }

  const cols: string[][] = [];
  for (const t of model.teams) (cols[rank.get(t.id)! - 1] ??= []).push(t.id);

  const th = teamHeights(model);
  const teams = new Map<string, Placed>();

  if (narrow !== null) {
    /* One column, deepest routing last, so what feeds what is still readable as an order
       even with no second column to put it in. */
    const queueW = 30;
    const teamW = Math.max(150, narrow - PAD_X * 2 - queueW);
    const x = PAD_X + queueW;
    let y = PAD_Y;
    for (const ids of cols) {
      for (const id of ids) {
        const h = th.get(id)!;
        teams.set(id, { x, y, w: teamW, h });
        y += h + 11;
      }
    }
    return {
      width: PAD_X * 2 + queueW + teamW,
      height: y - 11 + PAD_Y + 10,
      cols: 1,
      queueW,
      sources: new Map(),
      teams,
    };
  }

  const gap = COL_GAP + Math.max(0, spread);
  const colX = (c: number) => PAD_X + SRC_W + gap + c * (TEAM_W + gap);
  cols.forEach((ids, c) => {
    let y = PAD_Y;
    for (const id of ids) {
      const h = th.get(id)!;
      teams.set(id, { x: colX(c), y, w: TEAM_W, h });
      y += h + ROW_GAP;
    }
  });

  const sweep = <T extends { y: number; h: number }>(items: T[], gap: number) => {
    items.sort((a, b) => a.y - b.y);
    let cursor = PAD_Y;
    for (const it of items) {
      it.y = Math.max(cursor, it.y);
      cursor = it.y + it.h + gap;
    }
    return items;
  };

  for (let c = 1; c < cols.length; c++) {
    sweep(cols[c].map((id) => {
      const ups = routes.filter((r) => r.toTeamId === id)
        .map((r) => teams.get(r.sourceId)).filter(Boolean) as Placed[];
      const box = teams.get(id)!;
      if (ups.length) box.y = ups.reduce((a, u) => a + u.y + u.h / 2, 0) / ups.length - box.h / 2;
      return box;
    }), ROW_GAP);
  }

  const byTeam = new Map<string, string[]>();
  for (const f of result.flow) {
    if (f.kind !== 'arrival') continue;
    const list = byTeam.get(f.toTeamId) ?? [];
    list.push(f.sourceId);
    byTeam.set(f.toTeamId, list);
  }
  const sources = new Map<string, Placed>();
  const want: { id: string; x: number; y: number; w: number; h: number }[] = [];
  for (const [teamId, ids] of byTeam) {
    const box = teams.get(teamId)!;
    const mid = box.y + box.h / 2;
    const span = (ids.length - 1) * (SRC_H + SRC_GAP);
    ids.forEach((id, i) => {
      want.push({ id, x: PAD_X, y: mid - span / 2 - SRC_H / 2 + i * (SRC_H + SRC_GAP), w: SRC_W, h: SRC_H });
    });
  }
  for (const s of sweep(want, SRC_GAP)) sources.set(s.id, { x: s.x, y: s.y, w: s.w, h: s.h });

  const all = [...sources.values(), ...teams.values()];
  return {
    width: colX(Math.max(1, cols.length) - 1) + TEAM_W + PAD_X + 18,
    height: Math.max(...all.map((p) => p.y + p.h)) + PAD_Y + 16,
    cols: Math.max(1, cols.length),
    queueW: QUEUE_W,
    sources, teams,
  };
}

/* A route taking one case in seventy-seven is not "1%": rounded to the nearest whole
   number the small splits all read the same, and the small splits are the ones nobody
   expects to matter. */
const PILL = { holding: 'Room', tight: 'Near limit', over: 'Over', buried: 'Past limit' } as const;

export const shareLabel = (v: number) =>
  (v < 0.02 ? (v * 100).toFixed(1) : String(Math.round(v * 100))) + '%';

/* The trace is clipped at 140% of capacity: past that the shape stops telling you
   anything new and starts flattening everything below it. */
const SPARK_TOP = 1.4;
const sparkY = (u: number) => 16 - Math.max(0, Math.min(1, u / SPARK_TOP)) * 15;
const sparkPts = (s: number[]) =>
  s.map((u, i) => `${s.length > 1 ? (i / (s.length - 1)) * 100 : 50},${sparkY(u)}`);
const sparkLine = (s: number[]) => (s.length ? 'M' + sparkPts(s).join(' L') : '');
const sparkArea = (s: number[], _m: number) =>
  s.length ? `M0,16 L${sparkPts(s).join(' L')} L100,16 Z` : '';

/**
 * A run of channel, not a freehand curve.
 *
 * Work does not travel along a bezier. A conduit leaves its source horizontally, turns
 * once, runs, turns back and enters square: two elbows and three straight sections, with
 * a small radius on each corner so a bend reads as a bend in a run rather than a kink.
 * The corner radius is clamped against both legs, because a short drop between two teams
 * that sit almost level would otherwise round straight through itself.
 */
const channel = (x1: number, y1: number, x2: number, y2: number) => {
  const dy = y2 - y1;
  const run = x2 - x1;
  if (Math.abs(dy) < 1.5 && run >= 0) return `M${x1},${y1} L${x2},${y2}`;
  if (run < 8) {
    /* Stacked in one column, so the two ends face the same way: out past both, down, back.
       A straight line here would cut through every block between them. */
    const out = Math.max(x1, x2) + 20;
    const r = Math.min(8, Math.abs(dy) / 2, 18);
    const s = Math.sign(dy) || 1;
    return `M${x1},${y1} L${out - r},${y1} Q${out},${y1} ${out},${y1 + s * r}`
      + ` L${out},${y2 - s * r} Q${out},${y2} ${out - r},${y2} L${x2},${y2}`;
  }
  const mid = x1 + Math.max(16, run / 2);
  const r = Math.max(1, Math.min(10, Math.abs(dy) / 2, mid - x1 - 1, x2 - mid - 1));
  const s = Math.sign(dy);
  return `M${x1},${y1} L${mid - r},${y1}`
    + ` Q${mid},${y1} ${mid},${y1 + s * r}`
    + ` L${mid},${y2 - s * r}`
    + ` Q${mid},${y2} ${mid + r},${y2}`
    + ` L${x2},${y2}`;
};

interface Props {
  model: OperatingModel;
  result: ModelResult;
  month: number;
  selected: Sel;
  onSelect: (s: Sel) => void;
  compact: (n: number) => string;
  /** People asked for who are not in their seats yet. Null when none are pending. */
  pipeline: (teamId: string) => { headcount: number; landsAt: number } | null;
  monthLabels: string[];
  /**
   * Draw the world at this scale so it fills whatever the stage gives it.
   *
   * The layout stays in its own coordinate space: every position, sweep and wire is
   * computed exactly as before and the whole thing is scaled once at the root. The
   * wrapper is sized to the scaled box so the layout box and the painted box agree,
   * which is what keeps a scale over 1 from spilling out of its container.
   */
  fit?: number;
  /** Extra width per column gap, so the network spreads into the stage it is given. */
  spread?: number;
  /** Width available, when there is too little of it for the map: build the list instead. */
  narrow?: number | null;
  /** Changes made here that show up there: the reader's moves, and the plan's own waits. */
  leads?: Lead[];
}

export function FlowCanvas({ model, result, month, selected, onSelect, compact, pipeline, monthLabels, fit = 1, spread = 0, leads = [], narrow = null }: Props) {
  const geo = useMemo(() => layout(model, result, spread, narrow), [model, result, spread, narrow]);
  const edges = result.flow.map((f) => ({ f, units: f.unitsByMonth[month] ?? 0 }));
  const peak = Math.max(1, ...edges.map((e) => e.units));
  /* Hovering lights exactly what clicking would, so a reader can trace a channel back to
     where its work comes from without committing to a selection first. */
  const [hover, setHover] = useState<Sel>(null);
  const focus = selected ?? hover;
  const isOn = (kind: 'team' | 'stream', id: string) => selected?.kind === kind && selected.id === id;
  const lit = (teamId: string, sourceId: string, viaStream?: string) =>
    !focus ? false
      : focus.kind === 'team' ? focus.id === teamId || focus.id === sourceId
        : focus.id === sourceId || focus.id === viaStream;
  /* Everything the selected team shares a programme with, which is a connection the
     routes cannot show: an initiative is staffed out of several teams at once, so two
     teams that never hand each other a case are still competing for the same people. */
  const tied = useMemo(
    () => (focus?.kind === 'team' ? tiedTo(model, focus.id) : new Set<string>()),
    [model, focus],
  );
  const near = (teamId: string) => {
    if (!focus) return true;
    if (focus.kind === 'team') {
      if (focus.id === teamId) return true;
      if (tied.has(teamId)) return true;
      return result.flow.some((f) => f.kind === 'route'
        && ((f.sourceId === focus.id && f.toTeamId === teamId)
          || (f.sourceId === teamId && f.toTeamId === focus.id)));
    }
    return result.flow.some((f) =>
      (f.sourceId === focus.id || f.viaStreamId === focus.id) && f.toTeamId === teamId);
  };

  const fedBy = (teamId: string) => result.flow.some((f) => f.toTeamId === teamId);
  const scaled = fit !== 1;
  return (
    <div className={scaled ? 'fc-scroll fc-fitted' : 'fc-scroll'}
         style={scaled
           ? { width: Math.round(geo.width * fit), height: Math.round(geo.height * fit) }
           : undefined}>
      <div className="fc" style={{
        width: geo.width, height: geo.height,
        ...(scaled ? { transform: `scale(${fit})`, transformOrigin: '0 0' } : null),
      }}>
        <svg className="fc-wires" viewBox={`0 0 ${geo.width} ${geo.height}`} aria-hidden="true">
          {edges.map(({ f, units }) => {
            const from = f.kind === 'arrival' ? geo.sources.get(f.sourceId) : geo.teams.get(f.sourceId);
            const to = geo.teams.get(f.toTeamId);
            if (!from || !to) return null;
            const x1 = from.x + from.w, y1 = from.y + from.h / 2;
            const x2 = to.x - geo.queueW, y2 = to.y + to.h / 2;
            const d = channel(x1, y1, x2, y2);
            const rel = units / peak;
            const on = lit(f.toTeamId, f.sourceId, f.viaStreamId);
            return (
              <g key={f.id} className={'fc-edge' + (on ? ' on' : selected ? ' dim' : '')}>
                {/* A channel rather than an arrow: a surface the work travels on, its
                    centre line, and then the work itself, as things with a location.
                    How many are riding it is how much of the month's work it carries. */}
                <path id={`lane-${f.id}`} className="fc-lane" d={d}
                      style={{ strokeWidth: 7 + 5 * Math.sqrt(rel) }} />
                <path className="fc-wire" d={d} style={{ strokeWidth: 1 + 2 * Math.sqrt(rel) }} />
                {/* Where the run is tapped off, and where it lands. A channel that simply
                    stops is a line; a channel with a takeoff and a mouth is plumbing. */}
                <rect className="fc-tap" x={x1 - 2.5} y={y1 - 2.5} width="5" height="5" />
                <path className="fc-mouth"
                      d={`M${x2 - 6.5},${y2 - 4} L${x2 - 1},${y2} L${x2 - 6.5},${y2 + 4}`} />
                {(() => {
                  const count = Math.max(1, Math.round(1 + 5 * Math.sqrt(rel)));
                  const dur = 5.4 - 3 * rel;
                  return Array.from({ length: count }, (_, i) => (
                    <circle key={i} className="fc-tok" r={1.6 + 1.4 * Math.sqrt(rel)}>
                      {/* A negative start puts each dot part-way along from the first frame;
                          a positive one parks it at the canvas origin until it starts. */}
                      <animateMotion dur={`${dur.toFixed(2)}s`} repeatCount="indefinite"
                                     begin={`-${((i * dur) / count).toFixed(2)}s`}>
                        <mpath href={`#lane-${f.id}`} />
                      </animateMotion>
                    </circle>
                  ));
                })()}
              </g>
            );
          })}

          {/* Changes, as opposed to work. A lead leaves the side of one block, runs down
              the gutter that the queues stand in, and turns into the side of another, so
              it never has to cross a block whatever order the two are in. Dashed and
              arrowed: nothing travels down it continuously, one thing happened once. */}
          {leads.map((ld, i) => {
            const a = geo.teams.get(ld.fromTeamId), b = geo.teams.get(ld.toTeamId);
            if (!a || !b) return null;
            const ax = a.x - 10, bx = b.x - 10;
            const ay = a.y + a.h / 2, by = b.y + b.h / 2;
            const lane = Math.min(ax, bx) - 16 - (i % 3) * 7;
            const d = `M${a.x},${ay} L${lane},${ay} L${lane},${by} L${b.x - 7},${by}`;
            return (
              <g key={`lead-${i}`} className={'fc-lead k-' + ld.kind}>
                <path className="fc-lead-p" d={d} />
                <path className="fc-lead-h"
                      d={`M${b.x - 12},${by - 3.5} L${b.x - 6},${by} L${b.x - 12},${by + 3.5}`} />
                {ld.tag && (
                  <text className="fc-lead-t" x={lane + 4} y={(ay + by) / 2 + 3}>{ld.tag}</text>
                )}
              </g>
            );
          })}
        </svg>

        {result.flow.filter((f) => f.kind === 'arrival').map((f) => {
          /* The narrow layout places no sources: their column is a third of the width a
             phone has, and what arrives is one tap away in the panel. */
          const p = geo.sources.get(f.sourceId);
          if (!p) return null;
          const units = f.unitsByMonth[month] ?? 0;
          return (
            <button key={f.sourceId} type="button"
                    className={'fc-src' + (focus?.kind === 'stream' && focus.id === f.sourceId ? ' on' : selected ? ' dim' : '')}
                    style={{ left: p.x, top: p.y, width: p.w, height: p.h }}
                    aria-pressed={isOn('stream', f.sourceId)}
                    aria-label={`${f.label}: ${Math.round(units)} ${f.unit} this month`}
                    title={`${f.label}: ${compact(Math.round(units))} ${f.unit} this month`}
                    onMouseEnter={() => setHover({ kind: 'stream', id: f.sourceId })}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => onSelect(isOn('stream', f.sourceId) ? null : { kind: 'stream', id: f.sourceId })}>
              <b>{compact(Math.round(units))}</b>
              <span>{f.unit}</span>
            </button>
          );
        })}

        {model.teams.map((t) => {
          const p = geo.teams.get(t.id)!;
          const m = result.teams.find((x) => x.teamId === t.id)?.months[month];
          const w = workloadOf(result, t.id, month);
          if (!m || !w) return null;
          const util = Math.max(0, m.utilization);
          const press = pressureOf(w);
          const waiting = m.availableProductiveHours > 0 ? m.carriedInHours / m.availableProductiveHours : 0;
          const marks = Math.min(MARK_MAX, Math.ceil(waiting / MARK_UNIT));
          const series = result.teams.find((x) => x.teamId === t.id)!.months.map((x) => x.utilization);
          const pending = pipeline(t.id);
          const queued = asUnits(w, m.carriedInHours);
          const lost = m.shedHours > 0 ? asUnits(w, m.shedHours) : null;
          /* Everything a card used to print, moved to the one moment somebody asks. */
          const tip = [
            `${t.name}: ${PRESSURE_WORD[press].toLowerCase()}, ${Math.round(util * 100)}% of capacity`,
            `${Math.round(m.availableFte)} people`,
            m.serviceLevel !== null ? `${Math.round(m.serviceLevel * 100)}% answered in time` : null,
            pending ? `${pending.headcount} arriving ${monthLabels[pending.landsAt] ?? 'after this year'}` : null,
            queued !== null && queued >= 1 ? `${compact(Math.round(queued))} ${w.unit} waiting` : null,
            lost !== null && lost >= 1 ? `${compact(Math.round(lost))} ${w.unit} turned away` : null,
          ].filter(Boolean).join(' · ');
          const plan = level(m.targetUtilization);
          return (
            <button key={t.id} type="button"
                    className={`tc p-${press}`
                      + (focus?.kind === 'team' && focus.id === t.id ? ' on' : near(t.id) ? '' : ' dim')
                      + (tied.has(t.id) ? ' tied' : '')}
                    style={{ left: p.x, top: p.y, width: p.w, height: p.h }}
                    aria-pressed={isOn('team', t.id)} aria-label={tip} title={tip}
                    onMouseEnter={() => setHover({ kind: 'team', id: t.id })}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => onSelect(isOn('team', t.id) ? null : { kind: 'team', id: t.id })}>
              {/* The team's own year, faint behind the reading, with a dot for this month. */}
              <svg className="tc-spark" viewBox="0 0 100 16" preserveAspectRatio="none" aria-hidden="true">
                <path className="tc-spark-a" d={sparkArea(series, month)} />
                <path className="tc-spark-l" d={sparkLine(series)} />
              </svg>
              <span className="tc-sparkd" aria-hidden="true">
                <i style={{
                  left: `${series.length > 1 ? (month / (series.length - 1)) * 100 : 50}%`,
                  top: `${(sparkY(util) / 16) * 100}%`,
                }} />
              </span>
              <b className="tc-n">{t.name}</b>
              <span className="tc-read">
                <b className="tc-pc">{Math.round(util * 100)}<em>%</em></b>
                <span className="tc-pill">{PILL[press]}</span>
                <span className="tc-ppl">{Math.round(m.availableFte)} people</span>
              </span>
              {/* The gauge runs to half again what the team can do, so going past the plan
                  (the tick) and past the ceiling (the end mark) both have room to show. */}
              <span className="tc-gauge" aria-hidden="true">
                <i style={{ width: level(util) + '%' }} />
                <u className="tc-plan" style={{ left: plan + '%' }} />
                <u className="tc-ceil" style={{ left: level(1) + '%' }} />
              </span>
              <span className="tc-line">
                {queued !== null && queued >= 1
                  ? <><b>{compact(Math.round(queued))}</b> {w.unit} waiting</>
                  : m.serviceLevel !== null
                    ? <><b>{Math.round(m.serviceLevel * 100)}%</b> picked up in time</>
                    : fedBy(t.id)
                      ? <><b>{compact(Math.round(asUnits(w, w.given) ?? w.given))}</b> {w.unit ?? 'hours'} this month</>
                      : <>change work only, no queue</>}
                {lost !== null && lost >= 1 && (
                  <em className="tc-lost">{compact(Math.round(lost))} turned away</em>
                )}
              </span>
              {marks > 0 && (
                <span className="fc-q tc-q" aria-hidden="true">
                  {Array.from({ length: Math.ceil(marks / MARK_ROWS) }, (_, c) => (
                    <span key={c}>
                      {Array.from({ length: Math.min(MARK_ROWS, marks - c * MARK_ROWS) },
                        (_, r) => <i key={c * MARK_ROWS + r} />)}
                    </span>
                  ))}
                </span>
              )}
              {pending && (
                <span className="tc-pipe" title={`${pending.headcount} people arriving ${monthLabels[pending.landsAt] ?? 'after this year'}`}>
                  +{pending.headcount} in {monthLabels[pending.landsAt] ?? 'next year'}
                </span>
              )}
            </button>
          );
        })}

        {result.flow.filter((f) => f.kind === 'route').map((f) => {
          const from = geo.teams.get(f.sourceId), to = geo.teams.get(f.toTeamId);
          if (!from || !to) return null;
          const on = lit(f.toTeamId, f.sourceId, f.viaStreamId);
          return (
            <span key={f.id} className={'fc-lbl' + (on ? ' on' : selected ? ' dim' : '')}
                  style={{ left: from.x + from.w + 8, top: (from.y + from.h / 2 + to.y + to.h / 2) / 2 - 8 }}
                  title={`${f.label}: ${compact(Math.round(f.unitsByMonth[month] ?? 0))} ${f.unit} this month`}>
              {shareLabel(f.share)}
            </span>
          );
        })}
      </div>
    </div>
  );
}
