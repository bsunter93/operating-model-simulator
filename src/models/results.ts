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
  runCost: number;
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
  annualRunCost: number;
  startingFte: number;
  endingFte: number;
}

/**
 * One arrow in the work network: where a month's work comes from and which team it lands
 * on. The engine already computed this to get its hours; it used to throw the shape away
 * and keep only the total, which is why the app could draw a bar per team and nothing else.
 *
 * `units` is what a person would count (cases, referrals, visits). `hours` is what the
 * team has to find for them, after automation and productivity.
 */
export interface FlowEdge {
  id: string;
  kind: 'arrival' | 'route';
  /** Demand stream id for an arrival; the upstream team's id for a route. */
  sourceId: string;
  /** Present on a route: the stream the routed work came off. */
  viaStreamId?: string;
  toTeamId: string;
  label: string;
  unit: string;
  /** Fraction of upstream units taken by this route. 1 for an arrival. */
  share: number;
  unitsByMonth: number[];
  hoursByMonth: number[];
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
  businessImpact: number;
  firstMonth: MonthKey | null;
  metric: string;
  value: number;
  threshold: number;
}

export interface FinancialMonth {
  month: MonthKey;
  runCost: number;
  changeCost: number;
  totalCost: number;
  budgetCap: number;
  variance: number;
}

/** One fund's year: what it held, what it paid for, and what it could not be used on. */
export interface FundResult {
  fundId: string;
  name: string;
  restricted: boolean;
  amount: number;
  spent: number;
  /** Restricted money still held at year end. Real money, and unusable on what was short. */
  stranded: number;
}

export interface Financials {
  monthly: FinancialMonth[];
  annualRunCost: number;
  annualChangeCost: number;
  annualTotalCost: number;
  annualBudget: number;
  annualVariance: number;
  peakMonthlyVariance: number;
  /** Empty for a model with no funds declared. */
  byFund: FundResult[];
  /** Levers the engine can name for a budget gap. It never applies them. */
  budgetLevers: BudgetLever[];
}

export interface BudgetLever {
  kind: 'cancel-unstarted-hire' | 'defer-discretionary-initiative';
  id: string;
  label: string;
  /** Cash released over the horizon. Zero for initiative deferral in this model. */
  cashReleased: number;
  /** Capacity released over the horizon, in FTE-months. */
  fteMonthsReleased: number;
}

export interface ExposureItem {
  initiativeId: string;
  revenueAtRisk: number;
  baseProbability: number;
  scenarioProbability: number;
  /** Largest share of the initiative's teams' workload over capacity during its active months. */
  capacityShortfall: number;
  effectiveProbability: number;
  exposure: number;
}

export interface Exposure {
  items: ExposureItem[];
  total: number;
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
  annualTotalCost: number;
  annualBudgetVariance: number;
  revenueExposure: number;
  initiativesDelayed: number;
  /**
   * What the portfolio is still worth after cancellations and partial scope. Scope had
   * no output before this: you could cut it and nothing in the result said so, which
   * made it invisible next to cost and time.
   */
  portfolioValue: number;
  /** Work still waiting at the end of the year. */
  closingBacklogHours: number;
  /**
   * Cost with no fund able to pay for it. Zero unless the model declares funds, and the
   * number that matters most when it does.
   */
  unfundedCost: number;
  /** Restricted money held at year end that nothing short was allowed to spend. */
  strandedFunds: number;
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
  /** The arrows between sources and teams, month by month. */
  flow: FlowEdge[];
  initiatives: InitiativeSchedule[];
  constraints: Constraint[];
  financials: Financials;
  exposure: Exposure;
  summary: Summary;
}
