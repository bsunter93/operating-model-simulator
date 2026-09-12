import { href, useStore } from '../state/store';
import { WhyTabs } from './Why';
import { BarLine } from '../components/charts/BarLine';
import { Term } from '../components/Term';
import { monthLabel, num, pct } from '../lib/format';
import { monthIndex } from '../engine';

const people = (n: number) => (Math.round(n) === 1 ? '1 person' : `${Math.round(n)} people`);

/** Who we actually have, month by month: attrition, arrivals, and when each team first needs more than it has. */
export function Workforce() {
  const { result, base, model, state, teamName } = useStore();
  const months = result.months;
  const n = months.length;
  const totalFte = months.map((_, i) => result.teams.reduce((s, t) => s + t.months[i].availableFte, 0));
  const totalLoss = result.teams.reduce((s, t) => s + t.months.reduce((a, m) => a + m.attritionLoss, 0), 0);
  const totalLanded = result.teams.reduce((s, t) => s + t.months.reduce((a, m) => a + m.hiresLanded, 0), 0);
  const requiredTotal = months.map((_, i) => result.teams.reduce((s, t) => s + t.months[i].requiredFte, 0));
  const start = result.summary.startingFte, end = result.summary.endingFte;
  const landings = months.map((_, i) => result.teams.reduce((s, t) => s + t.months[i].hiresLanded, 0));
  const notes = landings.map((v, i) => (v > 0 ? { index: i, text: `+${Math.round(v)} land` } : null)).filter((x): x is { index: number; text: string } => x !== null);

  // Hiring requests: request month, landing month, and the month the team first needs them.
  const requests = model.hiringPlan.map((h) => {
    const t = result.teams.find((x) => x.teamId === h.teamId)!;
    const reqIdx = monthIndex(model.calendar.startMonth, h.requestMonth);
    const landIdx = t.months.findIndex((m) => m.hiresLanded > 0 && m.monthIndex >= reqIdx);
    const needIdx = t.months.findIndex((m) => m.status === 'constrained' || m.status === 'severe');
    return { h, t, reqIdx, landIdx, needIdx, cancelled: landIdx < 0 };
  });
  const lateBy = requests.filter((r) => !r.cancelled && r.needIdx >= 0 && r.landIdx > r.needIdx);
  const wasted = requests.filter((r) => !r.cancelled && r.needIdx < 0);

  const W = 920, LBL = 230, R = 16, T = 30, ROW = 46, PW = W - LBL - R;
  const x = (i: number) => LBL + (PW / n) * i;
  const H = T + ROW * Math.max(1, requests.length) + 8;

  return (
    <main className="main one">
      <div className="eyebrow">2 · Why</div>
      <WhyTabs active="workforce" />
      <h1 className="title">The workforce</h1>
      <p className="lede">
        Headcount is not a number; it is a line that moves every month. People leave at the <Term k="attrition">attrition</Term> rate, hires land after their <Term k="leadTime">lead time</Term>, and the work does not wait for either.
      </p>

      <div className="flow" aria-label="Headcount over the year">
        <div><b>{Math.round(start)}</b><span>people in {monthLabel(months[0])}</span></div>
        <i>→</i>
        <div className="neg"><b>−{Math.round(totalLoss)}</b><span>expected to leave</span></div>
        <i>→</i>
        <div className="pos"><b>+{Math.round(totalLanded)}</b><span>{totalLanded ? 'hires landing' : 'hires landing (none)'}</span></div>
        <i>→</i>
        <div><b>{Math.round(end)}</b><span>people in {monthLabel(months[n - 1])}</span></div>
      </div>
      <p className="versus">
        {end < start
          ? <>The plan has no automatic backfill. {people(totalLoss)} are expected to leave over the year and {totalLanded ? `only ${Math.round(totalLanded)} arrive` : 'nobody arrives'}, so the organization ends {Math.round(start - end)} people smaller than it started.</>
          : <>Hiring outruns attrition: the organization ends the year {Math.round(end - start)} people larger.</>}
        {!state.interventionIds.length && base !== result ? '' : ''}
      </p>

      <div className="chart">
        <div className="chart-title"><b>People available, month by month</b><span>all modeled teams · dashed line is what the work would need at every team's target</span></div>
        <BarLine
          months={months}
          series={[{ key: 'fte', label: 'available', values: totalFte, color: 'var(--accent)' }]}
          lines={[{ label: 'people the work needs', values: requiredTotal, color: 'var(--warm)', dashed: true }, { label: `${monthLabel(months[0])} headcount`, values: months.map(() => start), color: 'var(--muted)', dashed: true }]}
          notes={notes}
          format={(v) => `${Math.round(v)}`}
          yLabel="PEOPLE"
          zero={false}
          tip={(i) => `<b>${monthLabel(months[i], true)}</b>${Math.round(totalFte[i])} people available · ${Math.round(requiredTotal[i])} needed at target<br>${landings[i] ? `${Math.round(landings[i])} hires land · ` : ''}${result.teams.reduce((s, t) => s + t.months[i].attritionLoss, 0).toFixed(1)} expected to leave`}
        />
        <div className="legend"><span><i className="bar" /> people available</span><span><i className="tline" /> people the work needs at target</span><span><i className="aline" /> starting headcount</span></div>
      </div>

      <section className="sec">
        <h2>When the hires land, against when they are needed</h2>
        <p className="sub">Each planned request from the month it is raised to the month people start. The marker is the first month that team goes over target.</p>
        {requests.length === 0 ? <div className="empty">No hiring requests in this plan.</div> : (
          <div className="chart" data-tour="hiring">
            <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Hiring timing">
              {months.map((m, i) => (
                <g key={m}>
                  <line x1={x(i)} x2={x(i)} y1={T - 6} y2={H - 8} stroke="var(--hair)" />
                  <text x={x(i) + PW / n / 2} y={T - 12} textAnchor="middle" fontSize={11} fontFamily="var(--mono)" fill="var(--muted)">{monthLabel(m)}</text>
                </g>
              ))}
              <line x1={x(n)} x2={x(n)} y1={T - 6} y2={H - 8} stroke="var(--line)" />
              {requests.map((r, row) => {
                const y = T + ROW * row;
                const late = !r.cancelled && r.needIdx >= 0 && r.landIdx > r.needIdx;
                return (
                  <g key={r.h.id}>
                    <text x={0} y={y + 18} fontSize={13} fontWeight={600} fontFamily="var(--sans)" fill="var(--ink)">{teamName(r.h.teamId)}</text>
                    <text x={0} y={y + 32} fontSize={11} fontFamily="var(--sans)" fill="var(--muted)">{r.h.headcount} people · {r.cancelled ? 'cancelled in this scenario' : `${r.landIdx - r.reqIdx}-month lead time`}</text>
                    {!r.cancelled && (
                      <>
                        <rect x={x(r.reqIdx)} y={y + 12} width={Math.max(2, x(r.landIdx) - x(r.reqIdx))} height={12} fill="var(--accent-soft)" stroke="var(--accent)" strokeDasharray="3 3" rx={2} />
                        <rect x={x(r.landIdx)} y={y + 12} width={PW / n} height={12} fill="var(--accent)" rx={2} />
                        <text x={x(r.landIdx) + PW / n + 4} y={y + 22} fontSize={10.5} fontFamily="var(--mono)" fill="var(--accent)">+{r.h.headcount} start</text>
                      </>
                    )}
                    {r.cancelled && <rect x={x(r.reqIdx)} y={y + 12} width={PW / n} height={12} fill="none" stroke="var(--muted)" strokeDasharray="3 3" rx={2} />}
                    {r.needIdx >= 0 && (
                      <>
                        <line x1={x(r.needIdx)} x2={x(r.needIdx)} y1={y + 8} y2={y + 28} stroke="var(--alert)" strokeWidth={2} />
                        <text x={x(r.needIdx) + 4} y={y + 5} fontSize={10.5} fontFamily="var(--mono)" fill="var(--alert)">over target from {monthLabel(months[r.needIdx])}</text>
                      </>
                    )}
                    {late && <text x={x(r.needIdx) + 4} y={y + 38} fontSize={10.5} fontFamily="var(--mono)" fill="var(--alert)">hires are {r.landIdx - r.needIdx} month{r.landIdx - r.needIdx === 1 ? '' : 's'} late</text>}
                  </g>
                );
              })}
            </svg>
            <div className="legend"><span><i className="ghostbar" /> waiting for hires</span><span><i className="bar" /> hires start</span><span><i className="alertline" /> team goes over target</span></div>
          </div>
        )}
        {lateBy.length > 0 && (
          <div className="callout">
            <b>{lateBy.length === 1 ? `${teamName(lateBy[0].h.teamId)}'s hires arrive ${lateBy[0].landIdx - lateBy[0].needIdx} months after the team goes over target.` : `${lateBy.length} of ${requests.length} hiring requests land after their team is already over target.`}</b>
            {' '}The plan is not wrong to hire; it is wrong about when the need starts. Whatever bridges the gap has to work faster than recruiting does.
          </div>
        )}
        {wasted.length > 0 && <p className="note">{wasted.map((r) => teamName(r.h.teamId)).join(', ')}: hires planned for a team that never goes over target in this configuration.</p>}
      </section>

      <section className="sec">
        <h2>Team by team</h2>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Team</th><th>Jan</th><th><Term k="attrition">Leaving</Term></th><th>Arriving</th><th>Dec</th><th>Peak <Term k="required">needed</Term></th><th>Peak <Term k="shortfall">short</Term></th><th>First over target</th></tr></thead>
            <tbody>
              {result.teams.map((t) => {
                const loss = t.months.reduce((s, m) => s + m.attritionLoss, 0);
                const landed = t.months.reduce((s, m) => s + m.hiresLanded, 0);
                const moved = t.months[n - 1].reallocated;
                const peakReq = Math.max(...t.months.map((m) => m.requiredFte));
                return (
                  <tr key={t.teamId} data-s={t.worstStatus}>
                    <td><a href={href(`#/why/${t.teamId}`)}>{teamName(t.teamId)}</a></td>
                    <td className="ink">{Math.round(t.startingFte)}</td>
                    <td className="dim">−{loss.toFixed(1)}</td>
                    <td className={landed + Math.abs(moved) > 0 ? 'ink' : 'dim'}>{landed > 0 ? `+${Math.round(landed)}` : ''}{moved !== 0 ? ` ${moved > 0 ? '+' : ''}${Math.round(moved)} moved` : ''}{landed === 0 && moved === 0 ? '—' : ''}</td>
                    <td className="ink">{Math.round(t.endingFte)}</td>
                    <td>{peakReq.toFixed(0)}</td>
                    <td className={t.peakWorkforceGap > 0.5 ? 'ink' : 'dim'}>{t.peakWorkforceGap > 0.5 ? t.peakWorkforceGap.toFixed(1) : '—'}</td>
                    <td className="dim">{t.firstConstrainedMonth ? `${monthLabel(t.firstConstrainedMonth)} (${pct(t.months.find((m) => m.month === t.firstConstrainedMonth)!.utilization)})` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="note">Leaving is the expected attrition applied month by month; the plan contains no backfill unless a hiring request says so. {num(Math.round(totalLoss))} people across all teams.</p>
      </section>

      <nav className="next">
        <a className="btn ghost" href={href('#/why/cost')}>Next: what it costs →</a>
        <a className="btn" href={href(`#/options/${result.summary.firstBreakTeamId ?? model.teams[0].id}`)}>Or: what to do about it →</a>
      </nav>
    </main>
  );
}
