/**
 * The monthly engine. Pure, deterministic, no React.
 *
 *   fixture JSON -> run(model, { scenario, interventions }) -> ModelResult
 *
 * The atomic unit is team × month. Annual figures are sums of monthly ones.
 * The input model is never mutated; run() works on a structured clone.
 */
import type {
  DemandStream, HiringRequest, Intervention, MonthKey, OperatingModel, Scenario, ScenarioEffect, Team,
} from '../models/types';
import type {
  BudgetLever, Constraint, Exposure, ExposureItem, FinancialMonth, Financials,
  InitiativeSchedule, ModelResult, Summary, TeamMonth, TeamResult, TeamStatus,
} from '../models/results';
import { addMonths, annualToMonthlyRate, calendarMonth, expandMonths, monthIndex } from './calendar';
import { scheduleInitiatives } from './schedule';
import { assertValid } from './validate';

export interface RunOptions {
  /** Scenario id from the model, or a Scenario object. Defaults to the base scenario. */
  scenario?: string | Scenario;
  /** Intervention ids from the model, or Intervention objects. Applied together. */
  interventions?: Array<string | Intervention>;
}

/** Status thresholds. Configurable; these are the defaults from the spec. */
export const STATUS_BAND_PP = 0.05;

export function classify(utilization: number, target: number): TeamStatus {
  if (utilization > 1) return 'severe';
  if (utilization > target) return 'constrained';
  if (utilization >= target - STATUS_BAND_PP) return 'watch';
  return 'healthy';
}

const STATUS_RANK: Record<TeamStatus, number> = { healthy: 0, watch: 1, constrained: 2, severe: 3 };

function worse(a: TeamStatus, b: TeamStatus): TeamStatus {
  return STATUS_RANK[a] >= STATUS_RANK[b] ? a : b;
}

interface Effective {
  demandMult: Map<string, number[]>;   // streamId -> multiplier by month index
  hiringPlan: HiringRequest[];         // after freeze and expedite
  budgetMult: number;
  failureMult: number;
  productivityMult: Map<string, number>; // teamId -> multiplier
  attritionMult: Map<string, number>;    // teamId -> multiplier
  targetUtil: Map<string, number>;
  automationMult: Map<string, number[]>;  // teamId -> multiplier by month
  reallocDelta: Map<string, number[]>;    // teamId -> FTE delta by month (signed, persistent)
  changeCost: number[];                   // one-time change costs by month
  deferrals: Map<string, number>;
  cancelled: Set<string>;
}

function resolveScenario(model: OperatingModel, s: RunOptions['scenario']): Scenario {
  if (s === undefined) return model.scenarios.find((x) => x.type === 'base')!;
  if (typeof s === 'string') {
    const found = model.scenarios.find((x) => x.id === s);
    if (!found) throw new Error(`Unknown scenario "${s}"`);
    return found;
  }
  return s;
}

function resolveInterventions(model: OperatingModel, list: RunOptions['interventions']): Intervention[] {
  return (list ?? []).map((iv) => {
    if (typeof iv !== 'string') return iv;
    const found = model.interventions.find((x) => x.id === iv);
    if (!found) throw new Error(`Unknown intervention "${iv}"`);
    return found;
  });
}

