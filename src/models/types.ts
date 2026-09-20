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
  /**
   * How much sustained over-capacity lifts this team's attrition. 0 keeps the old
   * behaviour, where a team could run at 120% all year and lose exactly as many people
   * as one running at 60%, which is the least true thing this model used to say.
   *
   * The loop it closes is the one that matters: strain pushes people out, fewer people
   * means more strain on whoever stays, and the gap compounds faster than hiring closes
   * it. Damped and capped in the engine, because a reinforcing loop with no ceiling
   * models a company that ends the year with nobody in it.
   */
  burnoutSensitivity?: number;
  /**
   * What happens to work this team could not get to. Without it, a team at 130% simply
   * did 100% and the rest evaporated, so being over capacity cost nothing that lasted and
   * next month always started clean.
   *
   * `carryForward` is the share that waits and arrives again next month. The remainder is
   * gone: declined, abandoned, the customer went elsewhere. A queue that keeps everything
   * sets 1; a team that turns work away past a point sets less. Absent means the old
   * behaviour, which is a model with no memory.
   */
  backlog?: { carryForward: number };
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
  /**
   * How quickly a unit of this work is supposed to be picked up, in seconds. Present only
   * on work that queues: a request arrives, waits, and somebody is kept waiting. Absent
   * on project work, where "answered within" is not a thing anyone measures. Streams
   * without it are left out of the service-level calculation entirely rather than being
   * given a number that means nothing.
   */
  answerWithinSeconds?: number;
}

export interface HiringRequest {
  id: string;
  teamId: string;
  requestMonth: MonthKey;
  headcount: number;
  leadTimeMonths: number;
  /**
   * Makes the request conditional instead of certain. Without this the plan hires the
   * people whatever else happens, so removing a team's work still buys its headcount and
   * no efficiency ever shows up as money. With it, the hire is dropped when the team
   * would sit below `belowUtilization` for `months` running without it.
   */
  cancelIfSlack?: { months: number; belowUtilization: number };
}

/**
 * Work that one team's handling creates for another: escalations, handoffs, the second
 * line behind the first. Without routes, teams in this model only touch when they staff
 * the same initiative, so making one team faster can never help or hurt anyone else.
 *
 * The share is taken off the upstream stream's units AFTER automation, because a case
 * that self-service resolved is a case nobody escalates. That is the whole propagation
 * path: fewer units handled upstream means fewer units arriving downstream.
 */
export interface WorkRoute {
  id: string;
  name: string;
  fromStreamId: string;
  toTeamId: string;
  /** Fraction of upstream units that arrive at the downstream team. 0 to 1. */
  share: number;
  handlingMinutesPerUnit: number;
  complexityFactor?: number;
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

export type ScenarioEffect =
  | { type: 'demandMultiplier'; demandMultiplier: number; fromMonth?: MonthKey; /** Limit to these streams; all when absent. */ streamIds?: string[] }
  | { type: 'hiringFreeze'; fromMonth?: MonthKey }
  | { type: 'budgetConstraint'; budgetMultiplier: number }
  | { type: 'failureProbabilityMultiplier'; multiplier: number }
  | { type: 'productivityMultiplier'; multiplier: number; /** Limit to these teams; all when absent. */ teamIds?: string[] }
  | { type: 'attritionMultiplier'; multiplier: number; /** Limit to these teams; all when absent. */ teamIds?: string[] };

export type Scenario = { id: string; name: string; description?: string } & (
  | { type: 'base' }
  | ScenarioEffect
  | { type: 'combined'; effects: ScenarioEffect[] }
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
  /**
   * Trades time against people on one initiative, which is the axis this model was
   * missing. Nothing else here changes a delivery date, so cost and scope could move
   * and time could not, and the classic triangle had only two working corners.
   *
   * Run it leaner and longer (fte 0.7, duration 1.5), or crash it (fte 1.4, duration
   * 0.7, and pay for the overtime). `valueMultiplier` is how much of what it earns
   * survives the change: finishing later usually earns less inside the year.
   */
  | { type: 'restaff'; initiativeId: string; durationMultiplier: number; fteMultiplier: number;
      valueMultiplier?: number; oneTimeCostUsd?: number }
  /**
   * Delivers part of an initiative instead of all of it: fewer people, proportionally
   * less of what it was worth, same dates. Cancelling was previously the only way to
   * move scope, which made scope a switch rather than a dial.
   */
  | { type: 'rescope'; initiativeId: string; scopeMultiplier: number }
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
  /** Optional. Absent means teams are independent, which is how this model began. */
  routes?: WorkRoute[];
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
