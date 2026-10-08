import { describe, expect, it } from 'vitest';
import { formatClock, formatDuration, formatRest, formatSetValue, formatTarget, formatValue, formatValueList } from './labels';

describe('formats', () => {
  it('accorde les unités', () => {
    expect(formatTarget({ unit: 'reps', min: 1, max: 1 })).toBe('1 rep');
    expect(formatTarget({ unit: 'reps', min: 3, max: 5 })).toBe('3-5 reps');
    expect(formatTarget({ unit: 'seconds', min: 3, max: 6 })).toBe('3-6 s');
    expect(formatTarget({ unit: 'combos', min: 1, max: 3 })).toBe('1-3 combos');
    expect(formatValue(1, 'reps')).toBe('1 rep');
    expect(formatValue(10, 'seconds')).toBe('10 s');
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
});
