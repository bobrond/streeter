import { describe, expect, it } from 'vitest';
import { formatDuration, formatRest, formatTarget, formatValue } from './labels';

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
});
