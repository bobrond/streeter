import { describe, expect, it } from 'vitest';
import { adjustRest, restSignals, restView, strongestSignal } from './timers';
import type { RestTimer } from './types';

const T0 = 1_000_000;

describe('minuteur de repos', () => {
  const range: RestTimer = { itemId: 'i', startedAt: T0, minSec: 90, maxSec: 120, extraSec: 0 };

  it('signale le minimum de la fourchette puis la fin au maximum', () => {
    expect(restView(range, T0 + 10_000)).toMatchObject({ phase: 'running', remainingMs: 110_000 });
    expect(restView(range, T0 + 90_000)).toMatchObject({ phase: 'can_go' });
    expect(restView(range, T0 + 125_000)).toMatchObject({ phase: 'over', remainingMs: -5000 });
    expect(restSignals(range, T0, T0 + 90_000)).toEqual(['rest_min']);
    expect(restSignals(range, T0 + 90_000, T0 + 117_000)).toEqual(['rest_soon']);
    expect(restSignals(range, T0 + 117_000, T0 + 120_000)).toEqual(['rest_soon', 'rest_soon', 'rest_end']);
  });

  it('n’a qu’un signal de fin pour un repos fixe', () => {
    const fixed: RestTimer = { itemId: 'i', startedAt: T0, minSec: 90, maxSec: 90, extraSec: 0 };
    expect(restView(fixed, T0 + 89_000).phase).toBe('running');
    expect(restSignals(fixed, T0, T0 + 90_000)).toEqual(['rest_soon', 'rest_soon', 'rest_soon', 'rest_end']);
  });

  it('repousse ou avance la fin de 15 s, jamais avant le début du repos', () => {
    const longer = adjustRest(range, 15);
    expect(longer.extraSec).toBe(15);
    expect(restView(longer, T0 + 125_000)).toMatchObject({ phase: 'can_go', remainingMs: 10_000 });
    expect(restSignals(longer, T0 + 120_000, T0 + 135_000)).toContain('rest_end');
    const shorter = adjustRest(adjustRest(range, -15), -15);
    expect(restView(shorter, T0 + 90_000)).toMatchObject({ phase: 'over', endMs: 90_000 });
    let floor = range;
    for (let i = 0; i < 20; i++) floor = adjustRest(floor, -15);
    expect(floor.extraSec).toBe(-120);
    expect(restView(floor, T0)).toMatchObject({ phase: 'over', endMs: 0 });
  });

  it('est un simple chronomètre en repos libre, que ±15 s ne change pas', () => {
    const free: RestTimer = { itemId: 'i', startedAt: T0, minSec: null, maxSec: null, extraSec: 0 };
    expect(restView(free, T0 + 42_000)).toEqual({ phase: 'free', elapsedMs: 42_000, endMs: null, minMs: null, remainingMs: null });
    expect(restSignals(free, T0, T0 + 600_000)).toEqual([]);
    expect(adjustRest(free, 15)).toBe(free);
  });
});

describe('strongestSignal', () => {
  it('ne joue que le signal le plus important d’un lot', () => {
    expect(strongestSignal(['rest_soon', 'rest_min'])).toBe('rest_min');
    expect(strongestSignal(['rest_soon', 'rest_end'])).toBe('rest_end');
    expect(strongestSignal([])).toBeNull();
  });
});
