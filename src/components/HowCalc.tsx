/** "How is this calculated?" in plain words, one per stage picture. */
const TEXT: Record<string, string[]> = {
  map: [
    'Each cell is that team\'s hours of work in the month divided by the hours its people can actually work (paid hours less shrinkage, times headcount).',
    'Work = volume × handling time × complexity, spread across months by seasonality, plus hours for people assigned to initiatives.',
    'Colors follow the team\'s own target: within capacity below target minus 5 points; watch up to the target; over capacity above it; over 100% when work exceeds every productive hour.',
  ],
  team: [
    'Bars: run work (volume × handling time) plus initiative work (assigned people × their productive hours).',
    'Capacity line: available people × productive hours per person × the share of the day that team can sustain. The dashed line is every productive hour.',
    'People each month: last month\'s headcount less expected attrition (annual rate converted to monthly), plus hires landing at request month + lead time, plus reallocations.',
  ],
  scenarios: [
    'Each column reruns the whole model under that scenario with your levers still on. Demand scenarios multiply stream volumes; a freeze drops every hiring request not yet made; budget scenarios scale the cap; productivity divides hours; attrition multiplies the monthly rate.',
  ],
  ranking: [
    'Each option is run on its own against doing nothing. Added cost is total cost minus doing nothing. Hours still over capacity are summed across all teams and months against the plan\'s own targets, so moving a target cannot score. Revenue exposure is revenue at risk × odds of failure, where a shortfall on an initiative\'s teams raises the odds.',
    'Each measure is scaled 0 to 1 across the options on the table, inverted so lower is better, and weighted by your sliders. Adding or removing an option changes the others\' scores.',
  ],
  record: [
    'Thresholds are found by rerunning the model: demand is raised 2% at a time until another team goes over capacity; a hire\'s lead time is lengthened a month at a time until it stops helping; an automation rate is lowered until months over capacity appear.',
  ],
  organization: [
    'Erlang C, the standard queueing model for work that arrives at random. Pods: each client gets the smallest team that meets the service level on its own load. Pool: one team meets the same service level on the combined load, with one-off work slowed by the context penalty. Headcount can only move in whole people.',
  ],
};

export function HowCalc({ kind }: { kind: keyof typeof TEXT }) {
  const lines = TEXT[kind];
  if (!lines) return null;
  return (
    <details className="howcalc">
      <summary>How is this calculated?</summary>
      <ul>{lines.map((l) => <li key={l}>{l}</li>)}</ul>
      <p>Full method and every assumption: <a href="#/?p=about">How this works</a>. Source and tests on <a href="https://github.com/bsunter93/operating-model-simulator">GitHub</a>.</p>
    </details>
  );
}
