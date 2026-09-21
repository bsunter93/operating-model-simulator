import { useMemo } from 'react';
import type { ModelResult } from '../models/results';
import type { OperatingModel } from '../models/types';
import { asUnits, pressureOf, PRESSURE_WORD, workloadOf } from '../lib/workload';

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
const TEAM_W = 214;
/* Small enough that eight teams are one screen rather than one and a half, tall enough
   to carry the team's whole year under its gauge. */
const TEAM_H_MIN = 58, TEAM_H_MAX = 86;
const ROW_GAP = 15;
/* Room for a queue to grow into before it reaches whatever is feeding it. */
const QUEUE_W = 68, WIRE_W = 52;
const COL_GAP = QUEUE_W + WIRE_W;

/** One mark to a day of the team's own capacity. At half a week the queues were three or
    four marks long, which is a number in disguise rather than a line you can read. */
const MARK_UNIT = 1 / 21;
const MARK_MAX = 40;
const MARK_ROWS = 4;

interface Placed { x: number; y: number; w: number; h: number }

export interface Layout {
  width: number;
  height: number;
  sources: Map<string, Placed>;
  teams: Map<string, Placed>;
}

/** How many people one figure stands for, chosen so the largest team shows about eight of
    them. A fixed scale would draw forty figures for one team and one for another. */
function peopleScale(model: OperatingModel): number {
  const hi = Math.max(...model.teams.map((t) => t.currentFte));
  return Math.max(1, Math.round(hi / 8));
}

/** A team occupies space in proportion to the people in it, from the model rather than the
    month, so scrubbing the year moves the numbers and never the furniture. */
function teamHeights(model: OperatingModel): Map<string, number> {
  const fte = model.teams.map((t) => t.currentFte);
  const lo = Math.min(...fte), hi = Math.max(...fte);
  const span = hi - lo;
  return new Map(model.teams.map((t) => [
    t.id,
    Math.round(span > 0
      ? TEAM_H_MIN + (TEAM_H_MAX - TEAM_H_MIN) * ((t.currentFte - lo) / span)
      : (TEAM_H_MIN + TEAM_H_MAX) / 2),
  ]));
}

export function layout(model: OperatingModel, result: ModelResult): Layout {
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
  const colX = (c: number) => PAD_X + SRC_W + COL_GAP + c * (TEAM_W + COL_GAP);
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
    sources, teams,
  };
}

/* A route taking one case in seventy-seven is not "1%": rounded to the nearest whole
   number the small splits all read the same, and the small splits are the ones nobody
   expects to matter. */
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

const curve = (x1: number, y1: number, x2: number, y2: number) => {
  const dx = Math.max(34, (x2 - x1) / 2.1);
  return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
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
}

