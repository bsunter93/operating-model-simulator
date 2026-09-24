import type { ModelResult } from '../models/results';
import type { OperatingModel } from '../models/types';
import { asUnits, workloadOf } from './workload';

/**
 * What being over capacity costs this month, followed downstream until it reaches money:
 * work turned away, work waiting, how much was picked up in time, and the initiatives now
 * short of the people they were promised. Every figure is a field the engine produced.
 */

export type Tone = 'bad' | 'warn' | 'flat';

export interface Impact {
  label: string;
  value: string;
  tone: Tone;
}

export function impactFor(
  model: OperatingModel, result: ModelResult, teamId: string, month: number,
  fmt: { count(v: number): string; money(v: number): string },
): Impact[] {
  const row = result.teams.find((t) => t.teamId === teamId)?.months[month];
  const w = workloadOf(result, teamId, month);
  if (!row || !w) return [];

  const say = (hours: number) => {
    const u = asUnits(w, hours);
    return u !== null && u >= 1 ? `${fmt.count(Math.round(u))} ${w.unit}` : `${fmt.count(Math.round(hours))} hours`;
  };

  const out: Impact[] = [];
  /* An initiative is at risk here only when this team is one of the teams it needs AND the
     engine found a shortfall on it, so a team isn't blamed for somebody else's slip. */
  const atRisk = result.exposure.items.filter((x) => {
    if (x.capacityShortfall <= 0) return false;
    const init = model.initiatives.find((i) => i.id === x.initiativeId);
    return !!init && (init.requiredFteByTeam[teamId] ?? 0) > 0;
  });
  const money = atRisk.reduce((a, x) => a + x.exposure, 0);
  if (money > 0) out.push({ label: 'revenue at risk', value: fmt.money(money), tone: 'bad' });
  if (atRisk.length) {
    out.push({
      label: atRisk.length === 1 ? 'initiative short of people' : 'initiatives short of people',
      value: String(atRisk.length), tone: 'warn',
    });
  }
  if (row.shedHours > 0) out.push({ label: 'turned away for good', value: say(row.shedHours), tone: 'bad' });
  if (row.carriedInHours > 0) out.push({ label: 'waiting from last month', value: say(row.carriedInHours), tone: 'warn' });
  if (row.serviceLevel !== null && row.serviceLevel < 0.95) {
    out.push({
      label: 'picked up in time', value: `${Math.round(row.serviceLevel * 100)}%`,
      tone: row.serviceLevel < 0.5 ? 'bad' : 'warn',
    });
  }
  return out;
}
