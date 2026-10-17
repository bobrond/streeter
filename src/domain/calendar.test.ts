import { describe, expect, it } from 'vitest';
import { sessionLog } from '../test/builders';
import { isMonth, isoWeekday, monthGrid, monthOf, monthSummary, shiftMonth } from './calendar';

describe('calendrier', () => {
  it('calcule le jour de la semaine, lundi = 1', () => {
    expect(isoWeekday('2026-10-05')).toBe(1);
    expect(isoWeekday('2026-10-17')).toBe(6);
    expect(isoWeekday('2026-10-18')).toBe(7);
    expect(isoWeekday('1969-12-31')).toBe(3);
  });

  it('passe d’un mois à l’autre, années comprises', () => {
    expect(monthOf('2026-10-17')).toBe('2026-10');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-10', -14)).toBe('2025-08');
    expect(isMonth('2026-10')).toBe(true);
    expect(isMonth('2026-13')).toBe(false);
    expect(isMonth(null)).toBe(false);
  });

  it('dessine des semaines complètes du lundi au dimanche', () => {
    // Octobre 2026 : du jeudi 1er au samedi 31 → 5 semaines, du lundi 28/09 au dimanche 01/11.
    const weeks = monthGrid('2026-10', [], '2026-10-17');
    expect(weeks).toHaveLength(5);
    expect(weeks[0][0]).toMatchObject({ date: '2026-09-28', day: 28, inMonth: false });
    expect(weeks[0][3]).toMatchObject({ date: '2026-10-01', inMonth: true });
    expect(weeks[4][6]).toMatchObject({ date: '2026-11-01', inMonth: false });
    expect(weeks.flat().filter((d) => d.isToday).map((d) => d.date)).toEqual(['2026-10-17']);
    // Février 2027 commence un lundi et finit un dimanche : exactement 4 semaines.
    expect(monthGrid('2027-02', [], '2026-10-17')).toHaveLength(4);
  });

  it('range les séances par jour, le matin avant le soir', () => {
    const evening = sessionLog('2026-10-17', { moment: 'evening', startedAt: 2 });
    const morning = sessionLog('2026-10-17', { moment: 'morning', startedAt: 3 });
    const other = sessionLog('2026-10-07', { moment: 'evening' });
    const days = monthGrid('2026-10', [evening, other, morning], '2026-10-17').flat();
    expect(days.find((d) => d.date === '2026-10-17')?.sessions.map((s) => s.id)).toEqual([morning.id, evening.id]);
    expect(days.find((d) => d.date === '2026-10-07')?.sessions).toEqual([other]);
    expect(monthSummary('2026-10', [evening, other, morning, sessionLog('2026-11-02')])).toEqual({ sessions: 3, days: 2 });
  });
});
