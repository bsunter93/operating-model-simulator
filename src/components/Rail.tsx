import { useMemo } from 'react';
import { run } from '../engine';
import type { Intervention } from '../models/types';
import type { ModelResult } from '../models/results';
import { model, teamName, useStore } from '../state/store';
import { monthLabel, pct } from '../lib/format';

/** One line on what toggling this intervention would do, given everything else already on. */
function describe(iv: Intervention, before: ModelResult, after: ModelResult): string {
  const team = (r: ModelResult, id: string) => r.teams.find((t) => t.teamId === id)!;
  const init = (r: ModelResult, id: string) => r.initiatives.find((i) => i.initiativeId === id)!;
  const teamLine = (id: string) => {
    const a = team(before, id), b = team(after, id);
    if (a.monthsConstrained === b.monthsConstrained && Math.abs(a.peakUtilization - b.peakUtilization) < 0.005) return `${teamName(id)}: no change`;
    return `${teamName(id)}: ${a.monthsConstrained} → ${b.monthsConstrained} months over target, peak ${pct(a.peakUtilization)} → ${pct(b.peakUtilization)}`;
  };
  switch (iv.type) {
    case 'expediteHiring': {
      const req = model.hiringPlan.find((h) => h.id === iv.hiringRequestId)!;
      const landB = team(before, req.teamId).months.find((m) => m.hiresLanded > 0)?.month;
      const landA = team(after, req.teamId).months.find((m) => m.hiresLanded > 0)?.month;
      if (!landB) return `${teamName(req.teamId)}: no planned hires to expedite in this scenario`;
      return `${req.headcount} hires land ${monthLabel(landA ?? '')} instead of ${monthLabel(landB)}. ${teamLine(req.teamId)}`;
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
      const i = model.initiatives.find((x) => x.id === iv.initiativeId)!;
      const teams = Object.keys(i.requiredFteByTeam).map((id) => teamLine(id)).filter((s) => !s.endsWith('no change'));
      return teams.length ? teams.join('. ') : 'Releases capacity nobody was short of';
    }
  }
}

export function Rail() {
  const { state, dispatch, result } = useStore();
  const scenario = model.scenarios.find((s) => s.id === state.scenarioId)!;

  const effects = useMemo(() => {
    const out = new Map<string, string>();
    for (const iv of model.interventions) {
      const on = state.interventionIds.includes(iv.id);
      const without = state.interventionIds.filter((x) => x !== iv.id);
      const withIt = [...without, iv.id];
      const before = on ? run(model, { scenario: state.scenarioId, interventions: without }) : result;
      const after = on ? result : run(model, { scenario: state.scenarioId, interventions: withIt });
      out.set(iv.id, describe(iv, before, after));
    }
    return out;
  }, [state.scenarioId, state.interventionIds, result]);

  return (
    <aside className="rail">
      <div className="card">
        <h3>Scenario</h3>
        <select className="select" value={state.scenarioId} onChange={(e) => dispatch({ type: 'scenario', id: e.target.value })} aria-label="Scenario">
          {model.scenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {scenario.description && <p className="scenario-desc">{scenario.description}</p>}
      </div>
      <div className="card">
        <h3>Interventions</h3>
        <ul className="ivs">
          {model.interventions.map((iv) => {
            const on = state.interventionIds.includes(iv.id);
            const eff = effects.get(iv.id) ?? '';
            return (
              <li key={iv.id}>
                <label className="iv">
                  <input type="checkbox" checked={on} onChange={() => dispatch({ type: 'toggleIntervention', id: iv.id })} />
                  <span>
                    <b>{iv.name}</b>
                    {iv.description && <small>{iv.description}</small>}
                    <span className={'effect' + (/no change|stays|nobody/.test(eff) ? ' none' : '')}>{eff}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        <p className="note">Interventions stack. Each line shows what that one changes on top of the others already on.</p>
        {(state.interventionIds.length > 0 || scenario.type !== 'base') && (
          <button className="reset" onClick={() => dispatch({ type: 'reset' })}>Reset to the base plan</button>
        )}
      </div>
    </aside>
  );
}
