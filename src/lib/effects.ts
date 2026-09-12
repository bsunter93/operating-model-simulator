/** One line on what an intervention does, computed by running the model with and without it. */
import { run } from '../engine';
import type { Intervention, OperatingModel } from '../models/types';
import type { ModelResult } from '../models/results';
import { monthLabel, pct } from './format';

export function describeEffect(iv: Intervention, before: ModelResult, after: ModelResult, model: OperatingModel, teamName: (id: string) => string): string {
  const team = (r: ModelResult, id: string) => r.teams.find((t) => t.teamId === id)!;
  const init = (r: ModelResult, id: string) => r.initiatives.find((i) => i.initiativeId === id)!;
  const teamLine = (id: string) => {
    const a = team(before, id), b = team(after, id);
    if (a.monthsConstrained === b.monthsConstrained && Math.abs(a.peakUtilization - b.peakUtilization) < 0.005) return `${teamName(id)}: no change`;
    return `${teamName(id)}: ${a.monthsConstrained} → ${b.monthsConstrained} months over target, peak ${pct(a.peakUtilization)} → ${pct(b.peakUtilization)}`;
  };
  switch (iv.type) {
    case 'expediteHiring': {
      const tid = model.hiringPlan.find((h) => h.id === iv.hiringRequestId)?.teamId;
      if (!tid) return 'That hiring request is not in this model';
      const landB = team(before, tid).months.find((m) => m.hiresLanded > 0)?.month;
      const landA = team(after, tid).months.find((m) => m.hiresLanded > 0)?.month;
      if (!landB) return `${teamName(tid)}: no planned hires to expedite in this scenario`;
      return `Hires land ${monthLabel(landA ?? '')} instead of ${monthLabel(landB)}. ${teamLine(tid)}`;
    }
    case 'hire': {
      const land = team(after, iv.teamId).months.find((m) => m.hiresLanded > 0 && team(before, iv.teamId).months[m.monthIndex].hiresLanded < m.hiresLanded)?.month;
      return `${land ? `${iv.headcount} more land ${monthLabel(land)}. ` : ''}${teamLine(iv.teamId)}`;
    }
    case 'automation': return teamLine(iv.teamId);
    case 'serviceLevelChange': return `${teamLine(iv.teamId)} (the target moved; the work did not)`;
    case 'reallocation': return `${teamLine(iv.toTeamId)}. ${teamLine(iv.fromTeamId)}`;
    case 'defer': {
      const a = init(before, iv.initiativeId), b = init(after, iv.initiativeId);
      if (a.effectiveStart === b.effectiveStart) return `Start stays ${monthLabel(b.effectiveStart ?? '')}: a dependency already pushed it further than this deferral`;
      return `Start moves ${monthLabel(a.effectiveStart ?? '')} → ${monthLabel(b.effectiveStart ?? '')}`;
    }
    case 'cancel': {
      const changed = before.teams.map((t) => teamLine(t.teamId)).filter((s) => !s.endsWith('no change'));
      return changed.length ? changed.join('. ') : 'Releases capacity on teams that were not short';
    }
  }
}

/** Effect of each candidate on top of the active stack, under the scenario. */
export function effectsFor(model: OperatingModel, scenarioId: string, candidates: Intervention[], active: Intervention[], current: ModelResult, teamName: (id: string) => string, focusTeam?: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const iv of candidates) {
    const on = active.some((x) => x.id === iv.id);
    const without = active.filter((x) => x.id !== iv.id);
    const before = on ? run(model, { scenario: scenarioId, interventions: without }) : current;
    const after = on ? current : run(model, { scenario: scenarioId, interventions: [...without, iv] });
    let text = describeEffect(iv, before, after, model, teamName);
    if (focusTeam) {
      const a = before.teams.find((t) => t.teamId === focusTeam)!, b = after.teams.find((t) => t.teamId === focusTeam)!;
      const same = a.months.every((m, i) => Math.abs(m.workloadHours - b.months[i].workloadHours) < 1e-6 && Math.abs(m.availableFte - b.months[i].availableFte) < 1e-6 && m.targetUtilization === b.months[i].targetUtilization);
      if (same) text = `No effect on ${teamName(focusTeam)}${/no change|stays|nobody/.test(text) ? '' : `; ${text.charAt(0).toLowerCase() + text.slice(1)}`}`;
    }
    out.set(iv.id, text);
  }
  return out;
}

export const isQuietEffect = (s: string) => /^No effect|no change|stays|nobody|not in this/.test(s);
