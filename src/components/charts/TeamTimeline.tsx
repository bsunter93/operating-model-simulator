import { useState } from 'react';
import type { TeamResult } from '../../models/results';
import { monthLabel, pct } from '../../lib/format';
import { useStore } from '../../state/store';

interface Props {
  team: TeamResult;
  /** Same team under the current scenario with no interventions, for ghost bars. */
  ghost?: TeamResult;
}

const W = 920, H = 330, L = 58, R = 18, T = 34, B = 56;
const PW = W - L - R, PH = H - T - B;

function niceStep(max: number): number {
  const raw = max / 4;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

export function TeamTimeline({ team, ghost }: Props) {
  const { fmt } = useStore();
  const [hover, setHover] = useState<number | null>(null);
  const months = team.months;
  const n = months.length;
  const band = PW / n;
  const barW = band * 0.56;
  const showGhost = !!ghost && ghost !== team;

  const maxVal = Math.max(
    ...months.map((m) => Math.max(m.workloadHours, m.availableProductiveHours)),
    ...(showGhost ? ghost!.months.map((m) => Math.max(m.workloadHours, m.availableProductiveHours)) : [0]),
  ) * 1.08;
  const step = niceStep(maxVal);
  const top = Math.ceil(maxVal / step) * step;
  const y = (v: number) => T + PH - (v / top) * PH;
  const cx = (i: number) => L + band * i + band / 2;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);

  const targetPts = months.map((m, i) => `${cx(i)},${y(m.targetCapacityHours)}`).join(' ');
  const availPts = months.map((m, i) => `${cx(i)},${y(m.availableProductiveHours)}`).join(' ');
  const h = hover !== null ? months[hover] : null;

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Monthly workload against capacity for ${team.teamId}`} onMouseLeave={() => setHover(null)}>
        {/* grid */}
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--hair)" strokeWidth={1} />
            <text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fontFamily="var(--mono)" fill="var(--muted)">{v >= 1000 ? `${parseFloat((v / 1000).toFixed(1))}k` : v}</text>
          </g>
        ))}
        <text x={2} y={T - 14} textAnchor="start" fontSize={10.5} fontFamily="var(--mono)" fill="var(--muted)" letterSpacing={1}>HOURS / MO</text>

        {/* ghost bars: same scenario, no interventions */}
        {showGhost && ghost!.months.map((m, i) => (
          <rect key={`g${i}`} x={cx(i) - barW / 2} y={y(m.workloadHours)} width={barW} height={Math.max(0, PH + T - y(m.workloadHours))} fill="none" stroke="var(--muted)" strokeWidth={1} strokeDasharray="3 3" opacity={0.7} />
        ))}

        {/* bars: run + portfolio, 2px surface gap; overage over capacity in alert */}
        {months.map((m, i) => {
          const x0 = cx(i) - barW / 2;
          const yRun = y(m.runHours), yTop = y(m.workloadHours), yBase = T + PH;
          const gapPx = m.portfolioHours > 0 ? 2 : 0;
          const over = m.workloadHours > m.targetCapacityHours;
          return (
            <g key={i}>
              <rect x={x0} y={yRun} width={barW} height={yBase - yRun} fill="var(--accent)" rx={1} />
              {m.portfolioHours > 0 && <rect x={x0} y={yTop} width={barW} height={Math.max(0, yRun - yTop - gapPx)} fill="var(--plum)" rx={1} />}
              {over && <rect x={x0} y={yTop} width={barW} height={y(m.targetCapacityHours) - yTop} fill="var(--alert)" opacity={0.85} rx={1} />}
            </g>
          );
        })}

        {/* capacity lines */}
        <polyline points={availPts} fill="none" stroke="var(--muted)" strokeWidth={1.5} strokeDasharray="4 4" />
        <polyline points={targetPts} fill="none" stroke="var(--warm)" strokeWidth={2} />
        <text x={W - R} y={y(months[n - 1].targetCapacityHours) - 6} textAnchor="end" fontSize={11} fontFamily="var(--sans)" fill="var(--warm)">target capacity</text>
        <text x={W - R} y={y(months[n - 1].availableProductiveHours) - 6} textAnchor="end" fontSize={11} fontFamily="var(--sans)" fill="var(--muted)">all productive hours</text>

        {/* hires landing */}
        {months.map((m, i) => m.hiresLanded > 0 ? (
          <g key={`h${i}`}>
            <line x1={cx(i)} x2={cx(i)} y1={T - 2} y2={y(Math.max(m.workloadHours, m.availableProductiveHours)) - 4} stroke="var(--accent)" strokeWidth={1} strokeDasharray="2 3" />
            <text x={cx(i)} y={T - 6} textAnchor="middle" fontSize={11} fontFamily="var(--mono)" fontWeight={500} fill="var(--accent)">+{Math.round(m.hiresLanded)} land</text>
          </g>
        ) : null)}
        {months.map((m, i) => m.reallocated !== 0 && (i === 0 || months[i - 1].reallocated !== m.reallocated) ? (
          <text key={`r${i}`} x={cx(i)} y={T - 6 - (m.hiresLanded > 0 ? 13 : 0)} textAnchor="middle" fontSize={11} fontFamily="var(--mono)" fontWeight={500} fill="var(--plum)">{m.reallocated > 0 ? '+' : ''}{Math.round(m.reallocated)} moved</text>
        ) : null)}

        {/* axis + status strip */}
        <line x1={L} x2={W - R} y1={T + PH} y2={T + PH} stroke="var(--line)" />
        {months.map((m, i) => (
          <g key={`x${i}`}>
            <text x={cx(i)} y={T + PH + 16} textAnchor="middle" fontSize={11} fontFamily="var(--mono)" fill={hover === i ? 'var(--ink)' : 'var(--muted)'}>{monthLabel(m.month)}</text>
            <rect x={cx(i) - band / 2 + 2} y={T + PH + 24} width={band - 4} height={16} rx={2}
              fill={m.status === 'severe' ? 'var(--alert)' : m.status === 'constrained' ? 'var(--alert-soft)' : m.status === 'watch' ? 'var(--warm-soft)' : 'var(--tint)'}
              stroke={m.status === 'constrained' ? 'var(--alert)' : m.status === 'watch' ? 'var(--warm)' : 'none'} strokeWidth={1} />
            <text x={cx(i)} y={T + PH + 36} textAnchor="middle" fontSize={10.5} fontFamily="var(--mono)" fontWeight={500}
              fill={m.status === 'severe' ? '#fff' : m.status === 'constrained' ? 'var(--alert)' : m.status === 'watch' ? 'var(--warm)' : 'var(--muted)'}>{pct(m.utilization)}</text>
            <rect x={L + band * i} y={T} width={band} height={PH + B} fill="transparent" onMouseEnter={() => setHover(i)} />
          </g>
        ))}
        {hover !== null && <rect x={L + band * hover} y={T} width={band} height={PH} fill="var(--ink)" opacity={0.04} pointerEvents="none" />}
      </svg>
      {h && (
        <div className="tip" style={{ left: `${((cx(hover!) + (hover! > n / 2 ? -band / 2 : band / 2)) / W) * 100}%`, top: 8, transform: hover! > n / 2 ? 'translateX(-100%)' : undefined }}>
          <b>{monthLabel(h.month, true)} · {pct(h.utilization)} of productive hours</b>
          run work {fmt.num(h.runHours)} h · initiatives {fmt.num(h.portfolioHours)} h<br />
          target capacity {fmt.num(h.targetCapacityHours)} h at {h.availableFte.toFixed(1)} FTE<br />
          {h.gapHours > 0 ? `${fmt.num(h.gapHours)} h over capacity · ${h.workforceGap.toFixed(1)} FTE short` : 'within capacity'}
          {h.hiresLanded > 0 ? ` · ${Math.round(h.hiresLanded)} hires land` : ''}
        </div>
      )}
    </div>
  );
}
