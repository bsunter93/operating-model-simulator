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
}

export function YearSpine({ shape, base, month, labels, playing, onPick, onPlay }: Props) {
  const teams = shape[0]?.teams || 1;
  const h = (p: YearPoint) => (p.over / teams) * 100;
  const tone = (p: YearPoint) => (p.over === 0 ? 'ok' : p.over / teams > 0.5 ? 'bad' : 'mid');

  return (
    <div className="ys">
      <p className="ys-title">Teams over capacity, month by month</p>
      <button type="button" className="ys-play" onClick={onPlay} aria-label={playing ? 'Pause' : 'Play the year'}>
        {playing ? '❙❙' : '▶'}
      </button>
      <div className="ys-track" role="group" aria-label="Month">
        {shape.map((p) => {
          const was = base?.[p.month];
          return (
            <button key={p.month} type="button"
                    className={'ys-m' + (p.month === month ? ' on' : '')}
                    aria-pressed={p.month === month}
                    aria-label={`${labels[p.month]}: ${p.over} of ${p.teams} teams over capacity`}
                    onClick={() => onPick(p.month)}>
              <span className="ys-bars">
                {/* The plan as written sits behind, so a change reads as a difference in
                    shape rather than a number the reader has to remember. */}
                {was && was.over !== p.over && (
                  <i className="ys-was" style={{ height: `${h(was)}%` }} />
                )}
                <i className={'ys-now ' + tone(p)} style={{ height: `${h(p)}%` }} />
              </span>
              <span className="ys-l">{labels[p.month]?.slice(0, 1)}</span>
            </button>
          );
        })}
      </div>
      <p className="ys-cap">
        <b>{labels[month]}</b>
        {' · '}
        {shape[month].over === 0
          ? 'every team inside its limit'
          : `${shape[month].over} of ${shape[month].teams} teams over capacity`}
        {base && <span className="ys-key">Dashed outlines are the plan as written.</span>}
      </p>
    </div>
  );
}
