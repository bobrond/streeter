// Minuteur de repos, calculé à partir d'horodatages (jamais en accumulant des ticks).
import type { RestTimer } from './types';

export type RestPhase = 'free' | 'running' | 'can_go' | 'over';

export interface RestView {
  phase: RestPhase;
  elapsedMs: number;
  /** Fin du repos (max + ajouts), en ms depuis le début ; `null` en repos libre. */
  endMs: number | null;
  /** Premier signal (min d'une fourchette) ; `null` s'il n'y en a pas. */
  minMs: number | null;
  /** Temps restant avant la fin, négatif une fois dépassée ; `null` en repos libre. */
  remainingMs: number | null;
}

export function restView(rest: RestTimer, now: number): RestView {
  const elapsedMs = Math.max(0, now - rest.startedAt);
  if (rest.maxSec === null) return { phase: 'free', elapsedMs, endMs: null, minMs: null, remainingMs: null };
  const endMs = Math.max(0, rest.maxSec + rest.extraSec) * 1000;
  const minMs = rest.minSec !== null && rest.minSec * 1000 < endMs ? rest.minSec * 1000 : null;
  const phase: RestPhase = elapsedMs >= endMs ? 'over' : minMs !== null && elapsedMs >= minMs ? 'can_go' : 'running';
  return { phase, elapsedMs, endMs, minMs, remainingMs: endMs - elapsedMs };
}

/** « +15 s » / « −15 s » : déplace la fin du repos, jamais avant son début ; sans effet sur un repos libre. */
export function adjustRest(rest: RestTimer, deltaSec: number): RestTimer {
  if (rest.maxSec === null) return rest;
  return { ...rest, extraSec: Math.max(-rest.maxSec, rest.extraSec + deltaSec) };
}

export type TimerSignal =
  /** Minimum d'une fourchette de repos atteint. */
  | 'rest_min'
  /** 3, 2, 1 secondes avant la fin du repos. */
  | 'rest_soon'
  /** Fin du repos. */
  | 'rest_end';

const inWindow = (t: number, from: number, to: number) => t > from && t <= to;

/** Signaux du repos dont l'instant est dans ]from, to]. */
export function restSignals(rest: RestTimer, from: number, to: number): TimerSignal[] {
  const view = restView(rest, rest.startedAt);
  if (view.endMs === null) return [];
  const signals: TimerSignal[] = [];
  const end = rest.startedAt + view.endMs;
  if (view.minMs !== null && inWindow(rest.startedAt + view.minMs, from, to)) signals.push('rest_min');
  for (const before of [3000, 2000, 1000]) {
    const t = end - before;
    if (t > rest.startedAt + (view.minMs ?? 0) && inWindow(t, from, to)) signals.push('rest_soon');
  }
  if (inWindow(end, from, to)) signals.push('rest_end');
  return signals;
}

const PRIORITY: TimerSignal[] = ['rest_end', 'rest_min', 'rest_soon'];

/** Le signal le plus important d'un lot (un seul son à la fois, même après une longue pause). */
export function strongestSignal(signals: readonly TimerSignal[]): TimerSignal | null {
  for (const signal of PRIORITY) if (signals.includes(signal)) return signal;
  return null;
}