export function FlowCanvas({ model, result, month, selected, onSelect, compact, pipeline, monthLabels }: Props) {
  const geo = useMemo(() => layout(model, result), [model, result]);
  const per = useMemo(() => peopleScale(model), [model]);
  const edges = result.flow.map((f) => ({ f, units: f.unitsByMonth[month] ?? 0 }));
  const peak = Math.max(1, ...edges.map((e) => e.units));
  const isOn = (kind: 'team' | 'stream', id: string) => selected?.kind === kind && selected.id === id;
  const lit = (teamId: string, sourceId: string, viaStream?: string) =>
    !selected ? false
      : selected.kind === 'team' ? selected.id === teamId || selected.id === sourceId
        : selected.id === sourceId || selected.id === viaStream;
  const near = (teamId: string) => {
    if (!selected) return true;
    if (selected.kind === 'team') {
      if (selected.id === teamId) return true;
      return result.flow.some((f) => f.kind === 'route'
        && ((f.sourceId === selected.id && f.toTeamId === teamId)
          || (f.sourceId === teamId && f.toTeamId === selected.id)));
    }
    return result.flow.some((f) =>
      (f.sourceId === selected.id || f.viaStreamId === selected.id) && f.toTeamId === teamId);
  };

  return (
    <div className="fc-scroll">
      <div className="fc" style={{ width: geo.width, height: geo.height }}>
        <svg className="fc-wires" viewBox={`0 0 ${geo.width} ${geo.height}`} aria-hidden="true">
          {edges.map(({ f, units }) => {
            const from = f.kind === 'arrival' ? geo.sources.get(f.sourceId) : geo.teams.get(f.sourceId);
            const to = geo.teams.get(f.toTeamId);
            if (!from || !to) return null;
            const d = curve(from.x + from.w, from.y + from.h / 2, to.x - QUEUE_W, to.y + to.h / 2);
            const rel = units / peak;
            const on = lit(f.toTeamId, f.sourceId, f.viaStreamId);
            return (
              <g key={f.id} className={'fc-edge' + (on ? ' on' : selected ? ' dim' : '')}>
                {/* Three strokes make a channel rather than an arrow: a surface the work
                    travels on, its centre line, and the work itself moving down it. */}
                <path className="fc-lane" d={d} style={{ strokeWidth: 7 + 5 * Math.sqrt(rel) }} />
                <path className="fc-wire" d={d} style={{ strokeWidth: 1 + 2 * Math.sqrt(rel) }} />
                <path className="fc-pulse" d={d}
                      style={{ strokeWidth: 2 + 3 * Math.sqrt(rel),
                               animationDuration: `${(2.9 - 2 * rel).toFixed(2)}s` }} />
              </g>
            );
          })}
        </svg>

        {model.teams
          .filter((t) => !result.flow.some((f) => f.kind === 'arrival' && f.toTeamId === t.id))
          .map((t) => {
            const box = geo.teams.get(t.id);
            if (!box) return null;
            return (
              <span key={t.id} className={'fc-inhouse' + (selected ? ' dim' : '')}
                    style={{ left: box.x - QUEUE_W - 4, top: box.y + box.h / 2 - 7 }}
                    title={`${t.name} has no arriving work: its year is change work`}>
                no queue
              </span>
            );
          })}

        {result.flow.filter((f) => f.kind === 'arrival').map((f) => {
          const p = geo.sources.get(f.sourceId)!;
          const units = f.unitsByMonth[month] ?? 0;
          return (
            <button key={f.sourceId} type="button"
                    className={'fc-src' + (isOn('stream', f.sourceId) ? ' on' : selected ? ' dim' : '')}
                    style={{ left: p.x, top: p.y, width: p.w, height: p.h }}
                    aria-pressed={isOn('stream', f.sourceId)}
                    aria-label={`${f.label}: ${Math.round(units)} ${f.unit} this month`}
                    title={`${f.label}: ${compact(Math.round(units))} ${f.unit} this month`}
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
          const shed = m.shedHours > 0
            ? Math.min(14, Math.ceil((m.shedHours / Math.max(1, m.availableProductiveHours)) / MARK_UNIT))
            : 0;
          const series = result.teams.find((x) => x.teamId === t.id)!.months.map((x) => x.utilization);
          const pending = pipeline(t.id);
          const queued = asUnits(w, m.carriedInHours);
          const lost = asUnits(w, m.shedHours);
          /* Everything a card used to print, moved to the one moment somebody asks. */
          const tip = [
            `${t.name}: ${PRESSURE_WORD[press].toLowerCase()}, ${Math.round(util * 100)}% of capacity`,
            `${Math.round(m.availableFte)} people`,
            m.serviceLevel !== null ? `${Math.round(m.serviceLevel * 100)}% answered in time` : null,
            pending ? `${pending.headcount} arriving ${monthLabels[pending.landsAt] ?? 'after this year'}` : null,
            queued !== null && queued >= 1 ? `${compact(Math.round(queued))} ${w.unit} waiting` : null,
            lost !== null && lost >= 1 ? `${compact(Math.round(lost))} ${w.unit} turned away` : null,
          ].filter(Boolean).join(' · ');
          return (
            <button key={t.id} type="button"
                    className={`fc-node s-${m.status}` + (isOn('team', t.id) ? ' on' : near(t.id) ? '' : ' dim')}
                    style={{ left: p.x, top: p.y, width: p.w, height: p.h }}
                    aria-pressed={isOn('team', t.id)} aria-label={tip} title={tip}
                    onClick={() => onSelect(isOn('team', t.id) ? null : { kind: 'team', id: t.id })}>
              {marks > 0 && (
                <span className="fc-q" aria-hidden="true">
                  {Array.from({ length: Math.ceil(marks / MARK_ROWS) }, (_, c) => (
                    <span key={c}>
                      {Array.from({ length: Math.min(MARK_ROWS, marks - c * MARK_ROWS) }, (_, r) => <i key={r} />)}
                    </span>
                  ))}
                </span>
              )}
              <span className="fc-node-h">
                <b className="fc-node-n">{t.name}</b>
                {/* The people, countable. One figure to a few of them, so a big team looks
                    like a big team rather than like a bigger number. */}
                <span className="fc-ppl" aria-hidden="true"
                      title={`${Math.round(m.availableFte)} people, one figure to ${per}`}>
                  {Array.from({ length: Math.max(1, Math.min(9, Math.round(m.availableFte / per))) },
                    (_, i) => <i key={i} />)}
                </span>
              </span>
              <span className="fc-bar">
                <i style={{ width: Math.min(100, util * 100) + '%' }} />
                <u style={{ left: Math.min(100, m.targetUtilization * 100) + '%' }} />
              </span>
              {/* People asked for, on their way. Hollow until they are in their seats, so a
                  reader watches capacity arrive rather than reading that it will. */}
              {/* The team's own twelve months, under its gauge. A block that shows only
                  today makes a reader scrub to learn the shape; this carries it. */}
              <svg className="fc-spark" viewBox="0 0 100 16" preserveAspectRatio="none" aria-hidden="true">
                <path className="fc-spark-a" d={sparkArea(series, month)} />
                <path className="fc-spark-l" d={sparkLine(series)} />
                <line className="fc-spark-t" x1="0" x2="100"
                      y1={sparkY(m.targetUtilization)} y2={sparkY(m.targetUtilization)} />
                <circle className="fc-spark-d" r="1.9"
                        cx={series.length > 1 ? (month / (series.length - 1)) * 100 : 50}
                        cy={sparkY(util)} />
              </svg>
              {pending && (
                <span className="fc-pipe" title={`${pending.headcount} people arriving ${monthLabels[pending.landsAt] ?? 'after this year'}`}>
                  {Array.from({ length: Math.min(10, pending.headcount) }, (_, i) => <i key={i} />)}
                  <em>{monthLabels[pending.landsAt] ?? 'next year'}</em>
                </span>
              )}
              {shed > 0 && (
                <span className="fc-shed" aria-hidden="true">
                  {Array.from({ length: shed }, (_, i) => <i key={i} />)}
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
