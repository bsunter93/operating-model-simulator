import type { Fmt } from '../lib/format';
import { asUnits, type Workload } from '../lib/workload';

/**
 * Why this team is where it is, this month.
 *
 * One bar for everything the team was handed, cut into the things that handed it: the
 * streams by name, the escalations off another team, the change work, and last month's
 * queue. A marker sits where its capacity runs out. Anything past the marker is the
 * month's arithmetic made visible, and it needs no sentence explaining it.
 *
 * Nothing here is a second calculation. Every segment is a field the engine produced.
 */

const KIND_ORDER = { waiting: 0, arrival: 1, route: 2, change: 3 } as const;

/**
 * 'bar' is the picture: the bar and what each colour is. 'detail' is the arithmetic
 * behind it, for a reader who opens it.
 */
export function Why({ w, answered, fmt, variant = 'bar' }:
  { w: Workload; answered: number | null; fmt: Fmt; variant?: 'bar' | 'detail' }) {
  const total = Math.max(w.given, w.capacityHours, 1);
  const capAt = (w.capacityHours / total) * 100;
  /* Two lines, not one. "Over capacity" here means past the line the team planned to run
     at, which is deliberately not the same as past everything it could physically do: a
     team handed less than its ceiling can still be over the plan it was staffed against.
     Showing only the ceiling made the sentence contradict the word above it. */
  const planned = w.capacityHours * w.targetUtilization;
  const planAt = (planned / total) * 100;
  const segs = [...w.sources].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
  const count = (hours: number) => {
    const u = asUnits(w, hours);
    return u !== null && u >= 1 ? `${fmt.count(Math.round(u))} ${w.unit}` : fmt.hours(hours);
  };

  if (variant === 'detail') {
    return (
      <div className="why why-detail">
        <ul className="why-key">
          {segs.map((s) => (
            <li key={s.key}>
              <i className={'k-' + s.kind} />
              <span className="why-k-l">{s.label}</span>
              <b>{fmt.hours(s.hours)}</b>
              <em>{Math.round(s.share * 100)}%</em>
            </li>
          ))}
        </ul>
        <p className="why-end">
          It planned for <b>{count(planned)}</b> and could do at most <b>{count(w.capacityHours)}</b>,
          {' '}with {Math.round(w.people)} people at {Math.round(w.hoursEach)} productive hours each.
          {' '}It got through <b>{count(w.gotTo)}</b>.
          {w.waits > 0 && <> <b>{count(w.waits)}</b> left waiting for next month.</>}
          {w.lost > 0 && <> <b className="p-buried">{count(w.lost)}</b> turned away for good.</>}
          {w.waits <= 0 && w.lost <= 0 && <> Nothing was left over.</>}
          {answered !== null && (
            <> <b>{Math.round(answered * 100)}%</b> was picked up inside its target.</>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="why">
      <div className="why-bar" role="img"
           aria-label={`${Math.round(w.utilization * 100)} percent of capacity`}>
        {segs.map((s) => (
          <i key={s.key} className={'k-' + s.kind} style={{ width: `${(s.hours / total) * 100}%` }}
             title={`${s.label}: ${fmt.hours(s.hours)}`} />
        ))}
        {/* A label anchored to the right of a marker sitting at the far end of the bar
            pushes the panel wider than the page. Near the end they flip inward. */}
        <u className="why-plan" style={{ left: `${planAt}%` }}>
          <span className={planAt < 14 ? 'in' : ''}>planned for</span>
        </u>
        <u className="why-cap" style={{ left: `${capAt}%` }}>
          <span className={capAt > 86 ? 'in' : ''}>could do</span>
        </u>
      </div>

      <ul className="why-key why-key-short">
        {segs.map((s) => (
          <li key={s.key}><i className={'k-' + s.kind} /><span className="why-k-l">{s.label}</span></li>
        ))}
      </ul>
    </div>
  );
}
