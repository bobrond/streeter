import { describe, expect, it } from 'vitest';
import { settings } from '../test/builders';
import {
  addDays,
  dateOf,
  dayInfo,
  diffDays,
  isObjectiveTestDay,
  isObjectiveTestWeek,
  localISODate,
  shiftedStartDate,
  weekdayOf,
} from './cycle';

// Début réel : lundi 05/10/2026 (semaine 1, J3 le mercredi 07/10 dans le Journal).
const s = settings({ cycleStartDate: '2026-10-05', cycleLengthWeeks: 4, deloadWeek: 4 });

describe('arithmétique de dates calendaires', () => {
  it('ajoute des jours à travers les mois et le changement d’heure (25/10/2026)', () => {
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(diffDays('2026-10-05', '2026-11-02')).toBe(28);
  });

  it('donne le jour de la semaine (0 = dimanche)', () => {
    expect(weekdayOf('2026-10-05')).toBe(1);
    expect(weekdayOf('2026-10-11')).toBe(0);
  });

  it('formate une date locale', () => {
    expect(localISODate(new Date(2026, 9, 7, 23, 59))).toBe('2026-10-07');
  });
});

describe('dayInfo', () => {
  it('retrouve J3 de la semaine 1 le mercredi 07/10/2026', () => {
    expect(dayInfo('2026-10-07', s)).toMatchObject({ seqDay: 3, week: 1, cycle: 1, cycleWeek: 1, isDeload: false });
  });

  it('enchaîne J7 puis J1 de la semaine suivante', () => {
    expect(dayInfo('2026-10-11', s)).toMatchObject({ seqDay: 7, week: 1 });
    expect(dayInfo('2026-10-12', s)).toMatchObject({ seqDay: 1, week: 2 });
  });

  it('place la semaine allégée en semaine 4', () => {
    expect(dayInfo('2026-10-26', s)).toMatchObject({ week: 4, cycleWeek: 4, isDeload: true });
    expect(dayInfo('2026-11-01', s)).toMatchObject({ week: 4, seqDay: 7, isDeload: true });
  });

  it('numérote les semaines en continu : la semaine 5 est la S1 du cycle 2', () => {
    expect(dayInfo('2026-11-02', s)).toMatchObject({ week: 5, cycle: 2, cycleWeek: 1, isDeload: false });
    expect(dayInfo('2026-11-23', s)).toMatchObject({ week: 8, cycle: 2, cycleWeek: 4, isDeload: true });
  });

  it('suit une durée de cycle et une semaine allégée paramétrées', () => {
    const custom = settings({ cycleStartDate: '2026-10-05', cycleLengthWeeks: 5, deloadWeek: 5 });
    expect(dayInfo('2026-10-26', custom)).toMatchObject({ cycleWeek: 4, isDeload: false });
    expect(dayInfo('2026-11-02', custom)).toMatchObject({ week: 5, cycle: 1, cycleWeek: 5, isDeload: true });
  });

  it('signale une date antérieure au début', () => {
    expect(dayInfo('2026-10-04', s)).toMatchObject({ beforeStart: true, seqDay: 7 });
  });

  it('retrouve la date d’un jour de séquence', () => {
    expect(dateOf(1, 3, s)).toBe('2026-10-07');
    expect(dateOf(5, 1, s)).toBe('2026-11-02');
  });
});

describe('décalage de la séquence', () => {
  it('« Passer au jour suivant » : aujourd’hui devient le jour de séquence suivant', () => {
    const shifted = { ...s, cycleStartDate: shiftedStartDate(s, 1) };
    expect(dayInfo('2026-10-07', shifted).seqDay).toBe(4);
  });

  it('« Reporter à demain » : demain reprend le jour de séquence d’aujourd’hui', () => {
    const shifted = { ...s, cycleStartDate: shiftedStartDate(s, -1) };
    expect(dayInfo('2026-10-08', shifted).seqDay).toBe(3);
  });
});

describe('test des objectifs', () => {
  it('a lieu en début de semaine 5, sur le premier jour Max', () => {
    expect(isObjectiveTestWeek(dayInfo('2026-11-02', s))).toBe(true);
    expect(isObjectiveTestDay(dayInfo('2026-11-02', s), 1)).toBe(true);
    expect(isObjectiveTestDay(dayInfo('2026-11-03', s), 1)).toBe(false);
  });

  it('n’a pas lieu pendant le premier cycle', () => {
    expect(isObjectiveTestWeek(dayInfo('2026-10-05', s))).toBe(false);
  });

  it('revient à chaque nouveau cycle (semaine 9)', () => {
    expect(isObjectiveTestDay(dayInfo('2026-11-30', s), 1)).toBe(true);
  });
});
