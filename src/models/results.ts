/** Derived outputs. Produced only by the engine; never stored in a fixture. */
import type { MonthKey } from './types';

export type TeamStatus = 'healthy' | 'watch' | 'constrained' | 'severe';

export interface TeamMonth {
  teamId: string;
  month: MonthKey;
  monthIndex: number;
  startingFte: number;
  attritionLoss: number;
  hiresLanded: number;
  reallocated: number;
  availableFte: number;
  productiveHoursPerFte: number;
  availableProductiveHours: number;
  targetCapacityHours: number;
  runHours: number;
  portfolioHours: number;
  workloadHours: number;
  /** workload / available productive hours. Distinct from the target. */
  utilization: number;
  targetUtilization: number;
  gapHours: number;
  /** Gap measured against the model's own target for this team, so a
   *  service-level change cannot make a gap disappear on paper. */
  gapVsPlanHours: number;
  requiredFte: number;
  workforceGap: number;
  status: TeamStatus;
  /**
   * Share of this month's arriving work picked up inside its target, by Erlang C. Null
   * where the team's work does not queue. This is not utilisation restated: at the same
   * 85%, ten people hold 53% and a hundred and fifty hold 99%, because pooling absorbs
   * variance and a small team has none to spare.
   */
  serviceLevel: number | null;
  /** Work waiting at the start of this month, left over from the ones before it. */
  carriedInHours: number;
  /** Work this team could not get to, which either waits or is lost. */
  unservedHours: number;
  /** Of that, what is still waiting at the end of the month. The rest was shed. */
  carriedOutHours: number;
  /** Of that, the share that will not come back. */
  shedHours: number;
  runCostUsd: number;
}

export interface TeamResult {
  teamId: string;
  months: TeamMonth[];
  peakUtilization: number;
  peakMonth: MonthKey;
  monthsConstrained: number;
  firstConstrainedMonth: MonthKey | null;
  totalGapHours: number;
  totalGapVsPlanHours: number;
  peakWorkforceGap: number;
  worstStatus: TeamStatus;
  annualWorkloadHours: number;
  annualTargetCapacityHours: number;
  annualRunCostUsd: number;
  startingFte: number;
  endingFte: number;
}

export type InitiativeStatus = 'planned' | 'deferred' | 'cancelled';

export interface InitiativeSchedule {
  initiativeId: string;
  status: InitiativeStatus;
  plannedStart: MonthKey;
  /** After dependency propagation and deferral. Null when cancelled. */
  effectiveStart: MonthKey | null;
  /** First month after the last active month. Null when cancelled. */
  completion: MonthKey | null;
  delayMonths: number;
  /** The dependency that pushed the start, if any. */
  pushedBy: { dependencyId: string; predecessorId: string } | null;
  /** True when the initiative runs past the horizon. */
  truncated: boolean;
  activeMonthIndexes: number[];
}

export type ConstraintKind = 'capacity' | 'sequencing' | 'budget' | 'horizon';

export interface Constraint {
  id: string;
  kind: ConstraintKind;
  teamId?: string;
  initiativeId?: string;
  title: string;
  detail: string;
  /** Dollar-denominated so kinds can be ranked against each other. */
  businessImpactUsd: number;
  firstMonth: MonthKey | null;
  metric: string;
  value: number;
  threshold: number;
}

export interface FinancialMonth {
  month: MonthKey;
  runCostUsd: number;
  changeCostUsd: number;
  totalCostUsd: number;
  budgetCapUsd: number;
  varianceUsd: number;
}

export interface Financials {
  monthly: FinancialMonth[];
  annualRunCostUsd: number;
  annualChangeCostUsd: number;
  annualTotalCostUsd: number;
  annualBudgetUsd: number;
  annualVarianceUsd: number;
  peakMonthlyVarianceUsd: number;
  /** Levers the engine can name for a budget gap. It never applies them. */
  budgetLevers: BudgetLever[];
}

export interface BudgetLever {
  kind: 'cancel-unstarted-hire' | 'defer-discretionary-initiative';
  id: string;
  label: string;
  /** Cash released over the horizon. Zero for initiative deferral in this model. */
  cashReleasedUsd: number;
  /** Capacity released over the horizon, in FTE-months. */
  fteMonthsReleased: number;
}

export interface ExposureItem {
  initiativeId: string;
  revenueAtRiskUsd: number;
  baseProbability: number;
  scenarioProbability: number;
  /** Largest share of the initiative's teams' workload over capacity during its active months. */
  capacityShortfall: number;
  effectiveProbability: number;
  exposureUsd: number;
}

export interface Exposure {
  items: ExposureItem[];
  totalUsd: number;
}

export interface Summary {
  startingFte: number;
  endingFte: number;
  teamsConstrained: number;
  teamsWatch: number;
  peakGapHours: number;
  peakGapMonth: MonthKey | null;
  firstBreakMonth: MonthKey | null;
  firstBreakTeamId: string | null;
  portfolioLoad: number;
  annualTotalCostUsd: number;
  annualBudgetVarianceUsd: number;
  revenueExposureUsd: number;
  initiativesDelayed: number;
  /**
   * What the portfolio is still worth after cancellations and partial scope. Scope had
   * no output before this: you could cut it and nothing in the result said so, which
   * made it invisible next to cost and time.
   */
  portfolioValueUsd: number;
  /** Work still waiting at the end of the year. */
  closingBacklogHours: number;
  /** Work nobody ever did, because it was turned away rather than queued. */
  shedHours: number;
  /** Work picked up inside target across the year, weighted by how much work there was. */
  serviceLevelPct: number | null;
  /** The worst single team-month, because an average hides a month nobody could reach anyone. */
  worstServiceLevel: number | null;
  worstServiceMonth: MonthKey | null;
  /** People who left over the year, including the ones strain pushed out. */
  peopleLostToAttrition: number;
  /** Share of the starting workforce still there at year end. */
  retentionRate: number;
  /** Team-months spent over capacity. The closest thing this model has to morale. */
  strainMonths: number;
  /** Of those, the ones on teams that face a customer. */
  customerFacingStrainMonths: number;
  /** Conditional hires the plan no longer needs. Empty unless a request set cancelIfSlack. */
  hiresDropped: string[];
  /** Headcount those dropped requests would have added. */
  hiresDroppedFte: number;
}

export interface ModelResult {
  modelId: string;
  scenarioId: string;
  interventionIds: string[];
  months: MonthKey[];
  teams: TeamResult[];
  initiatives: InitiativeSchedule[];
  constraints: Constraint[];
  financials: Financials;
  exposure: Exposure;
  summary: Summary;
}
