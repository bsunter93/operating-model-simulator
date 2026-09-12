import type { ModelResult, TeamResult } from '../models/results';
import { model, teamName, useStore } from '../state/store';
import { money, monthLabel, pct, signed, num } from '../lib/format';

function peakShortfall(r: ModelResult): { team: TeamResult; month: string; fte: number } | null {
  let best: { team: TeamResult; month: string; fte: number } | null = null;
  for (const t of r.teams) for (const m of t.months) if (!best || m.workforceGap > best.fte) best = { team: t, month: m.month, fte: m.workforceGap };
  return best && best.fte > 0 ? best : null;
}

function Metric({ label, value, tone, delta }: { label: string; value: string; tone?: 'warm' | 'alert'; delta?: { text: string; dir: 'up' | 'down' | 'flat' } }) {
  return (
    <div className="metric">
      <div className="l">{label}</div>
      <div className={'v' + (tone ? ' ' + tone : '')}>{value}</div>
      <div className={'d' + (delta && delta.dir !== 'flat' ? ' ' + delta.dir : '')}>{delta?.text ?? ''}</div>
    </div>
  );
}

export function Overview() {
  const { result, base, isBase } = useStore();
  const s = result.summary;
  const peak = peakShortfall(result);
  const basePeak = peakShortfall(base);
  const nTeams = model.teams.length;
  const first = s.firstBreakTeamId ? teamName(s.firstBreakTeamId) : null;
  const seq = result.constraints.find((c) => c.kind === 'sequencing');
  const seqInit = seq ? model.initiatives.find((i) => i.id === seq.initiativeId) : null;
  const seqSched = seq ? result.initiatives.find((i) => i.initiativeId === seq.initiativeId) : null;

  // Deltas against the base plan, shown only when the reader has changed something.
  const d = (cur: number, ref: number, fmt: (n: number) => string, worseWhenUp = true) => {
    if (isBase || Math.abs(cur - ref) < 1e-9) return undefined;
    const up = cur > ref;
    return { text: `${signed(cur - ref, fmt)} vs base plan`, dir: (up === worseWhenUp ? 'up' : 'down') as 'up' | 'down' };
  };

  return (
    <main className="main">
      <div className="eyebrow">Executive read</div>
      <h1 className="title">Can Atlas execute the 2027 plan?</h1>
      <p className="lede">
        {s.teamsConstrained === 0 ? (
          <>Every team stays within its target all year. </>
        ) : (
          <><b>Most of it, but not all of it at once.</b> {s.teamsConstrained} of {nTeams} teams run over target at some point in the year; the first is <b>{first}</b> in <b>{monthLabel(s.firstBreakMonth ?? '', true)}</b>. </>
        )}
        {seq && seqInit && seqSched && (
          <><b>{seqInit.name}</b> is planned for {monthLabel(seqSched.plannedStart)} but cannot start before {monthLabel(seqSched.effectiveStart ?? '')}, because of a dependency the plan does not account for. </>
        )}
        {peak && <>The largest single shortfall is <b>{peak.fte.toFixed(0)} people</b> in {teamName(peak.team.teamId)} in {monthLabel(peak.month)}.</>}
      </p>

      <div className="metrics">
        <Metric label="Revenue target" value={money(model.strategy.revenueTargetUsd)} delta={{ text: `${pct(model.strategy.growthTargetPct)} growth`, dir: 'flat' }} />
        <Metric label="Headcount, Jan → Dec" value={`${Math.round(s.startingFte)} → ${Math.round(s.endingFte)}`} delta={{ text: s.endingFte < s.startingFte ? 'attrition outruns the hiring plan' : 'hiring outruns attrition', dir: 'flat' }} />
        <Metric label="Peak shortfall" value={peak ? `${peak.fte.toFixed(0)} FTE` : 'none'} tone={peak ? 'alert' : undefined}
          delta={peak ? (isBase ? { text: `${teamName(peak.team.teamId)}, ${monthLabel(peak.month)}`, dir: 'flat' } : d(peak.fte, basePeak?.fte ?? 0, (n) => `${n.toFixed(0)} FTE`)) : undefined} />
        <Metric label="Teams over target" value={`${s.teamsConstrained} of ${nTeams}`} tone={s.teamsConstrained ? 'alert' : undefined} delta={d(s.teamsConstrained, base.summary.teamsConstrained, (n) => `${n}`) ?? { text: `${s.teamsWatch} more on watch`, dir: 'flat' }} />
        <Metric label="Initiative load" value={pct(s.portfolioLoad)} delta={{ text: 'share of target capacity consumed by initiatives', dir: 'flat' }} />
        <Metric label="Budget variance" value={money(s.annualBudgetVarianceUsd, { sign: true })} tone={s.annualBudgetVarianceUsd > 0 ? 'alert' : undefined}
          delta={d(s.annualBudgetVarianceUsd, base.summary.annualBudgetVarianceUsd, (n) => money(n)) ?? { text: s.annualBudgetVarianceUsd > 0 ? 'over the modeled cap' : 'under the modeled cap', dir: 'flat' }} />
        <Metric label="Revenue exposure" value={money(s.revenueExposureUsd)} tone="warm" delta={d(s.revenueExposureUsd, base.summary.revenueExposureUsd, (n) => money(n)) ?? { text: 'revenue at risk × failure odds', dir: 'flat' }} />
        <Metric label="Initiatives delayed" value={`${s.initiativesDelayed} of ${model.initiatives.length}`} tone={s.initiativesDelayed ? 'warm' : undefined} delta={{ text: 'by dependencies the plan did not sequence', dir: 'flat' }} />
      </div>

      <section className="sec">
        <h2>What breaks first</h2>
        <p className="sub">Every constraint here is computed from the monthly model, ranked by what it costs. Nothing on this list is hardcoded.</p>
        {result.constraints.length === 0 ? <div className="empty">No constraints. Every team stays within target and every initiative starts when planned.</div> : (
          <ol className="cons">
            {result.constraints.map((c, i) => (
              <li key={c.id} className="con" data-kind={c.kind}>
                <div className="n">{i + 1}</div>
                <div>
                  <div className="t">
                    {c.teamId ? <a href={`#/capacity/${c.teamId}`}>{c.title}</a> : c.title}
                    <span className="k">{c.kind}</span>
                  </div>
                  <div className="w">{c.detail}</div>
                </div>
                <div className="i">
                  <b>{c.businessImpactUsd > 0 ? money(c.businessImpactUsd) : '—'}</b>
                  <span>{c.firstMonth ? `from ${monthLabel(c.firstMonth, true)}` : ''}</span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="sec">
        <h2>Where and when</h2>
        <p className="sub">Utilization by team and month: workload as a share of productive hours. Colored cells are above the team's own target. Click a team to open its timeline.</p>
        <div className="tbl-wrap">
          <table className="strip">
            <thead>
              <tr>
                <th>Team</th>
                {result.months.map((m) => <th key={m}>{monthLabel(m)}</th>)}
              </tr>
            </thead>
            <tbody>
              {result.teams.map((t) => (
                <tr key={t.teamId}>
                  <td><a href={`#/capacity/${t.teamId}`}>{teamName(t.teamId)}</a></td>
                  {t.months.map((m) => (
                    <td key={m.month}><span className="cell" data-s={m.status} title={`${teamName(t.teamId)}, ${monthLabel(m.month, true)}: ${num(m.workloadHours)} h of ${num(m.availableProductiveHours)} h, target ${pct(m.targetUtilization)}`}>{Number.isFinite(m.utilization) ? Math.round(m.utilization * 100) : '∞'}</span></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="legend"><span><i /> within target</span><span><i data-s="watch" /> watch, within 5 points of target</span><span><i data-s="constrained" /> over target</span><span><i data-s="severe" /> over 100%</span></div>
      </section>

      <section className="sec">
        <h2>What changes it</h2>
        <p className="sub">
          The plan already hires. The question is what closes the gap before those people arrive. Pick a scenario and stack interventions in the panel; every number on this page recomputes. Then open the <a href="#/capacity/team-implementation">Implementation timeline</a> to see the month the hires land.
        </p>
      </section>
    </main>
  );
}
