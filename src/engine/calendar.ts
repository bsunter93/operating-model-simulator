import type { MonthKey } from '../models/types';

const RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isMonthKey(s: string): boolean {
  return RE.test(s);
}

export function parseMonth(key: MonthKey): { year: number; month: number } {
  const m = RE.exec(key);
  if (!m) throw new Error(`Invalid month "${key}", expected YYYY-MM`);
  return { year: Number(m[1]), month: Number(m[2]) };
}

export function formatMonth(year: number, month: number): MonthKey {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function addMonths(key: MonthKey, n: number): MonthKey {
  const { year, month } = parseMonth(key);
  const total = year * 12 + (month - 1) + n;
  return formatMonth(Math.floor(total / 12), (total % 12) + 1);
}

export function monthsBetween(start: MonthKey, end: MonthKey): number {
  const a = parseMonth(start), b = parseMonth(end);
  return (b.year - a.year) * 12 + (b.month - a.month);
}

export function expandMonths(start: MonthKey, end: MonthKey): MonthKey[] {
  const n = monthsBetween(start, end);
  if (n < 0) throw new Error(`Calendar end ${end} is before start ${start}`);
  const out: MonthKey[] = [];
  for (let i = 0; i <= n; i++) out.push(addMonths(start, i));
  return out;
}

/** Index of a month within the horizon. May be negative or past the end. */
export function monthIndex(start: MonthKey, key: MonthKey): number {
  return monthsBetween(start, key);
}

/** Calendar month number (1-12) for a key, used to look up seasonality. */
export function calendarMonth(key: MonthKey): number {
  return parseMonth(key).month;
}

export function annualToMonthlyRate(annual: number): number {
  return 1 - Math.pow(1 - annual, 1 / 12);
}
