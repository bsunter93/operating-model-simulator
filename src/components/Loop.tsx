/** The model as a loop: decisions change the strategy, which changes everything after it. */
const TOP = ['Strategy', 'Demand', 'Workload', 'Capacity'];
const BOTTOM = ['Workforce', 'Portfolio', 'Decision'];
const PW = 112, PH = 26, GAP = 30, X0 = 6, YT = 8, YB = 78;
const col = (i: number) => X0 + i * (PW + GAP);
const W = col(3) + PW + 6, H = YB + PH + 8;

function Pill({ x, y, label, warm }: { x: number; y: number; label: string; warm?: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width={PW} height={PH} rx={3} fill="var(--surface)" stroke={warm ? 'var(--warm)' : 'var(--accent)'} strokeOpacity={0.35} />
      <text x={x + PW / 2} y={y + PH / 2 + 4} textAnchor="middle" fontSize={10.5} fontFamily="var(--mono)" fontWeight={500} letterSpacing={1.2} fill={warm ? 'var(--warm)' : 'var(--accent)'}>{label.toUpperCase()}</text>
    </g>
  );
}

export function Loop() {
  const arrow = 'var(--muted)';
  const midT = YT + PH / 2, midB = YB + PH / 2;
  return (
    <svg className="loop" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Strategy leads to demand, workload, capacity, workforce, portfolio, and a decision, which changes the strategy">
      <defs>
        <marker id="ah" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 z" fill={arrow} />
        </marker>
      </defs>
      {TOP.map((l, i) => <Pill key={l} x={col(i)} y={YT} label={l} />)}
      {BOTTOM.map((l, i) => <Pill key={l} x={col(3 - i)} y={YB} label={l} warm={l === 'Decision'} />)}
      {/* top row, left to right */}
      {[0, 1, 2].map((i) => <line key={i} x1={col(i) + PW + 2} y1={midT} x2={col(i + 1) - 3} y2={midT} stroke={arrow} strokeWidth={1.2} markerEnd="url(#ah)" />)}
      {/* down the right side */}
      <line x1={col(3) + PW / 2} y1={YT + PH + 2} x2={col(3) + PW / 2} y2={YB - 3} stroke={arrow} strokeWidth={1.2} markerEnd="url(#ah)" />
      {/* bottom row, right to left */}
      {[3, 2].map((i) => <line key={i} x1={col(i) - 2} y1={midB} x2={col(i - 1) + PW + 3} y2={midB} stroke={arrow} strokeWidth={1.2} markerEnd="url(#ah)" />)}
      {/* back up to strategy */}
      <path d={`M${col(1) - 2},${midB} H${col(0) + PW / 2} V${YT + PH + 3}`} fill="none" stroke="var(--warm)" strokeWidth={1.4} markerEnd="url(#ah)" strokeDasharray="4 3" />
    </svg>
  );
}
