import { describe, expect, it } from 'vitest';
import { run } from '../src/engine';
import { verdict } from '../src/lib/verdict';
import { fmtFor } from '../src/lib/format';
import type { OperatingModel } from '../src/models/types';
import fixture from '../src/data/atlas-systems-2027.json';

const model = fixture as unknown as OperatingModel;
const tn = (id: string) => model.teams.find((t) => t.id === id)!.name;
const inn = (id: string) => model.initiatives.find((i) => i.id === id)!.name;
const fmt = fmtFor(model);

describe('verdict moves with the model', () => {
  it('base plan: not all at once', () => {
    const v = verdict(run(model), fmt, tn, inn);
    expect(v.headline).toBe('Not all of it at once.');
    expect(v.sentences.join(' ')).toMatch(/Implementation in Feb 2027/);
    expect(v.sentences.join(' ')).toMatch(/International Expansion is planned for Mar/);
    expect(v.versus).toBeNull();
  });
  it('hiring freeze: not as written', () => {
    const v = verdict(run(model, { scenario: 'scenario-hiring-freeze' }), fmt, tn, inn, run(model));
    expect(v.headline).toBe('Not as written.');
    expect(v.versus).toMatch(/Against the base plan/);
  });
  it('a plan with room: yes', () => {
    const m = structuredClone(model);
    for (const t of m.teams) t.currentFte *= 1.6;
    m.dependencies = [];
    m.budget.modeledAnnualBudgetUsd *= 2;
    const v = verdict(run(m), fmt, tn, inn);
    expect(v.headline).toBe('Yes.');
  });
  it('one or two teams over: mostly', () => {
    const m = structuredClone(model);
    for (const t of m.teams) if (t.id !== 'team-implementation') t.currentFte *= 1.4;
    m.budget.modeledAnnualBudgetUsd *= 2;
    const v = verdict(run(m), fmt, tn, inn);
    expect(v.headline).toBe('Mostly.');
    expect(v.sentences.join(' ')).toMatch(/1 of 8 teams runs over capacity/);
  });
});
