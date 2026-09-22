import type { Shape } from '../data/templates';

/**
 * Four marks for the four kinds of work, drawn in the language the canvas already uses:
 * a square is a piece of work, a bar is a stretch of time, a line is a channel or a wall.
 *
 * Icons are worth it here and nowhere else in this app. The toolbar has five verbs that
 * say what they do in two words, so a glyph there is a private language. This is a choice
 * between four things made once, where the difference is structural rather than verbal,
 * and a picture of the structure says it faster than the sentence underneath it does.
 */
export function WorldMark({ shape }: { shape: Shape }) {
  return (
    <svg className="wm" viewBox="0 0 34 22" aria-hidden="true" focusable="false">
      {shape === 'queue' && (
        <>
          {[0, 5, 10, 15].map((x) => <rect key={x} x={1 + x} y="9" width="3.4" height="3.4" />)}
          <path className="wm-l" d="M28,4 V18" />
        </>
      )}
      {shape === 'projects' && (
        <>
          <rect x="5" y="3.5" width="16" height="3.4" />
          <rect x="11" y="9.3" width="18" height="3.4" />
          <rect x="1" y="15.1" width="12" height="3.4" />
        </>
      )}
      {shape === 'mixed' && (
        <>
          {[0, 5, 10].map((x) => <rect key={x} x={1 + x} y="9" width="3.4" height="3.4" />)}
          <path className="wm-l" d="M16,10.7 H20 M20,10.7 V5.7 H23 M20,10.7 V15.7 H23" />
          <rect x="24" y="4" width="9" height="3.4" />
          <rect x="24" y="14" width="7" height="3.4" />
        </>
      )}
      {shape === 'restricted' && (
        <>
          <path className="wm-l" d="M1.7,5 H32.3 V17 H1.7 Z M11.9,5 V17 M22.1,5 V17" />
          <rect x="3.4" y="8" width="6.8" height="6" />
          <rect x="23.8" y="8" width="6.8" height="6" />
        </>
      )}
    </svg>
  );
}
