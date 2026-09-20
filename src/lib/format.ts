const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function monthLabel(key: string, withYear = false): string {
  const [y, m] = key.split('-');
  const name = MONTHS[Number(m) - 1] ?? key;
  return withYear ? `${name} ${y}` : name;
}

export function money(v: number, opts: { sign?: boolean; compact?: boolean } = {}): string {
  const { sign = false, compact = true } = opts;
  const abs = Math.abs(v);
  let s: string;
  if (!compact) s = `$${Math.round(abs).toLocaleString()}`;
  else if (abs >= 1e9) s = `$${(abs / 1e9).toFixed(abs >= 1e10 ? 0 : 1)}B`;
  else if (abs >= 1e6) s = `$${(abs / 1e6).toFixed(abs >= 1e8 ? 0 : 1)}M`;
  else if (abs >= 1e3) s = `$${Math.round(abs / 1e3)}K`;
  else s = `$${Math.round(abs)}`;
  if (v < 0) return `−${s}`;
  return sign && v > 0 ? `+${s}` : s;
}

export function pct(v: number, digits = 0): string {
  if (!Number.isFinite(v)) return '∞';
  return `${(v * 100).toFixed(digits)}%`;
}

export function pp(v: number): string {
  const s = `${Math.abs(v * 100).toFixed(0)} pt`;
  return v < 0 ? `−${s}` : `+${s}`;
}

export function fte(v: number, digits = 0): string {
  return v.toFixed(digits);
}

export function num(v: number): string {
  return Math.round(v).toLocaleString();
}

export function signed(v: number, fmt: (n: number) => string): string {
  if (Math.abs(v) < 1e-9) return '±0';
  return (v > 0 ? '+' : '−') + fmt(Math.abs(v));
}

/** Hours of work, at the scale a year of them actually lands on: thousands. */
export function hours(v: number): string {
  return v >= 1000 ? (v / 1000).toFixed(1) + 'k hours' : Math.round(v) + ' hours';
}
