# Operating Model Simulator

**Can this organization actually execute the plan?**

A month-by-month model of a fictional company's operating plan. It turns strategy into work, work into hours, and hours into people, then shows which team hits its capacity limit first, when, which initiative launches are at risk, and what would change that. Every number is computed by a deterministic engine from one JSON file. Nothing on the pages is written in as a conclusion.

Live: **https://bensunter.com/simulator/**

Built by [Ben Sunter](https://bensunter.com/). The pods-versus-pooled model is the one from [Half a Day of Nothing](https://bensunter.com/pods-or-pooled.html).

## What it does

The pages follow the questions an operator asks, in order:

1. **Can the plan work?** A generated verdict, the constraints ranked by what they cost, and utilization by team and month.
2. **Why** A team's year (workload against capacity, hires landing, the month it breaks), the initiatives (planned against feasible, with the dependency that moved one), the workforce (attrition, arrivals, when hires land against when they are needed), the cost (against the cap, the priced shortfall, the levers), and pods or pooled.
3. **What if** Scenarios that change the conditions and rerun the whole model: growth, demand shock, hiring freeze, budget cut, productivity, attrition, execution risk.
4. **What to do** Levers that apply to any team (hire more, take work out, accept a higher target) plus the plan's own options, each with a computed one-line effect, beside a live chart.
5. **Decide** Preference-weighted comparison of every option against doing nothing, a generated decision record, and "what would change my mind" thresholds found by rerunning the model until the answer flips.
6. **Your numbers** Edit teams, workloads, and the hiring plan; scale the whole organization; import or export the model as JSON.

A seven-step walkthrough highlights what it is talking about and asks the reader which lever they would try first.

## The model

- The atomic unit is team × month. Annual figures are sums of monthly ones.
- Demand → workload hours (volume × handling time × complexity, spread by seasonality).
- Capacity: FTE × productive hours (paid hours less shrinkage) × target utilization.
- Workforce: monthly attrition from the annual rate, hires landing after their lead time, reallocations.
- Initiatives consume their assigned people's hours while active; dependencies push start dates.
- Interventions: expedite hiring, hire, automate, reallocate, defer, cancel, change target.
- Revenue exposure: revenue at risk × failure odds, raised by capacity shortfall on the initiative's teams.
- Decision score: min-max normalized cost, residual hours over capacity, and exposure, weighted by the reader.

Decisions the spec left open and how they were resolved are in [docs/engine-notes.md](docs/engine-notes.md).

The demo organization, Atlas Systems, is fictional. Its numbers were calibrated by running the engine, not by hand, and golden tests pin the story they tell.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173/simulator/
npm test           # engine, fixture, pooled-model, verdict, and decision tests
npm run build      # static output in dist/, served from /simulator/
npm run calibrate  # print the team-by-month grid for a scenario
```

The engine (`src/engine`) has no React imports and runs from a JSON model; a test fails if any engine file reads the fixture's `demoIntent` metadata.

## Use your own organization

Open **Your numbers**, edit the teams and workloads directly, or export the JSON, edit it, and import it back. Nothing leaves the browser. The schema is `src/models/types.ts`; `src/data/atlas-systems-2027.json` is a complete example.

## License

MIT.
