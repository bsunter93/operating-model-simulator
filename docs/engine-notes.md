# Engine notes

Decisions the spec left open, and how the engine resolves them. Every one of
these is visible in the code and tests; this file is the short version.

## Time
- Atomic unit is team × month. The horizon is inclusive of both calendar ends.
- A hiring request lands in month `request + leadTime`. Nothing before that.
- Attrition compounds monthly from the annual rate: `1 - (1 - a)^(1/12)`,
  applied to the starting FTE of each month. There is no automatic backfill;
  a plan that wants backfill must contain the hiring requests.

## Initiatives
- Active months are `[start, start + duration)`. "Completion" is the first
  month after the last active month.
- A successor may start at `predecessor completion + lag`. A lag of 0 means
  the month after the predecessor finishes.
- Assigned FTE consumes `fte × that team's productive hours per FTE` each
  active month. It is added to run workload before any utilization is computed.
- Deferral moves the planned start; the dependency check still applies, so a
  deferral that is smaller than the dependency push changes nothing.
- Initiatives that run past the horizon are flagged `truncated`; months beyond
  the horizon are not modeled.

## Capacity
- productive hours per FTE = calendar hours × (1 − shrinkage)
- target capacity = available FTE × productive hours × target utilization
- utilization = workload / available productive hours (actual, not target)
- gapHours = max(0, workload − target capacity) using the *effective* target
- gapVsPlanHours = the same using the model's own target. The decision
  comparison and revenue exposure use this one, so a service-level change
  (raising the target) moves the label, not the work, and scores like doing
  nothing. The UI should show both.
- Status bands: healthy < target − 5pp; watch in [target − 5pp, target];
  constrained (target, 100%]; severe > 100%.

## Scenarios
- Hiring freeze cancels every request made at or after the freeze month.
  Requests made before it are in flight and complete.
- Budget constraint scales the modeled monthly cap. The engine reports the
  variance and lists levers (unstarted hires with cash released; discretionary
  initiatives with FTE-months released, cash 0 because their people are
  already on payroll). It never applies a lever.
- Productivity divides run workload. Demand multiplier scales volume from
  `fromMonth` onward.

## Revenue exposure
- p = min(1, executionFailureProbability × scenario multiplier)
- shortfall = the largest `gapVsPlanHours / workloadHours` on any of the
  initiative's teams during its active months, in [0, 1]
- effective probability = 1 − (1 − p)(1 − shortfall)
- exposure = revenueAtRisk × effective probability
This is an explicit modeling assumption, disclosed in the UI, not a forecast.

## Constraints
Ranked by a dollar figure so kinds can be compared:
- capacity: gap hours converted to FTE at the team's loaded monthly cost
- sequencing: revenue at risk × min(1, delay / duration)
- budget: annual variance
- horizon: informational, impact 0

## Decision comparison
- cost = total cost over the horizon minus Do Nothing
- speed = residual gapVsPlanHours over all teams and months
- exposure = residual revenue exposure
Each metric is min-max normalized across the options on the table (including
Do Nothing) and inverted so lower is better. Adding or removing an option
changes the others' scores. The score is a preference, not an optimum.

## Pods vs pooled
Same Erlang C as "Half a Day of Nothing". Golden tests pin 40 / 24 / 27 / 73%.

## Demo intent
`demoIntent` on the fixture is author metadata. A test fails if any file under
`src/engine` mentions it.
