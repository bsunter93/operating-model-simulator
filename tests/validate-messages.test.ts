import { describe, it, expect } from 'vitest';
import { validateModel } from '../src/engine/validate';
import fixture from '../src/data/atlas-systems-2027.json';
import type { OperatingModel } from '../src/models/types';

const M = fixture as unknown as OperatingModel;
/* eslint-disable @typescript-eslint/no-explicit-any */
const bend = (f: (m: any) => void): string => {
  const c = JSON.parse(JSON.stringify(M));
  f(c);
  return validateModel(c as OperatingModel)[0] ?? '';
};

/*
 * Every numeric check used to be written as `if (!(x >= 0))`, which is true for a field
 * that is not there at all, because undefined >= 0 is false. So a model missing a number
 * was told the number was negative, and whoever was fixing the file went looking for a
 * minus sign that did not exist. Found by importing a real file with a misspelled field.
 */
describe('a missing number is not a negative number', () => {
  it('says missing when the field is absent', () => {
    expect(bend((m) => { delete m.teams[0].monthlyFteCost; })).toMatch(/monthlyFteCost is missing or not a number/);
  });

  it('says missing for null, a string, and NaN', () => {
    for (const v of [null, '18000', NaN]) {
      expect(bend((m) => { m.teams[0].monthlyFteCost = v; })).toMatch(/is missing or not a number/);
    }
  });

  it('still says negative when the number really is negative', () => {
    expect(bend((m) => { m.teams[0].monthlyFteCost = -5; })).toMatch(/monthlyFteCost cannot be negative/);
  });

  it('keeps the range wording for a number that is out of range', () => {
    expect(bend((m) => { m.teams[0].targetUtilization = 1.4; }))
      .toMatch(/targetUtilization must be between 0.01 and 1/);
  });

  it('tells them apart on a ratio too, where the old code could not', () => {
    expect(bend((m) => { delete m.teams[0].targetUtilization; })).toMatch(/is missing or not a number/);
  });

  it('names where it is, not just what it is', () => {
    expect(bend((m) => { delete m.initiatives[0].confidence; }))
      .toMatch(/^initiative init-[a-z-]+: confidence is missing/);
    expect(bend((m) => { delete m.pooling.serviceLevel; })).toBe('pooling.serviceLevel is missing or not a number');
  });

  it('leaves a sound model with nothing to say', () => {
    expect(validateModel(M)).toEqual([]);
  });
});
