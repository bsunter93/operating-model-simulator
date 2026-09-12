import { useMemo } from 'react';
import { run } from '../engine';
import type { Intervention } from '../models/types';
import type { ModelResult } from '../models/results';
import { CUSTOM_KINDS, customIntervention, isCustomId, knobFor, useRoute, useStore } from '../state/store';
import { monthLabel, pct } from '../lib/format';
import { TOUR } from '../lib/tour';

/** One line on what toggling this intervention does, given everything else already on. */
function describe(iv: Intervention, before: ModelResult, after: ModelResult, teamName: (id: string) => string, hiringTeam: (id: string) => string | undefined): string {
  const team = (r: ModelResult, id: string) => r.teams.find((t) => t.teamId === id)!;
  const init = (r: ModelResult, id: string) => r.initiatives.find((i) => i.initiativeId === id)!;
  const teamLine = (id: string) => {
    const a = team(before, id), b = team(after, id);
    if (a.monthsConstrained === b.monthsConstrained && Math.abs(a.peakUtilization - b.peakUtilization) < 0.005) return `${teamName(id)}: no change`;
    return `${teamName(id)}: ${a.monthsConstrained} → ${b.monthsConstrained} months over target, peak ${pct(a.peakUtilization)} → ${pct(b.peakUtilization)}`;
  };
  switch (iv.type) {
    case 'expediteHiring': {
      const tid = hiringTeam(iv.hiringRequestId);
      if (!tid) return 'That hiring request is not in this model';
      const landB = team(before, tid).months.find((m) => m.hiresLanded > 0)?.month;
      const landA = team(after, tid).months.find((m) => m.hiresLanded > 0)?.month;
      if (!landB) return `${teamName(tid)}: no planned hires to expedite in this scenario`;
      return `Hires land ${monthLabel(landA ?? '')} instead of ${monthLabel(landB)}. ${teamLine(tid)}`;
    }
    case 'hire': case 'automation': return teamLine(iv.teamId);
    case 'serviceLevelChange': return `${teamLine(iv.teamId)} (the target moved; the work did not)`;
    case 'reallocation': return `${teamLine(iv.toTeamId)}. ${teamLine(iv.fromTeamId)}`;
    case 'defer': {
      const a = init(before, iv.initiativeId), b = init(after, iv.initiativeId);
      if (a.effectiveStart === b.effectiveStart) return `Start stays ${monthLabel(b.effectiveStart ?? '')}: a dependency already pushed it further than this deferral`;
      return `Start moves ${monthLabel(a.effectiveStart ?? '')} → ${monthLabel(b.effectiveStart ?? '')}`;
    }
    case 'cancel': {
      const changed = before.teams.map((t) => teamLine(t.teamId)).filter((s) => !s.endsWith('no change'));
      return changed.length ? changed.join('. ') : 'Releases capacity nobody was short of';
    }
  }
}

function Tour() {
  const { state, dispatch } = useStore();
  const step = state.tourStep;
  const go = (i: number | null) => {
    dispatch({ type: 'tour', step: i });
    if (i === null) return;
    const s = TOUR[i];
    dispatch({ type: 'scenario', id: s.scenarioId });
    dispatch({ type: 'setInterventions', ids: s.interventionIds });
    const q = window.location.hash.split('?')[1];
    window.location.hash = s.route + (q ? '?' + q : '');
  };
  if (step === null) {
    return (
      <div className="card tour">
        <h3>Walk through it</h3>
        <p className="tour-body">Six steps, about two minutes. Each one sets the controls for you.</p>
        <button className="btn" onClick={() => go(0)}>Start the walkthrough</button>
      </div>
    );
  }
  const s = TOUR[step];
  return (
    <div className="card tour on">
      <h3>Step {step + 1} of {TOUR.length}</h3>
      <b className="tour-title">{s.title}</b>
      <p className="tour-body">{s.body}</p>
      <div className="tour-nav">
        <button className="btn ghost" onClick={() => go(step === 0 ? null : step - 1)}>{step === 0 ? 'Close' : 'Back'}</button>
        {step < TOUR.length - 1
          ? <button className="btn" onClick={() => go(step + 1)}>Next</button>
          : <button className="btn" onClick={() => { dispatch({ type: 'reset' }); dispatch({ type: 'tour', step: null }); window.location.hash = '#/overview'; }}>Finish and explore</button>}
      </div>
    </div>
  );
}

