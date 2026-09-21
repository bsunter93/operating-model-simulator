import { describe, expect, it } from 'vitest';
import { run } from '../src/engine';
import { bindingConstraints } from '../src/lib/constraint';
import { receipt } from '../src/lib/receipt';
import type { OperatingModel } from '../src/models/types';
import fixture from '../src/data/atlas-systems-2027.json';

const model = fixture as unknown as OperatingModel;
const shock = model.scenarios.find(
  (s) => s.type === 'demandMultiplier' && (s as { demandMultiplier?: number }).demandMultiplier! > 1,
)!;

const withFte = (m: OperatingModel, teamId: string, add: number): OperatingModel => ({
  ...m,
  teams: m.teams.map((t) => (t.id === teamId ? { ...t, currentFte: t.currentFte + add } : t)),
});
const bind = (m: OperatingModel, scenarioId: string, r = run(m, { scenario: scenarioId })) =>
  bindingConstraints(m, { decisions: [], scenarioId }, [], r);

describe('the receipt', () => {
  it('reports nothing when nothing was changed', () => {
    const r = run(model, { scenario: shock.id });
    const b = bind(model, shock.id, r);
    const rec = receipt(r, r, b, b);
    expect(rec.lines).toHaveLength(0);
    expect(rec.firstMonth).toBeNull();
    expect(rec.moved).toBeNull();
  });

  /* The line a reader is most likely to act on, so it is the one worth pinning: people
     cost money whatever else they do. */
  it('charges for people the moment they are added', () => {
    const before = run(model, { scenario: shock.id });
    const teamId = bind(model, shock.id, before).service!.teamId;
    const mine = withFte(model, teamId, 20);
    const after = run(mine, { scenario: shock.id });
    const rec = receipt(before, after, bind(model, shock.id, before), bind(mine, shock.id, after));
    const cost = rec.lines.find((l) => l.key === 'cost')!;
    expect(cost.delta).toBeGreaterThan(0);
    expect(cost.good).toBe(false);
  });

  it('marks a better answer rate as good and a worse one as bad', () => {
    const before = run(model, { scenario: shock.id });
    const teamId = bind(model, shock.id, before).service!.teamId;
    const more = run(withFte(model, teamId, 25), { scenario: shock.id });
    const fewer = run(withFte(model, teamId, -10), { scenario: shock.id });
    const b = bind(model, shock.id, before);
    const up = receipt(before, more, b, b).lines.find((l) => l.key === 'service')!;
    const down = receipt(before, fewer, b, b).lines.find((l) => l.key === 'service')!;
    expect(up.delta).toBeGreaterThan(0);
    expect(up.good).toBe(true);
    expect(down.delta).toBeLessThan(0);
    expect(down.good).toBe(false);
  });

  /* Hiring does not fix the month you hire in, and this is the field that says so. */
  it('names a month, and never one before the change could have landed', () => {
    const before = run(model, { scenario: shock.id });
    const teamId = bind(model, shock.id, before).service!.teamId;
    const mine = withFte(model, teamId, 15);
    const after = run(mine, { scenario: shock.id });
    const rec = receipt(before, after, bind(model, shock.id, before), bind(mine, shock.id, after));
    expect(rec.firstMonth).not.toBeNull();
    expect(rec.firstMonth!).toBeGreaterThanOrEqual(0);
    expect(rec.firstMonth!).toBeLessThan(before.months.length);
  });

  it('hands the title to the next team when the constraint is relieved', () => {
    const before = run(model, { scenario: shock.id });
    const b = bind(model, shock.id, before);
    const teamId = b.service!.teamId;
    /* Enough people that the team cannot still be the one the queue turns on. */
    const mine = withFte(model, teamId, 400);
    const after = run(mine, { scenario: shock.id });
    const rec = receipt(before, after, b, bind(mine, shock.id, after));
    expect(rec.moved).not.toBeNull();
    expect(rec.moved!.from).toBe(teamId);
    expect(rec.moved!.to).not.toBe(teamId);
  });

  it('keeps a change below the noise floor off the receipt', () => {
    const before = run(model, { scenario: shock.id });
    const b = bind(model, shock.id, before);
    const rec = receipt(before, before, b, b);
    expect(rec.lines.every((l) => Math.abs(l.delta) > 0)).toBe(true);
    expect(rec.lines).toHaveLength(0);
  });
});
