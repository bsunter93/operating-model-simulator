import { useMemo } from 'react';
import type { ModelResult } from '../models/results';
import { asUnits, pressureOf, PRESSURE_WORD, workloadOf } from '../lib/workload';
import type { OperatingModel } from '../models/types';

/**
 * The work network, drawn.
 *
 * Every arrow here is a number the engine already had and the interface was summing away:
 * a stream arrives at a team, a share of it escalates to another, what nobody got to
 * waits in front of the block it was queued for, and what will not come back falls out of
 * the bottom. A bar chart can show none of that, because a bar is one team with its
 * history and its neighbours removed.
 *
 * Layout is deterministic and computed from the model: sources on the left, teams ranked
 * by how far down the routing they sit. Nothing is positioned by hand, so an imported
 * model with a different shape draws itself.
 */

export type Sel = { kind: 'team' | 'stream'; id: string } | null;

const SRC_W = 176, SRC_H = 64;
/* Wide enough for the longest team name in the four fixtures. "Community Health Workers"
   and "Fundraising and Partnerships" were both losing their last word to an ellipsis. */
const TEAM_W = 252;
/* A team occupies space in proportion to the people in it. Uniform boxes hid the thing a
   reader most wants to see at a glance: that the team drowning is small and the team with
   nothing to do is large. Sized from the model rather than the month, so scrubbing the
   year moves the numbers and never the furniture. */
const TEAM_H_MIN = 74, TEAM_H_MAX = 122;
function teamHeights(model: OperatingModel): Map<string, number> {
  const fte = model.teams.map((t) => t.currentFte);
  const lo = Math.min(...fte), hi = Math.max(...fte);
  const span = hi - lo;
  return new Map(model.teams.map((t) => [
    t.id,
    Math.round(span > 0 ? TEAM_H_MIN + (TEAM_H_MAX - TEAM_H_MIN) * ((t.currentFte - lo) / span) : (TEAM_H_MIN + TEAM_H_MAX) / 2),
  ]));
}
/* Wide enough that a split's label fits in the gap it belongs to. At 104 the label for a
   six percent escalation landed on the block it was escalating to. */
const COL_GAP = 150, ROW_GAP = 26;
const PAD_X = 10, PAD_Y = 14;
const QUEUE_W = 26;

interface Placed { x: number; y: number; w: number; h: number }

export interface Layout {
  width: number;
  height: number;
  sources: Map<string, Placed>;
  teams: Map<string, Placed>;
}

/** Teams sit one column to the right of whatever feeds them. Sources sit beside the team
    they arrive at, so the common case (one stream, one team) draws a straight line. */
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
  for (const t of model.teams) {
    const r = rank.get(t.id)! - 1;
    (cols[r] ??= []).push(t.id);
  }
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

  /* Everything after the first column is placed opposite whatever feeds it, then swept
     downwards so nothing lands on anything else. A first cut nudged each box once and let
     it collide with the next one, which stacked three sources in the same 60 pixels. */
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
    const boxes = cols[c].map((id) => {
      const ups = routes.filter((r) => r.toTeamId === id).map((r) => teams.get(r.sourceId)).filter(Boolean) as Placed[];
      const box = teams.get(id)!;
      if (ups.length) box.y = ups.reduce((a, u) => a + u.y + u.h / 2, 0) / ups.length - box.h / 2;
      return box;
    });
    sweep(boxes, ROW_GAP);
  }

  const sources = new Map<string, Placed>();
  const byTeam = new Map<string, string[]>();
  for (const f of result.flow) {
    if (f.kind !== 'arrival') continue;
    const list = byTeam.get(f.toTeamId) ?? [];
    list.push(f.sourceId);
    byTeam.set(f.toTeamId, list);
  }
  const want: { id: string; x: number; y: number; w: number; h: number }[] = [];
  /* A team with no arriving work is not a gap in the diagram, it is a team whose whole
     year is change work. Saying so is the point: those are the teams with no queue. */
  for (const t of model.teams) if (!byTeam.has(t.id)) byTeam.set(t.id, [`none:${t.id}`]);
  for (const [teamId, ids] of byTeam) {
    const box = teams.get(teamId)!;
    const mid = box.y + box.h / 2;
    const span = (ids.length - 1) * (SRC_H + 12);
    ids.forEach((id, i) => {
      want.push({ id, x: PAD_X, y: mid - span / 2 - SRC_H / 2 + i * (SRC_H + 12), w: SRC_W, h: SRC_H });
    });
  }
  for (const s of sweep(want, 12)) sources.set(s.id, { x: s.x, y: s.y, w: s.w, h: s.h });

  const all = [...sources.values(), ...teams.values()];
  return {
    width: colX(Math.max(1, cols.length) - 1) + TEAM_W + PAD_X + 46,
    height: Math.max(...all.map((p) => p.y + p.h)) + PAD_Y + 26,
    sources, teams,
  };
}

