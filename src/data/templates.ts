/**
 * Starting organizations. Each is derived from the Atlas fixture by a
 * transform, so every template is a complete, valid model with a different
 * size, rate profile, and story. Nothing here is a real company.
 */
import type { OperatingModel } from '../models/types';
import base from './atlas-systems-2027.json';

export interface Template { id: string; name: string; blurb: string; build: () => OperatingModel }

const atlas = () => structuredClone(base as unknown as OperatingModel);

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
    build: atlas,
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
