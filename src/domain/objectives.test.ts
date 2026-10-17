import { describe, expect, it } from 'vitest';
import { bandRecords, bestSessionPerformance, bestTest, objectiveState } from './objectives';
import type { SessionLog, SetLog } from './types';

const test = (date: string, value: number) => ({ id: `${date}-${value}`, date, value, note: '' });

describe('objectiveState', () => {
  it('« À tester » sans test', () => {
    expect(objectiveState({ target: 10, tests: [] })).toEqual({ status: 'to_test', best: null, gap: null });
  });

  it('« En cours » sous la cible, avec l’écart', () => {
    expect(objectiveState({ target: 10, tests: [test('2026-11-02', 6)] })).toMatchObject({ status: 'in_progress', gap: 4 });
  });

  it('« Atteint » à la cible', () => {
    expect(objectiveState({ target: 1, tests: [test('2026-11-02', 1)] })).toMatchObject({ status: 'achieved', gap: 0 });
  });

  it('se calcule sur le meilleur test, pas sur le dernier', () => {
    const state = objectiveState({ target: 10, tests: [test('2026-11-02', 11), test('2026-11-30', 8)] });
    expect(state).toMatchObject({ status: 'achieved', gap: -1 });
    expect(state.best?.date).toBe('2026-11-02');
  });

  it('retient le premier test en cas d’égalité', () => {
    expect(bestTest([test('2026-11-30', 8), test('2026-11-02', 8)])?.date).toBe('2026-11-02');
  });
});

describe('bestSessionPerformance', () => {
  const sessions = new Map(
    [
      { id: 'a', date: '2026-10-07' },
      { id: 'b', date: '2026-10-12' },
    ].map((x) => [x.id, x as SessionLog]),
  );
  const set = (id: string, sessionId: string, value: number | null, extra: Partial<SetLog> = {}) =>
    ({ id, sessionId, exerciseId: 'planche-hold', value, bandId: null, quality: null, ...extra }) as SetLog;

  it('ignore les séries avec élastique et les séries dégradées', () => {
    const sets = [
      set('1', 'a', 3),
      set('2', 'a', 14, { bandId: 'jaune' }),
      set('3', 'b', 6, { quality: 'degraded' }),
      set('4', 'b', 4, { quality: 'clean' }),
      set('5', 'b', null),
      set('6', 'b', 9, { exerciseId: 'autre' }),
    ];
    expect(bestSessionPerformance('planche-hold', sets, sessions)).toEqual({ value: 4, date: '2026-10-12', setId: '4' });
  });

  it('ignore l’échauffement, garde l’échec', () => {
    const sets = [set('1', 'a', 8, { kind: 'warmup' }), set('2', 'b', 5, { kind: 'failure' })];
    expect(bestSessionPerformance('planche-hold', sets, sessions)).toEqual({ value: 5, date: '2026-10-12', setId: '2' });
  });

  it('compte les séries importées sans qualité notée', () => {
    expect(bestSessionPerformance('planche-hold', [set('1', 'a', 3)], sessions)?.value).toBe(3);
  });

  it('renvoie null sans série valable', () => {
    expect(bestSessionPerformance('planche-hold', [set('2', 'a', 14, { bandId: 'jaune' })], sessions)).toBeNull();
  });
});

describe('bandRecords', () => {
  const sessions = new Map(
    [
      { id: 'a', date: '2026-10-07' },
      { id: 'b', date: '2026-10-12' },
    ].map((x) => [x.id, x as SessionLog]),
  );
  const set = (id: string, sessionId: string, value: number | null, extra: Partial<SetLog> = {}) =>
    ({ id, sessionId, exerciseId: 'planche-hold', value, bandId: null, quality: null, kind: 'normal', ...extra }) as SetLog;

  it('garde un record par élastique, plus le record sans élastique', () => {
    const sets = [
      set('1', 'a', 6),
      set('2', 'a', 12, { bandId: 'vert' }),
      set('3', 'b', 15, { bandId: 'vert' }),
      set('4', 'b', 9, { bandId: 'bleue' }),
      set('5', 'b', 5),
    ];
    const records = bandRecords('planche-hold', sets, sessions);
    expect(records.get(null)).toEqual({ value: 6, date: '2026-10-07', setId: '1' });
    expect(records.get('vert')).toEqual({ value: 15, date: '2026-10-12', setId: '3' });
    expect(records.get('bleue')?.value).toBe(9);
    expect(records.has('jaune')).toBe(false);
  });

  it('exclut les séries dégradées et d’échauffement, quel que soit l’élastique', () => {
    const sets = [
      set('1', 'a', 20, { bandId: 'vert', quality: 'degraded' }),
      set('2', 'a', 18, { bandId: 'vert', kind: 'warmup' }),
      set('3', 'b', 10, { bandId: 'vert', kind: 'failure' }),
    ];
    expect([...bandRecords('planche-hold', sets, sessions)]).toEqual([['vert', { value: 10, date: '2026-10-12', setId: '3' }]]);
  });

  it('retient la première fois en cas d’égalité', () => {
    const sets = [set('1', 'b', 12, { bandId: 'vert' }), set('2', 'a', 12, { bandId: 'vert' })];
    expect(bandRecords('planche-hold', sets, sessions).get('vert')?.date).toBe('2026-10-07');
  });
});
