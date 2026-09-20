import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { TeamTimeline } from './charts/TeamTimeline';
import { StatusPill } from './StatusPill';
import { Term } from './Term';
import { HowCalc } from './HowCalc';
import { monthLabel, pct } from '../lib/format';
import { Portfolio } from '../views/Portfolio';
import { Workforce } from '../views/Workforce';
import { Cost } from '../views/Cost';
import { Organization } from '../views/Organization';
import { About } from '../views/About';

export type Detail = 'initiatives' | 'workforce' | 'cost' | 'organization' | 'about' | null;

const RANK: Record<string, number> = { healthy: 0, watch: 1, constrained: 2, severe: 3 };
const people = (n: number) => (Math.round(n) === 1 ? '1 person' : `${Math.round(n)} people`);

/**
 * The one visual the reader grounds on. It never changes shape: the map of
 * every team's year, the selected team's year beneath it, and the controls.
 * Changes against the base plan are marked on the map itself.
 */
export function Board({ teamId, onTeam, detail, onDetail }: { teamId: string; onTeam: (id: string) => void; detail: Detail; onDetail: (d: Detail) => void }) {
  const { result, base, doNothing, model, state, teamName, isBase, fmt } = useStore();
  const [showBase, setShowBase] = useState(true);
  const team = result.teams.find((t) => t.teamId === teamId)!;
  const ghost = doNothing.teams.find((t) => t.teamId === teamId)!;
  const def = model.teams.find((t) => t.id === teamId)!;
  const firstOver = team.months.find((m) => m.status === 'constrained' || m.status === 'severe');
  const lastOver = [...team.months].reverse().find((m) => m.status === 'constrained' || m.status === 'severe');
  const landing = team.months.filter((m) => m.hiresLanded > 0);
  const planned = model.hiringPlan.filter((h) => h.teamId === teamId).reduce((s, h) => s + h.headcount, 0);
  const now = new Date();
  const nowIdx = result.months.indexOf(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);

  // Cells whose status moved against the base plan.
  const diff = useMemo(() => {
    let worse = 0, better = 0;
    const cells = new Map<string, { d: number; dir: 'worse' | 'better' | 'same' }>();
    for (const t of result.teams) {
      const b = base.teams.find((x) => x.teamId === t.teamId)!;
      t.months.forEach((m, i) => {
        const bm = b.months[i];
        const d = Math.round((m.utilization - bm.utilization) * 100);
        const dir = RANK[m.status] > RANK[bm.status] ? 'worse' : RANK[m.status] < RANK[bm.status] ? 'better' : 'same';
        if (dir === 'worse') worse++; else if (dir === 'better') better++;
        cells.set(`${t.teamId}:${i}`, { d, dir });
      });
    }
    return { cells, worse, better };
  }, [result, base]);

  return (
    <div className="board">
      <div className="board-map">
        <div className="stage-q">
          <h3>The year, team by team</h3>
          <p>
            {result.summary.firstBreakTeamId ? <>{teamName(result.summary.firstBreakTeamId)} goes over capacity in <b>{monthLabel(result.summary.firstBreakMonth!)}</b>; {result.summary.teamsConstrained} of {result.teams.length} teams do at some point.</> : <>No team goes over capacity this year.</>}
            {!isBase && <> Against the base plan: <b className="alert">{diff.worse} cell{diff.worse === 1 ? '' : 's'} worse</b>, <b className="ok">{diff.better} better</b>. <label className="showbase"><input type="checkbox" checked={showBase} onChange={(e) => setShowBase(e.target.checked)} /> show the change</label></>}
          </p>
        </div>
        <div className="tbl-wrap">
          <table className="strip-t big">
            <thead><tr><th>Team</th>{result.months.map((m, i) => <th key={m} className={i === nowIdx ? 'now' : ''}>{monthLabel(m)}{i === nowIdx && <em>now</em>}</th>)}</tr></thead>
            <tbody>
              {result.teams.map((t) => (
                <tr key={t.teamId} className={teamId === t.teamId ? 'focus' : ''}>
                  <td><button className="teamlink" onClick={() => onTeam(t.teamId)}>{teamName(t.teamId)}{teamId === t.teamId ? ' ◀' : ''}</button></td>
                  {t.months.map((m, i) => {
                    const c = diff.cells.get(`${t.teamId}:${i}`)!;
                    const mark = !isBase && showBase && c.dir !== 'same';
                    return (
                      <td key={m.month} className={i === nowIdx ? 'now' : ''}>
                        <button className={'cell' + (mark ? ' ' + c.dir : '')} data-s={m.status} onClick={() => onTeam(t.teamId)} title={`${teamName(t.teamId)}, ${monthLabel(m.month, true)}: ${fmt.num(m.workloadHours)} h of ${fmt.num(m.availableProductiveHours)} h${!isBase ? ` (base plan ${Math.round(base.teams.find((x) => x.teamId === t.teamId)!.months[i].utilization * 100)}%)` : ''}`}>
                          {Number.isFinite(m.utilization) ? Math.round(m.utilization * 100) : '∞'}
                          {!isBase && showBase && c.d !== 0 && <sup>{c.d > 0 ? '+' : ''}{c.d}</sup>}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="legend"><span><i /> within capacity</span><span><i data-s="watch" /> <Term k="watch">watch</Term></span><span><i data-s="constrained" /> <Term k="constrained">over capacity</Term></span><span><i data-s="severe" /> <Term k="severe">over 100%</Term></span>{!isBase && showBase && <><span><i className="dworse" /> worse than base</span><span><i className="dbetter" /> better than base</span></>}</div>
        <HowCalc kind="map" />
      </div>

      <div className="board-team">
        <div className="stage-q">
          <h3><select className="teampick" value={teamId} onChange={(e) => onTeam(e.target.value)} aria-label="Team">{model.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select> <StatusPill status={team.worstStatus} /></h3>
          <p>{firstOver ? <>Over capacity from <b>{monthLabel(firstOver.month)}</b>{lastOver && lastOver !== firstOver ? <> through <b>{monthLabel(lastOver.month)}</b></> : null}, peaking at <b>{pct(team.peakUtilization)}</b> in {monthLabel(team.peakMonth)}, {people(team.peakWorkforceGap)} short.</> : <>Within capacity all year; peak {pct(team.peakUtilization)} in {monthLabel(team.peakMonth)}.</>}
            {planned > 0 && landing.length > 0 && <> The plan hires {planned}; they land in <b>{monthLabel(landing[0].month)}</b>.</>}
            {planned > 0 && landing.length === 0 && <> The plan's {planned} hires are cancelled in this scenario.</>}
          </p>
        </div>
        <div className="chart">
          <TeamTimeline team={team} ghost={state.interventionIds.length ? ghost : undefined} />
          <div className="legend"><span><i className="bar" /> <Term k="run">run work</Term></span><span><i className="bar2" /> <Term k="initiative">initiative work</Term></span><span><i data-s="severe" /> <Term k="gap">over capacity</Term></span><span><i className="tline" /> <Term k="target">target capacity</Term> ({pct(def.targetUtilization)})</span><span><i className="aline" /> <Term k="productive">all productive hours</Term></span>{state.interventionIds.length > 0 && <span><i className="ghost" /> before your levers</span>}</div>
          <HowCalc kind="team" />
        </div>
      </div>

      <div className="board-detail">
        <div className="detail-tabs">
          <span className="lbl">More detail</span>
          {([['initiatives', 'Initiatives'], ['workforce', 'Workforce'], ['cost', 'Cost'], ['organization', 'Pods or pooled'], ['about', 'How this works']] as const).map(([k, label]) => (
            <button key={k} className={detail === k ? 'on' : ''} onClick={() => onDetail(detail === k ? null : k)}>{label}</button>
          ))}
        </div>
        {detail && (
          <div className="detail-body">
            {detail === 'initiatives' && <Portfolio />}
            {detail === 'workforce' && <Workforce />}
            {detail === 'cost' && <Cost />}
            {detail === 'organization' && <Organization />}
            {detail === 'about' && <About />}
          </div>
        )}
      </div>
    </div>
  );
}
