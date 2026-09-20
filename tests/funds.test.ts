import { describe, it, expect } from 'vitest';
import { run } from '../src/engine';
import { validateModel } from '../src/engine/validate';
import atlas from '../src/data/atlas-systems-2027.json';
import ngo from '../src/data/riverbank-trust-2027.json';
import type { OperatingModel } from '../src/models/types';

const A = atlas as unknown as OperatingModel;
const N = ngo as unknown as OperatingModel;
const bend = (f: (m: OperatingModel) => void) => {
  const c = JSON.parse(JSON.stringify(N)) as OperatingModel;
  f(c);
  return c;
};

/*
 * Restricted income. A grant pays for the thing it names and nothing else, which is why
 * an organisation living on grants can be short of money and holding money at the same
 * time. A single budget cap cannot say that, and for anyone funded this way it is not a
 * detail, it is the shape of the year.
 */
describe('a model without funds is untouched by any of this', () => {
  it('reports nothing, because there is nothing to report', () => {
    const r = run(A);
    expect(r.financials.byFund).toEqual([]);
    expect(r.summary.unfundedCost).toBe(0);
    expect(r.summary.strandedFunds).toBe(0);
  });
});

describe('money goes only where it is allowed', () => {
  it('spends a restricted fund on the team it names', () => {
    const r = run(N);
    const wash = r.financials.byFund.find((f) => f.fundId === 'fund-wash')!;
    expect(wash.restricted).toBe(true);
    expect(wash.spent).toBeGreaterThan(0);
  });

  it('leaves a fund unspent when nothing it is allowed to pay for is left', () => {
    // Restricted to a team that costs almost nothing, so most of it cannot be used.
    const m = bend((c) => {
      c.funds!.push({ id: 'fund-tiny', name: 'Earmarked for one small team', amount: 5_000_000,
                      restrictedTo: { teamIds: ['team-fundraising'] } });
    });
    const f = run(m).financials.byFund.find((x) => x.fundId === 'fund-tiny')!;
    expect(f.stranded).toBeGreaterThan(4_000_000);
    expect(run(m).summary.strandedFunds).toBeGreaterThan(run(N).summary.strandedFunds);
  });

  it('keeps unrestricted money back, because it is the only money that can pay for anything', () => {
    // Give the restricted funds plenty: the unrestricted pot should be drawn on last and
    // therefore less than it would be if order did not matter.
    const rich = bend((c) => { for (const f of c.funds!) if (f.restrictedTo) f.amount *= 3; });
    const core = (m: OperatingModel) => run(m).financials.byFund.find((f) => f.fundId === 'fund-core')!.spent;
    expect(core(rich)).toBeLessThan(core(N));
  });

  it('counts cost no fund may cover as unfunded', () => {
    const stripped = bend((c) => {
      c.funds = c.funds!.filter((f) => f.id === 'fund-core');
      // and the shocks that named them, or the model is inconsistent and says so
      c.scenarios = c.scenarios.filter((sc) => !JSON.stringify(sc).includes('fund-wash'));
      c.run = undefined;
    });
    // Core alone cannot pay for four hundred people.
    expect(run(stripped).summary.unfundedCost).toBeGreaterThan(5_000_000);
  });

  it('charges one-off change spend to unrestricted money only', () => {
    // A grant for water points does not pay for standardising a reporting pack.
    const withLever = run(N, { interventions: ['intervention-automate-reporting'] });
    expect(withLever.summary.unfundedCost).toBeGreaterThan(run(N).summary.unfundedCost);
  });
});

describe('a tranche that is late is not the same as a tranche that is smaller', () => {
  it('cannot be spent before its window opens', () => {
    const early = run(N).financials.byFund.find((f) => f.fundId === 'fund-wash-renewal')!;
    expect(early.spent).toBeLessThan(early.amount);
  });

  it('makes the organisation shorter of money and holding more of it, at once', () => {
    // The paradox, which is the whole reason this exists. Same money, three months later.
    const onTime = run(N).summary;
    const late = run(N, { scenario: 'scenario-renewal-late' }).summary;
    expect(late.unfundedCost).toBeGreaterThan(onTime.unfundedCost);
    expect(late.strandedFunds).toBeGreaterThan(onTime.strandedFunds);
  });

  it('is worse than losing a smaller amount outright, on the measure that matters', () => {
    const late = run(N, { scenario: 'scenario-renewal-late' }).summary.unfundedCost;
    expect(late).toBeGreaterThan(run(N).summary.unfundedCost);
  });

  it('cuts what a fund holds when the shock is a cut rather than a delay', () => {
    const lost = run(N, { scenario: 'scenario-renewal-lost' });
    const f = lost.financials.byFund.find((x) => x.fundId === 'fund-wash-renewal')!;
    expect(f.amount).toBe(0);
    expect(lost.summary.unfundedCost).toBeGreaterThan(run(N).summary.unfundedCost);
  });

  it('leaves every other fund alone when it names one', () => {
    const lost = run(N, { scenario: 'scenario-renewal-lost' });
    const health = lost.financials.byFund.find((x) => x.fundId === 'fund-health')!;
    expect(health.amount).toBe(N.funds!.find((f) => f.id === 'fund-health')!.amount);
  });

  it('does not change the input model, only the year run from it', () => {
    run(N, { scenario: 'scenario-renewal-lost' });
    expect(N.funds!.find((f) => f.id === 'fund-wash-renewal')!.amount).toBeGreaterThan(0);
  });
});

describe('the model has to mean what it says about its money', () => {
  it('refuses a fund earmarked for a team that does not exist', () => {
    const bad = bend((c) => { c.funds![0].restrictedTo = { teamIds: ['team-nope'] }; });
    expect(validateModel(bad).join(' ')).toMatch(/restricted to unknown team/);
  });

  it('refuses a fund that is restricted to nothing in particular', () => {
    const bad = bend((c) => { c.funds![0].restrictedTo = { teamIds: [] }; });
    expect(validateModel(bad).join(' ')).toMatch(/names nothing it is restricted to/);
  });

  it('refuses a shock aimed at a fund that is not there', () => {
    const bad = bend((c) => {
      c.scenarios.push({ id: 'scenario-oops', name: 'Oops', type: 'fundingShock', fundMultiplier: 0, fundIds: ['fund-ghost'] });
    });
    expect(validateModel(bad).join(' ')).toMatch(/shocks unknown fund/);
  });

  it('accepts the shipped model as it stands', () => {
    expect(validateModel(N)).toEqual([]);
  });
});
