import { useMemo } from 'react';
import { comparePooling } from '../engine';
import type { PoolingAssumptions } from '../models/types';
import { href, useStore } from '../state/store';
import { Term } from '../components/Term';
import { pct } from '../lib/format';

/** Pods or one pool, using the same Erlang C model as the article. */
export function Organization() {
  const { model, dispatch, result } = useStore();
  const p = model.pooling;
  const c = useMemo(() => comparePooling(p), [p]);

  const set = (patch: Partial<PoolingAssumptions>) => {
    const m = structuredClone(model);
    m.pooling = { ...m.pooling, ...patch };
    dispatch({ type: 'editModel', model: m });
  };

  // Pooled headcount as the context penalty rises, against the flat pods line.
  const penalties = useMemo(() => {
    const out: { pen: number; pooled: number }[] = [];
    for (let pen = 0; pen <= 1.5 + 1e-9; pen += 0.05) out.push({ pen, pooled: comparePooling({ ...p, bespokeShare: 1, contextPenalty: pen }).pooledFte });
    return out;
  }, [p]);
  // Crossover by size of each client.
  const byLoad = useMemo(() => [0.5, 1, 2, 4, 8, 16].map((load) => ({ load, ...comparePooling({ ...p, workloadPerClient: load }) })), [p]);

  const W = 920, H = 300, L = 56, R = 18, T = 30, B = 40, PW = W - L - R, PH = H - T - B;
  const maxY = Math.max(c.podsFte, ...penalties.map((x) => x.pooled)) * 1.1;
  const x = (pen: number) => L + (pen / 1.5) * PW;
  const y = (v: number) => T + PH - (v / maxY) * PH;
  const cross = c.crossoverPenalty;
  const blended = c.blendedPenalty;

  const supportTeam = model.teams.find((t) => t.id === 'team-enterprise-support');
  const supportResult = supportTeam ? result.teams.find((t) => t.teamId === supportTeam.id) : null;

  const Num = ({ label, value, onChange, step = 1, min = 0, max, unit }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; unit?: string }) => (
    <label className="orgin">
      <span>{label}</span>
      <input className="cellin" type="number" value={value} step={step} min={min} max={max} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange(v); }} />
      {unit && <em>{unit}</em>}
    </label>
  );

  return (
    <main className="main one">
      
      <h1 className="title">Pods or one pool?</h1>
      <p className="lede">
        The same work needs a different number of people depending on how it is organized. A dedicated pod per client keeps context but each pod carries its own reserve. One pool shares the reserve but pays a <Term k="contextPenalty">context penalty</Term> on work where the person does not know the client. This page runs both with the same queueing model as <a href="https://bensunter.com/pods-or-pooled.html">Half a Day of Nothing</a>.
      </p>

      <div className="two">
        <div className="two-controls">
          <div className="card" data-tour="pooling">
            <h3>Assumptions</h3>
            <p className="note top">Change any of these. Both structures recompute.</p>
            <Num label="Clients" value={p.clientCount} min={1} max={200} onChange={(v) => set({ clientCount: Math.max(1, Math.round(v)) })} />
            <Num label="Work per client" value={p.workloadPerClient} step={0.5} min={0.5} max={64} unit="people-worth, at once" onChange={(v) => set({ workloadPerClient: Math.max(0.5, v) })} />
            <Num label="Handling time" value={Math.round(p.ahtSeconds / 60)} min={1} max={480} unit="minutes" onChange={(v) => set({ ahtSeconds: Math.max(1, v) * 60 })} />
            <Num label="Answer within" value={p.targetSeconds} step={30} min={0} max={3600} unit="seconds" onChange={(v) => set({ targetSeconds: Math.max(0, v) })} />
            <Num label="Service level" value={Math.round(p.serviceLevel * 100)} min={1} max={99} unit="% answered in time" onChange={(v) => set({ serviceLevel: Math.min(0.99, Math.max(0.01, v / 100)) })} />
            <Num label="One-off work" value={Math.round(p.bespokeShare * 100)} min={0} max={100} unit="% of the work" onChange={(v) => set({ bespokeShare: Math.min(1, Math.max(0, v / 100)) })} />
            <Num label="Context penalty" value={Math.round(p.contextPenalty * 100)} min={0} max={300} unit="% longer on one-off work" onChange={(v) => set({ contextPenalty: Math.max(0, v / 100) })} />
          </div>
        </div>
        <div className="two-chart">
          <div className="metrics three org">
            <div className="metric"><div className="l">{p.clientCount} pods</div><div className="v">{c.podsFte}</div><div className="d">{c.podsFte / p.clientCount} per pod: {Math.ceil(p.workloadPerClient)} working, {c.podsFte / p.clientCount - Math.ceil(p.workloadPerClient)} in reserve</div></div>
            <div className="metric"><div className="l">One pool</div><div className={'v' + (c.savedFte > 0 ? '' : ' alert')}>{c.pooledFte}</div><div className="d">{c.pooledFteNoPenalty} with no penalty; {pct(blended)} blended penalty adds {c.pooledFte - c.pooledFteNoPenalty}</div></div>
            <div className="metric"><div className="l">Difference</div><div className={'v' + (c.savedFte > 0 ? ' warm' : c.savedFte < 0 ? ' alert' : '')}>{c.savedFte > 0 ? `${c.savedFte} fewer` : c.savedFte < 0 ? `${-c.savedFte} more` : 'same'}</div><div className="d">{c.savedFte > 0 ? 'people with one pool' : c.savedFte < 0 ? 'people with one pool' : 'either way'}</div></div>
          </div>

          <div className="callout">
            {c.savedFte > 0 ? (
              <><b>One pool needs {c.savedFte} fewer people for the same service level.</b> One-off work would have to take {cross === null ? 'more than 500%' : pct(cross)} longer in the pool before pods break even. Right now it is set to {pct(p.contextPenalty)} on {pct(p.bespokeShare)} of the work, which is {pct(blended)} blended.</>
            ) : c.savedFte === 0 ? (
              <><b>Both structures need the same number of people here.</b> Decide it on relationship and risk, not cost.</>
            ) : (
              <><b>Pods need {-c.savedFte} fewer people here.</b> The context penalty on one-off work has outrun the reserve that pooling saves.</>
            )}
          </div>

          <div className="chart">
            <div className="chart-title"><b>People needed as the context penalty rises</b><span>{p.clientCount} clients, {p.workloadPerClient} people-worth each, {pct(p.serviceLevel)} within {p.targetSeconds}s</span></div>
            <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Pooled headcount against context penalty">
              {[0, 0.25, 0.5, 0.75, 1].map((f) => (
                <g key={f}>
                  <line x1={L} x2={W - R} y1={y(maxY * f)} y2={y(maxY * f)} stroke="var(--hair)" />
                  <text x={L - 8} y={y(maxY * f) + 4} textAnchor="end" fontSize={11} fontFamily="var(--mono)" fill="var(--muted)">{Math.round(maxY * f)}</text>
                </g>
              ))}
              <text x={2} y={T - 12} fontSize={10.5} fontFamily="var(--mono)" fill="var(--muted)" letterSpacing={1}>PEOPLE</text>
              {[0, 0.25, 0.5, 0.75, 1, 1.25, 1.5].map((pen) => (
                <text key={pen} x={x(pen)} y={T + PH + 16} textAnchor="middle" fontSize={11} fontFamily="var(--mono)" fill="var(--muted)">{pct(pen)}</text>
              ))}
              <text x={W - R} y={T + PH + 32} textAnchor="end" fontSize={10.5} fontFamily="var(--mono)" fill="var(--muted)" letterSpacing={1}>PENALTY ON ALL POOLED WORK</text>
              <line x1={L} x2={W - R} y1={y(c.podsFte)} y2={y(c.podsFte)} stroke="var(--plum)" strokeWidth={2} />
              <text x={L + 6} y={y(c.podsFte) - 6} fontSize={11} fontFamily="var(--sans)" fill="var(--plum)">{p.clientCount} pods: {c.podsFte} people, whatever the penalty</text>
              <polyline points={penalties.map((q) => `${x(q.pen)},${y(q.pooled)}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth={2} />
              <text x={x(1.5) - 4} y={y(penalties[penalties.length - 1].pooled) + 14} textAnchor="end" fontSize={11} fontFamily="var(--sans)" fill="var(--accent)">one pool</text>
              {cross !== null && cross <= 1.5 && (
                <>
                  <line x1={x(cross)} x2={x(cross)} y1={T} y2={T + PH} stroke="var(--warm)" strokeDasharray="4 4" />
                  <text x={x(cross) + 6} y={T + 12} fontSize={11} fontFamily="var(--mono)" fontWeight={500} fill="var(--warm)">pods break even at {pct(cross)}</text>
                </>
              )}
              <line x1={x(blended)} x2={x(blended)} y1={y(c.pooledFte) - 2} y2={T + PH} stroke="var(--alert)" strokeWidth={1.5} />
              <circle cx={x(blended)} cy={y(c.pooledFte)} r={5} fill="var(--alert)" />
              <text x={x(blended) + 8} y={y(c.pooledFte) - 10} fontSize={11} fontFamily="var(--mono)" fontWeight={500} fill="var(--alert)">your setting: {pct(blended)} blended, {c.pooledFte} people</text>
            </svg>
            <div className="legend"><span><i className="bar2" /> pods</span><span><i className="bar" /> one pool</span><span><i className="tline" /> break-even</span><span><i className="alertline" /> your blended penalty</span></div>
          </div>
        </div>
      </div>

      <section className="sec">
        <h2>The bigger each client, the less pooling saves</h2>
        <p className="sub">Same assumptions, different size of client. Reserve is what pooling shares; a client big enough to carry its own reserve gains little from a pool.</p>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Work per client</th><th>{p.clientCount} pods</th><th>One pool</th><th>Saved</th><th>Pods break even at</th></tr></thead>
            <tbody>
              {byLoad.map((r) => (
                <tr key={r.load} data-s={r.load === p.workloadPerClient ? 'watch' : undefined}>
                  <td className="ink">{r.load} people-worth{r.load === p.workloadPerClient ? ' (yours)' : ''}</td>
                  <td>{r.podsFte}</td>
                  <td>{r.pooledFte}</td>
                  <td className={r.savedFte > 0 ? 'ink' : 'dim'}>{r.savedFte > 0 ? `${r.savedFte} (${pct(r.savedFte / r.podsFte)})` : '—'}</td>
                  <td>{r.crossoverPenalty === null ? 'over 500%' : pct(r.crossoverPenalty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {supportTeam && supportResult && (
        <section className="sec">
          <h2>In this plan</h2>
          <p className="sub">
            {supportTeam.name} has {Math.round(supportResult.startingFte)} people and peaks at {pct(supportResult.peakUtilization)} of its productive hours. The reserve a pool shares is the same slack that keeps a team under its target. If the team is organized as pods today, the numbers above show how much of its headcount is reserve. If it is already pooled, measure the context penalty on one-off work rather than assume it.
          </p>
        </section>
      )}

      <section className="sec">
        <h2>Method</h2>
        <p className="sub">
          Erlang C, the standard queueing model for work that arrives at random and has to be answered within a target. Pods: each client gets the smallest team that meets the service level on its own load. Pool: one team meets the same service level on the combined load, with one-off work made slower by the context penalty. The pods number can only go down in whole people, so small changes in load sometimes move it by more than they should. Tickets and email that can wait are less like this than phone-style work; treat the figures as directional for those.
        </p>
      </section>

      <nav className="next">
        <a className="btn ghost" href={href('#/whatif')}>Next: what if the world is different →</a>
        <a className="btn" href={href(`#/options/${result.summary.firstBreakTeamId ?? model.teams[0].id}`)}>Or: what to do about it →</a>
      </nav>
    </main>
  );
}
