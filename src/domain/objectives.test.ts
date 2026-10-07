import { describe, expect, it } from 'vitest';
import { bestSessionPerformance, bestTest, objectiveState } from './objectives';
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

  it('compte les séries importées sans qualité notée', () => {
    expect(bestSessionPerformance('planche-hold', [set('1', 'a', 3)], sessions)?.value).toBe(3);
  });

  it('renvoie null sans série valable', () => {
    expect(bestSessionPerformance('planche-hold', [set('2', 'a', 14, { bandId: 'jaune' })], sessions)).toBeNull();
  });
});
