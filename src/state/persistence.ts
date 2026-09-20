import type { OperatingModel } from '../models/types';

/**
 * Where a model lives between visits.
 *
 * Everything here is the browser's own storage, because the site is a static page with
 * nothing behind it. The interface is the point: it is async and it is small, so the day
 * this wants real accounts, a server adapter implements the same four methods and nothing
 * above this file has to know. Local storage is not a lesser version of that; it is the
 * same contract with a different back end.
 */

export interface SavedModel {
  id: string;
  name: string;
  /** ISO 8601, so the list can sort without parsing anything. */
  updatedAt: string;
  bytes: number;
}

export interface ModelStore {
  /** What is actually backing this. 'memory' means the browser refused us storage. */
  readonly kind: 'indexeddb' | 'memory';
  list(): Promise<SavedModel[]>;
  load(id: string): Promise<OperatingModel | null>;
  save(name: string, model: OperatingModel): Promise<SavedModel>;
  remove(id: string): Promise<void>;
  /** The model last on screen, so a refresh does not cost somebody their afternoon. */
  readSession(): Promise<OperatingModel | null>;
  writeSession(model: OperatingModel | null): Promise<void>;
}

const DB = 'operating-model-simulator';
const MODELS = 'models';
const SESSION = 'session';

const idOf = (name: string) =>
  name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
  || 'model-' + Date.now().toString(36);

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(MODELS)) db.createObjectStore(MODELS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(SESSION)) db.createObjectStore(SESSION, { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('indexedDB blocked'));
  });
}

const run = <T>(store: IDBObjectStore, req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    void store;
  });

async function tx<T>(name: string, mode: IDBTransactionMode, f: (s: IDBObjectStore) => Promise<T>): Promise<T> {
  const db = await openDb();
  try {
    return await f(db.transaction(name, mode).objectStore(name));
  } finally {
    db.close();
  }
}

/** A store that forgets everything, for a browser that will not let us keep anything. */
function memoryStore(): ModelStore {
  const mem = new Map<string, { meta: SavedModel; model: OperatingModel }>();
  let session: OperatingModel | null = null;
  return {
    kind: 'memory',
    async list() { return [...mem.values()].map((v) => v.meta).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); },
    async load(id) { return mem.get(id)?.model ?? null; },
    async save(name, model) {
      const meta = { id: idOf(name), name: name.trim(), updatedAt: new Date().toISOString(), bytes: JSON.stringify(model).length };
      mem.set(meta.id, { meta, model });
      return meta;
    },
    async remove(id) { mem.delete(id); },
    async readSession() { return session; },
    async writeSession(m) { session = m; },
  };
}

function indexedDbStore(): ModelStore {
  return {
    kind: 'indexeddb',
    list: () => tx(MODELS, 'readonly', async (s) => {
      const rows = await run(s, s.getAll() as IDBRequest<{ meta: SavedModel }[]>);
      return rows.map((r) => r.meta).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }),
    load: (id) => tx(MODELS, 'readonly', async (s) => {
      const row = await run(s, s.get(id) as IDBRequest<{ model: OperatingModel } | undefined>);
      return row?.model ?? null;
    }),
    save: (name, model) => tx(MODELS, 'readwrite', async (s) => {
      const meta: SavedModel = {
        id: idOf(name), name: name.trim(),
        updatedAt: new Date().toISOString(), bytes: JSON.stringify(model).length,
      };
      await run(s, s.put({ id: meta.id, meta, model }));
      return meta;
    }),
    remove: (id) => tx(MODELS, 'readwrite', async (s) => { await run(s, s.delete(id)); }),
    readSession: () => tx(SESSION, 'readonly', async (s) => {
      const row = await run(s, s.get('current') as IDBRequest<{ model: OperatingModel } | undefined>);
      return row?.model ?? null;
    }),
    writeSession: (model) => tx(SESSION, 'readwrite', async (s) => {
      if (model) await run(s, s.put({ key: 'current', model, savedAt: new Date().toISOString() }));
      else await run(s, s.delete('current'));
    }),
  };
}

/**
 * Every call is wrapped, because storage fails in ways that are not bugs: a private
 * window, a browser set to block site data, a full disk. None of those should take the
 * page down with them, so a failure degrades to forgetting rather than throwing.
 */
export function createModelStore(): ModelStore {
  const usable = (() => {
    try { return typeof indexedDB !== 'undefined' && indexedDB !== null; } catch { return false; }
  })();
  if (!usable) return memoryStore();
  const real = indexedDbStore();
  const fallback = memoryStore();
  const guard = <A extends unknown[], R>(f: (...a: A) => Promise<R>, g: (...a: A) => Promise<R>) =>
    async (...a: A): Promise<R> => { try { return await f(...a); } catch { return g(...a); } };
  return {
    kind: 'indexeddb',
    list: guard(real.list, fallback.list),
    load: guard(real.load, fallback.load),
    save: guard(real.save, fallback.save),
    remove: guard(real.remove, fallback.remove),
    readSession: guard(real.readSession, fallback.readSession),
    writeSession: guard(real.writeSession, fallback.writeSession),
  };
}

// ── share links ──────────────────────────────────────────────────────────────
// A whole model in a URL. Gzip first: the fixture is 17.6k of JSON and 4.8k compressed,
// which is 6.4k of base64. Long for a link, and still short enough to paste anywhere
// that is not Twitter.

const b64url = (b: Uint8Array) => {
  let s = '';
  for (const byte of b) s += String.fromCharCode(byte);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const unb64url = (s: string) => {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

const bytesOf = async (stream: ReadableStream<Uint8Array>) =>
  new Uint8Array(await new Response(stream).arrayBuffer());

/** Prefix says how it was packed, so an old link keeps working if this ever changes. */
export async function encodeShare(model: OperatingModel): Promise<string> {
  const json = JSON.stringify(model);
  if (typeof CompressionStream === 'undefined') return 'r' + b64url(new TextEncoder().encode(json));
  const packed = await bytesOf(
    new Blob([json]).stream().pipeThrough(new CompressionStream('gzip')) as ReadableStream<Uint8Array>,
  );
  return 'g' + b64url(packed);
}

/** Returns the raw object. The caller validates it like any other imported file. */
export async function decodeShare(token: string): Promise<unknown | null> {
  try {
    const how = token[0];
    const body = unb64url(token.slice(1));
    if (how === 'r') return JSON.parse(new TextDecoder().decode(body));
    if (how !== 'g' || typeof DecompressionStream === 'undefined') return null;
    const out = await bytesOf(
      new Blob([body as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip')) as ReadableStream<Uint8Array>,
    );
    return JSON.parse(new TextDecoder().decode(out));
  } catch {
    return null;
  }
}
