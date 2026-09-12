import { useMemo } from 'react';
import type { Intervention } from '../models/types';
import { CUSTOM_KINDS, customIntervention, isCustomId, knobFor, useStore } from '../state/store';
import { effectsFor, isQuietEffect } from '../lib/effects';

/** The one place inputs live: Scenario, Levers, Team. Labeled boxes, always in the same spot. */
export function Controls({ teamId, onTeam, compact = false }: { teamId: string; onTeam: (id: string) => void; compact?: boolean }) {
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
      <li key={iv.id} className={'lv' + (on ? ' on' : '')} title={`${eff}${iv.description ? '\n' + iv.description : ''}`}>
        <input id={`lv-${iv.id}`} type="checkbox" checked={on} onChange={() => dispatch({ type: 'toggleIntervention', id: iv.id })} />
        <label htmlFor={`lv-${iv.id}`}>{iv.name}</label>
        {knob ? <span className="lv-knob"><input type="number" min={knob.min} max={knob.max} step={knob.step} value={knob.get(iv)} onChange={(e) => dispatch({ type: 'override', id: iv.id, value: Math.min(knob.max, Math.max(knob.min, Number(e.target.value))) })} aria-label={knob.label} /><em>{knob.unit}</em></span> : <span />}
        {on && <span className={'lv-eff' + (isQuietEffect(eff) ? ' none' : '')}>{eff}</span>}
      </li>
    );
  };

  return (
    <div className={'tray' + (compact ? ' compact' : '')} data-tour="tray">
      <section className="tray-box">
        <h5>Scenario</h5>
        <select className="select" value={state.scenarioId} onChange={(e) => dispatch({ type: 'scenario', id: e.target.value })} aria-label="Scenario">
          {model.scenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <p className="tray-note">{model.scenarios.find((s) => s.id === state.scenarioId)?.description}</p>
      </section>
      <section className="tray-box">
        <h5>Team</h5>
        <select className="select" value={teamId} onChange={(e) => onTeam(e.target.value)} aria-label="Team">
          {model.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <p className="tray-note">Levers below apply to this team. The plan's own options apply where they say.</p>
      </section>
      <section className="tray-box wide">
        <h5>Levers {active.length > 0 && <button className="linkbtn small" onClick={() => dispatch({ type: 'setInterventions', ids: [] })}>turn all off</button>}</h5>
        <ul className="lvs">{levers.map(item)}</ul>
        <h6>In the plan</h6>
        <ul className="lvs">{planned.map(item)}</ul>
      </section>
    </div>
  );
}
