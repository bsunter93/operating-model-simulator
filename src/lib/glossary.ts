/** Plain-language definitions surfaced as tooltips. Keep each to one or two sentences. */
export const GLOSSARY = {
  utilization: 'Hours of work divided by the hours people can actually work. 90% means nine of every ten available hours are spoken for.',
  target: 'The utilization a team is planned to run at. The room below it absorbs peaks and surprises. Above it, queues form and the service level slips.',
  productive: 'Paid hours minus shrinkage. The hours that can actually go to work.',
  shrinkage: 'The share of paid hours that never reach the work: vacation, training, meetings, sick time.',
  gap: 'Hours of work above what the team can handle at its target. Zero means within target.',
  required: 'People needed to do this month’s work at the target utilization.',
  shortfall: 'People required minus people available.',
  run: 'Recurring work driven by volume: cases, tickets, implementations, projects.',
  initiative: 'People assigned to strategic initiatives while those are active. They come out of the same hours as run work.',
  initiativeLoad: 'The share of the organization’s target capacity taken by initiatives rather than run work.',
  exposure: 'For each initiative, revenue at risk times the odds it fails. A capacity shortfall on its teams raises those odds.',
  budget: 'Modeled cost minus the modeled budget cap for these teams. Positive is over budget.',
  leadTime: 'Months from deciding to hire to the person actually doing the work.',
  sequencing: 'An initiative that cannot start when planned because something it depends on finishes later.',
  watch: 'Within five points below the target. No slack left.',
  constrained: 'Above the target utilization. Work is queuing.',
  severe: 'Above 100%: more work than hours in the month.',
  attrition: 'Expected departures, applied every month from the annual rate. The plan has no automatic backfill.',
  headcount: 'People at the start and end of the year after hires land and attrition takes its share.',
  peakShortfall: 'The single worst team-month: how many more people that team needed than it had.',
  delayed: 'Initiatives that cannot start on their planned month because of a dependency.',
  score: 'A preference score from the weights you set. It ranks options against each other; it does not claim one is objectively best.',
  cost: 'Total modeled cost over the year minus the cost of doing nothing.',
  speed: 'Hours of work left above target across all teams and months. Lower means the fix landed sooner and closed more.',
} as const;

export type TermKey = keyof typeof GLOSSARY;
