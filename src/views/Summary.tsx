import { useMemo } from 'react';
import { useStore } from '../state/store';
import { verdict } from '../lib/verdict';
import { whatChanged } from '../lib/whatChanged';
import { thresholds } from '../lib/thresholds';
import { monthLabel, pct } from '../lib/format';
import { monthIndex } from '../engine';

/** One page an operator can hand to an executive. Print to PDF. */
export function Summary() {
  const { model, state, result, base, interventions, teamName, initName, isBase, fmt } = useStore();
  const active = interventions.filter((iv) => state.interventionIds.includes(iv.id));
  const scen = model.scenarios.find((s) => s.id === state.scenarioId)!;
  const v = verdict(result, fmt, teamName, initName, isBase ? undefined : base);
  const changed = isBase ? null : whatChanged(model, scen, active, result, base, teamName, initName);
  const th = useMemo(() => thresholds(model, state.scenarioId, active, teamName), [model, state.scenarioId, active, teamName]);
  const idx = (k: string) => monthIndex(model.calendar.startMonth, k);
  const dated = [...result.constraints].sort((a, b) => ((a.firstMonth ? idx(a.firstMonth) : 99) - (b.firstMonth ? idx(b.firstMonth) : 99)) || b.businessImpact - a.businessImpact);
  const s = result.summary;
  let peak: { team: string; month: string; fte: number } | null = null;
  for (const t of result.teams) for (const m of t.months) if (!peak || m.workforceGap > peak.fte) peak = { team: t.teamId, month: m.month, fte: m.workforceGap };
  /* Back to the model, explicitly. This used to build '#/', which stopped meaning the
     model the day the run became the landing page and quietly ejected the reader to it. */
  const back = '#/model' + (window.location.hash.includes('?') ? '?' + window.location.hash.split('?')[1] : '');

  return (
    <div className="summary">
      <div className="summary-tools noprint"><a href={back}>← back</a><button className="btn small" onClick={() => window.print()}>Print or save as PDF</button></div>
      <div className="eyebrow">Operating scenario · {model.name} · {model.calendar.startMonth.slice(0, 4)} plan{model.id.includes('atlas') ? ' · fictional' : ''}</div>
      <h1>{scen.name}{active.length ? ` with ${active.map((iv) => iv.name.toLowerCase()).join(', ')}` : ''}</h1>
      <p className="summary-verdict"><b>{v.headline}</b> {v.sentences.join(' ')}</p>

      <div className="summary-nums">
        <div><b>{Math.round(s.startingFte)} → {Math.round(s.endingFte)}</b><span>people, Jan to Dec</span></div>
        <div><b>{peak && peak.fte >= 0.5 ? `${Math.round(peak.fte)} people` : 'none'}</b><span>peak shortfall{peak && peak.fte >= 0.5 ? `, ${teamName(peak.team)}, ${monthLabel(peak.month)}` : ''}</span></div>
        <div><b>{s.teamsConstrained} of {model.teams.length}</b><span>teams over capacity</span></div>
        <div><b>{fmt.money(result.financials.annualTotalCost)}</b><span>cost, {fmt.money(result.financials.annualVariance, { sign: true })} against budget</span></div>
        <div><b>{fmt.money(s.revenueExposure)}</b><span>revenue exposure</span></div>
        {/* Only when there is some. On a plan that stays inside its capacity this is zero
            every month, and a cell reading "0 hours" is noise on an executive's page. */}
        {s.shedHours > 0 && (
          <div><b>{fmt.hours(s.shedHours)}</b><span>work never done{s.closingBacklogHours > 0
            ? `, ${fmt.hours(s.closingBacklogHours)} still waiting at year end` : ''}</span></div>
        )}
      </div>

      {changed && (
        <section>
          <h2>What changed against the base plan</h2>
          <p className="summary-cause">{changed.cause}</p>
          <table className="summary-tbl"><tbody>{changed.steps.map((st) => <tr key={st.label}><td>{st.label}</td><td>{st.from}</td><td>→</td><td><b>{st.to}</b>{st.note ? ` (${st.note})` : ''}</td></tr>)}</tbody></table>
        </section>
      )}

      <section>
        <h2>Key findings, in date order</h2>
        <table className="summary-tbl"><tbody>{dated.slice(0, 5).map((c) => <tr key={c.id}><td><b>{c.firstMonth ? monthLabel(c.firstMonth) : '—'}</b></td><td>{c.title}</td><td>{c.detail}</td><td>{c.businessImpact > 0 ? fmt.money(c.businessImpact) : ''}</td></tr>)}</tbody></table>
      </section>

      <section>
        <h2>What has to be true</h2>
        <ul>
          {active.length === 0 && <li>Nothing beyond the plan as written.</li>}
          {active.map((iv) => <li key={iv.id}>{iv.type === 'expediteHiring' ? `The planned hires can be brought in with a ${iv.newLeadTimeMonths}-month lead time for ${fmt.money(iv.oneTimeCost)}.` : iv.type === 'hire' ? `${iv.headcount} more people for ${teamName(iv.teamId)} can be hired and land after ${iv.leadTimeMonths} months.` : iv.type === 'automation' ? `${pct(iv.workloadReductionRate)} of ${teamName(iv.teamId)}'s hours can be removed, live ${iv.timeToImpactMonths} months after kickoff, for ${fmt.money(iv.implementationCost)}.` : iv.type === 'reallocation' ? `${iv.headcount} people from ${teamName(iv.fromTeamId)} can do ${teamName(iv.toTeamId)}'s work after ${iv.timeToImpactMonths} month${iv.timeToImpactMonths === 1 ? '' : 's'}.` : iv.type === 'defer' ? `${initName(iv.initiativeId)} can move by ${iv.months} months without losing its value.` : iv.type === 'cancel' ? `${initName(iv.initiativeId)} can be dropped.` : iv.type === 'rescope' ? `${initName(iv.initiativeId)} ships at ${pct(iv.scopeMultiplier)} of its scope.` : iv.type === 'restaff' ? `${initName(iv.initiativeId)} is restaffed, which moves when it lands.` : `${teamName(iv.teamId)} can run at ${pct(iv.newTargetUtilization)} and the service level can take it.`}</li>)}
        </ul>
      </section>

      <section>
        <h2>What would change my mind</h2>
        <ul>{th.map((t) => <li key={t.text}>{t.text}</li>)}</ul>
      </section>

      <p className="summary-foot">Generated from the model on {new Date().toISOString().slice(0, 10)}. Illustrative operating model, not a financial forecast. Every figure is recomputable from the exported JSON. bensunter.com/simulator</p>
    </div>
  );
}
