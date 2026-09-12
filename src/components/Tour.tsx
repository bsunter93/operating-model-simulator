import { useEffect, useMemo } from 'react';
import { run } from '../engine';
import { useStore } from '../state/store';
import { TOUR } from '../lib/tour';
import type { TourCtx } from '../lib/tour';
import { effectsFor } from '../lib/effects';

/** Floating walkthrough card. Glows the element it talks about via data-tour. */
export function Tour() {
  const { state, dispatch, model, result, base, interventions, teamName, initName, isFixture } = useStore();
  const step = state.tourStep;
  const s = step !== null ? TOUR[step] : null;

  const ctx = useMemo<TourCtx>(() => {
    const active = interventions.filter((iv) => state.interventionIds.includes(iv.id));
    const doNothing = run(model, { scenario: state.scenarioId });
    const effects = effectsFor(model, state.scenarioId, active, active, active.length ? result : doNothing, teamName);
    return { model, result, base, scenarioId: state.scenarioId, interventionIds: state.interventionIds, choice: state.tourChoice, teamName, initName, effect: (id) => effects.get(id) };
  }, [model, result, base, interventions, state.scenarioId, state.interventionIds, state.tourChoice, teamName, initName]);

  // Glow the target and scroll it into view whenever the step or page changes.
  useEffect(() => {
    if (!s) return;
    const timer = window.setTimeout(() => {
      document.querySelectorAll('.glow').forEach((e) => e.classList.remove('glow'));
      const el = document.querySelector(`[data-tour="${s.target}"]`);
      if (el) { el.classList.add('glow'); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    }, 80);
    return () => window.clearTimeout(timer);
  }, [s, state.scenarioId, state.interventionIds, window.location.hash]);
  useEffect(() => () => { document.querySelectorAll('.glow').forEach((e) => e.classList.remove('glow')); }, []);

  const go = (i: number | null) => {
    if (i === null) { dispatch({ type: 'tour', step: null }); document.querySelectorAll('.glow').forEach((e) => e.classList.remove('glow')); return; }
    const next = TOUR[i];
    dispatch({ type: 'tour', step: i });
    dispatch({ type: 'tourChoice', id: null });
    if (i === 0) { dispatch({ type: 'reset' }); }
    const q = window.location.hash.split('?')[1];
    const route = next.route(ctx);
    window.location.hash = route + (q ? '?' + q : '');
  };

  const choose = (id: string) => {
    const c = s?.choices?.(ctx).find((x) => x.id === id);
    if (!c) return;
    dispatch({ type: 'tourChoice', id });
    if (c.interventionIds) dispatch({ type: 'setInterventions', ids: c.interventionIds });
    if (c.scenarioId) dispatch({ type: 'scenario', id: c.scenarioId });
  };

  if (!isFixture && step === null) return null;

  if (!s) {
    return (
      <div className="tourbar">
        <span>New here?</span>
        <button className="btn small" onClick={() => go(0)}>Walk through it in seven steps</button>
      </div>
    );
  }

  const choices = s.choices?.(ctx) ?? [];
  const chosen = state.tourChoice;
  return (
    <aside className="tourcard" aria-live="polite">
      <div className="tourcard-head">
        <span className="tourcard-step">Step {step! + 1} of {TOUR.length}</span>
        <button className="tourcard-close" onClick={() => go(null)} aria-label="Close walkthrough">×</button>
      </div>
      <b className="tour-title">{s.title}</b>
      <p className="tour-body">{s.body(ctx)}</p>
      {choices.length > 0 && (
        <div className="tour-choices">
          <p className="tour-q">{s.question}</p>
          {choices.map((c) => (
            <button key={c.id} className={'choice' + (chosen === c.id ? ' on' : '')} onClick={() => choose(c.id)}>{c.label}</button>
          ))}
        </div>
      )}
      {chosen && s.after && <p className="tour-after">{s.after(ctx)}</p>}
      <div className="tour-nav">
        <button className="btn ghost small" onClick={() => go(step! === 0 ? null : step! - 1)}>{step === 0 ? 'Close' : 'Back'}</button>
        {step! < TOUR.length - 1
          ? <button className="btn small" onClick={() => go(step! + 1)} disabled={choices.length > 0 && !chosen}>{choices.length > 0 && !chosen ? 'Pick one to continue' : 'Next'}</button>
          : <button className="btn small" onClick={() => { go(null); dispatch({ type: 'reset' }); window.location.hash = '#/'; }}>Finish</button>}
      </div>
    </aside>
  );
}