/* A route taking one case in seventy-seven is not "1%": rounded to the nearest whole
   number the small splits all read the same, and the small splits are the ones nobody
   expects to matter. */
export const shareLabel = (v: number) =>
  (v < 0.02 ? (v * 100).toFixed(1) : String(Math.round(v * 100))) + '%';

const curve = (x1: number, y1: number, x2: number, y2: number) => {
  const dx = Math.max(46, (x2 - x1) / 2.1);
  return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
};

interface Props {
  model: OperatingModel;
  result: ModelResult;
  month: number;
  selected: Sel;
  onSelect: (s: Sel) => void;
  compact: (n: number) => string;
}

export function FlowCanvas({ model, result, month, selected, onSelect, compact }: Props) {
  const geo = useMemo(() => layout(model, result), [model, result]);
  const teamName = (id: string) => model.teams.find((t) => t.id === id)?.name ?? id;
  const rowOf = (id: string) => result.teams.find((t) => t.teamId === id)?.months[month];

  const edges = result.flow.map((f) => ({ f, units: f.unitsByMonth[month] ?? 0 }));
  const peak = Math.max(1, ...edges.map((e) => e.units));
  const isOn = (kind: 'team' | 'stream', id: string) => selected?.kind === kind && selected.id === id;
  /* One selection lights the whole path it touches, because the point of the picture is
     that a team is not an island: its queue is somebody else's escalation. */
  const lit = (teamId: string, sourceId: string, viaStream?: string) =>
    !selected ? false
      : selected.kind === 'team' ? selected.id === teamId || selected.id === sourceId
        : selected.id === sourceId || selected.id === viaStream;
  /* A block stays lit when the selected thing feeds it or is fed by it. Dimming a team
     while highlighting the stream landing on it hid the half of the answer that matters. */
  const near = (teamId: string) => {
    if (!selected) return true;
    if (selected.kind === 'team') {
      if (selected.id === teamId) return true;
      return result.flow.some((f) => f.kind === 'route'
        && ((f.sourceId === selected.id && f.toTeamId === teamId) || (f.sourceId === teamId && f.toTeamId === selected.id)));
    }
    /* Including the escalations: a stream that lands on one team ends up on three, and
       that is the thing about it worth seeing. */
    return result.flow.some((f) => (f.sourceId === selected.id || f.viaStreamId === selected.id) && f.toTeamId === teamId);
  };

  return (
    <div className="fc-scroll">
      <div className="fc" style={{ width: geo.width, height: geo.height }}>
        <svg className="fc-wires" viewBox={`0 0 ${geo.width} ${geo.height}`} aria-hidden="true">
          {edges.map(({ f, units }) => {
            const from = f.kind === 'arrival' ? geo.sources.get(f.sourceId) : geo.teams.get(f.sourceId);
            const to = geo.teams.get(f.toTeamId);
            if (!from || !to) return null;
            const d = curve(from.x + from.w, from.y + from.h / 2, to.x - QUEUE_W - 6, to.y + to.h / 2);
            const rel = units / peak;
            const on = lit(f.toTeamId, f.sourceId, f.viaStreamId);
            return (
              <g key={f.id} className={'fc-edge' + (on ? ' on' : selected ? ' dim' : '')}>
                <path className="fc-wire" d={d} style={{ strokeWidth: 1 + 3.4 * Math.sqrt(rel) }} />
                <path className="fc-pulse" d={d}
                      style={{ strokeWidth: 1 + 3.4 * Math.sqrt(rel), animationDuration: `${(2.9 - 2 * rel).toFixed(2)}s` }} />
              </g>
            );
          })}
          {/* What nobody got to and nobody will: it leaves the system, so it leaves the
              picture. This is the only thing on the canvas drawn in the alert colour. */}
          {result.teams.map((t) => {
            const m = t.months[month];
            if (!m || m.shedHours <= 0) return null;
            const box = geo.teams.get(t.teamId)!;
            const x = box.x + box.w * 0.5, y = box.y + box.h;
            return (
              <g key={t.teamId} className="fc-shed">
                <path d={`M${x},${y} L${x},${y + 16}`} />
                <path d={`M${x - 4},${y + 11} L${x},${y + 17} L${x + 4},${y + 11}`} />
              </g>
            );
          })}
        </svg>

        {model.teams.filter((t) => !result.flow.some((f) => f.kind === 'arrival' && f.toTeamId === t.id))
          .map((t) => {
            const p = geo.sources.get(`none:${t.id}`);
            if (!p) return null;
            return (
              <span key={t.id} className={'fc-src fc-src-none' + (selected ? ' dim' : '')}
                    style={{ left: p.x, top: p.y, width: p.w, height: p.h }}>
                <span className="fc-src-n">Change work only</span>
                <span className="fc-src-v">nothing queues here</span>
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
                    onClick={() => onSelect(isOn('stream', f.sourceId) ? null : { kind: 'stream', id: f.sourceId })}>
              <span className="fc-src-n">{f.label}</span>
              <span className="fc-src-v">{compact(Math.round(units))} {f.unit}</span>
            </button>
          );
        })}

        {model.teams.map((t) => {
          const p = geo.teams.get(t.id)!;
          const m = rowOf(t.id);
          const w = workloadOf(result, t.id, month);
          if (!m || !w) return null;
          const util = Math.max(0, m.utilization);
          /* The queue is drawn, not described. Tokens are the month's waiting work as a
             share of what the team can do in a month, so four tokens means four weeks,
             and the count beside them is in the thing the team actually handles. */
          const waiting = m.availableProductiveHours > 0 ? m.carriedInHours / m.availableProductiveHours : 0;
          const tokens = Math.min(7, Math.ceil(waiting * 4));
          const queued = asUnits(w, m.carriedInHours);
          const press = pressureOf(w);
          return (
            <button key={t.id} type="button"
                    className={`fc-node s-${m.status}` + (isOn('team', t.id) ? ' on' : near(t.id) ? '' : ' dim')}
                    style={{ left: p.x, top: p.y, width: p.w, height: p.h }}
                    aria-pressed={isOn('team', t.id)}
                    aria-label={`${t.name}, ${Math.round(util * 100)} percent of capacity, ${Math.round(m.availableFte)} people`}
                    title={t.name}
                    onClick={() => onSelect(isOn('team', t.id) ? null : { kind: 'team', id: t.id })}>
              <span className="fc-q" aria-hidden="true">
                {Array.from({ length: tokens }, (_, i) => <i key={i} />)}
              </span>
              {queued !== null && queued >= 1 && (
                <span className="fc-q-n" aria-hidden="true">{compact(Math.round(queued))}</span>
              )}
              <span className="fc-node-h">
                <b>{t.name}</b>
                <em>{Math.round(m.availableFte)}</em>
              </span>
              <span className="fc-bar">
                <i style={{ width: Math.min(100, util * 100) + '%' }} />
                <u style={{ left: Math.min(100, m.targetUtilization * 100) + '%' }} />
              </span>
              {/* The words first. "112% of capacity" is a number a reader converts before
                  it means anything; "past what it can do" is the thing it means. */}
              <span className="fc-node-f">
                <b className={'p-' + press}>{PRESSURE_WORD[press]}</b>
                <span>{Math.round(util * 100)}% of capacity</span>
                {m.serviceLevel !== null && <span>{Math.round(m.serviceLevel * 100)}% answered</span>}
              </span>
            </button>
          );
        })}

        {result.flow.filter((f) => f.kind === 'route').map((f) => {
          const from = geo.teams.get(f.sourceId), to = geo.teams.get(f.toTeamId);
          if (!from || !to) return null;
          const x = from.x + from.w + 14;
          const y = (from.y + from.h / 2 + to.y + to.h / 2) / 2 - 9;
          const on = lit(f.toTeamId, f.sourceId, f.viaStreamId);
          return (
            <span key={f.id} className={'fc-lbl' + (on ? ' on' : selected ? ' dim' : '')}
                  style={{ left: x, top: y }} title={f.label}>
              {shareLabel(f.share)} · {compact(Math.round(f.unitsByMonth[month] ?? 0))} {f.unit}
            </span>
          );
        })}

        {result.teams.map((t) => {
          const m = t.months[month];
          if (!m || m.shedHours <= 0) return null;
          const box = geo.teams.get(t.teamId)!;
          const w = workloadOf(result, t.teamId, month);
          const lost = w ? asUnits(w, m.shedHours) : null;
          return (
            <span key={t.teamId} className="fc-shed-l"
                  style={{ left: box.x + box.w * 0.5 + 8, top: box.y + box.h + 4 }}
                  title={`${teamName(t.teamId)}: work turned away this month`}>
              {lost !== null && lost >= 1
                ? <>{compact(Math.round(lost))} {w!.unit} turned away</>
                : <>{compact(Math.round(m.shedHours))} hrs turned away</>}
            </span>
          );
        })}
      </div>
    </div>
  );
}
