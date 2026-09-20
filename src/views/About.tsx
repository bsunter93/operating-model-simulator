import { useMemo } from 'react';
import { modelWarnings } from '../engine';
import { href, useStore } from '../state/store';
import { STATUS_BAND_PP } from '../engine';
import { pct } from '../lib/format';
import { Loop } from '../components/Loop';

/** How the model works and every assumption it makes, with the live values. */
export function About() {
  const { model, result, isFixture, fmt } = useStore();
  const warnings = useMemo(() => modelWarnings(model), [model]);
  const modeled = model.teams.reduce((s, t) => s + t.currentFte, 0);
  const year = model.calendar.startMonth.slice(0, 4);

  return (
    <main className="main one about">
      <div className="eyebrow">How this works</div>
      <h1 className="title">An illustrative operating model, not a forecast</h1>
      <p className="lede">
        {model.name} is {isFixture ? 'fictional' : 'your model'}. The point is to show how a plan turns into work, hours, and people, and where that breaks. The numbers are internally consistent and every one of them can be traced to an input on this page or in <a href={href('#/plan')}>Your numbers</a>. None of them predict what a real company will earn or spend.
      </p>
      <Loop />

        {/* The flow board, iframed rather than reimplemented, so the animation has one
            source. loading="lazy" keeps its canvas and rAF loop idle until someone
            actually opens this tab. */}
        <figure className="flowframe">
          <iframe src="/simulator-flow.html?embed=1" loading="lazy" title="A year of this plan running: where capacity breaks, and what one lever changes" />
          <figcaption>
            One efficiency, followed from the tool to the money. Same engine, same fixture.{' '}
            <a href="/simulator-flow.html">Open it full size &rarr;</a>
          </figcaption>
        </figure>

      <section className="sec">
        <h2>What the model does, in order</h2>
        <ol className="how">
          <li><b>Demand.</b> Each stream has an annual volume for {year}, spread across months by the seasonality profile (normalized to shares, so the annual total is preserved). Scenarios multiply it.</li>
          <li><b>Workload.</b> Volume × handling time × complexity, in hours. Productivity scenarios divide it; automation levers reduce it from the month they land.</li>
          <li><b>Capacity.</b> Each person has {model.calendar.workHoursPerFteMonth} paid hours a month. Shrinkage (vacation, training, meetings, sick time) comes off first. The target utilization says how much of the rest a team should plan to use; the remainder is reserve.</li>
          <li><b>Workforce.</b> Every month, expected attrition comes off the team; hires land after their lead time; reallocations move people between teams. There is no automatic backfill. Attrition is not a constant: sustained time over capacity raises it, smoothed across months and capped, so pressure that builds costs people and one hard month does not. The ceiling is each team's own sensitivity to strain, 40% to 90% above its base rate here, which is what keeps the loop from running a company to empty. Last month's strain drives this month's leavers, because people resign after the bad month rather than during it.</li>
          <li><b>Portfolio.</b> Initiatives take their assigned people's hours while active. A dependency pushes an initiative to the month after its predecessor finishes, plus any lag.</li>
          <li><b>Status.</b> A team-month is within capacity below target minus {Math.round(STATUS_BAND_PP * 100)} points, on watch up to the target, over capacity above it, and over 100% when the work exceeds every productive hour.</li>
          <li><b>Backlog.</b> Work above every productive hour does not disappear. A share of it, set per team, waits and is added to next month's load, so being short compounds; the rest is shed, which is a team declining what it cannot reach. A month of capacity is the most that can be waiting at once, and whatever overflows that is shed too. Work done, work waiting and work shed always add back to the work that arrived.</li>
          <li><b>Service level.</b> For streams with a target answer time, Erlang C on the team's own load: the share of requests picked up inside that target. It is not utilization renamed. The same 85% is comfortable on a large team and a crisis on a small one, because a small team has no variance to absorb, and queues do not degrade in a line. Work without a target answer time gets no figure rather than an invented one.</li>
          <li><b>Cost.</b> People × monthly loaded cost, plus one-time change costs from levers, against the budget for these teams.</li>
          <li><b>Revenue exposure.</b> Each initiative's revenue at risk × its odds of failing. A capacity shortfall on its teams raises the odds: 1 − (1 − odds) × (1 − shortfall share).</li>
          <li><b>Constraints.</b> Ranked by a dollar figure so they can be compared: hours over capacity at loaded cost; revenue at risk × delay share; budget overage.</li>
          <li><b>Decision score.</b> Added cost, hours still over capacity, and revenue exposure, each scaled 0 to 1 across the options on the table (including doing nothing), weighted by the reader. It ranks; it does not recommend.</li>
        </ol>
      </section>

      <section className="sec">
        <h2>Assumptions in this model</h2>
        <p className="sub">Live values. Change them in Your numbers and the whole model recomputes.</p>
        <div className="tbl-wrap">
          <table className="tbl assum">
            <tbody>
              <tr><td className="ink left">Scope</td><td className="left">{fmt.num(modeled)} people in {model.teams.length} modeled teams, of {fmt.num(model.strategy.employeeCount)} employees. Everyone else is outside the model.</td></tr>
              <tr><td className="ink left">Budget</td><td className="left">{fmt.money(model.budget.modeledAnnualBudget)} for the modeled teams, inside a company operating cost target of {fmt.money(model.strategy.operatingCostTarget)}.</td></tr>
              <tr><td className="ink left">Growth</td><td className="left">The strategy targets {pct(model.strategy.growthTargetPct)} revenue growth. Stream volumes are the {year} plan and already include it; scenarios move them from there.</td></tr>
              <tr><td className="ink left">Hours</td><td className="left">{model.calendar.workHoursPerFteMonth} paid hours per person per month, {model.calendar.startMonth} to {model.calendar.endMonth}.</td></tr>
              <tr><td className="ink left">Attrition</td><td className="left">Annual rates converted to a monthly rate, applied to each month's starting headcount. Expected values, not random draws.</td></tr>
              <tr><td className="ink left">Hiring</td><td className="left">A request lands the whole headcount in one month, request month plus lead time. New hires are counted at full productivity from that month; ramp is not modeled.</td></tr>
              <tr><td className="ink left">Initiatives</td><td className="left">Constant staffing while active; no ramp, no partial months. Strategic value, urgency, and confidence are recorded for the reader and do not drive the engine.</td></tr>
              <tr><td className="ink left">Generic levers</td><td className="left">Hire more: recruiting cost of one month's loaded cost per hire, then salary. Take work out: lands in two months; cost assumed at half a year of the hours it saves. Higher target: no cost; the service level pays.</td></tr>
              <tr><td className="ink left">Pods or pooled</td><td className="left">Erlang C on {model.pooling.clientCount} clients with {model.pooling.workloadPerClient} people-worth of work each, {model.pooling.ahtSeconds / 60}-minute handling time, {pct(model.pooling.serviceLevel)} answered within {model.pooling.targetSeconds} seconds; one-off work is {pct(model.pooling.bespokeShare)} of the total and takes {pct(model.pooling.contextPenalty)} longer in a pool.</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="sec">
        <h2>Team assumptions</h2>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Team</th><th>People</th><th>Target</th><th>Shrinkage</th><th>Attrition / yr</th><th>Cost / person / mo</th><th>Work coming in</th></tr></thead>
            <tbody>
              {model.teams.map((t) => {
                const streams = model.demandStreams.filter((s) => s.teamId === t.id);
                return (
                  <tr key={t.id}>
                    <td className="ink left">{t.name}</td>
                    <td>{t.currentFte}</td><td>{pct(t.targetUtilization)}</td><td>{pct(t.shrinkage)}</td><td>{pct(t.annualAttrition)}</td><td>{fmt.money(t.monthlyFteCost, { compact: false })}</td>
                    <td className="left dim">{streams.length ? streams.map((s) => `${fmt.num(s.annualVolume)} ${s.unit} × ${s.handlingMinutesPerUnit >= 60 ? `${parseFloat((s.handlingMinutesPerUnit / 60).toFixed(1))} h` : `${s.handlingMinutesPerUnit} min`}`).join('; ') : 'initiative work only'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="sec">
        <h2>Scenarios</h2>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Scenario</th><th>What it changes</th></tr></thead>
            <tbody>
              {model.scenarios.map((s) => <tr key={s.id}><td className="ink left">{s.name}</td><td className="left">{s.description ?? ''}</td></tr>)}
            </tbody>
          </table>
        </div>
      </section>

      <section className="sec">
        <h2>Consistency checks</h2>
        {warnings.length === 0
          ? <p className="sub">The model's own numbers agree with each other: modeled headcount fits inside the company, the budget fits inside the operating cost target, no team plans to run above 90%, no hiring request is larger than its team, and no initiative takes more than half a team.</p>
          : <ul className="th">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
      </section>

      <section className="sec">
        <h2>What it does not do</h2>
        <ul className="th">
          <li>It does not forecast revenue, margin, or cash. Revenue exposure is a weighted at-risk figure, not a P&amp;L line.</li>
          <li>It does not model individual people, skills, ramp time, overtime, or contractors.</li>
          <li>It does not know which work is urgent. A month over capacity means work queues; it does not say which work.</li>
          <li>Queueing figures on the pods-or-pooled page assume phone-style work that arrives at random. Ticket and email work that can wait behaves better than the model says.</li>
          <li>It does not recommend. The decision score ranks options by weights you set.</li>
        </ul>
        <p className="note">Result summary for the current configuration: {result.summary.teamsConstrained} of {model.teams.length} teams over capacity, {fmt.money(result.summary.revenueExposure)} exposed, {fmt.money(result.financials.annualVariance, { sign: true })} against budget. Source and tests: <a href="https://github.com/bsunter93/operating-model-simulator">github.com/bsunter93/operating-model-simulator</a>.</p>
      </section>
    </main>
  );
}