export function Rail() {
  const { state, dispatch, model, interventions, result, teamName, isFixture } = useStore();
  const route = useRoute();
  const viewTeam = route.view === 'capacity' ? route.teamId : null;
  const scenario = model.scenarios.find((s) => s.id === state.scenarioId)!;
  const hiringTeam = (id: string) => model.hiringPlan.find((h) => h.id === id)?.teamId;

  // The three generic levers for the team on screen, plus any generic levers already on for other teams.
  const levers = useMemo(() => {
    const ids = new Set<string>(state.interventionIds.filter(isCustomId));
    if (viewTeam) for (const k of CUSTOM_KINDS) ids.add(`${viewTeam}:${k}`);
    return [...ids].map((id) => interventions.find((iv) => iv.id === id) ?? customIntervention(model, id.split(':')[0], id.split(':')[1] as (typeof CUSTOM_KINDS)[number], state.overrides[id])!).filter(Boolean);
  }, [model, interventions, state.interventionIds, state.overrides, viewTeam]);
  const planned = interventions.filter((iv) => !isCustomId(iv.id));

  const effects = useMemo(() => {
    const out = new Map<string, string>();
    const active = interventions.filter((iv) => state.interventionIds.includes(iv.id));
    for (const iv of [...planned, ...levers]) {
      const on = state.interventionIds.includes(iv.id);
      const without = active.filter((x) => x.id !== iv.id);
      const before = on ? run(model, { scenario: state.scenarioId, interventions: without }) : result;
      const after = on ? result : run(model, { scenario: state.scenarioId, interventions: [...without, iv] });
      let text = describe(iv, before, after, teamName, hiringTeam);
      if (viewTeam) {
        const a = before.teams.find((t) => t.teamId === viewTeam)!, b = after.teams.find((t) => t.teamId === viewTeam)!;
        const same = a.months.every((m, i) => Math.abs(m.workloadHours - b.months[i].workloadHours) < 1e-6 && Math.abs(m.availableFte - b.months[i].availableFte) < 1e-6 && m.targetUtilization === b.months[i].targetUtilization);
        if (same) text = `No effect on ${teamName(viewTeam)}${/no change|stays|nobody/.test(text) ? '' : `; ${text.charAt(0).toLowerCase() + text.slice(1)}`}`;
      }
      out.set(iv.id, text);
    }
    return out;
  }, [model, interventions, planned, levers, state.scenarioId, state.interventionIds, result, teamName, viewTeam]);

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
            <span className={'effect' + (/^No effect|no change|stays|nobody|not in this/.test(eff) ? ' none' : '')}>{eff}</span>
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
    <aside className="rail">
      {isFixture && <Tour />}
      <div className="card">
        <h3>Scenario</h3>
        <select className="select" value={state.scenarioId} onChange={(e) => dispatch({ type: 'scenario', id: e.target.value })} aria-label="Scenario">
          {model.scenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {scenario.description && <p className="scenario-desc">{scenario.description}</p>}
      </div>
      {levers.length > 0 && (
        <div className="card">
          <h3>{viewTeam ? `Try on ${teamName(viewTeam)}` : 'Your levers'}</h3>
          <p className="note top">{viewTeam ? 'Three things any team can do: add people, remove work, or run hotter. Set the size, turn it on.' : 'Generic levers you turned on from a team page.'}</p>
          <ul className="ivs">{levers.map(item)}</ul>
        </div>
      )}
      <div className="card">
        <h3>{levers.length ? 'In the plan' : 'Interventions'}</h3>
        <p className="note top">Options already on the table for this plan. Turn any on; they stack. Each line shows what it changes on top of the others.</p>
        <ul className="ivs">{planned.map(item)}</ul>
        {(state.interventionIds.length > 0 || scenario.type !== 'base' || Object.keys(state.overrides).length > 0) && (
          <button className="reset" onClick={() => dispatch({ type: 'reset' })}>Reset to the base plan</button>
        )}
      </div>
    </aside>
  );
}
