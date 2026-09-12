import { useMemo, useState } from 'react';
import type { ModelResult, TeamResult } from '../models/results';
import { monthIndex } from '../engine';
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
  const { result, base, isBase, model, teamName, initName, isFixture } = useStore();
  const s = result.summary;
  const v = verdict(result, teamName, initName, isBase ? undefined : base);
  const peak = peakShortfall(result);
  const basePeak = peakShortfall(base);
  const nTeams = model.teams.length;
  const year = model.calendar.startMonth.slice(0, 4);

  const [order, setOrder] = useState<'date' | 'cost'>('date');
  const idx = (k: string) => monthIndex(model.calendar.startMonth, k);
  const constraints = useMemo(() => {
    const list = [...result.constraints];
    if (order === 'date') list.sort((a, b) => ((a.firstMonth ? idx(a.firstMonth) : 99) - (b.firstMonth ? idx(b.firstMonth) : 99)) || b.businessImpactUsd - a.businessImpactUsd);
    return list;
  }, [result.constraints, order, model.calendar.startMonth]);
  // Where today falls in the plan, from the machine's clock.
  const now = new Date();
  const nowKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const nowIdx = idx(nowKey);
  const nowIn = nowIdx >= 0 && nowIdx < result.months.length;

  /** The inputs a constraint was computed from, in one line. */
  const provenance = (c: (typeof result.constraints)[number]): string => {
    if (c.kind === 'capacity' && c.teamId) {
      const t = model.teams.find((x) => x.id === c.teamId)!;
      const streams = model.demandStreams.filter((x) => x.teamId === t.id);
      const inits = model.initiatives.filter((i) => i.requiredFteByTeam[t.id]).map((i) => `${i.requiredFteByTeam[t.id]} on ${i.name}`);
      const hires = model.hiringPlan.filter((h) => h.teamId === t.id).map((h) => `${h.headcount} hires planned, ${h.leadTimeMonths}-month lead`);
      const work = streams.map((x) => `${num(x.annualVolume)} ${x.unit} × ${x.handlingMinutesPerUnit >= 60 ? `${parseFloat((x.handlingMinutesPerUnit / 60).toFixed(1))} h` : `${x.handlingMinutesPerUnit} min`}`).join(', ');
      return `${work || 'initiative work only'}; ${t.currentFte} people at a ${pct(t.targetUtilization)} target, ${pct(t.shrinkage)} shrinkage, ${pct(t.annualAttrition)} attrition${inits.length ? `; ${inits.join(', ')}` : ''}${hires.length ? `; ${hires.join(', ')}` : ''}.`;
    }
    if (c.kind === 'sequencing' && c.initiativeId) {
      const sch = result.initiatives.find((i) => i.initiativeId === c.initiativeId)!;
      const dep = sch.pushedBy ? model.dependencies.find((x) => x.id === sch.pushedBy!.dependencyId) : null;
      const pred = dep ? model.initiatives.find((i) => i.id === dep.predecessorId) : null;
      const init = model.initiatives.find((i) => i.id === c.initiativeId)!;
      return `${init.name} planned ${monthLabel(init.startMonth)}, ${init.durationMonths} months${pred && dep ? `; depends on ${pred.name} (starts ${monthLabel(pred.startMonth)}, ${pred.durationMonths} months, ${dep.lagMonths}-month handover)` : ''}; ${money(init.revenueAtRiskUsd)} revenue at risk.`;
    }
    if (c.kind === 'budget') return `Team headcount × monthly cost, plus one-time lever costs, against the ${money(result.financials.annualBudgetUsd)} budget for these teams.`;
    return '';
  };

  const d = (cur: number, ref: number, fmt: (n: number) => string, worseWhenUp = true) => {
    if (isBase || Math.abs(cur - ref) < 1e-9) return undefined;
    const up = cur > ref;
    return { text: `${signed(cur - ref, fmt)} vs base plan`, dir: (up === worseWhenUp ? 'up' : 'down') as 'up' | 'down' };
  };

  return (
    <section className="page-sec" id="sec-hold">
      <div className="purpose">
        <div className="purpose-text">
          <b>A month-by-month model of a fictional company's plan.</b> Strategy becomes work, work becomes hours, hours become people. Decisions change the strategy and the loop runs again. Change anything; every number recomputes.
          <span className="purpose-method">Under the hood: a deterministic team-by-month engine for demand, capacity, workforce, portfolio, and cost; Erlang C for the queueing question; thresholds found by rerunning the model until the answer flips; 86 automated tests. <a href={href('#/about')}>How it works and what it assumes →</a></span>
        </div>
        <Loop />
      </div>

      <div className="eyebrow">1 · Can the plan work?</div>
      <h1 className="title">Can {model.name} execute the {year} plan?</h1>
      <p className="lede" data-tour="verdict">
        <b>{v.headline}</b> {v.sentences.join(' ')}
      </p>
      {v.versus && <p className="versus">{v.versus}</p>}
      <p className="readme">This page is the summary: the answer above, then what breaks and when, then where. Steps 2 to 5 are the detail behind each piece. {isFixture ? 'Atlas Systems is fictional; ' : ''}every figure is computed from the inputs on <a href={href('#/plan')}>Your numbers</a>, nothing is typed in, and it all recomputes when you change anything.</p>

      <div className="metrics">
        <Metric label="Revenue target" value={money(model.strategy.revenueTargetUsd)} delta={{ text: `${pct(model.strategy.growthTargetPct)} revenue growth, year over year`, dir: 'flat' }} />
        <Metric label="Headcount, Jan → Dec" term="headcount" value={`${Math.round(s.startingFte)} → ${Math.round(s.endingFte)}`} delta={{ text: `${signed(Math.round(s.endingFte) - Math.round(s.startingFte), (n) => `${n}`)} (${signed((s.endingFte - s.startingFte) / s.startingFte, (n) => pct(n))}): ${s.endingFte < s.startingFte ? 'attrition outruns the hiring plan' : 'hiring outruns attrition'}`, dir: 'flat' }} />
        <Metric label="Peak shortfall" term="peakShortfall" value={peak ? people(peak.fte) : 'none'} tone={peak ? 'alert' : undefined}
          delta={peak ? (isBase ? { text: `${teamName(peak.team.teamId)} in ${monthLabel(peak.month)} needs ${people(peak.fte)} more than it has`, dir: 'flat' } : d(peak.fte, basePeak?.fte ?? 0, (n) => people(n))) : undefined} />
        <Metric label="Teams over capacity" term="constrained" value={`${s.teamsConstrained} of ${nTeams}`} tone={s.teamsConstrained ? 'alert' : undefined} delta={d(s.teamsConstrained, base.summary.teamsConstrained, (n) => `${n}`) ?? { text: `at some point in the year; ${s.teamsWatch} more within 5 points of capacity`, dir: 'flat' }} />
        <Metric label="Initiative load" term="initiativeLoad" value={pct(s.portfolioLoad)} delta={{ text: 'of all available hours go to initiatives instead of day-to-day work', dir: 'flat' }} />
        <Metric label="Budget variance" term="budget" value={money(s.annualBudgetVarianceUsd, { sign: true })} tone={s.annualBudgetVarianceUsd > 0 ? 'alert' : undefined}
          delta={d(s.annualBudgetVarianceUsd, base.summary.annualBudgetVarianceUsd, (n) => money(n)) ?? { text: `${money(Math.abs(s.annualBudgetVarianceUsd))} ${s.annualBudgetVarianceUsd > 0 ? 'over' : 'under'} the ${money(result.financials.annualBudgetUsd)} budget for these teams`, dir: 'flat' }} />
        <Metric label="Revenue exposure" term="exposure" value={money(s.revenueExposureUsd)} tone="warm" delta={d(s.revenueExposureUsd, base.summary.revenueExposureUsd, (n) => money(n)) ?? { text: 'revenue riding on initiatives, weighted by their odds of failing', dir: 'flat' }} />
        <Metric label="Initiatives delayed" term="delayed" value={`${s.initiativesDelayed} of ${model.initiatives.length}`} tone={s.initiativesDelayed ? 'warm' : undefined} delta={{ text: 'cannot start on the planned date because of a dependency', dir: 'flat' }} />
      </div>

      <section className="sec">
        <div className="sec-head">
          <div>
            <h2>What breaks, and when</h2>
            <p className="sub">{order === 'date' ? 'In date order: the month each one starts.' : 'Ranked by what each one costs.'} Each card says which inputs it came from. Detail: <a href={href(s.firstBreakTeamId ? `#/why/${s.firstBreakTeamId}` : '#/why/initiatives')}>step 2, Why →</a></p>
          </div>
          <div className="seg" role="group" aria-label="Order">
            <button className={order === 'date' ? 'on' : ''} onClick={() => setOrder('date')}>By date</button>
            <button className={order === 'cost' ? 'on' : ''} onClick={() => setOrder('cost')}>By cost</button>
          </div>
        </div>
        {constraints.length === 0 ? <div className="empty">Nothing. Every team stays within capacity and every initiative starts when planned.</div> : (
          <ol className="cons">
            {constraints.map((c, i) => {
              const link = c.teamId ? `#/why/${c.teamId}` : c.initiativeId ? '#/why/initiatives' : null;
              const prev = i > 0 ? constraints[i - 1] : null;
              const sameMonth = order === 'date' && prev?.firstMonth === c.firstMonth;
              return (
                <li key={c.id} className={'con' + (order === 'date' ? ' dated' : '')} data-kind={c.kind} data-tour={c.kind === 'capacity' && c.teamId === s.firstBreakTeamId ? 'constraint-first-team' : undefined}>
                  {order === 'date'
                    ? <div className={'when' + (sameMonth ? ' same' : '')}>{c.firstMonth ? <><b>{monthLabel(c.firstMonth)}</b><span>{c.firstMonth.slice(0, 4)}</span></> : <b>—</b>}</div>
                    : <div className="n">{i + 1}</div>}
                  <div>
                    <div className="t">
                      {link ? <a href={href(link)}>{c.title}</a> : c.title}
                      <span className="k">{c.kind === 'sequencing' ? <Term k="sequencing">sequencing</Term> : c.kind}</span>
                    </div>
                    <div className="w">{c.detail}</div>
                    <div className="from"><span>From</span> {provenance(c)} <a href={href('#/plan')}>Change these →</a></div>
                  </div>
                  <div className="i">
                    <b>{c.businessImpactUsd > 0 ? money(c.businessImpactUsd) : '—'}</b>
                    <span>{order === 'date' ? (c.businessImpactUsd > 0 ? 'what it costs' : '') : (c.firstMonth ? `from ${monthLabel(c.firstMonth, true)}` : '')}</span>
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
        <p className="sub"><Term k="utilization">Utilization</Term> by team and month, computed from each team's workload and headcount. A colored cell is above that team's own <Term k="target">target</Term>. Click a team to open its year. Detail: <a href={href('#/why/workforce')}>step 2, the workforce →</a></p>
        <div className="tbl-wrap">
          <table className="strip-t">
            <thead>
              <tr>
                <th>Team</th>
                {result.months.map((m, i) => <th key={m} className={nowIn && i === nowIdx ? 'now' : ''}>{monthLabel(m)}{nowIn && i === nowIdx && <em>now</em>}</th>)}
              </tr>
            </thead>
            <tbody>
              {result.teams.map((t) => (
                <tr key={t.teamId}>
                  <td><a href={href(`#/why/${t.teamId}`)}>{teamName(t.teamId)}</a></td>
                  {t.months.map((m, i) => (
                    <td key={m.month} className={nowIn && i === nowIdx ? 'now' : ''}><span className="cell" data-s={m.status} title={`${teamName(t.teamId)}, ${monthLabel(m.month, true)}: ${num(m.workloadHours)} h of ${num(m.availableProductiveHours)} h, target ${pct(m.targetUtilization)}`}>{Number.isFinite(m.utilization) ? Math.round(m.utilization * 100) : '∞'}</span></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="legend"><span><i /> within capacity</span><span><i data-s="watch" /> <Term k="watch">watch</Term></span><span><i data-s="constrained" /> <Term k="constrained">over capacity</Term></span><span><i data-s="severe" /> <Term k="severe">over 100%</Term></span>{nowIn && <span><i className="nowline" /> now ({monthLabel(nowKey, true)}, from this machine's clock)</span>}</div>
        {!nowIn && <p className="note">Today is {monthLabel(nowKey, true)} on this machine; the plan {nowIdx < 0 ? `starts ${monthLabel(result.months[0], true)}` : `ended ${monthLabel(result.months[result.months.length - 1], true)}`}, so there is no "now" column to mark.</p>}
      </section>

      <nav className="next">
        <a className="btn" href={href(s.firstBreakTeamId ? `#/why/${s.firstBreakTeamId}` : '#/why/initiatives')}>Next: why {s.firstBreakTeamId ? teamName(s.firstBreakTeamId) : 'the plan'} breaks →</a>
      </nav>
    </section>
  );
}
