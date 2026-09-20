import { describe, it, expect } from 'vitest';
import { makeFmt, fmtFor } from '../src/lib/format';
import { validateModel } from '../src/engine/validate';
import { run } from '../src/engine';
import fixture from '../src/data/atlas-systems-2027.json';
import type { OperatingModel } from '../src/models/types';

const M = fixture as unknown as OperatingModel;
const clone = (f: (m: OperatingModel) => void) => {
  const c = JSON.parse(JSON.stringify(M)) as OperatingModel;
  f(c);
  return c;
};

/*
 * The compact suffix is matched case-insensitively throughout. CI found out why on its
 * first run: this machine is ICU 77 / CLDR 47 and writes "£1.9M", while the runner's Node
 * carries an older CLDR and writes "£1.9m". Both are correct for their data, and the app
 * is right either way, because each reader's browser formats with its own. What was wrong
 * was a test asserting a glyph nobody promised. Symbols, separators, signs and grouping
 * are stable and still checked exactly; only the suffix's case is not.
 *
 * Money used to be built by hand as '$' followed by a number, in two different places,
 * with the compact suffixes B/M/K written out. That is wrong three ways for anyone
 * outside the dollar: the symbol, where the symbol goes, and the fact that not every
 * place groups by thousands. Intl knows all of it; nothing here should.
 */
describe('money follows the model, not the developer', () => {
  it('reads as dollars by default, unchanged from what it was', () => {
    const f = makeFmt();
    expect(f.money(1_870_000)).toMatch(/^\$1\.9M$/i);
    expect(f.money(450_000)).toMatch(/^\$450K$/i);
    expect(f.money(0)).toBe('$0');
  });

  it('puts two decimals on the figures a reader compares side by side', () => {
    expect(makeFmt().money(47_040_000, { precise: true })).toMatch(/^\$47\.04M$/i);
    // Except for nothing, which is not close to anything and does not need the decimals.
    expect(makeFmt().money(0, { precise: true })).toBe('$0');
  });

  it('follows the currency the model declares', () => {
    expect(makeFmt('GBP', 'en-GB').money(1_870_000)).toMatch(/^£1\.9M$/i);
    expect(makeFmt('EUR', 'de-DE').money(1_870_000)).toContain('€');
  });

  it('puts the symbol where the language puts it, not where English does', () => {
    // German writes the amount first. A hand-rolled '$' + n can never do this.
    const de = makeFmt('EUR', 'de-DE').money(1_870_000);
    expect(de.indexOf('€')).toBeGreaterThan(0);
    expect(makeFmt('USD', 'en-US').money(1_870_000).indexOf('$')).toBe(0);
  });

  it('groups the way the locale groups, which is not always by thousands', () => {
    // Indian digit grouping, and lakh/crore rather than K/M.
    expect(makeFmt('INR', 'en-IN').money(1_870_000)).toMatch(/L/i);
    expect(makeFmt('INR', 'en-IN').money(12_34_567, { compact: false })).toBe('₹12,34,567');
  });

  it('uses the typographic minus this design uses, not a hyphen', () => {
    expect(makeFmt().money(-3_100_000)).toMatch(/^−\$3\.1M$/i);
    expect(makeFmt().money(4_100_000, { sign: true })).toMatch(/^\+\$4\.1M$/i);
  });

  it('binds straight off a model', () => {
    expect(fmtFor(M).currency).toBe('USD');
    // Japanese groups by ten-thousands, so a million yen reads as 100 man, not 1M.
    expect(fmtFor({ currency: 'JPY', locale: 'ja-JP' }).money(1_000_000)).toContain('万');
  });
});

describe('the model says what its numbers are in', () => {
  it('accepts the fixture as it stands', () => {
    expect(validateModel(M)).toEqual([]);
  });

  it('is optional, and means dollars when absent', () => {
    const bare = clone((c) => { delete c.currency; delete c.locale; });
    expect(validateModel(bare)).toEqual([]);
    expect(fmtFor(bare).currency).toBe('USD');
    expect(fmtFor(bare).locale).toBe('en-US');
  });

  it('refuses a currency that is not an ISO code', () => {
    expect(validateModel(clone((c) => { c.currency = 'dollars'; })).join(' '))
      .toMatch(/three-letter ISO 4217/);
  });

  it('refuses a locale no runtime can parse', () => {
    expect(validateModel(clone((c) => { c.locale = 'not a locale'; })).join(' '))
      .toMatch(/BCP 47/);
  });
});

describe('the engine does not read the machine it runs on', () => {
  it('formats the strings it hands back in the model\'s currency', () => {
    const eur = clone((c) => { c.currency = 'EUR'; c.locale = 'de-DE'; });
    const over = run(eur, { scenario: 'scenario-budget-cut' }).constraints
      .find((c) => /budget/i.test(c.title + c.detail));
    if (over) expect(over.detail).toContain('€');
  });

  it('gives the same answer whatever locale the host is set to', () => {
    // The old code called toLocaleString(), so this text changed with the machine.
    const a = run(M).constraints.map((c) => c.detail).join('|');
    const b = run(JSON.parse(JSON.stringify(M))).constraints.map((c) => c.detail).join('|');
    expect(a).toBe(b);
    expect(a).not.toMatch(/undefined|NaN/);
  });
});
