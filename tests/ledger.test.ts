import { describe, expect, it } from 'vitest';
import { run } from '../src/engine';
import { applyDecisions, type Decision } from '../src/lib/edits';
import { ledgerFor } from '../src/lib/ledger';
import { tracksFor, divergesAt } from '../src/lib/replay';
import type { OperatingModel } from '../src/models/types';
import fixture from '../src/data/atlas-systems-2027.json';

const model = fixture as unknown as OperatingModel;
const shock = model.scenarios.find(
  (s) => s.type === 'demandMultiplier' && (s as { demandMultiplier?: number }).demandMultiplier! > 1,
)!;
const queueTeam = () => {
  const r = run(model, { scenario: shock.id });
  return r.teams.find((t) => t.months.some((m) => m.serviceLevel !== null && m.serviceLevel < 0.9))!.teamId;
};
const hire = (teamId: string, n: number, month: string, id: string): Decision =>
  ({ id, kind: 'hire', month, teamId, amount: n, label: `Hire ${n}` });

describe('the decision ledger', () => {
  it('gives one entry per decision, in the order they were taken', () => {
    const t = queueTeam();
    const ds = [hire(t, 20, model.calendar.startMonth, 'a'), hire(t, 20, model.calendar.startMonth, 'b')];
    const led = ledgerFor(model, ds, shock.id);
    expect(led).toHaveLength(2);
    expect(led[0].decision.id).toBe('a');
    expect(led[1].decision.id).toBe('b');
  });

  it('is empty when nothing has been decided', () => {
    expect(ledgerFor(model, [], shock.id)).toEqual([]);
  });

  /* The whole reason it is marginal: the second twenty into a team the first twenty already
     relieved cannot be worth what the first twenty were. Computed in isolation both would
     claim the same, which is the lie this replaces. */
  it('charges the second identical hire less than the first', () => {
    const t = queueTeam();
    const ds = [hire(t, 20, model.calendar.startMonth, 'a'), hire(t, 20, model.calendar.startMonth, 'b')];
    const led = ledgerFor(model, ds, shock.id);
    const gain = (i: number) => led[i].effect.lines.find((l) => l.key === 'service')?.delta ?? 0;
    expect(gain(0)).toBeGreaterThan(0);
    expect(gain(1)).toBeLessThan(gain(0));
  });

  it('adds up to the same year the decisions actually produce', () => {
    const t = queueTeam();
    const ds = [hire(t, 15, model.calendar.startMonth, 'a'), hire(t, 15, model.calendar.startMonth, 'b')];
    const led = ledgerFor(model, ds, shock.id);
    const a = applyDecisions(model, ds);
    const direct = run(a.model, { scenario: shock.id, interventions: a.interventionIds });
    const stepwise = led.reduce((a, e) => a + (e.effect.lines.find((l) => l.key === 'cost')?.delta ?? 0), 0);
    const base = run(model, { scenario: shock.id });
    expect(base.summary.annualTotalCost + stepwise)
      .toBeCloseTo(direct.summary.annualTotalCost, 0);
  });
});

describe('the replay', () => {
  it('draws one point per month on every track', () => {
    const base = run(model, { scenario: shock.id });
    const a = applyDecisions(model, [hire(queueTeam(), 30, model.calendar.startMonth, 'a')]);
    const mine = run(a.model, { scenario: shock.id, interventions: a.interventionIds });
    const tracks = tracksFor(base, mine);
    expect(tracks.length).toBeGreaterThanOrEqual(2);
    for (const t of tracks) {
      expect(t.base).toHaveLength(base.months.length);
      expect(t.mine).toHaveLength(base.months.length);
      expect(t.max).toBeGreaterThan(0);
    }
  });

  it('says the years never part when nothing was decided', () => {
    const base = run(model, { scenario: shock.id });
    expect(divergesAt(tracksFor(base, base))).toBeNull();
  });

  /* Hiring in month one still cannot show up in month one: the lead time is the point. */
  it('parts no earlier than the decision could possibly land', () => {
    const t = queueTeam();
    const a = applyDecisions(model, [hire(t, 40, model.calendar.startMonth, 'a')]);
    const mine = run(a.model, { scenario: shock.id, interventions: a.interventionIds });
    const base = run(model, { scenario: shock.id });
    const at = divergesAt(tracksFor(base, mine));
    expect(at).not.toBeNull();
    expect(at!).toBeGreaterThan(0);
  });
});

describe('when a decision lands', () => {
  /* A move made in July must not change January. It used to: moves rewrote the giving
     team's starting headcount, so the whole year shifted and the receipt reported that a
     July decision showed up in Jan. */
  it('never changes a month before the one the decision was taken in', () => {
    const months = run(model, { scenario: shock.id }).months;
    const jul = months[6];
    const from = model.teams.reduce((a, b) => (a.currentFte > b.currentFte ? a : b));
    const to = model.teams.find((t) => t.id !== from.id)!;
    const d: Decision = {
      id: 'mv', kind: 'move', month: jul, teamId: to.id, fromTeamId: from.id, amount: 10,
      label: 'Move 10',
    };
    const a = applyDecisions(model, [d]);
    const after = run(a.model, { scenario: shock.id, interventions: a.interventionIds });
    const before = run(model, { scenario: shock.id });
    for (let i = 0; i < 6; i++) {
      for (const t of after.teams) {
        const was = before.teams.find((x) => x.teamId === t.teamId)!.months[i];
        expect(t.months[i].availableFte).toBeCloseTo(was.availableFte, 6);
      }
    }
    const moved = after.teams.find((t) => t.teamId === to.id)!.months[6];
    const wasThen = before.teams.find((t) => t.teamId === to.id)!.months[6];
    expect(moved.availableFte).toBeGreaterThan(wasThen.availableFte);
  });
});
