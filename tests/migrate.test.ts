import { describe, it, expect } from 'vitest';
import { run } from '../src/engine';
import { validateModel } from '../src/engine/validate';
import { MODEL_VERSION, RENAMED_IN_V3, migrateModel } from '../src/models/migrate';
import { parseImportedModel } from '../src/state/store';
import fixture from '../src/data/atlas-systems-2027.json';
import type { OperatingModel } from '../src/models/types';

const M = fixture as unknown as OperatingModel;

/** The fixture as version 2 would have written it: every amount named after a currency. */
const asV2 = (() => {
  const back = Object.fromEntries(Object.entries(RENAMED_IN_V3).map(([old, cur]) => [cur, old]));
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>)
        .map(([k, val]) => [back[k] ?? k, walk(val)]));
    }
    return v;
  };
  const out = walk(JSON.parse(JSON.stringify(M))) as Record<string, unknown>;
  out.modelVersion = '2.0';
  return out;
})();

/*
 * A model file is a thing people keep. They export it, edit it, mail it to somebody and
 * import it back a month later. Renaming a field is free inside the codebase and not free
 * out there, so the rename has to come with a way for the old files to still open.
 */
describe('files written before the rename still open', () => {
  it('starts from something that really is the old shape', () => {
    expect(JSON.stringify(asV2)).toContain('monthlyFteCostUsd');
    expect(JSON.stringify(asV2)).not.toContain('"monthlyFteCost"');
  });

  it('is rejected outright without the migration, which is why it exists', () => {
    expect(validateModel(asV2 as unknown as OperatingModel).length).toBeGreaterThan(0);
  });

  it('imports cleanly through it', () => {
    const r = parseImportedModel(JSON.stringify(asV2));
    expect('errors' in r ? r.errors : []).toEqual([]);
  });

  it('produces exactly the same year as the current file', () => {
    const r = parseImportedModel(JSON.stringify(asV2));
    expect('model' in r).toBe(true);
    if (!('model' in r)) return;
    expect(run(r.model).summary).toEqual(run(M).summary);
  });

  it('stamps the version it migrated to', () => {
    expect(migrateModel(asV2).model).toHaveProperty('modelVersion', MODEL_VERSION);
    expect(migrateModel(asV2).changed).toBeGreaterThan(0);
  });

  it('leaves a current file completely alone', () => {
    const { model, changed } = migrateModel(JSON.parse(JSON.stringify(M)));
    expect(changed).toBe(0);
    expect(model).toEqual(M);
  });

  it('does not clobber a new name when a file carries both', () => {
    // Half-migrated by hand, which is the state a person's file is most likely to be in.
    const both = { monthlyFteCostUsd: 1, monthlyFteCost: 2 };
    expect(migrateModel(both).model).toEqual(both);
  });

  it('leaves a Usd field of its own meaning alone', () => {
    const mine = { someOtherThingUsd: 7 };
    expect(migrateModel(mine).model).toEqual(mine);
  });
});

describe('no field name claims a currency any more', () => {
  it('nowhere in the shipped model', () => {
    expect(JSON.stringify(M)).not.toMatch(/[A-Za-z]Usd"/);
  });

  it('and the model says what the currency is instead', () => {
    expect(M.currency).toBe('USD');
  });
});
