import { describe, expect, it } from 'vitest';
import { leadsFor } from '../src/lib/leads';
import type { Decision } from '../src/lib/edits';
import type { OperatingModel } from '../src/models/types';
import atlas from '../src/data/atlas-systems-2027.json';
import health from '../src/data/meadowbrook-health-2027.json';
import agency from '../src/data/northgate-studio-2027.json';
import ngo from '../src/data/riverbank-trust-2027.json';

const models = [atlas, health, agency, ngo] as unknown as OperatingModel[];
const monthsOf = (m: OperatingModel) =>
  Array.from({ length: 12 }, (_, i) => `${m.calendar.startMonth.slice(0, 4)}-${String(i + 1).padStart(2, '0')}`);

const move = (m: OperatingModel, at: string): Decision => ({
  id: 'd1', kind: 'move', month: at, teamId: m.teams[1].id, fromTeamId: m.teams[0].id,
  amount: 5, label: 'Move 5',
});

describe('a change made here, showing up there', () => {
  it('draws the reader’s own move whether or not anything is selected', () => {
    for (const m of models) {
      const ms = monthsOf(m);
      for (const sel of [null, m.teams[3].id]) {
        const out = leadsFor(m, [move(m, ms[6])], ms, sel).filter((l) => l.kind === 'move');
        expect(out).toHaveLength(1);
        expect(out[0].fromTeamId).toBe(m.teams[0].id);
        expect(out[0].toTeamId).toBe(m.teams[1].id);
        expect(out[0].landsAt).toBe(6);
      }
    }
  });

  it('never draws a lead from a team to itself', () => {
    for (const m of models) {
      const ms = monthsOf(m);
      for (const t of m.teams) {
        for (const l of leadsFor(m, [], ms, t.id)) expect(l.fromTeamId).not.toBe(l.toTeamId);
      }
    }
  });

  it('keeps the plan’s waits out of the picture until a team on one end is selected', () => {
    for (const m of models) {
      const ms = monthsOf(m);
      expect(leadsFor(m, [], ms, null).filter((l) => l.kind === 'waits-on')).toHaveLength(0);
    }
  });

  it('shows a wait to every team on the far end, and only to those', () => {
    const m = models[0];
    const ms = monthsOf(m);
    const dep = m.dependencies![0];
    const on = (id: string) => Object.entries(m.initiatives.find((i) => i.id === id)!.requiredFteByTeam)
      .filter(([, v]) => v > 0).map(([k]) => k);
    const pre = on(dep.predecessorId), post = on(dep.successorId);
    const head = pre[0];
    const got = leadsFor(m, [], ms, head).filter((l) => l.kind === 'waits-on');
    expect(got.map((l) => l.toTeamId).sort())
      .toEqual(post.filter((t) => t !== head).sort());
    for (const l of got) expect(l.fromTeamId).toBe(head);
  });

  it('says what the wait is, in the model’s own words and lag', () => {
    const m = models[0];
    const dep = m.dependencies![0];
    const pre = m.initiatives.find((i) => i.id === dep.predecessorId)!;
    const post = m.initiatives.find((i) => i.id === dep.successorId)!;
    const head = Object.keys(pre.requiredFteByTeam).filter((k) => pre.requiredFteByTeam[k] > 0)[0];
    const got = leadsFor(m, [], monthsOf(m), head).find((l) => l.kind === 'waits-on')!;
    expect(got.detail).toContain(pre.name);
    expect(got.detail).toContain(post.name);
    expect(got.tag).toBe(`+${dep.lagMonths}`);
  });

  it('has nothing to say for a model that carries no dependencies', () => {
    for (const m of models.filter((x) => !(x.dependencies ?? []).length)) {
      for (const t of m.teams) {
        expect(leadsFor(m, [], monthsOf(m), t.id)).toHaveLength(0);
      }
    }
  });
});
