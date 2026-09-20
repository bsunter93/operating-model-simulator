import { run } from '../engine';
import type { ModelResult } from '../models/results';
import type { OperatingModel, RunSpec } from '../models/types';

/**
 * Where the constraint actually is.
 *
 * Goldratt's point is that capacity added anywhere but the constraint buys nothing, and
 * it is the most useful thing this model can tell somebody. The temptation is to answer
 * it from utilisation, naming whichever team is reddest. That is a proxy, and on this
 * engine it is wrong: the team running at 165% is the constraint on the portfolio and
 * does nothing at all for the queue, while a team at 113% is the one the queue turns on.
 *
 * So it is measured instead. Put five more people on each team in turn, run the year
 * again, and see what moves. Eight extra runs at a third of a millisecond each, which is
 * cheaper than being wrong.
 *
 * The answer is plural on purpose. There is a constraint per thing you might be
 * protecting, and pretending there is one is the same mistake as pretending there is a
 * best plan.
 */

const PROBE_FTE = 5;

export type Binding = {
  /** Biggest gain in requests answered in time, if any team moves it at all. */
  service: { teamId: string; gain: number } | null;
  /** Biggest reduction in money at risk. */
  portfolio: { teamId: string; gain: number } | null;
  /** Teams where five more people changed nothing worth reporting. */
  idle: string[];
};

/** Below this, a change is noise and should not be dressed up as a finding. */
const SERVICE_FLOOR = 0.005;
const MONEY_FLOOR = 50_000;

export function bindingConstraints(
  model: OperatingModel, spec: RunSpec, interventions: string[], base: ModelResult,
): Binding {
  const out: Binding = { service: null, portfolio: null, idle: [] };
  for (const t of model.teams) {
    const probed: OperatingModel = {
      ...model,
      teams: model.teams.map((x) => (x.id === t.id ? { ...x, currentFte: x.currentFte + PROBE_FTE } : x)),
    };
    const r = run(probed, { scenario: spec.scenarioId, interventions });
    const dService = (r.summary.serviceLevelPct ?? 0) - (base.summary.serviceLevelPct ?? 0);
    const dMoney = base.summary.revenueExposure - r.summary.revenueExposure;

    if (dService > SERVICE_FLOOR && dService > (out.service?.gain ?? 0)) {
      out.service = { teamId: t.id, gain: dService };
    }
    if (dMoney > MONEY_FLOOR && dMoney > (out.portfolio?.gain ?? 0)) {
      out.portfolio = { teamId: t.id, gain: dMoney };
    }
    if (dService <= SERVICE_FLOOR && dMoney <= MONEY_FLOOR) out.idle.push(t.id);
  }
  return out;
}
