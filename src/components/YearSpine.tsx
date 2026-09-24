import type { YearPoint } from '../lib/workload';

/**
 * The year, always on.
 *
 * A scrubber under a diagram shows one month and asks the reader to hold the other eleven
 * in their head. This shows the shape of the whole year at once: how much of the
 * organisation was over capacity in each month, with the playhead sitting inside it rather
 * than beside it. Trouble that builds from April is a thing you can see before you have
 * moved anything.
 *
 * When the reader has changed something, the plan as written stays on the chart behind
 * theirs. That is the divergence, month by month, in the place they are already looking.
 */

interface Props {
  shape: YearPoint[];
  base: YearPoint[] | null;
  month: number;
  labels: string[];
  playing: boolean;
  onPick: (m: number) => void;
  onPlay: () => void;
  /** Money committed to the end of each month, against the year's budget. */
  cash: { spentToDate: number; budget: number; pace: number; fmt: (n: number) => string };
}

export function YearSpine({ shape, base, month, labels, playing, onPick, onPlay }: Props) {
  const teams = shape[0]?.teams || 1;
  const most = Math.max(1, ...shape.map((p) => p.over), ...(base ?? []).map((p) => p.over));

  return (
    <div className="ys ys2">
      <button type="button" className="ys-play" onClick={onPlay} aria-label={playing ? 'Pause' : 'Next month'}>
        {playing ? '❙❙' : '▶'}
      </button>
      <div className="ys-track" role="group" aria-label="Month">
        {shape.map((p) => {
          const was = base?.[p.month];
          return (
            <button key={p.month} type="button"
                    className={'ys-m' + (p.month === month ? ' on' : p.month < month ? ' past' : '')}
                    aria-pressed={p.month === month}
                    aria-label={`${labels[p.month]}: ${p.over} of ${p.teams} teams over capacity`}
                    title={`${labels[p.month]}: ${p.over} of ${teams} teams over capacity`}
                    onClick={() => onPick(p.month)}>
              <span className="ys-stack">
                {/* One block per team over capacity. The plan as written sits behind as an
                    outline, so a change reads as a difference in height. */}
                {was && was.over !== p.over && (
                  <span className="ys-was" style={{ height: `${(was.over / most) * 100}%` }} />
                )}
                {Array.from({ length: p.over }, (_, i) => <i key={i} style={{ height: `${100 / most}%` }} />)}
              </span>
              <span className="ys-l">{labels[p.month]}</span>
            </button>
          );
        })}
      </div>
      <p className="ys-cap">
        Each block is a team over capacity that month{base ? '. Outlines are the plan as written.' : ', if nothing changes.'}
      </p>
    </div>
  );
}
