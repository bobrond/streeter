import { describe, expect, it } from 'vitest';
import { sessionLog, settings, template } from '../test/builders';
import { tranchePeriod } from './period';
import {
  firstTestPosition,
  nextSequenceTest,
  projectedCycleEnd,
  projectedDate,
  sequenceDayInfo,
  sequenceIds,
  sequenceState,
  sequenceWeekPlan,
  type SequenceInfo,
} from './sequence';
import type { SessionLog, SessionType } from './types';

// Novembre : 5 séances du soir par tranche, 4 tranches, la 4e allégée ; 2 matins par tranche.
const st = template('Séance type', 'evening', [], { sessionTypeId: 'type-st' });
const cl = template('Combo libre', 'evening', [], { sessionTypeId: 'type-cl' });
const st5 = template('Séance type 5', 'evening', [], { sessionTypeId: 'type-st' });
const matin = template('Matin', 'morning', [], { optional: true });
const plan = sequenceWeekPlan([st.id, cl.id, st.id, cl.id, st5.id], [matin.id, matin.id]);
const s = { ...settings({ cycleStartDate: '2026-10-01', weekPlan: plan, schedule: 'sequence', startDate: '2026-10-29' }), startDate: '2026-10-29' };

let clock = 0;
const evening = (date: string, status: SessionLog['status'] = 'done') => sessionLog(date, { moment: 'evening', status, startedAt: ++clock });
const morning = (date: string) => sessionLog(date, { moment: 'morning', status: 'done', startedAt: ++clock });

describe('séquence de séances', () => {
  it('range la séquence sur J1…Jn et la relit dans l’ordre', () => {
    expect(sequenceIds(plan, 'evening')).toEqual([st.id, cl.id, st.id, cl.id, st5.id]);
    expect(sequenceIds(plan, 'morning')).toEqual([matin.id, matin.id]);
    expect(plan[6]).toEqual({ morning: null, evening: null });
  });

  it('propose la séance qui suit la dernière faite, quel que soit le jour', () => {
    const sessions = [evening('2026-10-29'), evening('2026-10-30')];
    // Deux jours sans séance : la 3e séance reste à faire.
    const info = sequenceDayInfo('2026-11-02', s, sessions);
    expect(info).toMatchObject({ seqDay: 3, cycleWeek: 1, cycle: 1, isDeload: false, beforeStart: false });
    expect(info.sequence).toMatchObject({ index: 2, tranche: 0, length: 5, done: 2, slot: { evening: st.id, morning: matin.id } });
  });

  it('garde la séance du jour une fois faite, et la même après un abandon', () => {
    const done = [evening('2026-10-29'), evening('2026-10-30')];
    expect(sequenceDayInfo('2026-10-30', s, done).sequence).toMatchObject({ index: 1, done: 2, slot: { evening: cl.id } });
    const abandoned = [evening('2026-10-29'), evening('2026-10-30', 'abandoned')];
    expect(sequenceDayInfo('2026-10-30', s, abandoned).sequence).toMatchObject({ index: 1, done: 1 });
    expect(sequenceDayInfo('2026-10-31', s, abandoned).sequence).toMatchObject({ index: 1, slot: { evening: cl.id } });
    const running = [evening('2026-10-29'), evening('2026-10-30', 'in_progress')];
    expect(sequenceDayInfo('2026-10-30', s, running).sequence).toMatchObject({ index: 1, done: 1 });
  });

  it('compte les tranches en séances : la 4e est allégée, puis un nouveau cycle', () => {
    const fifteen = Array.from({ length: 15 }, (_, k) => evening(`2026-11-${String(k + 1).padStart(2, '0')}`));
    expect(sequenceDayInfo('2026-11-20', s, fifteen)).toMatchObject({ seqDay: 1, cycleWeek: 4, isDeload: true, sequence: { tranche: 3 } });
    const twenty = Array.from({ length: 20 }, (_, k) => evening(`2026-11-${String(k + 1).padStart(2, '0')}`));
    expect(sequenceDayInfo('2026-11-25', s, twenty)).toMatchObject({ seqDay: 1, cycle: 2, cycleWeek: 1, isDeload: false });
  });

  it('les matins sont hors séquence : 2 par tranche, sans faire avancer la séquence', () => {
    const sessions = [evening('2026-10-29'), morning('2026-10-30'), morning('2026-10-31')];
    const state = sequenceState(plan, sessions);
    expect(state.done).toBe(1);
    expect(sequenceDayInfo('2026-11-01', s, sessions).sequence.slot).toEqual({ evening: cl.id, morning: null });
    expect(sequenceDayInfo('2026-10-31', s, sessions).sequence.slot.morning).toBe(matin.id);
  });

  it('avant le début : la première séance, signalée', () => {
    expect(sequenceDayInfo('2026-10-28', s, [])).toMatchObject({ beforeStart: true, seqDay: 1 });
  });

  it('donne des dates indicatives : une tranche par semaine', () => {
    expect(projectedDate('2026-10-29', 5, 5)).toBe('2026-11-05');
    expect(projectedDate('2026-10-29', 1, 5)).toBe('2026-10-30');
    const info = sequenceDayInfo('2026-10-29', s, []) as SequenceInfo;
    expect(projectedCycleEnd(info, s)).toBe('2026-11-25');
  });

  it('teste les objectifs à la première séance d’un type « jour de test » de la première tranche', () => {
    const types = new Map<string, SessionType>([
      ['type-st', { id: 'type-st', name: 'Séance type', moment: 'evening', description: '', color: '#000000', isTestDay: false }],
      ['type-cl', { id: 'type-cl', name: 'Combo libre', moment: 'evening', description: '', color: '#000000', isTestDay: true }],
    ]);
    const templates = new Map([st, cl, st5].map((t) => [t.id, t]));
    expect(firstTestPosition(plan, templates, types)).toBe(2);
    const info = sequenceDayInfo('2026-10-30', s, [evening('2026-10-29')]) as SequenceInfo;
    expect(nextSequenceTest(info, s, 2)).toEqual({ date: '2026-10-30', index: 1 });
    const later = sequenceDayInfo('2026-11-02', s, [evening('2026-10-29'), evening('2026-10-30'), evening('2026-10-31')]) as SequenceInfo;
    expect(nextSequenceTest(later, s, 2)).toMatchObject({ index: 21 });
    expect(nextSequenceTest(later, s, null)).toBeNull();
  });

  it('suit une tranche : séances faites, prochaine, à venir, matins faits', () => {
    const sessions = [evening('2026-10-29'), morning('2026-10-30'), evening('2026-10-30')];
    const period = tranchePeriod(0, '2026-10-31', s, new Map([st, cl, st5, matin].map((t) => [t.id, t])), sessions);
    expect(period.kind).toBe('tranche');
    expect(period.days.map((d) => d.slots.evening.status)).toEqual(['done', 'done', 'today', 'upcoming', 'upcoming']);
    expect(period.days[2].date).toBe('2026-10-31');
    expect(period.days.map((d) => d.slots.morning.status)).toEqual(['done', 'upcoming', 'none', 'none', 'none']);
    expect([...period.sessionIds]).toHaveLength(3);
  });
});
