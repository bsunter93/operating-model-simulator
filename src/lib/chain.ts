import type { ModelResult } from '../models/results';
import type { OperatingModel } from '../models/types';
import { asUnits, pressureOf, PRESSURE_WORD, workloadOf } from './workload';

/**
 * What being over capacity actually costs, followed downstream until it reaches money.
 *
 * Red on its own says a threshold was crossed, which is a fact about a line rather than a
 * fact about the business. The chain says what the crossing did: this many waiting, this
 * many turned away, these initiatives now short of the people they were promised, this
 * much revenue standing behind them. Every link is a field the engine produced.
 */

export type Tone = 'bad' | 'warn' | 'flat';

export interface Link {
  text: string;
  tone: Tone;
}

export function chainFor(
  model: OperatingModel, result: ModelResult, teamId: string, month: number,
  fmt: { count(v: number): string; money(v: number): string },
): Link[] {
  const row = result.teams.find((t) => t.teamId === teamId)?.months[month];
  const w = workloadOf(result, teamId, month);
  const team = model.teams.find((t) => t.id === teamId);
  if (!row || !w || !team) return [];

  const out: Link[] = [];
  const press = pressureOf(row);
  const say = (hours: number) => {
    const u = asUnits(w, hours);
    return u !== null && u >= 1 ? `${fmt.count(Math.round(u))} ${w.unit}` : `${fmt.count(Math.round(hours))} hours`;
  };

  out.push({
    text: `${team.name} is ${PRESSURE_WORD[press].toLowerCase()}`,
    tone: press === 'buried' ? 'bad' : press === 'over' ? 'warn' : 'flat',
  });
  if (row.carriedInHours > 0) out.push({ text: `${say(row.carriedInHours)} waiting`, tone: 'warn' });
  if (row.shedHours > 0) out.push({ text: `${say(row.shedHours)} turned away for good`, tone: 'bad' });
  if (row.serviceLevel !== null && row.serviceLevel < 0.95) {
    out.push({ text: `${Math.round(row.serviceLevel * 100)}% picked up in time`, tone: row.serviceLevel < 0.5 ? 'bad' : 'warn' });
  }

  /* The link that turns an operations problem into a business one. An initiative is at
     risk here only when this team is one of the teams it needs AND the engine found a
     shortfall on it, so the chain cannot blame a team for somebody else's slip. */
  const atRisk = result.exposure.items.filter((x) => {
    if (x.capacityShortfall <= 0) return false;
    const init = model.initiatives.find((i) => i.id === x.initiativeId);
    return !!init && (init.requiredFteByTeam[teamId] ?? 0) > 0;
  });
  if (atRisk.length) {
    out.push({
      text: `${atRisk.length} ${atRisk.length === 1 ? 'initiative' : 'initiatives'} short of the people they were promised`,
      tone: 'warn',
    });
    const money = atRisk.reduce((a, x) => a + x.exposure, 0);
    if (money > 0) out.push({ text: `${fmt.money(money)} of revenue standing behind them`, tone: 'bad' });
  }
  if (out.length === 1) out.push({ text: 'nothing downstream is waiting on it', tone: 'flat' });
  return out;
}
