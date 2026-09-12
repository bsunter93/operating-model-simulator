/**
 * The executive read, generated from the result. Every sentence is computed;
 * nothing here is a fixed conclusion about any fixture.
 */
import type { ModelResult } from '../models/results';
import { money, monthLabel } from './format';

export interface Verdict {
  /** Short answer to "can this organization execute the plan?" */
  headline: string;
  sentences: string[];
  /** Comparison against another result (usually the base plan), or null. */
  versus: string | null;
}

function listNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

export function verdict(r: ModelResult, teamName: (id: string) => string, initName: (id: string) => string, base?: ModelResult): Verdict {
  const nTeams = r.teams.length;
  const severe = r.teams.filter((t) => t.worstStatus === 'severe');
  const over = r.teams.filter((t) => t.worstStatus === 'severe' || t.worstStatus === 'constrained');
  const seq = r.constraints.filter((c) => c.kind === 'sequencing');
  const budgetGap = r.financials.annualVarianceUsd > 0;
  const s = r.summary;

  let headline: string;
  const sentences: string[] = [];

  if (over.length === 0 && seq.length === 0 && !budgetGap) {
    headline = 'Yes.';
    sentences.push(`Every team stays within its target all year and every initiative starts when planned.`);
  } else if (severe.length > 0) {
    headline = 'Not as written.';
    sentences.push(`${listNames(severe.map((t) => teamName(t.teamId)))} ${severe.length === 1 ? 'runs' : 'run'} past 100% of available hours, and ${over.length} of ${nTeams} teams are over target at some point in the year.`);
  } else if (over.length <= 2) {
    headline = 'Mostly.';
    sentences.push(`${over.length} of ${nTeams} teams ${over.length === 1 ? 'runs' : 'run'} over target at some point in the year; the rest have room. The first is ${teamName(s.firstBreakTeamId!)} in ${monthLabel(s.firstBreakMonth!, true)}.`);
  } else {
    headline = 'Not all of it at once.';
    sentences.push(`${over.length} of ${nTeams} teams run over target at some point in the year; the first is ${teamName(s.firstBreakTeamId!)} in ${monthLabel(s.firstBreakMonth!, true)}.`);
  }

  for (const c of seq) {
    const sch = r.initiatives.find((i) => i.initiativeId === c.initiativeId)!;
    sentences.push(`${initName(c.initiativeId!)} is planned for ${monthLabel(sch.plannedStart)} but cannot start before ${monthLabel(sch.effectiveStart!)}, because of a dependency the plan does not account for.`);
  }

  let peak: { team: string; month: string; fte: number } | null = null;
  for (const t of r.teams) for (const m of t.months) if (!peak || m.workforceGap > peak.fte) peak = { team: t.teamId, month: m.month, fte: m.workforceGap };
  if (peak && peak.fte >= 0.5) sentences.push(`The largest single shortfall is ${Math.round(peak.fte) === 1 ? '1 person' : `${Math.round(peak.fte)} people`} in ${teamName(peak.team)} in ${monthLabel(peak.month)}.`);

  if (budgetGap) sentences.push(`The modeled cost runs ${money(r.financials.annualVarianceUsd)} over the budget cap.`);

  let versus: string | null = null;
  if (base && base !== r) {
    const parts: string[] = [];
    const bo = base.teams.filter((t) => t.worstStatus === 'severe' || t.worstStatus === 'constrained').length;
    if (bo !== over.length) parts.push(`teams over target ${bo} → ${over.length}`);
    let bpeak = 0;
    for (const t of base.teams) for (const m of t.months) bpeak = Math.max(bpeak, m.workforceGap);
    if (Math.round(bpeak) !== Math.round(peak?.fte ?? 0)) parts.push(`peak shortfall ${Math.round(bpeak)} → ${Math.round(peak?.fte ?? 0)} people`);
    const gapB = base.teams.reduce((a, t) => a + t.totalGapVsPlanHours, 0), gapR = r.teams.reduce((a, t) => a + t.totalGapVsPlanHours, 0);
    if (Math.abs(gapB - gapR) > 50) parts.push(`hours over target ${Math.round(gapB).toLocaleString()} → ${Math.round(gapR).toLocaleString()}`);
    if (Math.abs(base.summary.revenueExposureUsd - s.revenueExposureUsd) > 1e5) parts.push(`revenue exposure ${money(base.summary.revenueExposureUsd)} → ${money(s.revenueExposureUsd)}`);
    if (Math.abs(base.financials.annualTotalCostUsd - r.financials.annualTotalCostUsd) > 1e4) parts.push(`cost ${money(base.financials.annualTotalCostUsd)} → ${money(r.financials.annualTotalCostUsd)}`);
    versus = parts.length ? `Against the base plan: ${parts.join('; ')}.` : 'No material change from the base plan.';
  }

  return { headline, sentences, versus };
}
