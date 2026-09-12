import { useMemo } from 'react';
import { CUSTOM_KINDS, customIntervention, isCustomId, knobFor, href, useStore } from '../state/store';
import type { Intervention } from '../models/types';
import { TeamTimeline } from '../components/charts/TeamTimeline';
import { StatusPill } from '../components/StatusPill';
import { effectsFor, isQuietEffect } from '../lib/effects';
import { pct } from '../lib/format';

export function Options({ teamId: requested }: { teamId: string }) {
  const { state, dispatch, model, interventions, result, doNothing, teamName } = useStore();
  const teamId = requested || result.summary.firstBreakTeamId || model.teams[0].id;
  const def = model.teams.find((t) => t.id === teamId)!;
  const team = result.teams.find((t) => t.teamId === teamId)!;
  const ghost = doNothing.teams.find((t) => t.teamId === teamId)!;
  const q = window.location.hash.split('?')[1];

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
      <li key={iv.id} className={'iv' + (on ? ' on' : '')}>
        <label className="iv-main">
          <input type="checkbox" checked={on} onChange={() => dispatch({ type: 'toggleIntervention', id: iv.id })} />
          <span>
            <b>{iv.name}{iv.description && <span className="term info" tabIndex={0} data-tip={iv.description} aria-label="What this is">?</span>}</b>
            <span className={'effect' + (isQuietEffect(eff) ? ' none' : '')}>{eff}</span>
          </span>
        </label>
        {knob && (
          <label className="knob">
            <span>{knob.label}</span>
            <input type="number" min={knob.min} max={knob.max} step={knob.step} value={knob.get(iv)} onChange={(e) => dispatch({ type: 'override', id: iv.id, value: Math.min(knob.max, Math.max(knob.min, Number(e.target.value))) })} />
            <span>{knob.unit}</span>
          </label>
        )}
      </li>
    );
  };

  return (
    <main className="main one">
      <div className="eyebrow">4 · What to do</div>
      <div className="teamhead">
        <h1 className="title">What could we do about {def.name}?</h1>
        <select className="teampick" value={teamId} onChange={(e) => { window.location.hash = `#/options/${e.target.value}` + (q ? '?' + q : ''); }} aria-label="Team">
          {model.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <StatusPill status={team.worstStatus} />
      </div>
      <p className="lede">Turn a lever on and the chart moves. Each line under a lever says what it changes on top of the others already on. Set the size with the number next to it. None of this is a recommendation; the next step is where you weigh them.</p>

      <div className="two">
        <div className="two-controls">
          <div className="card" data-tour="levers">
            <h3>Try on {def.name}</h3>
            <p className="note top">Three things any team can do: add people, remove work, or run hotter.</p>
            <ul className="ivs">{levers.map(item)}</ul>
          </div>
          <div className="card">
            <h3>Already on the table</h3>
            <p className="note top">Options written into this plan. Some touch other teams; the line says so.</p>
            <ul className="ivs">{planned.map(item)}</ul>
          </div>
          {(state.interventionIds.length > 0 || Object.keys(state.overrides).length > 0) && <button className="reset" onClick={() => { dispatch({ type: 'setInterventions', ids: [] }); }}>Turn everything off</button>}
        </div>
        <div className="two-chart">
          <div className="chart sticky">
            <div className="chart-title"><b>{def.name}, month by month</b><span>{team.monthsConstrained} month{team.monthsConstrained === 1 ? '' : 's'} over the {pct(def.targetUtilization)} target · peak {pct(team.peakUtilization)}</span></div>
            <TeamTimeline team={team} ghost={active.length ? ghost : undefined} />
            <div className="legend"><span><i className="bar" /> run work</span><span><i className="bar2" /> initiative work</span><span><i data-s="severe" /> over target</span><span><i className="tline" /> target capacity</span>{active.length > 0 && <span><i className="ghost" /> before your levers</span>}</div>
          </div>
        </div>
      </div>

      <nav className="next">
        <a className="btn" href={href('#/decide')}>Next: weigh the options →</a>
      </nav>
    </main>
  );
}
