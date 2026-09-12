import { model, useStore } from '../state/store';
import { TeamTimeline } from '../components/charts/TeamTimeline';
import { StatusPill } from '../components/StatusPill';
import { monthLabel, num, pct } from '../lib/format';

export function TeamView({ teamId }: { teamId: string }) {
  const { result, doNothing, state } = useStore();
  const team = result.teams.find((t) => t.teamId === teamId)!;
  const ghost = doNothing.teams.find((t) => t.teamId === teamId)!;
  const def = model.teams.find((t) => t.id === teamId)!;
  const landing = team.months.filter((m) => m.hiresLanded > 0);
  const firstOver = team.months.find((m) => m.status === 'constrained' || m.status === 'severe');
  const lastOver = [...team.months].reverse().find((m) => m.status === 'constrained' || m.status === 'severe');
  const peak = team.months.find((m) => m.month === team.peakMonth)!;
  const planned = model.hiringPlan.filter((h) => h.teamId === teamId);
  const streams = model.demandStreams.filter((s) => s.teamId === teamId);

  return (
    <main className="main">
      <div className="eyebrow">Capacity timeline</div>
      <div className="teamhead">
        <h1 className="title">{def.name}</h1>
        <select className="teampick" value={teamId} onChange={(e) => { window.location.hash = `#/capacity/${e.target.value}`; }} aria-label="Team">
          {model.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <StatusPill status={team.worstStatus} />
      </div>
      <ul className="facts">
        <li><b>{Math.round(team.startingFte)} → {Math.round(team.endingFte)}</b>FTE, Jan to Dec</li>
        <li><b>{pct(team.peakUtilization)}</b>peak, {monthLabel(team.peakMonth)}</li>
        <li><b>{team.monthsConstrained}</b>months over {pct(def.targetUtilization)} target</li>
        <li><b>{team.peakWorkforceGap.toFixed(1)}</b>FTE short at peak</li>
        <li><b>{pct(1 - def.shrinkage)}</b>of paid hours productive</li>
        {landing.length > 0 && <li><b>{landing.map((m) => `+${Math.round(m.hiresLanded)} ${monthLabel(m.month)}`).join(', ')}</b>hires landing</li>}
      </ul>

      <div className="chart">
        <div className="chart-title">
          <b>Monthly workload against capacity</b>
          <span>{streams.length ? streams.map((s) => `${num(s.annualVolume)} ${s.unit}/yr at ${s.handlingMinutesPerUnit >= 60 ? `${(s.handlingMinutesPerUnit / 60).toFixed(0)} h` : `${s.handlingMinutesPerUnit} min`} each`).join(' · ') : 'Portfolio-only team: workload is initiative assignments'}</span>
        </div>
        <TeamTimeline team={team} ghost={state.interventionIds.length ? ghost : undefined} />
        <div className="legend">
          <span><i className="bar" /> run work</span>
          <span><i className="bar2" /> initiative work</span>
          <span><i data-s="severe" /> over target</span>
          <span><i className="tline" /> target capacity ({pct(def.targetUtilization)} of productive hours)</span>
          <span><i className="aline" /> all productive hours</span>
          {state.interventionIds.length > 0 && <span><i className="ghost" /> before interventions</span>}
        </div>
      </div>

      {planned.length > 0 && firstOver && (
        <div className="callout">
          {landing.length > 0 ? (
            <>
              <b>The plan already hires {planned.reduce((s, h) => s + h.headcount, 0)} people for this team.</b> They arrive in <b>{monthLabel(landing[0].month)}</b>.
              {' '}Between {monthLabel(firstOver.month)} and then, the team runs up to <b>{pct(peak.utilization)}</b> of its productive hours against an {pct(def.targetUtilization)} target, {peak.workforceGap.toFixed(0)} people short at the worst point.
              {lastOver && landing[0].monthIndex <= lastOver.monthIndex ? <> Even after they land it is over target through {monthLabel(lastOver.month)}.</> : <> Once they land it clears the target for the rest of the year.</>}
              {' '}Hiring solves the capacity problem eventually. It does not solve the one that exists today.
            </>
          ) : (
            <>
              <b>This scenario cancels the {planned.reduce((s, h) => s + h.headcount, 0)} hires the plan had for this team.</b> It runs over target from {monthLabel(firstOver.month)}{lastOver ? ` through ${monthLabel(lastOver.month)}` : ''}, peaking at {pct(peak.utilization)}.
            </>
          )}
        </div>
      )}

      <section className="sec" style={{ marginTop: 28 }}>
        <h2>Month by month</h2>
        <p className="sub">Available FTE is last month's headcount less attrition plus arrivals. Required FTE is what the workload needs at the {pct(def.targetUtilization)} target.</p>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Month</th><th>FTE</th><th>Arrivals</th><th>Attrition</th><th>Run h</th><th>Initiative h</th><th>Target h</th><th>Util</th><th>Required</th><th>Short</th></tr>
            </thead>
            <tbody>
              {team.months.map((m) => (
                <tr key={m.month} data-s={m.status}>
                  <td>{monthLabel(m.month)}</td>
                  <td className="ink">{m.availableFte.toFixed(1)}</td>
                  <td className={m.hiresLanded + Math.abs(m.reallocated) > 0 ? 'ink' : 'dim'}>{m.hiresLanded > 0 ? `+${Math.round(m.hiresLanded)}` : ''}{m.reallocated !== 0 && (m.monthIndex === 0 || team.months[m.monthIndex - 1].reallocated !== m.reallocated) ? ` ${m.reallocated > 0 ? '+' : ''}${Math.round(m.reallocated)} moved` : ''}{m.hiresLanded === 0 && m.reallocated === 0 ? '—' : ''}</td>
                  <td className="dim">−{m.attritionLoss.toFixed(1)}</td>
                  <td>{num(m.runHours)}</td>
                  <td className={m.portfolioHours > 0 ? '' : 'dim'}>{m.portfolioHours > 0 ? num(m.portfolioHours) : '—'}</td>
                  <td>{num(m.targetCapacityHours)}</td>
                  <td className="ink">{pct(m.utilization)}</td>
                  <td>{m.requiredFte.toFixed(1)}</td>
                  <td className={m.workforceGap > 0 ? 'ink' : 'dim'}>{m.workforceGap > 0 ? m.workforceGap.toFixed(1) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
