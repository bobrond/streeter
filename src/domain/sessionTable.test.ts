import { describe, expect, it } from 'vitest';
import { element, exercise, item, setLog } from '../test/builders';
import type { LastPerformance } from './session';
import { firstPending, lineRows, type PendingRow } from './sessionTable';
import type { SetDraft } from './types';

const planche = element('Planche', 'skill');
const hold = exercise('Planche Hold', planche.id, { measure: 'seconds' });
const line = item({ blockTypeId: 'skill', elementId: planche.id, setsMin: 3, setsMax: 4, targets: [{ unit: 'seconds', min: 3, max: 6 }] });
const done = (value: number, extra: Partial<Parameters<typeof setLog>[0]> = {}) =>
  setLog({ sessionId: 'now', exerciseId: hold.id, itemId: line.id, value, ...extra });
const last: LastPerformance = {
  sessionId: 'old',
  date: '2026-10-14',
  sameBlock: true,
  blockTypeId: 'skill',
  sets: [setLog({ sessionId: 'old', exerciseId: hold.id, value: 5, bandId: 'vert' }), setLog({ sessionId: 'old', exerciseId: hold.id, value: 4 })],
};
const draft = (value: number, patch: Partial<SetDraft> = {}): SetDraft => ({ value, bandId: null, rpe: null, quality: 'clean', kind: 'normal', note: '', ...patch });
const rows = (args: Partial<Parameters<typeof lineRows>[0]> = {}) =>
  lineRows({ item: line, exercise: hold, isSkill: true, sets: [], last, pendingDrafts: [], extraRows: 0, closed: false, ...args });

describe('lineRows', () => {
  it('prévoit autant de lignes que le minimum de séries, pré-remplies par la dernière performance', () => {
    const list = rows();
    expect(list.map((r) => [r.status, r.label])).toEqual([
      ['pending', '1'],
      ['pending', '2'],
      ['pending', '3'],
    ]);
    expect((list[0] as PendingRow).draft).toEqual(draft(5, { bandId: 'vert' }));
    expect((list[2] as PendingRow).draft).toMatchObject({ value: 5, bandId: 'vert', kind: 'normal' });
    expect(list.map((r) => r.previous?.value ?? null)).toEqual([5, 4, null]);
  });

  it('met les séries faites en tête ; la suivante reprend la dernière série faite', () => {
    const list = rows({ sets: [done(6, { rpe: 8, quality: 'degraded' })] });
    expect(list.map((r) => [r.status, r.label])).toEqual([
      ['done', '1'],
      ['pending', '2'],
      ['pending', '3'],
    ]);
    expect(firstPending(list)?.draft).toEqual(draft(6, { rpe: 8 }));
  });

  it('ajoute ou retire des lignes', () => {
    expect(rows({ extraRows: 1 })).toHaveLength(4);
    expect(rows({ extraRows: -1 })).toHaveLength(2);
    expect(rows({ sets: [done(5), done(5), done(5)] }).every((r) => r.status === 'done')).toBe(true);
    expect(rows({ closed: true, sets: [done(5)] })).toHaveLength(1);
  });

  it('garde les valeurs modifiées et les recopie dans les lignes suivantes', () => {
    const list = rows({ pendingDrafts: [draft(8, { rpe: 9, quality: 'degraded' })] }) as PendingRow[];
    expect(list[0]).toMatchObject({ edited: true, draft: { value: 8, quality: 'degraded' } });
    expect(list[1]).toMatchObject({ edited: false, draft: { value: 8, rpe: 9, quality: 'clean', kind: 'normal' } });
  });

  it('ajoute l’échauffement sans prendre la place d’une série prévue, et le note « E »', () => {
    const list = rows({ sets: [done(2, { kind: 'warmup' })], pendingDrafts: [null, draft(3, { kind: 'warmup' })] });
    expect(list.map((r) => [r.status, r.label])).toEqual([
      ['done', 'E'],
      ['pending', '1'],
      ['pending', 'E'],
      ['pending', '2'],
      ['pending', '3'],
    ]);
    // La première série normale ne reprend pas la valeur de l'échauffement.
    expect((list[1] as PendingRow).draft.value).toBe(5);
    expect((list[3] as PendingRow).draft.value).toBe(5);
  });

  it('numérote une série à l’échec comme une série normale', () => {
    const list = rows({ sets: [done(6), done(4, { kind: 'failure' })] });
    expect(list.map((r) => r.label)).toEqual(['1', '2', '3']);
  });

  it('n’a pas de série à faire sans exercice', () => {
    expect(rows({ exercise: null })).toEqual([]);
  });
});
