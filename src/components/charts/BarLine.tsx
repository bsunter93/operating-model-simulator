import { useState } from 'react';
import { monthLabel } from '../../lib/format';

export interface Series { key: string; label: string; values: number[]; color: string }
export interface Line { label: string; values: number[]; color: string; dashed?: boolean }
export interface Note { index: number; text: string; color?: string }

interface Props {
  months: string[];
  series: Series[];
  lines?: Line[];
  notes?: Note[];
  format: (v: number) => string;
  /** Tooltip body for a month. */
  tip?: (i: number) => string;
  yLabel?: string;
  /** Start the y axis at zero (default) or let it float to the data. */
  zero?: boolean;
}

const W = 920, H = 300, L = 62, R = 18, T = 34, B = 34;
const PW = W - L - R, PH = H - T - B;

function niceStep(range: number): number {
  const raw = range / 4;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

/** Stacked monthly bars with optional reference lines, direct labels, and hover. */
export function BarLine({ months, series, lines = [], notes = [], format, tip, yLabel, zero = true }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const n = months.length;
  const band = PW / n;
  const barW = band * 0.56;
  const totals = months.map((_, i) => series.reduce((s, x) => s + x.values[i], 0));
  const allVals = [...totals, ...lines.flatMap((l) => l.values)];
  const maxVal = Math.max(...allVals) * 1.08;
  const minVal = zero ? 0 : Math.min(...allVals) * 0.92;
  const step = niceStep(maxVal - minVal);
  const top = Math.ceil(maxVal / step) * step;
  const bottom = zero ? 0 : Math.floor(minVal / step) * step;
  const y = (v: number) => T + PH - ((v - bottom) / (top - bottom)) * PH;
  const cx = (i: number) => L + band * i + band / 2;
  const ticks: number[] = [];
  for (let v = bottom; v <= top + 1e-9; v += step) ticks.push(v);

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" onMouseLeave={() => setHover(null)}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--hair)" />
            <text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fontFamily="var(--mono)" fill="var(--muted)">{format(v)}</text>
          </g>
        ))}
        {yLabel && <text x={2} y={T - 14} fontSize={10.5} fontFamily="var(--mono)" fill="var(--muted)" letterSpacing={1}>{yLabel}</text>}
        {months.map((_, i) => {
          let acc = 0;
          return (
            <g key={i}>
              {series.map((s, k) => {
                const v = s.values[i];
                const y0 = y(Math.max(acc, bottom)), y1 = y(Math.max(acc + v, bottom));
                acc += v;
                const gap = k > 0 && v > 0 ? 2 : 0;
                return v > 0 ? <rect key={s.key} x={cx(i) - barW / 2} y={y1} width={barW} height={Math.max(0, y0 - y1 - gap)} fill={s.color} rx={1} /> : null;
              })}
            </g>
          );
        })}
        {lines.map((l) => (
          <g key={l.label}>
            <polyline points={l.values.map((v, i) => `${cx(i)},${y(v)}`).join(' ')} fill="none" stroke={l.color} strokeWidth={l.dashed ? 1.5 : 2} strokeDasharray={l.dashed ? '4 4' : undefined} />
            <text x={W - R} y={y(l.values[n - 1]) - 6} textAnchor="end" fontSize={11} fontFamily="var(--sans)" fill={l.color} paintOrder="stroke" stroke="var(--surface)" strokeWidth={3}>{l.label}</text>
          </g>
        ))}
        {notes.map((nt) => (
          <g key={`${nt.index}-${nt.text}`}>
            <line x1={cx(nt.index)} x2={cx(nt.index)} y1={T - 2} y2={y(totals[nt.index]) - 4} stroke={nt.color ?? 'var(--accent)'} strokeDasharray="2 3" />
            <text x={cx(nt.index)} y={T - 6} textAnchor="middle" fontSize={11} fontFamily="var(--mono)" fontWeight={500} fill={nt.color ?? 'var(--accent)'} paintOrder="stroke" stroke="var(--surface)" strokeWidth={3}>{nt.text}</text>
          </g>
        ))}
        <line x1={L} x2={W - R} y1={T + PH} y2={T + PH} stroke="var(--line)" />
        {months.map((m, i) => (
          <g key={m}>
            <text x={cx(i)} y={T + PH + 16} textAnchor="middle" fontSize={11} fontFamily="var(--mono)" fill={hover === i ? 'var(--ink)' : 'var(--muted)'}>{monthLabel(m)}</text>
            <rect x={L + band * i} y={T} width={band} height={PH + B} fill="transparent" onMouseEnter={() => setHover(i)} />
          </g>
        ))}
        {hover !== null && <rect x={L + band * hover} y={T} width={band} height={PH} fill="var(--ink)" opacity={0.04} pointerEvents="none" />}
      </svg>
      {hover !== null && tip && (
        <div className="tip" style={{ left: `${((cx(hover) + (hover > n / 2 ? -band / 2 : band / 2)) / W) * 100}%`, top: 8, transform: hover > n / 2 ? 'translateX(-100%)' : undefined }} dangerouslySetInnerHTML={{ __html: tip(hover) }} />
      )}
    </div>
  );
}