function buildEffective(model: OperatingModel, scenario: Scenario, interventions: Intervention[], months: MonthKey[]): Effective {
  const n = months.length;
  const start = model.calendar.startMonth;
  const idx = (k: MonthKey) => monthIndex(start, k);
  const eff: Effective = {
    demandMult: new Map(model.demandStreams.map((s) => [s.id, new Array(n).fill(1)])),
    hiringPlan: model.hiringPlan.map((h) => ({ ...h })),
    budgetMult: 1,
    failureMult: 1,
    productivityMult: new Map(model.teams.map((t) => [t.id, 1])),
    attritionMult: new Map(model.teams.map((t) => [t.id, 1])),
    targetUtil: new Map(model.teams.map((t) => [t.id, t.targetUtilization])),
    automationMult: new Map(model.teams.map((t) => [t.id, new Array(n).fill(1)])),
    reallocDelta: new Map(model.teams.map((t) => [t.id, new Array(n).fill(0)])),
    changeCost: new Array(n).fill(0),
    deferrals: new Map(),
    cancelled: new Set(),
  };

  const apply = (e: ScenarioEffect) => {
    switch (e.type) {
      case 'demandMultiplier': {
        const from = e.fromMonth ? Math.max(0, idx(e.fromMonth)) : 0;
        for (const [sid, arr] of eff.demandMult) {
          if (e.streamIds && !e.streamIds.includes(sid)) continue;
          for (let m = from; m < n; m++) arr[m] *= e.demandMultiplier;
        }
        break;
      }
      case 'hiringFreeze': {
        const from = e.fromMonth ? idx(e.fromMonth) : 0;
        // Requests made before the freeze are in flight and complete; the rest are cancelled.
        eff.hiringPlan = eff.hiringPlan.filter((h) => idx(h.requestMonth) < from);
        break;
      }
      case 'budgetConstraint': eff.budgetMult *= e.budgetMultiplier; break;
      case 'failureProbabilityMultiplier': eff.failureMult *= e.multiplier; break;
      case 'productivityMultiplier':
        for (const [tid, v] of eff.productivityMult) if (!e.teamIds || e.teamIds.includes(tid)) eff.productivityMult.set(tid, v * e.multiplier);
        break;
      case 'attritionMultiplier':
        for (const [tid, v] of eff.attritionMult) if (!e.teamIds || e.teamIds.includes(tid)) eff.attritionMult.set(tid, v * e.multiplier);
        break;
    }
  };
  if (scenario.type === 'combined') scenario.effects.forEach(apply);
  else if (scenario.type !== 'base') apply(scenario);

  for (const iv of interventions) {
    const s0 = iv.startMonth ? Math.max(0, idx(iv.startMonth)) : 0;
    switch (iv.type) {
      case 'expediteHiring': {
        const h = eff.hiringPlan.find((x) => x.id === iv.hiringRequestId);
        if (h) { h.leadTimeMonths = iv.newLeadTimeMonths; if (s0 < n) eff.changeCost[s0] += iv.oneTimeCostUsd; }
        break;
      }
      case 'hire': {
        eff.hiringPlan.push({ id: `${iv.id}:hire`, teamId: iv.teamId, requestMonth: addMonths(start, s0), headcount: iv.headcount, leadTimeMonths: iv.leadTimeMonths });
        if (s0 < n) eff.changeCost[s0] += iv.recruitingCostPerHeadUsd * iv.headcount;
        break;
      }
      case 'automation': {
        const arr = eff.automationMult.get(iv.teamId)!;
        for (let m = s0 + iv.timeToImpactMonths; m < n; m++) arr[m] *= 1 - iv.workloadReductionRate;
        if (s0 < n) eff.changeCost[s0] += iv.implementationCostUsd;
        break;
      }
      case 'reallocation': {
        const from = eff.reallocDelta.get(iv.fromTeamId)!, to = eff.reallocDelta.get(iv.toTeamId)!;
        const m0 = s0 + iv.timeToImpactMonths;
        if (m0 < n) { from[m0] -= iv.headcount; to[m0] += iv.headcount; }
        if (s0 < n) eff.changeCost[s0] += iv.implementationCostUsd;
        break;
      }
      case 'defer': eff.deferrals.set(iv.initiativeId, (eff.deferrals.get(iv.initiativeId) ?? 0) + iv.months); break;
      case 'cancel': eff.cancelled.add(iv.initiativeId); break;
      case 'serviceLevelChange': eff.targetUtil.set(iv.teamId, iv.newTargetUtilization); break;
    }
  }
  return eff;
}

/** Normalized seasonality share for each month of the horizon, per stream. */
function seasonShares(model: OperatingModel, stream: DemandStream, months: MonthKey[]): number[] {
  const profile = stream.seasonality === 'default' ? model.seasonality : stream.seasonality;
  const byCalMonth = new Map<number, number>();
  for (const [k, v] of Object.entries(profile)) byCalMonth.set(calendarMonth(k), v);
  const total = [...byCalMonth.values()].reduce((a, b) => a + b, 0);
  return months.map((k) => (total > 0 ? byCalMonth.get(calendarMonth(k))! / total : 0));
}

