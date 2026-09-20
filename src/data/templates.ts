/**
 * Starting organizations.
 *
 * Three of these are the Atlas fixture put through a transform, which gives a different
 * size and rate profile and the same company underneath. Two are not: a community health
 * service and a client services firm, written from scratch, with their own teams, their
 * own work, their own currency and their own run.
 *
 * That distinction is the point. An engine that only ever runs one kind of organisation
 * has not shown that it models operating models; it has shown that it models that one.
 * Nothing here is a real company.
 */
import type { OperatingModel } from '../models/types';
import base from './atlas-systems-2027.json';
import health from './meadowbrook-health-2027.json';
import agency from './northgate-studio-2027.json';

/**
 * `shape` says what the organisation mostly does, and only the three written-from-scratch
 * models carry one. It is what the run asks a reader before it starts, because "do you
 * serve a queue or deliver projects" is a question anybody can answer about their own
 * work, and it picks the world for them without making them read four blurbs.
 */
export type Shape = 'queue' | 'projects' | 'mixed';
export interface Template {
  id: string; name: string; blurb: string; build: () => OperatingModel;
  shape?: Shape;
  /** One line, in the reader's terms, for the question "which of these is you?" */
  shapeLine?: string;
}

const atlas = () => structuredClone(base as unknown as OperatingModel);
const asModel = (m: unknown) => () => structuredClone(m as OperatingModel);

function scale(m: OperatingModel, k: number): OperatingModel {
  for (const t of m.teams) t.currentFte = Math.max(1, Math.round(t.currentFte * k));
  for (const s of m.demandStreams) s.annualVolume = Math.max(1, Math.round(s.annualVolume * k));
  for (const h of m.hiringPlan) h.headcount = Math.max(1, Math.round(h.headcount * k));
  for (const i of m.initiatives) {
    for (const tid of Object.keys(i.requiredFteByTeam)) i.requiredFteByTeam[tid] = Math.max(1, Math.round(i.requiredFteByTeam[tid] * k));
    i.financialValue = Math.round(i.financialValue * k);
    i.revenueAtRisk = Math.round(i.revenueAtRisk * k);
  }
  m.budget.modeledAnnualBudget = Math.round(m.budget.modeledAnnualBudget * k);
  m.strategy.revenueTarget = Math.round(m.strategy.revenueTarget * k);
  m.strategy.operatingCostTarget = Math.round(m.strategy.operatingCostTarget * k);
  m.strategy.employeeCount = Math.round(m.strategy.employeeCount * k);
  m.strategy.enterpriseCustomers = Math.round(m.strategy.enterpriseCustomers * k);
  return m;
}

export const TEMPLATES: Template[] = [
  {
    id: 'atlas-systems-2027', name: 'Atlas Systems', blurb: 'B2B platform company, 725 people in 8 teams, $500M revenue. The default: mostly healthy, two teams near the ceiling, one sequencing conflict.',
    build: atlas, shape: 'mixed',
    shapeLine: 'Both. Queues to answer and programmes to land, competing for the same people.',
  },
  {
    id: 'meadowbrook-health-2027', name: 'Community health service',
    blurb: 'Six clinical and support teams, 428 people, in pounds. Nine-month hiring, a physical bottleneck in Diagnostics, and a winter that arrives whether or not the posts are filled.',
    build: asModel(health), shape: 'queue',
    shapeLine: 'Mostly a queue. Work arrives whether or not you are ready, and the question is who it waits for.',
  },
  {
    id: 'northgate-studio-2027', name: 'Client services firm',
    blurb: 'A studio of 152 in euro, where almost all the work is engagements with a client on them. The constraint is a named group of senior designers, and the internal investment loses to billable work every time.',
    build: asModel(agency), shape: 'projects',
    shapeLine: 'Mostly projects. Named pieces of work with dates and people on them, and a bench you pay for either way.',
  },
  {
    id: 'atlas-startup', name: 'Series B startup', blurb: '70 people. Lean targets, fast hiring, high attrition, and a budget with almost no slack. Small numbers move fast.',
    build: () => {
      const m = scale(atlas(), 0.1);
      m.id = 'atlas-startup'; m.name = 'Northwind Labs'; m.status = 'provisional';
      for (const t of m.teams) { t.annualAttrition = Math.min(0.9, t.annualAttrition + 0.12); t.targetUtilization = Math.min(0.95, t.targetUtilization + 0.05); t.shrinkage = Math.max(0.05, t.shrinkage - 0.03); }
      for (const h of m.hiringPlan) h.leadTimeMonths = Math.max(1, h.leadTimeMonths - 2);
      m.budget.modeledAnnualBudget = Math.round(m.teams.reduce((s, t) => s + t.currentFte * t.monthlyFteCost * 12, 0) * 1.02);
      m.demoIntent = { summary: 'A small company where a two-person shortfall is a crisis and hiring is fast but attrition is faster.', intents: [] };
      return m;
    },
  },
  {
    id: 'atlas-enterprise', name: 'Global enterprise', blurb: '4,300 people. Conservative targets, low attrition, six-month hiring, and initiatives that take hundreds of people. Slow to break, slow to fix.',
    build: () => {
      const m = scale(atlas(), 6);
      m.id = 'atlas-enterprise'; m.name = 'Meridian Group'; m.status = 'provisional';
      for (const t of m.teams) { t.annualAttrition = Math.max(0.03, t.annualAttrition - 0.05); t.targetUtilization = Math.max(0.6, t.targetUtilization - 0.05); t.shrinkage = Math.min(0.4, t.shrinkage + 0.03); }
      for (const h of m.hiringPlan) h.leadTimeMonths = h.leadTimeMonths + 2;
      for (const d of m.dependencies) d.lagMonths += 1;
      m.demoIntent = { summary: 'A large organization where nothing is urgent until it is, and every fix takes two quarters.', intents: [] };
      return m;
    },
  },
  {
    id: 'atlas-seasonal', name: 'Seasonal consumer business', blurb: '725 people, but demand peaks hard in November and December and troughs in the summer. The same headcount is wrong in both halves of the year.',
    build: () => {
      const m = atlas();
      m.id = 'atlas-seasonal'; m.name = 'Harbor Retail'; m.status = 'provisional';
      const peak: Record<string, number> = { '2027-01': 0.75, '2027-02': 0.7, '2027-03': 0.8, '2027-04': 0.85, '2027-05': 0.9, '2027-06': 0.85, '2027-07': 0.8, '2027-08': 0.9, '2027-09': 1.05, '2027-10': 1.25, '2027-11': 1.6, '2027-12': 1.55 };
      m.seasonality = peak;
      for (const h of m.hiringPlan) h.requestMonth = '2027-06';
      m.demoIntent = { summary: 'Flat headcount against a Q4 spike: over capacity in the peak, paying for slack in the trough.', intents: [] };
      return m;
    },
  },
];

/**
 * The models the app ships with, as opposed to somebody's own numbers. Used to decide
 * whether to say "fictional" or "your numbers": every template other than Atlas was
 * being called the reader's own work, which it is not.
 */
export const SAMPLE_IDS: ReadonlySet<string> = new Set(TEMPLATES.map((t) => t.id));

/** The three the run offers up front. The rest are variations on Atlas and live in the
    full model, where somebody looking for them will find them. */
export const RUN_WORLDS = TEMPLATES.filter((t) => t.shape);
