import { useEffect, useRef, useState } from 'react';
import type { Track } from '../lib/replay';

/**
 * Watch the two years pull apart.
 *
 * Three small charts on one axis of months, the plan as written behind and the reader's
 * year in front, with a playhead that walks January to December. Everything before the
 * playhead is drawn; everything after it is not, so pressing play is watching the year
 * happen rather than looking at a finished picture of it.
 */

interface Props {
  tracks: Track[];
  months: number;
  labels: string[];
  diverges: number | null;
  value: (t: Track, v: number) => string;
}

const W = 100, H = 30;

const pathTo = (s: number[], max: number, upto: number) => {
  const n = s.length - 1;
  const pts = s.slice(0, upto + 1).map((v, i) => {
    const x = n > 0 ? (i / n) * W : W / 2;
    const y = H - Math.max(0, Math.min(1, v / (max || 1))) * (H - 1);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  return pts.length ? 'M' + pts.join(' L') : '';
};

export function Replay({ tracks, months, labels, diverges, value }: Props) {
  const [at, setAt] = useState(months - 1);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) return;
    timer.current = window.setInterval(() => {
      setAt((m) => {
        if (m >= months - 1) { setPlaying(false); return m; }
        return m + 1;
      });
    }, 420);
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, [playing, months]);

  const start = () => { setAt(0); setPlaying(true); };

  return (
    <div className="rp">
      <div className="rp-head">
        <button type="button" className="rp-go" onClick={playing ? () => setPlaying(false) : start}>
          {playing ? 'Pause' : 'Replay the year'}
        </button>
        <span className="rp-at">{labels[at]}</span>
        {diverges !== null
          ? <span className="rp-div">The two years part in <b>{labels[diverges]}</b></span>
          : <span className="rp-div">The two years never part</span>}
      </div>

      <div className="rp-tracks">
        {tracks.map((t) => {
          const d = t.mine[at] - t.base[at];
          const good = (d > 0) === t.upIsGood;
          return (
            <div key={t.key} className="rp-track">
              <p className="rp-k">{t.label}</p>
              <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
                <path className="rp-base" d={pathTo(t.base, t.max, at)} />
                <path className="rp-mine" d={pathTo(t.mine, t.max, at)} />
                <line className="rp-head-l" x1={t.base.length > 1 ? (at / (t.base.length - 1)) * W : W / 2}
                      x2={t.base.length > 1 ? (at / (t.base.length - 1)) * W : W / 2} y1="0" y2={H} />
              </svg>
              <p className="rp-v">
                <b>{value(t, t.mine[at])}</b>
                <span>plan {value(t, t.base[at])}</span>
                {Math.abs(d) / (t.max || 1) > 0.004 && (
                  <em className={good ? 'up' : 'down'}>{good ? 'better' : 'worse'}</em>
                )}
              </p>
            </div>
          );
        })}
      </div>

      <ol className="rp-axis">
        {labels.slice(0, months).map((l, i) => (
          <li key={i} className={i === at ? 'on' : i <= at ? 'past' : ''}>{l[0]}</li>
        ))}
      </ol>
    </div>
  );
}
