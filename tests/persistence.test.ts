import { describe, it, expect } from 'vitest';
import { createModelStore, decodeShare, encodeShare } from '../src/state/persistence';
import { parseImportedModel } from '../src/state/store';
import { run } from '../src/engine';
import fixture from '../src/data/atlas-systems-2027.json';
import type { OperatingModel } from '../src/models/types';

const M = fixture as unknown as OperatingModel;

/*
 * The site is a static page with nothing behind it, so "saved" means the browser's own
 * storage. The interface is the part that matters: four async methods, so the day this
 * wants real accounts a server adapter implements the same contract and nothing above it
 * changes. These run against the in-memory fallback, which is the same contract.
 */
describe('a model store keeps models', () => {
  it('saves, lists and loads one back unchanged', async () => {
    const s = createModelStore();
    const meta = await s.save('My Org 2027', M);
    expect(meta.name).toBe('My Org 2027');
    expect(meta.bytes).toBeGreaterThan(1000);
    expect(await s.list()).toHaveLength(1);
    expect(await s.load(meta.id)).toEqual(M);
  });

  it('gives a saved model a readable id rather than a random one', async () => {
    const s = createModelStore();
    expect((await s.save('  Northwind   Support  ', M)).id).toBe('northwind-support');
  });

  it('saving the same name again replaces rather than duplicates', async () => {
    const s = createModelStore();
    await s.save('Plan A', M);
    await s.save('Plan A', { ...M, name: 'edited' });
    const list = await s.list();
    expect(list).toHaveLength(1);
    expect((await s.load(list[0].id))?.name).toBe('edited');
  });

  it('removes one', async () => {
    const s = createModelStore();
    const meta = await s.save('Gone', M);
    await s.remove(meta.id);
    expect(await s.list()).toHaveLength(0);
    expect(await s.load(meta.id)).toBeNull();
  });

  it('returns null for something it has never heard of', async () => {
    expect(await createModelStore().load('nope')).toBeNull();
  });

  it('keeps a session model separately from the saved ones', async () => {
    const s = createModelStore();
    expect(await s.readSession()).toBeNull();
    await s.writeSession(M);
    expect(await s.readSession()).toEqual(M);
    expect(await s.list()).toHaveLength(0);
    await s.writeSession(null);
    expect(await s.readSession()).toBeNull();
  });

  it('falls back to forgetting rather than throwing when storage is refused', () => {
    // No indexedDB in this environment, which is exactly the private-window case.
    expect(createModelStore().kind).toBe('memory');
  });
});

describe('a link can carry a whole model', () => {
  it('survives the round trip exactly', async () => {
    const token = await encodeShare(M);
    expect(await decodeShare(token)).toEqual(M);
  });

  it('compresses, because the uncompressed thing is too long to paste', async () => {
    const token = await encodeShare(M);
    expect(token[0]).toBe('g');
    expect(token.length).toBeLessThan(JSON.stringify(M).length / 2);
  });

  it('is URL-safe, with nothing that needs escaping', async () => {
    expect(await encodeShare(M)).toMatch(/^[gr][A-Za-z0-9_-]+$/);
  });

  it('comes back through the same door as an imported file', async () => {
    // Which means it is migrated and validated, not trusted because it came from us.
    const decoded = await decodeShare(await encodeShare(M));
    const r = parseImportedModel(JSON.stringify(decoded));
    expect('model' in r).toBe(true);
    if ('model' in r) expect(run(r.model).summary).toEqual(run(M).summary);
  });

  it('returns null for a token that is damaged rather than throwing', async () => {
    for (const bad of ['', 'g', 'gnonsense', 'x' + 'A'.repeat(40), 'g@@@@']) {
      expect(await decodeShare(bad)).toBeNull();
    }
  });
});