export function run(input: OperatingModel, opts: RunOptions = {}): ModelResult {
  assertValid(input);
  const model: OperatingModel = structuredClone(input);
  const scenario = resolveScenario(model, opts.scenario);
  const interventions = resolveInterventions(model, opts.interventions);
  const months = expandMonths(model.calendar.startMonth, model.calendar.endMonth);
  const n = months.length;
  const eff = buildEffective(model, scenario, interventions, months);
  const teams = new Map(model.teams.map((t) => [t.id, t]));
  const hours = model.calendar.workHoursPerFteMonth;

  // 1. Initiative schedule with dependency propagation.
  const schedule = scheduleInitiatives({
    horizonStart: model.calendar.startMonth, horizonMonths: n,
    initiatives: model.initiatives, dependencies: model.dependencies,
    deferrals: eff.deferrals, cancelled: eff.cancelled,
  });
  const initById = new Map(model.initiatives.map((i) => [i.id, i]));

  // 2. Run workload hours per team-month (demand streams).
  const runHours = new Map<string, number[]>(model.teams.map((t) => [t.id, new Array(n).fill(0)]));
  for (const s of model.demandStreams) {
    const shares = seasonShares(model, s, months);
    const arr = runHours.get(s.teamId)!;
    const auto = eff.automationMult.get(s.teamId)!;
    const dm = eff.demandMult.get(s.id)!;
    const prod = eff.productivityMult.get(s.teamId)!;
    for (let m = 0; m < n; m++) {
      const volume = s.annualVolume * shares[m] * dm[m];
      arr[m] += (volume * s.handlingMinutesPerUnit * s.complexityFactor / 60) * auto[m] / prod;
    }
  }

  // 2b. Routed work: hours one team creates for another by escalating or handing off.
  //     The share comes off the upstream units AFTER automation, because a case that
  //     self-service resolved is a case nobody escalates. This is the only mechanism by
  //     which making one team faster changes what another team sees.
  const streamById = new Map(model.demandStreams.map((s) => [s.id, s]));
  for (const r of model.routes ?? []) {
    const up = streamById.get(r.fromStreamId);
    if (!up) continue;
    const arr = runHours.get(r.toTeamId);
    if (!arr) continue;
    const shares = seasonShares(model, up, months);
    const auto = eff.automationMult.get(up.teamId)!;
    const dm = eff.demandMult.get(up.id)!;
    const toProd = eff.productivityMult.get(r.toTeamId)!;
    for (let m = 0; m < n; m++) {
      const upstreamUnits = up.annualVolume * shares[m] * dm[m] * auto[m];
      const units = upstreamUnits * r.share;
      arr[m] += (units * r.handlingMinutesPerUnit * (r.complexityFactor ?? 1) / 60) / toProd;
    }
  }

  // 3. Portfolio hours per team-month: assigned FTE × that team's productive hours.
  const productivePerFte = (t: Team) => hours * (1 - t.shrinkage);
  const portfolioHours = new Map<string, number[]>(model.teams.map((t) => [t.id, new Array(n).fill(0)]));
  for (const sch of schedule) {
    if (sch.status === 'cancelled') continue;
    const init = initById.get(sch.initiativeId)!;
    for (const [tid, fte] of Object.entries(init.requiredFteByTeam)) {
      const arr = portfolioHours.get(tid)!;
      const t = teams.get(tid)!;
      for (const m of sch.activeMonthIndexes) arr[m] += fte * productivePerFte(t);
    }
  }

  // 4. Workforce and capacity per team-month.
  const landingFrom = (plan: typeof eff.hiringPlan) => {
    const map = new Map<string, number[]>(model.teams.map((t) => [t.id, new Array(n).fill(0)]));
    for (const h of plan) {
      const m = monthIndex(model.calendar.startMonth, h.requestMonth) + h.leadTimeMonths;
      if (m >= 0 && m < n) map.get(h.teamId)![m] += h.headcount;
    }
    return map;
  };

  const rowsFor = (t: Team, landing: Map<string, number[]>): TeamMonth[] => {
    const ma = annualToMonthlyRate(Math.min(0.99, t.annualAttrition * eff.attritionMult.get(t.id)!));
    const prod = productivePerFte(t);
    const target = eff.targetUtil.get(t.id)!;
    const rows: TeamMonth[] = [];
    let fte = t.currentFte;
    let realloc = 0;
    for (let m = 0; m < n; m++) {
      const starting = fte;
      const loss = starting * ma;
      const landed = landing.get(t.id)![m];
      realloc += eff.reallocDelta.get(t.id)![m];
      const available = Math.max(0, starting - loss + landed + eff.reallocDelta.get(t.id)![m]);
      const availProd = available * prod;
      const targetCap = availProd * target;
      const rh = runHours.get(t.id)![m];
      const ph = portfolioHours.get(t.id)![m];
      const work = rh + ph;
      const util = availProd > 0 ? work / availProd : (work > 0 ? Infinity : 0);
      const gap = Math.max(0, work - targetCap);
      const gapVsPlan = Math.max(0, work - availProd * t.targetUtilization);
      const required = prod * target > 0 ? work / (prod * target) : 0;
      rows.push({
        teamId: t.id, month: months[m], monthIndex: m,
        startingFte: starting, attritionLoss: loss, hiresLanded: landed, reallocated: realloc,
        availableFte: available, productiveHoursPerFte: prod, availableProductiveHours: availProd,
        targetCapacityHours: targetCap, runHours: rh, portfolioHours: ph, workloadHours: work,
        utilization: util, targetUtilization: target, gapHours: gap, gapVsPlanHours: gapVsPlan, requiredFte: required,
        workforceGap: Math.max(0, required - available),
        status: classify(util, target), runCostUsd: available * t.monthlyFteCostUsd,
      });
      fte = available;
    }
    return rows;
  };

  /*
   * A conditional hire is judged against a year run WITHOUT it, because a hire that is
   * only justified by having been made is not a decision. One pass decides, the second
   * pass is the answer. Dropped requests are reported so the reason is visible rather
   * than inferred from a headcount that quietly went missing.
   */
  const conditional = eff.hiringPlan.filter((h) => h.cancelIfSlack);
  const hiresDropped: string[] = [];
  if (conditional.length > 0) {
    const provisional = landingFrom(eff.hiringPlan.filter((h) => !h.cancelIfSlack));
    for (const h of conditional) {
      const t = teams.get(h.teamId);
      if (!t) continue;
      const rows = rowsFor(t, provisional);
      const from = monthIndex(model.calendar.startMonth, h.requestMonth) + h.leadTimeMonths;
      const window = rows.slice(Math.max(0, from), Math.max(0, from) + h.cancelIfSlack!.months);
      if (window.length > 0 && window.every((r) => r.utilization < h.cancelIfSlack!.belowUtilization)) {
        hiresDropped.push(h.id);
      }
    }
  }
  const landing = landingFrom(eff.hiringPlan.filter((h) => !hiresDropped.includes(h.id)));

  const teamResults: TeamResult[] = [];
  for (const t of model.teams) {
    const rows = rowsFor(t, landing);
    const peak = rows.reduce((a, b) => (b.utilization > a.utilization ? b : a), rows[0]);
    const constrained = rows.filter((r) => STATUS_RANK[r.status] >= 2);
    teamResults.push({
      teamId: t.id, months: rows,
      peakUtilization: peak.utilization, peakMonth: peak.month,
      monthsConstrained: constrained.length,
      firstConstrainedMonth: constrained[0]?.month ?? null,
      totalGapHours: rows.reduce((s, r) => s + r.gapHours, 0),
      totalGapVsPlanHours: rows.reduce((s, r) => s + r.gapVsPlanHours, 0),
      peakWorkforceGap: Math.max(...rows.map((r) => r.workforceGap)),
      worstStatus: rows.reduce<TeamStatus>((s, r) => worse(s, r.status), 'healthy'),
      annualWorkloadHours: rows.reduce((s, r) => s + r.workloadHours, 0),
      annualTargetCapacityHours: rows.reduce((s, r) => s + r.targetCapacityHours, 0),
      annualRunCostUsd: rows.reduce((s, r) => s + r.runCostUsd, 0),
      startingFte: rows[0].startingFte, endingFte: rows[n - 1].availableFte,
    });
  }
  const teamResultById = new Map(teamResults.map((r) => [r.teamId, r]));

  // 5. Financials.
  const monthlyBudget = (model.budget.modeledAnnualBudgetUsd / 12) * eff.budgetMult;
  const fin: FinancialMonth[] = months.map((k, m) => {
    const runCost = teamResults.reduce((s, r) => s + r.months[m].runCostUsd, 0);
    const change = eff.changeCost[m];
    return { month: k, runCostUsd: runCost, changeCostUsd: change, totalCostUsd: runCost + change, budgetCapUsd: monthlyBudget, varianceUsd: runCost + change - monthlyBudget };
  });
  const budgetLevers: BudgetLever[] = [];
  for (const h of eff.hiringPlan) {
    const m = monthIndex(model.calendar.startMonth, h.requestMonth) + h.leadTimeMonths;
    if (m >= n) continue;
    const t = teams.get(h.teamId)!;
    const remaining = n - Math.max(0, m);
    budgetLevers.push({ kind: 'cancel-unstarted-hire', id: h.id, label: `Cancel ${h.headcount} ${t.name} hires`, cashReleasedUsd: h.headcount * t.monthlyFteCostUsd * remaining, fteMonthsReleased: h.headcount * remaining });
  }
  for (const sch of schedule) {
    const init = initById.get(sch.initiativeId)!;
    if (!init.discretionary || sch.status === 'cancelled') continue;
    const fteMonths = sch.activeMonthIndexes.length * Object.values(init.requiredFteByTeam).reduce((a, b) => a + b, 0);
    budgetLevers.push({ kind: 'defer-discretionary-initiative', id: init.id, label: `Defer ${init.name}`, cashReleasedUsd: 0, fteMonthsReleased: fteMonths });
  }
  const financials: Financials = {
    monthly: fin,
    annualRunCostUsd: fin.reduce((s, f) => s + f.runCostUsd, 0),
    annualChangeCostUsd: fin.reduce((s, f) => s + f.changeCostUsd, 0),
    annualTotalCostUsd: fin.reduce((s, f) => s + f.totalCostUsd, 0),
    annualBudgetUsd: monthlyBudget * n,
    annualVarianceUsd: fin.reduce((s, f) => s + f.varianceUsd, 0),
    peakMonthlyVarianceUsd: Math.max(...fin.map((f) => f.varianceUsd)),
    budgetLevers,
  };

  // 6. Revenue exposure. Capacity shortfall raises the failure probability on
  //    the remaining headroom: p_eff = 1 - (1 - p)(1 - shortfall). Shortfall is
  //    measured against the plan's target so a relabeled target changes nothing.
  const items: ExposureItem[] = [];
  for (const sch of schedule) {
    if (sch.status === 'cancelled') continue;
    const init = initById.get(sch.initiativeId)!;
    if (init.revenueAtRiskUsd <= 0) continue;
    const p = Math.min(1, init.executionFailureProbability * eff.failureMult);
    let shortfall = 0;
    for (const tid of Object.keys(init.requiredFteByTeam)) {
      const tr = teamResultById.get(tid)!;
      for (const m of sch.activeMonthIndexes) {
        const row = tr.months[m];
        if (row.workloadHours > 0) shortfall = Math.max(shortfall, Math.min(1, row.gapVsPlanHours / row.workloadHours));
      }
    }
    const pEff = 1 - (1 - p) * (1 - shortfall);
    items.push({ initiativeId: init.id, revenueAtRiskUsd: init.revenueAtRiskUsd, baseProbability: init.executionFailureProbability, scenarioProbability: p, capacityShortfall: shortfall, effectiveProbability: pEff, exposureUsd: init.revenueAtRiskUsd * pEff });
  }
  const exposure: Exposure = { items, totalUsd: items.reduce((s, i) => s + i.exposureUsd, 0) };

  // 7. Constraints, ranked by dollar impact.
  const constraints = detectConstraints(model, teamResults, schedule, financials, months);

  // 8. Summary.
  const allRows = teamResults.flatMap((r) => r.months);
  const peakGapRow = allRows.reduce((a, b) => (b.gapHours > a.gapHours ? b : a), allRows[0]);
  const firstBreak = allRows.filter((r) => STATUS_RANK[r.status] >= 2).sort((a, b) => a.monthIndex - b.monthIndex || b.utilization - a.utilization)[0];
  const totalTarget = teamResults.reduce((s, r) => s + r.annualTargetCapacityHours, 0);
  const totalPortfolio = allRows.reduce((s, r) => s + r.portfolioHours, 0);
  const summary: Summary = {
    startingFte: teamResults.reduce((s, r) => s + r.startingFte, 0),
    endingFte: teamResults.reduce((s, r) => s + r.endingFte, 0),
    teamsConstrained: teamResults.filter((r) => STATUS_RANK[r.worstStatus] >= 2).length,
    teamsWatch: teamResults.filter((r) => r.worstStatus === 'watch').length,
    peakGapHours: peakGapRow?.gapHours ?? 0,
    peakGapMonth: peakGapRow && peakGapRow.gapHours > 0 ? peakGapRow.month : null,
    firstBreakMonth: firstBreak?.month ?? null,
    firstBreakTeamId: firstBreak?.teamId ?? null,
    portfolioLoad: totalTarget > 0 ? totalPortfolio / totalTarget : 0,
    annualTotalCostUsd: financials.annualTotalCostUsd,
    annualBudgetVarianceUsd: financials.annualVarianceUsd,
    revenueExposureUsd: exposure.totalUsd,
    initiativesDelayed: schedule.filter((s) => s.delayMonths > 0).length,
    hiresDropped,
    hiresDroppedFte: eff.hiringPlan
      .filter((h) => hiresDropped.includes(h.id))
      .reduce((a, h) => a + h.headcount, 0),
  };

  return {
    modelId: model.id, scenarioId: scenario.id, interventionIds: interventions.map((i) => i.id),
    months, teams: teamResults, initiatives: schedule, constraints, financials, exposure, summary,
  };
}

