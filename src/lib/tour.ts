/**
 * The guided walkthrough. Works on any loaded model: every sentence is built
 * from the current result, and the choices offered are read from the model.
 */
import type { OperatingModel, Intervention } from '../models/types';
import type { ModelResult } from '../models/results';
import { monthLabel, pct } from './format';
import { verdict } from './verdict';
import { customIntervention } from '../state/store';

export interface TourCtx {
  model: OperatingModel;
  result: ModelResult;
  base: ModelResult;
  scenarioId: string;
  interventionIds: string[];
  choice: string | null;
  teamName: (id: string) => string;
  initName: (id: string) => string;
  /** Effect line for an intervention id, if the current page computed one. */
  effect: (id: string) => string | undefined;
}

export interface TourChoice {
  id: string;
  label: string;
  interventionIds?: string[];
  scenarioId?: string;
}

export interface TourStep {
  title: string;
  /** Route to open, given the context. */
  route: (c: TourCtx) => string;
  /** `data-tour` key of the element to glow. */
  target: string;
  body: (c: TourCtx) => string;
  /** Ask the reader to pick; applying a choice sets scenario or interventions. */
  question?: string;
  choices?: (c: TourCtx) => TourChoice[];
  /** Shown once a choice is applied. */
  after?: (c: TourCtx) => string;
}

const firstTeam = (c: TourCtx) => c.result.summary.firstBreakTeamId ?? c.model.teams[0].id;

export const TOUR: TourStep[] = [
  {
    title: 'Start with the answer',
    route: () => '#/',
    target: 'verdict',
    body: (c) => {
      const v = verdict(c.result, c.teamName, c.initName);
      return `The read at the top is computed from the whole model, not written. Right now it says “${v.headline}” Below it, everything that breaks is ranked by what it costs.`;
    },
  },
  {
    title: 'Find the team that breaks first',
    route: () => '#/',
    target: 'constraint-first-team',
    body: (c) => {
      const s = c.result.summary;
      if (!s.firstBreakTeamId) return 'No team runs over capacity in this plan. The constraints, if any, are about sequencing or budget.';
      return `${c.teamName(s.firstBreakTeamId)} is the first team over capacity, in ${monthLabel(s.firstBreakMonth!, true)}. The next step opens its year.`;
    },
  },
  {
    title: 'See why',
    route: (c) => `#/why/${firstTeam(c)}`,
    target: 'chart',
    body: (c) => {
      const t = c.result.teams.find((x) => x.teamId === firstTeam(c))!;
      const land = t.months.find((m) => m.hiresLanded > 0);
      const planned = c.model.hiringPlan.filter((h) => h.teamId === t.teamId).reduce((s, h) => s + h.headcount, 0);
      const base = `Bars are hours of work each month; the line is what the team can handle at its ${pct(t.months[0].targetUtilization)} target. It peaks at ${pct(t.peakUtilization)} in ${monthLabel(t.peakMonth)}.`;
      if (planned && land) return `${base} The plan already hires ${planned} people for this team; they land in ${monthLabel(land.month)}. Everything before that is the problem.`;
      if (planned) return `${base} The plan had ${planned} hires for this team; this scenario cancels them.`;
      return `${base} The plan has no hires for this team.`;
    },
  },
  {
    title: 'What would you try first?',
    route: (c) => `#/options/${firstTeam(c)}`,
    target: 'levers',
    question: 'Which lever would you try first?',
    body: () => 'Each option below is run through the same model. Pick one to see its timing and its cost.',
    choices: (c) => {
      const team = firstTeam(c);
      const out: TourChoice[] = [];
      const exp = c.model.interventions.find((iv) => iv.type === 'expediteHiring' && c.model.hiringPlan.find((h) => h.id === iv.hiringRequestId)?.teamId === team);
      if (exp) out.push({ id: 'expedite', label: 'Get the planned hires in sooner', interventionIds: [exp.id] });
      out.push({ id: 'hire', label: 'Hire more people', interventionIds: [`${team}:hire`] });
      out.push({ id: 'automate', label: 'Take work out of the team', interventionIds: [`${team}:automate`] });
      const move = c.model.interventions.find((iv): iv is Extract<Intervention, { type: 'reallocation' }> => iv.type === 'reallocation' && iv.toTeamId === team);
      if (move) out.push({ id: 'move', label: 'Move people in from another team', interventionIds: [move.id] });
      const rel = c.model.interventions.find((iv) => (iv.type === 'defer' || iv.type === 'cancel'));
      if (rel) out.push({ id: 'portfolio', label: rel.type === 'defer' ? 'Push an initiative back' : 'Cancel an initiative', interventionIds: [rel.id] });
      out.push({ id: 'target', label: 'Accept running hotter', interventionIds: [`${team}:target`] });
      return out;
    },
    after: (c) => {
      const id = c.interventionIds[0];
      if (!id) return 'Nothing is on. Pick one above to see what it does.';
      const eff = c.effect(id);
      const t = c.result.teams.find((x) => x.teamId === firstTeam(c))!;
      const b = c.base.teams.find((x) => x.teamId === firstTeam(c))!;
      const tail = t.monthsConstrained === 0 ? `${c.teamName(t.teamId)} now stays within capacity all year.` : `${c.teamName(t.teamId)} is still over capacity for ${t.monthsConstrained} month${t.monthsConstrained === 1 ? '' : 's'} (was ${b.monthsConstrained}).`;
      const lead = eff ? eff.replace(/[.\s]+$/, '') + '. ' : '';
      return `${lead}${tail} Change the number next to it, or add a second lever; they stack. Then move on to stress the plan.`;
    },
  },
  {
    title: 'Now make the world harder',
    route: () => '#/whatif',
    target: 'scenarios',
    question: 'Pick a scenario.',
    body: () => 'Each scenario changes the conditions and reruns the whole model. Your levers stay on.',
    choices: (c) => c.model.scenarios.filter((s) => s.type !== 'base').slice(0, 4).map((s) => ({ id: s.id, label: s.name, scenarioId: s.id })),
    after: (c) => {
      const v = verdict(c.result, c.teamName, c.initName, c.base);
      const name = c.model.scenarios.find((s) => s.id === c.scenarioId)?.name ?? '';
      return `Under “${name}”: ${v.headline} ${v.sentences[0]} ${v.versus ?? ''}`;
    },
  },
  {
    title: 'Weigh what matters',
    route: () => '#/decide',
    target: 'weights',
    body: () => 'Every option is compared on added cost, on how much of the problem is still there and for how long, and on revenue at risk. Drag the weights; the ranking follows you, not us. Below the table the model writes the decision record, including what would change its mind.',
  },
  {
    title: 'Make it yours',
    route: () => '#/plan',
    target: 'scale',
    body: () => 'Drag the scale to your organization’s size, edit any team or workload directly, or import your own model as JSON. Everything you just did works the same way on your numbers.',
  },
];

export function customFor(model: OperatingModel, id: string): Intervention | null {
  const [teamId, kind] = id.split(':');
  return kind ? customIntervention(model, teamId, kind as 'hire' | 'automate' | 'target') : null;
}
