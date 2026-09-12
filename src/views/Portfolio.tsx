import { href, useStore } from '../state/store';
import { WhyTabs } from './Why';
import { Term } from '../components/Term';
import { money, monthLabel } from '../lib/format';
import { monthIndex } from '../engine';

/** Initiative timeline: planned versus feasible, with the dependency that moved it. */
export function Portfolio() {
  const { result, model, teamName } = useStore();
  const months = result.months;
  const n = months.length;
  const W = 920, LBL = 250, R = 16, T = 30, ROW = 44, BOT = 12;
  const PW = W - LBL - R;
  const H = T + ROW * model.initiatives.length + BOT;
  const x = (i: number) => LBL + (PW / n) * i;
  const clamp = (i: number) => Math.max(0, Math.min(n, i));
  const idx = (k: string) => monthIndex(model.calendar.startMonth, k);
  const seq = result.constraints.filter((c) => c.kind === 'sequencing');
  const byId = new Map(result.initiatives.map((s) => [s.initiativeId, s]));

  return (
    <main className="main one">
      <div className="eyebrow">2 · Why</div>
      <WhyTabs active="initiatives" />
      <h1 className="title">The initiatives</h1>
      <p className="lede">
        Each initiative takes people from teams while it runs. The lighter bar is when the plan says it happens; the solid bar is when the model says it can, once dependencies are respected.
        {seq.length > 0 && <> <b>{seq.length === 1 ? 'One initiative cannot' : `${seq.length} initiatives cannot`} start when planned.</b></>}
      </p>

      <div className="chart" data-tour="gantt">
        <div className="chart-title"><b>Planned against feasible</b><span>{model.calendar.startMonth.slice(0, 4)}, by month</span></div>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Initiative timeline">
          {months.map((m, i) => (
            <g key={m}>
              <line x1={x(i)} x2={x(i)} y1={T - 6} y2={H - BOT} stroke="var(--hair)" />
              <text x={x(i) + PW / n / 2} y={T - 12} textAnchor="middle" fontSize={11} fontFamily="var(--mono)" fill="var(--muted)">{monthLabel(m)}</text>
            </g>
          ))}
          <line x1={x(n)} x2={x(n)} y1={T - 6} y2={H - BOT} stroke="var(--line)" />
          {model.initiatives.map((init, r) => {
            const s = byId.get(init.id)!;
            const y = T + ROW * r;
            const p0 = clamp(idx(init.startMonth)), p1 = clamp(idx(init.startMonth) + init.durationMonths);
            const e0 = s.effectiveStart ? clamp(idx(s.effectiveStart)) : null;
            const e1 = s.completion ? clamp(idx(s.completion)) : null;
            const pushed = s.pushedBy ? byId.get(s.pushedBy.predecessorId) : null;
            const fte = Object.values(init.requiredFteByTeam).reduce((a, b) => a + b, 0);
            return (
              <g key={init.id}>
                <text x={0} y={y + 17} fontSize={13} fontWeight={600} fontFamily="var(--sans)" fill="var(--ink)">{init.name}</text>
                <text x={0} y={y + 32} fontSize={11} fontFamily="var(--sans)" fill="var(--muted)">{fte} people · {money(init.revenueAtRiskUsd)} at risk{init.discretionary ? ' · discretionary' : ''}</text>
                {/* planned */}
                <rect x={x(p0)} y={y + 8} width={Math.max(0, x(p1) - x(p0))} height={10} fill="var(--accent-soft)" stroke="var(--accent)" strokeDasharray={s.delayMonths > 0 || s.status === 'cancelled' ? '3 3' : undefined} strokeWidth={1} rx={2} />
                {/* feasible */}
                {s.status === 'cancelled' ? (
                  <text x={x(p0) + 4} y={y + 31} fontSize={11} fontFamily="var(--mono)" fill="var(--muted)">cancelled</text>
                ) : e0 !== null && e1 !== null && (
                  <>
                    <rect x={x(e0)} y={y + 21} width={Math.max(0, x(e1) - x(e0))} height={10} fill={s.delayMonths > 0 ? 'var(--plum)' : 'var(--accent)'} rx={2} />
                    {s.truncated && <text x={x(e0) - 6} y={y + 30} textAnchor="end" fontSize={10.5} fontFamily="var(--mono)" fill={s.delayMonths > 0 ? 'var(--plum)' : 'var(--accent)'}>runs past {monthLabel(months[n - 1])} →</text>}
                    {s.delayMonths > 0 && e0 > p0 && (
                      <>
                        <line x1={x(p0)} x2={x(e0)} y1={y + 26} y2={y + 26} stroke="var(--plum)" strokeWidth={1} strokeDasharray="2 3" />
                        <text x={x(p0) + 2} y={y + 41} fontSize={10.5} fontFamily="var(--mono)" fill="var(--plum)">+{s.delayMonths} mo{pushed ? `, waits for ${model.initiatives.find((i) => i.id === pushed.initiativeId)!.name}` : ''}</text>
                      </>
                    )}
                  </>
                )}
              </g>
            );
          })}
        </svg>
        <div className="legend"><span><i className="ghostbar" /> planned</span><span><i className="bar" /> feasible, on time</span><span><i className="bar2" /> feasible, pushed by a dependency</span></div>
      </div>

      {seq.map((c) => {
        const s = byId.get(c.initiativeId!)!;
        const init = model.initiatives.find((i) => i.id === c.initiativeId)!;
        const pred = model.initiatives.find((i) => i.id === s.pushedBy!.predecessorId)!;
        const ps = byId.get(pred.id)!;
        const dep = model.dependencies.find((d) => d.id === s.pushedBy!.dependencyId)!;
        return (
          <div className="callout plum" key={c.id} data-tour="sequencing">
            <b>{init.name} is planned for {monthLabel(s.plannedStart, true)}. The earliest it can start is {monthLabel(s.effectiveStart!, true)}.</b>
            {' '}It depends on {pred.name}, which starts {monthLabel(ps.effectiveStart!)} and runs {pred.durationMonths} months, finishing {monthLabel(ps.completion!)}{dep.lagMonths ? `, plus a ${dep.lagMonths}-month handover` : ''}.
            {s.truncated && <> That pushes {init.name} past the end of the plan.</>}
            {' '}Each initiative is fine on its own. Together, the plan is {s.delayMonths} months inconsistent with itself.
          </div>
        );
      })}

      <section className="sec">
        <h2>Who each initiative takes</h2>
        <p className="sub">People assigned while the initiative is active. They come out of the same hours as the team's run work, which is how initiatives push teams over capacity.</p>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Initiative</th><th>Teams and people</th><th>Planned</th><th>Feasible</th><th>Done</th><th><Term k="delayed">Delay</Term></th><th><Term k="exposure">Exposure</Term></th></tr></thead>
            <tbody>
              {model.initiatives.map((init) => {
                const s = byId.get(init.id)!;
                const e = result.exposure.items.find((x) => x.initiativeId === init.id);
                return (
                  <tr key={init.id} data-s={s.delayMonths > 0 ? 'watch' : undefined}>
                    <td className="ink left">{init.name}</td>
                    <td className="left">{Object.entries(init.requiredFteByTeam).map(([tid, f]) => <a key={tid} className="tag" href={href(`#/why/${tid}`)}>{teamName(tid)} {f}</a>)}</td>
                    <td>{monthLabel(init.startMonth)}</td>
                    <td className={s.delayMonths > 0 ? 'ink' : ''}>{s.status === 'cancelled' ? 'cancelled' : monthLabel(s.effectiveStart!)}</td>
                    <td>{s.completion ? monthLabel(s.completion, s.truncated) : '—'}</td>
                    <td>{s.delayMonths > 0 ? `+${s.delayMonths} mo` : '—'}</td>
                    <td>{e ? money(e.exposureUsd) : '—'}</td>
                  </tr>
                );
              })}
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
