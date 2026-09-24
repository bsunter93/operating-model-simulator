import type { Fmt } from './format';
import { asUnits, PRESSURE_WORD, pressureOf, type Workload } from './workload';

/** The headline for a team this month: its pressure, and by how much it missed its plan. */
export function headlineOf(w: Workload, fmt: Fmt) {
  const press = pressureOf(w);
  const planned = w.capacityHours * w.targetUtilization;
  const count = (hours: number) => {
    const u = asUnits(w, hours);
    return u !== null && u >= 1 ? `${fmt.count(Math.round(u))} ${w.unit}` : fmt.hours(hours);
  };
  const past = w.given - planned;
  return {
    press,
    word: PRESSURE_WORD[press],
    by: (press === 'over' || press === 'buried') && past > 0 ? count(past) : null,
    line: `${count(w.given)} came in. The plan covered ${count(planned)}.`,
  };
}
