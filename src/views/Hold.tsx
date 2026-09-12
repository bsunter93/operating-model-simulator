import type { ModelResult, TeamResult } from '../models/results';
import { href, useStore } from '../state/store';
import { money, monthLabel, pct, signed, num } from '../lib/format';
import { verdict } from '../lib/verdict';
import { Term } from '../components/Term';
import type { TermKey } from '../lib/glossary';
import { Loop } from '../components/Loop';

function peakShortfall(r: ModelResult): { team: TeamResult; month: string; fte: number } | null {
  let best: { team: TeamResult; month: string; fte: number } | null = null;
  for (const t of r.teams) for (const m of t.months) if (!best || m.workforceGap > best.fte) best = { team: t, month: m.month, fte: m.workforceGap };
  return best && best.fte > 0 ? best : null;
}
const people = (n: number) => (Math.round(n) === 1 ? '1 person' : `${Math.round(n)} people`);

function Metric({ label, term, value, tone, delta }: { label: string; term?: TermKey; value: string; tone?: 'warm' | 'alert'; delta?: { text: string; dir: 'up' | 'down' | 'flat' } }) {
  return (
    <div className="metric">
      <div className="l">{term ? <Term k={term}>{label}</Term> : label}</div>
      <div className={'v' + (tone ? ' ' + tone : '')}>{value}</div>
      <div className={'d' + (delta && delta.dir !== 'flat' ? ' ' + delta.dir : '')}>{delta?.text ?? ''}</div>
    </div>
  );
}

