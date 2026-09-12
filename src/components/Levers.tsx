import { useMemo } from 'react';
import type { Intervention } from '../models/types';
import { CUSTOM_KINDS, customIntervention, isCustomId, knobFor, useStore } from '../state/store';
import { effectsFor, isQuietEffect } from '../lib/effects';

/** The levers for one team plus the plan's own options, each with a computed effect line. */
export function Levers({ teamId, compact = false }: { teamId: string; compact?: boolean }) {
  const { state, dispatch, model, interventions, result, teamName } = useStore();
  const active = useMemo(() => interventions.filter((iv) => state.interventionIds.includes(iv.id)), [interventions, state.interventionIds]);
  const levers = useMemo(() => {
    const ids = new Set<string>(state.interventionIds.filter(isCustomId));
    for (const k of CUSTOM_KINDS) ids.add(`${teamId}:${k}`);
    return [...ids].map((id) => interventions.find((iv) => iv.id === id) ?? customIntervention(model, id.split(':')[0], id.split(':')[1] as (typeof CUSTOM_KINDS)[number], state.overrides[id])!).filter(Boolean);
  }, [model, interventions, state.interventionIds, state.overrides, teamId]);
  const planned = interventions.filter((iv) => !isCustomId(iv.id));
  const effects = useMemo(() => effectsFor(model, state.scenarioId, [...levers, ...planned], active, result, teamName, teamId), [model, state.scenarioId, levers, planned, active, result, teamName, teamId]);

  const item = (iv: Intervention) => {
    const on = state.interventionIds.includes(iv.id);
    const eff = effects.get(iv.id) ?? '';
    const knob = knobFor(iv);
    return (
      <li key={iv.id} className={'iv row' + (on ? ' on' : '')}>
        <input id={`iv-${iv.id}`} type="checkbox" checked={on} onChange={() => dispatch({ type: 'toggleIntervention', id: iv.id })} />
        <label htmlFor={`iv-${iv.id}`} className="iv-name">{iv.name}{iv.description && <span className="term info" tabIndex={0} data-tip={iv.description} aria-label="What this is">?</span>}</label>
        {knob ? (
          <label className="knob inline">
            <input type="number" min={knob.min} max={knob.max} step={knob.step} value={knob.get(iv)} onChange={(e) => dispatch({ type: 'override', id: iv.id, value: Math.min(knob.max, Math.max(knob.min, Number(e.target.value))) })} aria-label={knob.label} />
            <span>{knob.unit}</span>
          </label>
        ) : <span />}
        <span className={'effect' + (isQuietEffect(eff) ? ' none' : '')}>{eff}</span>
      </li>
    );
  };

  return (
    <div className="levers-one">
      <h4>Try on {teamName(teamId)}</h4>
      <ul className="ivs">{levers.map(item)}</ul>
      {!compact && <h4>Already in the plan</h4>}
      {!compact && <ul className="ivs">{planned.map(item)}</ul>}
      {compact && <details className="fold small"><summary>Options already in the plan ({planned.length})</summary><ul className="ivs">{planned.map(item)}</ul></details>}
      {state.interventionIds.length > 0 && <button className="reset" onClick={() => dispatch({ type: 'setInterventions', ids: [] })}>Turn everything off</button>}
    </div>
  );
}
