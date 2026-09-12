/**
 * Operating Model Simulator: input schema.
 *
 * Everything in this file is an INPUT the fixture supplies. Nothing here is
 * derived. Derived values live in ./results.ts and are produced only by the
 * engine. The `demoIntent` block is metadata for the fixture author and the UI;
 * the engine never reads it (enforced by tests/no-demo-intent.test.ts).
 */

/** "YYYY-MM" */
export type MonthKey = string;

export type TeamType = 'operational' | 'portfolio-only' | 'portfolio-and-run';

export interface Calendar {
  startMonth: MonthKey;
  endMonth: MonthKey;
  /** Gross paid hours per FTE per month before shrinkage. */
  workHoursPerFteMonth: number;
}

export interface Strategy {
  revenueTargetUsd: number;
  growthTargetPct: number;
  employeeCount: number;
  enterpriseCustomers: number;
  /** Company-wide context only. The modeled budget is `budget.modeledAnnualBudgetUsd`. */
  operatingCostTargetUsd: number;
  strategicPriorities: string[];
}

export interface Team {
  id: string;
  name: string;
  teamType: TeamType;
  /** Single authoritative FTE count at the start of the horizon. */
  currentFte: number;
  annualAttrition: number;
  shrinkage: number;
  targetUtilization: number;
  /** Single authoritative fully loaded monthly cost per FTE. */
  monthlyFteCostUsd: number;
}

export interface WorkMix {
  reusable: number;
  configurable: number;
  bespoke: number;
}

export interface DemandStream {
  id: string;
  name: string;
  teamId: string;
  unit: string;
  annualVolume: number;
  handlingMinutesPerUnit: number;
  complexityFactor: number;
  workMix: WorkMix;
  /** 'default' uses the model-level profile; otherwise a full 12-month override. */
  seasonality: 'default' | Record<MonthKey, number>;
}

export interface HiringRequest {
  id: string;
  teamId: string;
  requestMonth: MonthKey;
  headcount: number;
  leadTimeMonths: number;
}

export interface Initiative {
  id: string;
  name: string;
  description?: string;
  startMonth: MonthKey;
  durationMonths: number;
  requiredFteByTeam: Record<string, number>;
  strategicValue: number;
  financialValueUsd: number;
  urgency: number;
  confidence: number;
  revenueAtRiskUsd: number;
  executionFailureProbability: number;
  discretionary: boolean;
}

export interface Dependency {
  id: string;
  predecessorId: string;
  successorId: string;
  lagMonths: number;
}

export interface Budget {
  /** Covers the modeled teams only, not the company-wide operating cost target. */
  modeledAnnualBudgetUsd: number;
}

export interface DecisionWeights {
  cost: number;
  speed: number;
  revenueExposure: number;
}

/** Inputs to the pods-vs-pooled model. Same assumptions as the article. */
export interface PoolingAssumptions {
  clientCount: number;
  /** Concurrent work per client in Erlangs (people's worth of work). */
  workloadPerClient: number;
  ahtSeconds: number;
  targetSeconds: number;
  serviceLevel: number;
  bespokeShare: number;
  contextPenalty: number;
}

export type Scenario = { id: string; name: string; description?: string } & (
  | { type: 'base' }
  | { type: 'demandMultiplier'; demandMultiplier: number; fromMonth?: MonthKey }
  | { type: 'hiringFreeze'; fromMonth?: MonthKey }
  | { type: 'budgetConstraint'; budgetMultiplier: number }
  | { type: 'failureProbabilityMultiplier'; multiplier: number }
  | { type: 'productivityMultiplier'; multiplier: number }
  | { type: 'attritionMultiplier'; multiplier: number }
);

export type Intervention = {
  id: string;
  name: string;
  description?: string;
  /** Defaults to the calendar start. */
  startMonth?: MonthKey;
} & (
  | { type: 'expediteHiring'; hiringRequestId: string; newLeadTimeMonths: number; oneTimeCostUsd: number }
  | { type: 'hire'; teamId: string; headcount: number; leadTimeMonths: number; recruitingCostPerHeadUsd: number }
  | { type: 'automation'; teamId: string; workloadReductionRate: number; timeToImpactMonths: number; implementationCostUsd: number }
  | { type: 'reallocation'; fromTeamId: string; toTeamId: string; headcount: number; timeToImpactMonths: number; implementationCostUsd: number }
  | { type: 'defer'; initiativeId: string; months: number }
  | { type: 'cancel'; initiativeId: string }
  | { type: 'serviceLevelChange'; teamId: string; newTargetUtilization: number }
);

export interface DemoIntent {
  summary: string;
  intents: string[];
}

export interface OperatingModel {
  modelVersion: string;
  id: string;
  name: string;
  status: 'provisional' | 'calibrated';
  calendar: Calendar;
  strategy: Strategy;
  teams: Team[];
  seasonality: Record<MonthKey, number>;
  demandStreams: DemandStream[];
  hiringPlan: HiringRequest[];
  initiatives: Initiative[];
  dependencies: Dependency[];
  budget: Budget;
  pooling: PoolingAssumptions;
  scenarios: Scenario[];
  interventions: Intervention[];
  decisionWeights: DecisionWeights;
  /** Author metadata. Never read by the engine. */
  demoIntent?: DemoIntent;
}