export function Hold() {
  const { result, base, isBase, model, teamName, initName } = useStore();
  const s = result.summary;
  const v = verdict(result, teamName, initName, isBase ? undefined : base);
  const peak = peakShortfall(result);
  const basePeak = peakShortfall(base);
  const nTeams = model.teams.length;
  const year = model.calendar.startMonth.slice(0, 4);
  const firstCap = result.constraints.find((c) => c.kind === 'capacity');

  const d = (cur: number, ref: number, fmt: (n: number) => string, worseWhenUp = true) => {
    if (isBase || Math.abs(cur - ref) < 1e-9) return undefined;
    const up = cur > ref;
    return { text: `${signed(cur - ref, fmt)} vs base plan`, dir: (up === worseWhenUp ? 'up' : 'down') as 'up' | 'down' };
  };

  return (
    <main className="main one">
      <div className="purpose">
        <div className="purpose-text">
          <b>A month-by-month model of one company's plan.</b> Strategy becomes work, work becomes hours, hours become people. Decisions change the strategy and the loop runs again. Change anything; every number recomputes.
        </div>
        <Loop />
      </div>

      <div className="eyebrow">1 · Can the plan work?</div>
      <h1 className="title">Can {model.name} execute the {year} plan?</h1>
      <p className="lede" data-tour="verdict">
        <b>{v.headline}</b> {v.sentences.join(' ')}
      </p>
      {v.versus && <p className="versus">{v.versus}</p>}

      <div className="metrics">
        <Metric label="Revenue target" value={money(model.strategy.revenueTargetUsd)} delta={{ text: `${pct(model.strategy.growthTargetPct)} growth`, dir: 'flat' }} />
        <Metric label="Headcount, Jan → Dec" term="headcount" value={`${Math.round(s.startingFte)} → ${Math.round(s.endingFte)}`} delta={{ text: s.endingFte < s.startingFte ? 'attrition outruns the hiring plan' : 'hiring outruns attrition', dir: 'flat' }} />
        <Metric label="Peak shortfall" term="peakShortfall" value={peak ? people(peak.fte) : 'none'} tone={peak ? 'alert' : undefined}
          delta={peak ? (isBase ? { text: `${teamName(peak.team.teamId)}, ${monthLabel(peak.month)}`, dir: 'flat' } : d(peak.fte, basePeak?.fte ?? 0, (n) => people(n))) : undefined} />
        <Metric label="Teams over target" term="constrained" value={`${s.teamsConstrained} of ${nTeams}`} tone={s.teamsConstrained ? 'alert' : undefined} delta={d(s.teamsConstrained, base.summary.teamsConstrained, (n) => `${n}`) ?? { text: `${s.teamsWatch} more on watch`, dir: 'flat' }} />
        <Metric label="Initiative load" term="initiativeLoad" value={pct(s.portfolioLoad)} delta={{ text: 'of target capacity goes to initiatives', dir: 'flat' }} />
        <Metric label="Budget variance" term="budget" value={money(s.annualBudgetVarianceUsd, { sign: true })} tone={s.annualBudgetVarianceUsd > 0 ? 'alert' : undefined}
          delta={d(s.annualBudgetVarianceUsd, base.summary.annualBudgetVarianceUsd, (n) => money(n)) ?? { text: s.annualBudgetVarianceUsd > 0 ? 'over the modeled cap' : 'under the modeled cap', dir: 'flat' }} />
        <Metric label="Revenue exposure" term="exposure" value={money(s.revenueExposureUsd)} tone="warm" delta={d(s.revenueExposureUsd, base.summary.revenueExposureUsd, (n) => money(n)) ?? { text: 'revenue at risk × odds of failure', dir: 'flat' }} />
        <Metric label="Initiatives delayed" term="delayed" value={`${s.initiativesDelayed} of ${model.initiatives.length}`} tone={s.initiativesDelayed ? 'warm' : undefined} delta={{ text: 'by dependencies the plan did not sequence', dir: 'flat' }} />
      </div>

      <section className="sec">
        <h2>What breaks first</h2>
        <p className="sub">Every constraint is computed from the monthly model and ranked by what it costs. Click one to see why.</p>
        {result.constraints.length === 0 ? <div className="empty">Nothing. Every team stays within target and every initiative starts when planned.</div> : (
          <ol className="cons">
            {result.constraints.map((c, i) => {
              const link = c.teamId ? `#/why/${c.teamId}` : c.initiativeId ? '#/why/initiatives' : null;
              return (
                <li key={c.id} className="con" data-kind={c.kind} data-tour={firstCap && c.id === firstCap.id ? 'constraint-first-team' : undefined}>
                  <div className="n">{i + 1}</div>
                  <div>
                    <div className="t">
                      {link ? <a href={href(link)}>{c.title}</a> : c.title}
                      <span className="k">{c.kind === 'sequencing' ? <Term k="sequencing">sequencing</Term> : c.kind}</span>
                    </div>
                    <div className="w">{c.detail}</div>
                  </div>
                  <div className="i">
                    <b>{c.businessImpactUsd > 0 ? money(c.businessImpactUsd) : '—'}</b>
                    <span>{c.firstMonth ? `from ${monthLabel(c.firstMonth, true)}` : ''}</span>
                    {link && <a className="why" href={href(link)}>Why →</a>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="sec">
        <h2>Where and when</h2>
        <p className="sub"><Term k="utilization">Utilization</Term> by team and month. A colored cell is above that team's own <Term k="target">target</Term>. Click a team to open its year.</p>
        <div className="tbl-wrap">
          <table className="strip-t">
            <thead>
              <tr>
                <th>Team</th>
                {result.months.map((m) => <th key={m}>{monthLabel(m)}</th>)}
              </tr>
            </thead>
            <tbody>
              {result.teams.map((t) => (
                <tr key={t.teamId}>
                  <td><a href={href(`#/why/${t.teamId}`)}>{teamName(t.teamId)}</a></td>
                  {t.months.map((m) => (
                    <td key={m.month}><span className="cell" data-s={m.status} title={`${teamName(t.teamId)}, ${monthLabel(m.month, true)}: ${num(m.workloadHours)} h of ${num(m.availableProductiveHours)} h, target ${pct(m.targetUtilization)}`}>{Number.isFinite(m.utilization) ? Math.round(m.utilization * 100) : '∞'}</span></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="legend"><span><i /> within target</span><span><i data-s="watch" /> <Term k="watch">watch</Term></span><span><i data-s="constrained" /> <Term k="constrained">over target</Term></span><span><i data-s="severe" /> <Term k="severe">over 100%</Term></span></div>
      </section>

      <nav className="next">
        <a className="btn" href={href(s.firstBreakTeamId ? `#/why/${s.firstBreakTeamId}` : '#/why/initiatives')}>Next: why {s.firstBreakTeamId ? teamName(s.firstBreakTeamId) : 'the plan'} breaks →</a>
      </nav>
    </main>
  );
}
