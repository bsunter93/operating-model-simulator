import { describe, expect, it } from 'vitest';
import { tiedTo, tiesFor } from '../src/lib/ties';
import type { OperatingModel } from '../src/models/types';
import atlas from '../src/data/atlas-systems-2027.json';
import health from '../src/data/meadowbrook-health-2027.json';
import agency from '../src/data/northgate-studio-2027.json';
import ngo from '../src/data/riverbank-trust-2027.json';

const models = [atlas, health, agency, ngo] as unknown as OperatingModel[];

describe('who a team is committed to', () => {
  it('never ties a team to itself', () => {
    for (const m of models) for (const t of m.teams) {
      expect(tiesFor(m, t.id).some((x) => x.teamId === t.id)).toBe(false);
    }
  });

  it('is symmetric: if A shares a programme with B, B shares it with A', () => {
    for (const m of models) for (const a of m.teams) {
      for (const tie of tiesFor(m, a.id)) {
        const back = tiesFor(m, tie.teamId).find((x) => x.teamId === a.id);
        expect(back).toBeDefined();
        expect(back!.shared.map((s) => s.id).sort()).toEqual(tie.shared.map((s) => s.id).sort());
      }
    }
  });

  it('names only programmes both teams actually staff', () => {
    for (const m of models) for (const a of m.teams) {
      for (const tie of tiesFor(m, a.id)) for (const s of tie.shared) {
        const init = m.initiatives.find((i) => i.id === s.id)!;
        expect(init.requiredFteByTeam[a.id]).toBeGreaterThan(0);
        expect(init.requiredFteByTeam[tie.teamId]).toBeGreaterThan(0);
      }
    }
  });

  it('ranks the teams sharing most with this one first', () => {
    for (const m of models) for (const t of m.teams) {
      const counts = tiesFor(m, t.id).map((x) => x.shared.length);
      expect([...counts].sort((a, b) => b - a)).toEqual(counts);
    }
  });

  it('agrees with the id-only form', () => {
    for (const m of models) for (const t of m.teams) {
      expect([...tiedTo(m, t.id)].sort()).toEqual(tiesFor(m, t.id).map((x) => x.teamId).sort());
    }
  });
});
