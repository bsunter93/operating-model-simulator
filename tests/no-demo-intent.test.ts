import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('the engine never reads demo intent', () => {
  it('no file under src/engine mentions demoIntent', () => {
    const dir = join(__dirname, '..', 'src', 'engine');
    for (const f of readdirSync(dir)) {
      const src = readFileSync(join(dir, f), 'utf8');
      expect(src.includes('demoIntent'), `${f} references demoIntent`).toBe(false);
    }
  });
});
