import { href, useStore } from '../state/store';
import { WhyTabs } from './Why';
import { BarLine } from '../components/charts/BarLine';
import { Term } from '../components/Term';
import { money, monthLabel, num, pct } from '../lib/format';

/** What the plan costs against the cap, what the shortfall costs, and what the levers cost. */
export function Cost() {
  const { result, base, model, state, interventions, teamName, initName } = useStore();
  const f = result.financials;
  const months = result.months;
  const run = f.monthly.map((m) => m.runCostUsd);
  const change = f.monthly.map((m) => m.changeCostUsd);
  const cap = f.monthly.map((m) => m.budgetCapUsd);
  const overMonths = f.monthly.filter((m) => m.varianceUsd > 0);
  const gapCost = result.constraints.filter((c) => c.kind === 'capacity').reduce((s, c) => s + c.businessImpactUsd, 0);
  const baseGapCost = base.constraints.filter((c) => c.kind === 'capacity').reduce((s, c) => s + c.businessImpactUsd, 0);
  const active = interventions.filter((iv) => state.interventionIds.includes(iv.id));
  const addedCost = f.annualTotalCostUsd - base.financials.annualTotalCostUsd;
  const byTeam = result.teams.map((t) => ({ t, cost: t.annualRunCostUsd })).sort((a, b) => b.cost - a.cost);
  const scen = model.scenarios.find((s) => s.id === state.scenarioId)!;

  return (
    <main className="main one">
      <div className="eyebrow">2 · Why</div>
      <WhyTabs active="cost" />
      <h1 className="title">The cost</h1>
      <p className="lede">
        Three numbers. What the plan costs against its <Term k="budget">cap</Term>. What the capacity shortfall costs, priced as the hours over capacity at each team's loaded rate. And what any fix adds.
      </p>

      <div className="metrics three">
        <div className="metric"><div className="l">Modeled cost, {model.calendar.startMonth.slice(0, 4)}</div><div className="v">{money(f.annualTotalCostUsd)}</div><div className="d">{money(f.annualRunCostUsd)} people · {money(f.annualChangeCostUsd)} one-time changes</div></div>
        <div className="metric"><div className="l"><Term k="budget">Against the cap</Term></div><div className={'v' + (f.annualVarianceUsd > 0 ? ' alert' : '')}>{money(f.annualVarianceUsd, { sign: true })}</div><div className="d">{f.annualVarianceUsd > 0 ? `over a ${money(f.annualBudgetUsd)} cap; ${overMonths.length} month${overMonths.length === 1 ? '' : 's'} over` : `under a ${money(f.annualBudgetUsd)} cap`}</div></div>
        <div className="metric"><div className="l">What the shortfall costs</div><div className={'v' + (gapCost > 0 ? ' warm' : '')}>{gapCost > 0 ? money(gapCost) : 'nothing'}</div><div className="d">{gapCost > 0 ? 'hours over capacity, at loaded cost' : 'no team over capacity'}{active.length && Math.abs(gapCost - baseGapCost) > 1e3 ? ` · was ${money(baseGapCost)} before your levers` : ''}</div></div>
      </div>

      <div className="chart">
        <div className="chart-title"><b>Cost against the cap, month by month</b><span>people plus one-time change costs · cap is the modeled budget for these teams{scen.type === 'budgetConstraint' ? `, cut to ${pct(scen.budgetMultiplier)}` : ''}</span></div>
        <BarLine
          months={months}
          series={[{ key: 'run', label: 'people', values: run, color: 'var(--accent)' }, { key: 'change', label: 'one-time', values: change, color: 'var(--plum)' }]}
          lines={[{ label: 'budget cap', values: cap, color: 'var(--warm)' }]}
          format={(v) => money(v)}
          yLabel="USD / MO"
          zero={false}
          tip={(i) => `<b>${monthLabel(months[i], true)}</b>people ${money(run[i])}${change[i] ? ` · one-time ${money(change[i])}` : ''}<br>cap ${money(cap[i])} · ${f.monthly[i].varianceUsd > 0 ? `${money(f.monthly[i].varianceUsd)} over` : `${money(-f.monthly[i].varianceUsd)} under`}`}
        />
        <div className="legend"><span><i className="bar" /> people</span><span><i className="bar2" /> one-time change costs</span><span><i className="tline" /> budget cap</span></div>
      </div>

      {f.annualVarianceUsd > 0 && (
        <div className="callout">
          <b>The cap bites by {money(f.annualVarianceUsd)} over the year.</b> The levers below would close it. Cancelling hires releases cash. Deferring an initiative releases people, not cash, because they are already on payroll.
        </div>
      )}
      {f.budgetLevers.length > 0 && (
        <section className="sec">
          <h2>{f.annualVarianceUsd > 0 ? 'Levers that would close it' : 'Levers, if the cap ever bites'}</h2>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Lever</th><th>Cash released</th><th>Capacity released</th><th>What it costs you</th></tr></thead>
              <tbody>
                {f.budgetLevers.map((l) => (
                  <tr key={l.id}>
                    <td className="ink left">{l.label}</td>
                    <td className={l.cashReleasedUsd > 0 ? 'ink' : 'dim'}>{l.cashReleasedUsd > 0 ? money(l.cashReleasedUsd) : 'none'}</td>
                    <td>{num(l.fteMonthsReleased)} people-months</td>
                    <td className="left dim">{l.kind === 'cancel-unstarted-hire' ? 'The team stays short for the rest of the year.' : 'The initiative slips, with its value and its revenue at risk.'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="sec">
        <h2>Where the money goes</h2>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Team</th><th>People-months</th><th>Per person / mo</th><th>Cost</th><th>Share</th><th>Cost of its shortfall</th></tr></thead>
            <tbody>
              {byTeam.map(({ t, cost }) => {
                const def = model.teams.find((x) => x.id === t.teamId)!;
                const pm = t.months.reduce((s, m) => s + m.availableFte, 0);
                const c = result.constraints.find((x) => x.kind === 'capacity' && x.teamId === t.teamId);
                return (
                  <tr key={t.teamId} data-s={t.worstStatus}>
                    <td><a href={href(`#/why/${t.teamId}`)}>{teamName(t.teamId)}</a></td>
                    <td>{num(pm)}</td>
                    <td>{money(def.monthlyFteCostUsd, { compact: false })}</td>
                    <td className="ink">{money(cost)}</td>
                    <td className="dim">{pct(cost / f.annualRunCostUsd)}</td>
                    <td className={c ? 'ink' : 'dim'}>{c ? money(c.businessImpactUsd) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="sec">
        <h2>What the fixes add, against what the shortfall costs</h2>
        {active.length === 0 ? (
          <p className="sub">Nothing is on. Turn on a lever in <a href={href(`#/options/${result.summary.firstBreakTeamId ?? model.teams[0].id}`)}>What to do</a> and this compares its price with the hours it recovers.</p>
        ) : (
          <>
            <p className="sub">{active.length === 1 ? 'Your lever adds' : `Your ${active.length} levers add`} {money(Math.max(0, addedCost))} to the year. The shortfall they leave behind is priced at {money(gapCost)}, down from {money(baseGapCost)}. {gapCost < baseGapCost && addedCost > 0 ? `Each dollar spent recovers $${((baseGapCost - gapCost) / addedCost).toFixed(2)} of shortfall.` : ''}</p>
            <ul className="th">
              {active.map((iv) => {
                const line = iv.type === 'expediteHiring' ? `${money(iv.oneTimeCostUsd)} one-time`
                  : iv.type === 'hire' ? `${money(iv.recruitingCostPerHeadUsd * iv.headcount)} recruiting, then ${iv.headcount} salaries`
                  : iv.type === 'automation' ? `${money(iv.implementationCostUsd)} one-time`
                  : iv.type === 'reallocation' ? `${money(iv.implementationCostUsd)} one-time; payroll unchanged`
                  : iv.type === 'cancel' ? `no cost; ${money(model.initiatives.find((i) => i.id === iv.initiativeId)!.financialValueUsd)} of value given up`
                  : iv.type === 'defer' ? `no cost; ${initName(iv.initiativeId)} slips ${iv.months} months`
                  : 'no cost; the service level pays';
                return <li key={iv.id}><b>{iv.name}</b>: {line}.</li>;
              })}
            </ul>
          </>
        )}
      </section>

      <section className="sec">
        <h2><Term k="exposure">Revenue exposure</Term> by initiative</h2>
        <p className="sub">Revenue at risk times the odds of failure, where a capacity shortfall on the initiative's teams raises the odds. {money(result.exposure.totalUsd)} in total.</p>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Initiative</th><th>At risk</th><th>Base odds</th><th>Shortfall on its teams</th><th>Effective odds</th><th>Exposure</th></tr></thead>
            <tbody>
              {result.exposure.items.sort((a, b) => b.exposureUsd - a.exposureUsd).map((e) => (
                <tr key={e.initiativeId}>
                  <td className="ink left">{initName(e.initiativeId)}</td>
                  <td>{money(e.revenueAtRiskUsd)}</td>
                  <td>{pct(e.scenarioProbability)}</td>
                  <td className={e.capacityShortfall > 0 ? 'ink' : 'dim'}>{e.capacityShortfall > 0 ? pct(e.capacityShortfall) : '—'}</td>
                  <td className="ink">{pct(e.effectiveProbability)}</td>
                  <td className="ink">{money(e.exposureUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <nav className="next">
        <a className="btn ghost" href={href('#/whatif')}>Next: what if the world is different →</a>
        <a className="btn" href={href(`#/options/${result.summary.firstBreakTeamId ?? model.teams[0].id}`)}>Or: what to do about it →</a>
      </nav>
    </main>
  );
}
