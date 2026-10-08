import { describe, expect, it } from 'vitest';
import { item, sessionLog, settings, template, weekPlan } from '../test/builders';
import { weekProgress, weekRange } from './week';

const max = template('Max', 'evening', [item({ blockTypeId: 'b', elementId: 'e' })]);
const technique = template('Technique', 'evening', [item({ blockTypeId: 'b', elementId: 'e' })]);
const matinA = template('Matin A', 'morning', [item({ blockTypeId: 'b', elementId: 'e' })], { optional: true });
const templates = new Map([max, technique, matinA].map((t) => [t.id, t]));
const s = settings({
  cycleStartDate: '2026-10-05',
  weekPlan: weekPlan({ 1: { evening: max.id }, 3: { evening: technique.id }, 4: { morning: matinA.id }, 5: { evening: max.id } }),
});

describe('weekProgress', () => {
  it('croise la semaine type et les séances faites, par date', () => {
    const sessions = [
      sessionLog('2026-10-07', { moment: 'evening', status: 'done' }),
      sessionLog('2026-10-08', { moment: 'morning', status: 'in_progress' }),
    ];
    const days = weekProgress(1, '2026-10-08', s, templates, sessions);
    expect(days.map((d) => d.date)).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']);
    expect(days[0].slots.evening.status).toBe('missed');
    expect(days[1].slots.evening.status).toBe('none');
    expect(days[2].slots.evening.status).toBe('done');
    expect(days[3].slots.morning.status).toBe('in_progress');
    expect(days[3].isToday).toBe(true);
    expect(days[4].slots.evening.status).toBe('upcoming');
  });

  it('distingue une séance optionnelle sautée d’une séance manquée', () => {
    const days = weekProgress(1, '2026-10-09', s, templates, []);
    expect(days[3].slots.morning.status).toBe('skipped');
    expect(days[4].slots.evening.status).toBe('today');
  });

  it('montre une séance faite même si rien n’était prévu (choix ponctuel)', () => {
    const days = weekProgress(1, '2026-10-08', s, templates, [sessionLog('2026-10-06', { moment: 'evening', status: 'done' })]);
    expect(days[1].slots.evening.status).toBe('done');
  });

  it('masque les matins en semaine allégée', () => {
    const days = weekProgress(4, '2026-10-26', s, templates, []);
    expect(days[3].slots.morning.status).toBe('hidden');
  });

  it('donne les dates de la semaine', () => {
    expect(weekRange(2, s)).toEqual({ from: '2026-10-12', to: '2026-10-18' });
  });
});