function detectConstraints(model: OperatingModel, teams: TeamResult[], schedule: InitiativeSchedule[], fin: Financials, months: MonthKey[]): Constraint[] {
  const out: Constraint[] = [];
  const teamById = new Map(model.teams.map((t) => [t.id, t]));
  const initById = new Map(model.initiatives.map((i) => [i.id, i]));

  for (const r of teams) {
    if (STATUS_RANK[r.worstStatus] < 2) continue;
    const t = teamById.get(r.teamId)!;
    const prod = r.months[0].productiveHoursPerFte;
    // Cost of the missing hours at this team's loaded rate.
    const impact = prod > 0 ? (r.totalGapHours / prod) * t.monthlyFteCostUsd : 0;
    out.push({
      id: `capacity:${r.teamId}`, kind: 'capacity', teamId: r.teamId,
      title: `${t.name} over capacity`,
      detail: `${r.monthsConstrained} of ${months.length} months over capacity against a ${Math.round(r.months[0].targetUtilization * 100)}% target; peak ${Math.round(r.peakUtilization * 100)}% in ${r.peakMonth}; ${Math.round(r.totalGapHours).toLocaleString()} gap hours; peak shortfall ${r.peakWorkforceGap.toFixed(1)} FTE.`,
      businessImpactUsd: impact, firstMonth: r.firstConstrainedMonth,
      metric: 'peak utilization', value: r.peakUtilization, threshold: r.months[0].targetUtilization,
    });
  }
  for (const s of schedule) {
    if (s.delayMonths <= 0 || !s.pushedBy) continue;
    const init = initById.get(s.initiativeId)!;
    const pred = initById.get(s.pushedBy.predecessorId)!;
    out.push({
      id: `sequencing:${s.initiativeId}`, kind: 'sequencing', initiativeId: s.initiativeId,
      title: `${init.name} cannot start when planned`,
      detail: `Planned ${s.plannedStart}, earliest feasible ${s.effectiveStart}: it depends on ${pred.name}, which finishes ${schedule.find((x) => x.initiativeId === pred.id)!.completion}.${s.truncated ? ' It now runs past the planning horizon.' : ''}`,
      businessImpactUsd: init.revenueAtRiskUsd * Math.min(1, s.delayMonths / init.durationMonths),
      firstMonth: s.plannedStart, metric: 'delay months', value: s.delayMonths, threshold: 0,
    });
  }
  for (const s of schedule) {
    if (!s.truncated || (s.delayMonths > 0 && s.pushedBy)) continue;
    const init = initById.get(s.initiativeId)!;
    out.push({
      id: `horizon:${s.initiativeId}`, kind: 'horizon', initiativeId: s.initiativeId,
      title: `${init.name} runs past the horizon`,
      detail: `Completes ${s.completion}, after the plan ends ${months[months.length - 1]}.`,
      businessImpactUsd: 0, firstMonth: s.effectiveStart, metric: 'completion', value: 0, threshold: 0,
    });
  }
  if (fin.annualVarianceUsd > 0) {
    out.push({
      id: 'budget', kind: 'budget',
      title: 'Modeled cost exceeds the budget cap',
      detail: `${Math.round(fin.annualVarianceUsd).toLocaleString()} over across the horizon; peak monthly overage ${Math.round(fin.peakMonthlyVarianceUsd).toLocaleString()}.`,
      businessImpactUsd: fin.annualVarianceUsd, firstMonth: fin.monthly.find((f) => f.varianceUsd > 0)?.month ?? null,
      metric: 'annual variance', value: fin.annualVarianceUsd, threshold: 0,
    });
  }
  return out.sort((a, b) => b.businessImpactUsd - a.businessImpactUsd);
}
