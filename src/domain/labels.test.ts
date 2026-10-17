import { describe, expect, it } from 'vitest';
import { expressName, formatClock, formatDayMonth, formatRelativeDay, formatDuration, formatDurationRange, formatRange, formatRest, restParts, formatSetValue, formatTarget, formatValue, formatValueList } from './labels';

describe('formats', () => {
  it('accorde les unités', () => {
    expect(formatTarget({ unit: 'reps', min: 1, max: 1 })).toBe('1 rep');
    expect(formatTarget({ unit: 'reps', min: 3, max: 5 })).toBe('3-5 reps');
    expect(formatTarget({ unit: 'seconds', min: 3, max: 6 })).toBe('3-6 s');
    expect(formatTarget({ unit: 'combos', min: 1, max: 3 })).toBe('1-3 combos');
    expect(formatValue(1, 'reps')).toBe('1 rep');
    expect(formatValue(10, 'seconds')).toBe('10 s');
  });

  it('abrège une date en jour et mois', () => {
    expect(formatDayMonth('2026-10-07')).toBe('07/10');
  });

  it('formate repos et durées', () => {
    expect(formatRest(null, null)).toBe('Libre');
    expect(formatRest(90, 120)).toBe('1 min 30 – 2 min');
    expect(formatRest(60, 60)).toBe('1 min');
    expect(formatDuration(17 * 60)).toBe('17 min');
    expect(formatDuration(86 * 60)).toBe('1 h 26');
  });

  it('formate le chronomètre', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(5.9)).toBe('0:05');
    expect(formatClock(90)).toBe('1:30');
    expect(formatClock(-3)).toBe('0:00');
  });

  it('formate les valeurs des séries', () => {
    expect(formatSetValue(4, 'seconds')).toBe('4 s');
    expect(formatSetValue(null, 'reps')).toBe('—');
    expect(formatSetValue(null, 'none')).toBe('fait');
    expect(formatValueList([3, 3, 2, 2], 'reps')).toBe('3 ; 3 ; 2 ; 2 reps');
    expect(formatValueList([1, 1], 'reps')).toBe('1 ; 1 rep');
    expect(formatValueList([7, null, 4], 'seconds')).toBe('7 ; – ; 4 s');
    expect(formatValueList([null, null], 'none')).toBe('2 séries');
  });

  it('donne une fourchette de durée et de valeurs', () => {
    expect(formatDurationRange(17 * 60, 25 * 60)).toBe('17 à 25 min');
    expect(formatDurationRange(46 * 60, 66 * 60)).toBe('46 min à 1 h 06');
    expect(formatDurationRange(25 * 60, 25 * 60)).toBe('25 min');
    expect(formatRange(8, 9)).toBe('8-9');
    expect(formatRange(null, 6)).toBe('≤ 6');
    expect(formatRange(4, 4)).toBe('4');
    expect(formatRange(null, null)).toBe('');
    expect(restParts(120, 120)).toEqual(['2 min']);
    expect(restParts(150, 180)).toEqual(['2 min 30', '3 min']);
    expect(restParts(null, null)).toEqual(['Libre']);
    expect(restParts(90, 120)).toEqual(['90 s', '2 min']);
    expect(restParts(60, 90)).toEqual(['60-90 s']);
  });
});

describe('jours relatifs et séance express', () => {
  it('« aujourd’hui », « hier », le jour de la semaine, puis la date', () => {
    expect(formatRelativeDay('2026-10-17', '2026-10-17')).toBe('aujourd’hui');
    expect(formatRelativeDay('2026-10-16', '2026-10-17')).toBe('hier');
    expect(formatRelativeDay('2026-10-14', '2026-10-17')).toBe('mercredi');
    expect(formatRelativeDay('2026-10-10', '2026-10-17')).toBe('10/10');
  });

  it('nomme une séance express d’après la durée et la séance remplacée', () => {
    expect(expressName(30, 'Max')).toBe('Express 30 min · Max');
  });
});
