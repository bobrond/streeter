import { describe, expect, it } from 'vitest';
import { holdResult, holdSignals, holdView, restSignals, restView, strongestSignal } from './timers';
import type { HoldTimer, RestTimer } from './types';

const T0 = 1_000_000;
const hold: HoldTimer = { itemId: 'i', startedAt: T0, countdownSec: 3, targetSec: 5 };

describe('minuteur de hold', () => {
  it('décompte 3, 2, 1 puis compte les secondes tenues', () => {
    expect(holdView(hold, T0)).toEqual({ phase: 'countdown', count: 3 });
    expect(holdView(hold, T0 + 1500)).toEqual({ phase: 'countdown', count: 2 });
    expect(holdView(hold, T0 + 2999)).toEqual({ phase: 'countdown', count: 1 });
    expect(holdView(hold, T0 + 3000)).toMatchObject({ phase: 'running', seconds: 0, targetReached: false });
    expect(holdView(hold, T0 + 7999)).toMatchObject({ phase: 'running', seconds: 4, targetReached: false });
    expect(holdView(hold, T0 + 8000)).toMatchObject({ phase: 'running', seconds: 5, targetReached: true });
  });

  it('reporte les secondes entières tenues, 0 si arrêté pendant le décompte', () => {
    expect(holdResult(hold, T0 + 2000)).toBe(0);
    expect(holdResult(hold, T0 + 9700)).toBe(6);
  });

  it('émet un bip par seconde du décompte, le départ, chaque seconde et un bip distinct à la cible', () => {
    expect(holdSignals(hold, T0 - 1, T0 + 3000)).toEqual(['count', 'count', 'count', 'go']);
    expect(holdSignals(hold, T0 + 3000, T0 + 7000)).toEqual(['tick', 'tick', 'tick', 'tick']);
    expect(holdSignals(hold, T0 + 7000, T0 + 8000)).toEqual(['target']);
    expect(holdSignals(hold, T0 + 8000, T0 + 8500)).toEqual([]);
    expect(holdSignals(hold, T0 + 8500, T0 + 9000)).toEqual(['tick']);
  });

  it('ne répète pas un signal déjà passé', () => {
    expect(holdSignals(hold, T0 + 4000, T0 + 4999)).toEqual([]);
  });
});

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

  it('repousse la fin avec « +30 s »', () => {
    const extended: RestTimer = { ...range, extraSec: 30 };
    expect(restView(extended, T0 + 125_000)).toMatchObject({ phase: 'can_go', remainingMs: 25_000 });
    expect(restSignals(extended, T0 + 120_000, T0 + 150_000)).toContain('rest_end');
  });

  it('est un simple chronomètre en repos libre', () => {
    const free: RestTimer = { itemId: 'i', startedAt: T0, minSec: null, maxSec: null, extraSec: 0 };
    expect(restView(free, T0 + 42_000)).toEqual({ phase: 'free', elapsedMs: 42_000, endMs: null, minMs: null, remainingMs: null });
    expect(restSignals(free, T0, T0 + 600_000)).toEqual([]);
  });
});

describe('strongestSignal', () => {
  it('ne joue que le signal le plus important d’un lot', () => {
    expect(strongestSignal(['tick', 'tick', 'target'])).toBe('target');
    expect(strongestSignal(['rest_soon', 'rest_end'])).toBe('rest_end');
    expect(strongestSignal([])).toBeNull();
  });
});
