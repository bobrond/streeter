import { describe, expect, it } from 'vitest';
import { parseIntensity, parseRest, parseSeqDay, parseTargets, parseYes } from './parse';

describe('parseTargets', () => {
  it.each([
    ['8-10 reps lentes', [{ unit: 'reps', min: 8, max: 10 }]],
    ['3-6 s', [{ unit: 'seconds', min: 3, max: 6 }]],
    ['1 (singles)', [{ unit: 'reps', min: 1, max: 1 }]],
    ['2-4 reps', [{ unit: 'reps', min: 2, max: 4 }]],
    ['3 reps', [{ unit: 'reps', min: 3, max: 3 }]],
    ['2-3 s', [{ unit: 'seconds', min: 2, max: 3 }]],
    ['1-3 combos', [{ unit: 'combos', min: 1, max: 3 }]],
    [
      '8-12 s ou 3-5 reps',
      [
        { unit: 'seconds', min: 8, max: 12 },
        { unit: 'reps', min: 3, max: 5 },
      ],
    ],
    [
      '5-8 reps ou 8-15 s',
      [
        { unit: 'reps', min: 5, max: 8 },
        { unit: 'seconds', min: 8, max: 15 },
      ],
    ],
    [
      '8-15 reps ou 15-30 s',
      [
        { unit: 'reps', min: 8, max: 15 },
        { unit: 'seconds', min: 15, max: 30 },
      ],
    ],
  ])('« %s »', (text, expected) => {
    expect(parseTargets(text)).toEqual(expected);
  });

  it('renvoie une liste vide pour « — » et « Au choix »', () => {
    expect(parseTargets('—')).toEqual([]);
    expect(parseTargets('Au choix')).toEqual([]);
    expect(parseTargets('')).toEqual([]);
  });
});

describe('parseIntensity', () => {
  it.each([
    ['RPE ≤ 5', { kind: 'rpe', min: null, max: 5 }],
    ['RPE ≤ 6', { kind: 'rpe', min: null, max: 6 }],
    ['RPE 8-9', { kind: 'rpe', min: 8, max: 9 }],
    ['RPE 8', { kind: 'rpe', min: 8, max: 8 }],
    ['RPE 6-7', { kind: 'rpe', min: 6, max: 7 }],
    ['1-2 reps en réserve', { kind: 'rir', min: 1, max: 2 }],
    ['2 reps en réserve', { kind: 'rir', min: 2, max: 2 }],
  ])('« %s »', (text, expected) => {
    expect(parseIntensity(text)).toEqual(expected);
  });

  it('renvoie null pour « — »', () => {
    expect(parseIntensity('—')).toBeNull();
  });
});

describe('parseRest', () => {
  it.each([
    ['Libre', { minSec: null, maxSec: null, superset: false }],
    ['—', { minSec: null, maxSec: null, superset: false }],
    ['90 s', { minSec: 90, maxSec: 90, superset: false }],
    ['2 min', { minSec: 120, maxSec: 120, superset: false }],
    ['90 s-2 min', { minSec: 90, maxSec: 120, superset: false }],
    ['Superset, 60-90 s', { minSec: 60, maxSec: 90, superset: true }],
  ])('« %s »', (text, expected) => {
    expect(parseRest(text)).toEqual(expected);
  });
});

describe('parseSeqDay', () => {
  it('normalise « J3 », « 3 » et 3', () => {
    expect(parseSeqDay('J3')).toBe(3);
    expect(parseSeqDay('j7')).toBe(7);
    expect(parseSeqDay('3')).toBe(3);
    expect(parseSeqDay(3)).toBe(3);
    expect(parseSeqDay(' J 1 ')).toBe(1);
  });

  it('refuse ce qui n’est pas un jour J1…J7', () => {
    expect(parseSeqDay('J8')).toBeNull();
    expect(parseSeqDay('lundi')).toBeNull();
    expect(parseSeqDay(null)).toBeNull();
  });
});

describe('parseYes', () => {
  it('lit Oui / Non', () => {
    expect(parseYes('Oui')).toBe(true);
    expect(parseYes('Non')).toBe(false);
    expect(parseYes(null)).toBe(false);
  });
});
