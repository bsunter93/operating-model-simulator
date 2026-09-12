import { describe, expect, it } from 'vitest';
import { comparePooling, staffFor } from '../src/engine';
import fixture from '../src/data/atlas-systems-2027.json';
import type { OperatingModel } from '../src/models/types';

const article = (fixture as unknown as OperatingModel).pooling;

describe('pods vs pooled reproduces "Half a Day of Nothing"', () => {
  it('ten pods of two people-worth of work need 4 each: 40 total', () => {
    expect(staffFor(2, 900, 120, 0.8)).toBe(4);
    expect(comparePooling(article).podsFte).toBe(40);
  });
  it('one pool with no penalty needs 24', () => {
    expect(comparePooling(article).pooledFteNoPenalty).toBe(24);
  });
  it('30% bespoke at a 40% penalty is a 12% blended penalty and 27 people', () => {
    const c = comparePooling(article);
    expect(c.blendedPenalty).toBeCloseTo(0.12, 10);
    expect(c.pooledFte).toBe(27);
  });
  it('pods win only once pooled work is 73% slower', () => {
    expect(comparePooling(article).crossoverPenalty).toBeCloseTo(0.73, 10);
  });
  it('a higher context penalty never makes pooling cheaper', () => {
    let prev = -1;
    for (let pen = 0; pen <= 2; pen += 0.05) {
      const c = comparePooling({ ...article, contextPenalty: pen });
      expect(c.pooledFte).toBeGreaterThanOrEqual(prev);
      prev = c.pooledFte;
    }
  });
  it('more reusable work reduces the pooled headcount', () => {
    const lo = comparePooling({ ...article, bespokeShare: 0.6 }).pooledFte;
    const hi = comparePooling({ ...article, bespokeShare: 0.1 }).pooledFte;
    expect(hi).toBeLessThanOrEqual(lo);
  });
});
