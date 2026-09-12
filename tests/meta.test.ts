import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TESTS } from '../src/lib/meta';

/** The number shown in the verified indicator must be the number of tests in this suite. */
describe('verified indicator', () => {
  it('TESTS equals the count of it() blocks across the suite', () => {
    const dir = join(__dirname);
    let n = 0;
    for (const f of readdirSync(dir)) if (f.endsWith('.test.ts')) n += (readFileSync(join(dir, f), 'utf8').match(/^\s*it\(/gm) ?? []).length;
    expect(TESTS).toBe(n);
  });
});
