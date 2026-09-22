import type { ModelResult } from '../models/results';
import type { OperatingModel } from '../models/types';
import { applyDecisions, type Decision } from './edits';

/**
 * The year as it happens, one line at a time.
 *
 * Every line is a month in which something in the engine's own output changed state: a
 * team crossing the line it planned to run at, a queue starting to carry, work being
 * turned away for the first time, people landing, an initiative slipping. Nothing here is
 * narrated or scheduled by hand, which is why advancing time produces new lines rather
 * than replaying a script.
 */

export type FeedTone = 'bad' | 'warn' | 'good' | 'flat';

export interface FeedItem {
  month: number;
  tone: FeedTone;
  text: string;
}

export function feedFor(
  model: OperatingModel, decisions: Decision[], result: ModelResult, name: (id: string) => string,
): FeedItem[] {
  const out: FeedItem[] = [];
  const n = result.teams[0]?.months.length ?? 0;

  const left: Record<number, number> = {};

  const leftTeams: Record<number, Set<string>> = {};

  for (const t of result.teams) {
    let wasOver = false, wasBuried = false, hadQueue = false, hadShed = false;
    for (let i = 0; i < n; i++) {
      const m = t.months[i];
      const over = m.utilization > m.targetUtilization;
      const buried = m.utilization > 1;
      if (over && !wasOver) {
        out.push({ month: i, tone: 'warn', text: `${name(t.teamId)} went past the line it plans to run at` });
      }
      if (!over && wasOver) {
        out.push({ month: i, tone: 'good', text: `${name(t.teamId)} came back inside its line` });
      }
      if (buried && !wasBuried) {
        out.push({ month: i, tone: 'bad', text: `${name(t.teamId)} is past everything it can do` });
      }
      if (m.carriedInHours > 0 && !hadQueue) {
        out.push({ month: i, tone: 'warn', text: `${name(t.teamId)} started carrying work into the next month` });
        hadQueue = true;
      }
      if (m.shedHours > 0 && !hadShed) {
        out.push({ month: i, tone: 'bad', text: `${name(t.teamId)} began turning work away` });
        hadShed = true;
      }
      if (m.hiresLanded > 0) {
        out.push({ month: i, tone: 'good', text: `${Math.round(m.hiresLanded)} people landed on ${name(t.teamId)}` });
      }
      /* Attrition is not news. Every team loses somebody most months, so a line each
         made three of the five entries the same three lines every month and the feed
         read as a loop rather than a wire. Counted here and reported once below. */
      if (m.attritionLoss >= 1) {
        left[i] = (left[i] ?? 0) + Math.round(m.attritionLoss);
        leftTeams[i] = (leftTeams[i] ?? new Set<string>()).add(t.teamId);
      }
      wasOver = over;
      wasBuried = buried;
    }
  }

  /* One line a month for everybody who left, rather than one a team. */
  for (const key of Object.keys(left)) {
    const i = Number(key);
    const n = left[i], teams = leftTeams[i]?.size ?? 0;
    out.push({
      month: i, tone: 'flat',
      text: teams === 1
        ? `${[...leftTeams[i]].map(name)[0]} lost ${n} to attrition`
        : `${n} people left, across ${teams} teams`,
    });
  }

  /* Decisions belong in the feed too: the year is partly the reader's doing and the log
     should say so in the same voice as everything else. */
  const applied = applyDecisions(model, decisions).model;
  for (const d of decisions) {
    const i = result.months.indexOf(d.month);
    if (i >= 0) out.push({ month: i, tone: 'flat', text: `You: ${d.label.toLowerCase()}` });
  }

  for (const s of applied.initiatives) {
    const sched = result.initiatives.find((x) => x.initiativeId === s.id);
    if (!sched || sched.delayMonths <= 0 || !sched.effectiveStart) continue;
    const i = result.months.indexOf(sched.effectiveStart);
    if (i >= 0) {
      out.push({ month: i, tone: 'warn', text: `${s.name} started ${sched.delayMonths} months late` });
    }
  }

  return out.sort((a, b) => a.month - b.month || a.text.localeCompare(b.text));
}
