/**
 * The guided walkthrough. Authored for the Atlas fixture and shown only when
 * that fixture is loaded; the numbers in the copy are still read from the
 * result at render time, never typed in here.
 */
export interface TourStep {
  title: string;
  body: string;
  route: string;
  scenarioId: string;
  interventionIds: string[];
}

export const TOUR_MODEL_ID = 'atlas-systems-2027';

export const TOUR: TourStep[] = [
  {
    title: 'Start with the plan as written',
    body: 'Atlas plans 12% growth with four strategic initiatives. The model turns that plan into hours of work per team per month and shows where the hours run out.',
    route: '#/overview', scenarioId: 'scenario-base', interventionIds: [],
  },
  {
    title: 'Open the team that breaks first',
    body: 'Implementation is over target from February. The plan already hires ten people for it; watch the month they land.',
    route: '#/capacity/team-implementation', scenarioId: 'scenario-base', interventionIds: [],
  },
  {
    title: 'Try the obvious fix, faster',
    body: 'Expedite those same ten hires. They arrive two months earlier. Note how much of the problem is still there before they do.',
    route: '#/capacity/team-implementation', scenarioId: 'scenario-base', interventionIds: ['intervention-expedite-implementation'],
  },
  {
    title: 'Try something that is not hiring',
    body: 'Automation takes hours out of the work instead of adding people. It lands sooner and costs more. Neither option is free of trade-offs.',
    route: '#/capacity/team-implementation', scenarioId: 'scenario-base', interventionIds: ['intervention-automate-implementation'],
  },
  {
    title: 'Weigh the options',
    body: 'Set what matters to you: cost, speed, or revenue at risk. The ranking follows your weights, not ours.',
    route: '#/scenarios', scenarioId: 'scenario-base', interventionIds: [],
  },
  {
    title: 'Stress the plan',
    body: 'A hiring freeze removes the plan’s own fix. See what breaks then, and which levers still work.',
    route: '#/overview', scenarioId: 'scenario-hiring-freeze', interventionIds: [],
  },
];
