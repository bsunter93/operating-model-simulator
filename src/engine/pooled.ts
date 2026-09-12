/**
 * Pods vs pooled, using the same Erlang C model as "Half a Day of Nothing".
 * Stable recursion rather than factorials, which overflow past ~170 agents.
 */
import type { PoolingAssumptions } from '../models/types';

export function erlangB(n: number, a: number): number {
  let b = 1;
  for (let k = 1; k <= n; k++) b = (a * b) / (k + a * b);
  return b;
}

export function erlangC(n: number, a: number): number {
  if (n <= a) return 1;
  const b = erlangB(n, a);
  return b / (1 - (a / n) * (1 - b));
}

export function serviceLevel(n: number, a: number, ahtSeconds: number, targetSeconds: number): number {
  if (n <= a) return 0;
  return 1 - erlangC(n, a) * Math.exp((-(n - a) * targetSeconds) / ahtSeconds);
}

/** Smallest integer headcount that meets the service level for offered load `a`. */
export function staffFor(a: number, ahtSeconds: number, targetSeconds: number, sl: number): number {
  if (a <= 0) return 0;
  let n = Math.max(1, Math.ceil(a));
  let guard = 0;
  while (serviceLevel(n, a, ahtSeconds, targetSeconds) < sl && guard++ < 5000) n++;
  return n;
}

export interface PooledComparison {
  /** Headcount if every client has its own pod. */
  podsFte: number;
  /** Headcount for one shared pool with no context penalty. */
  pooledFteNoPenalty: number;
  /** Headcount for one shared pool carrying the blended penalty. */
  pooledFte: number;
  /** bespoke share × context penalty on bespoke work. */
  blendedPenalty: number;
  /** Penalty on pooled work at which pods need no more people than the pool. Null past 500%. */
  crossoverPenalty: number | null;
  savedFte: number;
}

export function comparePooling(p: PoolingAssumptions): PooledComparison {
  const { clientCount, workloadPerClient: load, ahtSeconds, targetSeconds, serviceLevel: sl } = p;
  const staff = (a: number) => staffFor(a, ahtSeconds, targetSeconds, sl);
  const blended = p.bespokeShare * p.contextPenalty;
  const podsFte = staff(load) * clientCount;
  const pooledFteNoPenalty = staff(load * clientCount);
  const pooledFte = staff(load * clientCount * (1 + blended));
  let crossoverPenalty: number | null = null;
  for (let pen = 0; pen <= 5; pen = Math.round((pen + 0.01) * 100) / 100) {
    if (staff(load * clientCount * (1 + pen)) >= podsFte) { crossoverPenalty = pen; break; }
  }
  return { podsFte, pooledFteNoPenalty, pooledFte, blendedPenalty: blended, crossoverPenalty, savedFte: podsFte - pooledFte };
}
