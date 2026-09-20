const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function monthLabel(key: string, withYear = false): string {
  const [y, m] = key.split('-');
  const name = MONTHS[Number(m) - 1] ?? key;
  return withYear ? `${name} ${y}` : name;
}

/** The minus this design uses. Intl hands back an ASCII hyphen. */
const MINUS = '−';

export interface MoneyOpts {
  /** Show a + in front of positive amounts. */
  sign?: boolean;
  /** Compact by default: $1.9M rather than $1,870,000. */
  compact?: boolean;
  /** Two decimals, for figures a reader is comparing against each other. */
  precise?: boolean;
}

/**
 * Formatting bound to one model's currency and locale.
 *
 * Every money figure used to be built by hand as '$' + a number, which meant a model
 * denominated in anything else still rendered as dollars, with the symbol in the position
 * English puts it. Intl gets all of that right, including the part hand-rolled B/M/K
 * always gets wrong: Indian lakh and crore, Japanese man, and the several languages that
 * put the symbol after the number with a space.
 */
export interface Fmt {
  money(v: number, opts?: MoneyOpts): string;
  num(v: number): string;
  /** Hours of work, at the scale a year of them actually lands on. */
  hours(v: number): string;
  currency: string;
  locale: string;
}

/**
 * Defaults are USD and en-US rather than the reader's own locale, deliberately: a figure
 * that formats differently depending on who is looking makes screenshots, printed pages
 * and tests disagree with each other for no reason anybody can see. A model that wants a
 * different one says so.
 */
export function makeFmt(currency = 'USD', locale = 'en-US'): Fmt {
  const cache = new Map<string, Intl.NumberFormat>();
  const nf = (o: Intl.NumberFormatOptions) => {
    const k = JSON.stringify(o);
    let f = cache.get(k);
    if (!f) { f = new Intl.NumberFormat(locale, o); cache.set(k, f); }
    return f;
  };
  const typographic = (parts: Intl.NumberFormatPart[]) =>
    parts.map((p) => (p.type === 'minusSign' ? MINUS : p.value)).join('');
  const short = { notation: 'compact', compactDisplay: 'short' } as const;

  return {
    currency, locale,
    money(v, { sign = false, compact = true, precise = false } = {}) {
      // Two decimals are for telling close figures apart. Nothing is close to nothing,
      // and "$0.00" in a row of millions reads as a rounding artefact.
      if (precise && v === 0) precise = false;
      const opts: Intl.NumberFormatOptions = {
        style: 'currency', currency,
        signDisplay: sign ? 'exceptZero' : 'auto',
        ...(compact
          ? { ...short, minimumFractionDigits: precise ? 2 : 0, maximumFractionDigits: precise ? 2 : 1 }
          : { maximumFractionDigits: 0 }),
      };
      return typographic(nf(opts).formatToParts(Number.isFinite(v) ? v : 0));
    },
    num: (v) => nf({ maximumFractionDigits: 0 }).format(Math.round(v)),
    hours: (v) => (v >= 1000
      ? nf({ ...short, maximumFractionDigits: 1 }).format(v)
      : nf({ maximumFractionDigits: 0 }).format(Math.round(v))) + ' hours',
  };
}

/** For engine code and anywhere a model is in hand but a bound formatter is not. */
export function fmtFor(m: { currency?: string; locale?: string }): Fmt {
  return makeFmt(m.currency, m.locale);
}

export function pct(v: number, digits = 0): string {
  if (!Number.isFinite(v)) return '∞';
  return `${(v * 100).toFixed(digits)}%`;
}

export function pp(v: number): string {
  const s = `${Math.abs(v * 100).toFixed(0)} pt`;
  return v < 0 ? `${MINUS}${s}` : `+${s}`;
}

export function fte(v: number, digits = 0): string {
  return v.toFixed(digits);
}

export function signed(v: number, f: (n: number) => string): string {
  if (Math.abs(v) < 1e-9) return '±0';
  return (v > 0 ? '+' : MINUS) + f(Math.abs(v));
}
