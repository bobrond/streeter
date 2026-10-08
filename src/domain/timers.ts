// Minuteurs de hold et de repos, calculés à partir d'horodatages (jamais en accumulant des ticks).
import type { HoldTimer, RestTimer } from './types';

export type HoldView =
  | { phase: 'countdown'; /** 3, 2, 1 */ count: number }
  | { phase: 'running'; elapsedMs: number; /** Secondes entières tenues. */ seconds: number; targetReached: boolean };

export function holdView(hold: HoldTimer, now: number): HoldView {
  const sinceStart = Math.max(0, now - hold.startedAt);
  const countdownMs = hold.countdownSec * 1000;
  if (sinceStart < countdownMs) return { phase: 'countdown', count: hold.countdownSec - Math.floor(sinceStart / 1000) };
  const elapsedMs = sinceStart - countdownMs;
  const seconds = Math.floor(elapsedMs / 1000);
  return { phase: 'running', elapsedMs, seconds, targetReached: hold.targetSec !== null && seconds >= hold.targetSec };
}

/** Valeur reportée dans la série à l'arrêt : secondes entières tenues après le décompte. */
export function holdResult(hold: HoldTimer, now: number): number {
  const view = holdView(hold, now);
  return view.phase === 'running' ? view.seconds : 0;
}

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
  const endMs = (rest.maxSec + rest.extraSec) * 1000;
  const minMs = rest.minSec !== null && rest.minSec * 1000 < endMs ? rest.minSec * 1000 : null;
  const phase: RestPhase = elapsedMs >= endMs ? 'over' : minMs !== null && elapsedMs >= minMs ? 'can_go' : 'running';
  return { phase, elapsedMs, endMs, minMs, remainingMs: endMs - elapsedMs };
}

export type TimerSignal =
  /** Décompte du hold : 3, 2, 1. */
  | 'count'
  /** Début du hold. */
  | 'go'
  /** Chaque seconde de hold. */
  | 'tick'
  /** Cible du hold atteinte. */
  | 'target'
  /** Minimum d'une fourchette de repos atteint. */
  | 'rest_min'
  /** 3, 2, 1 secondes avant la fin du repos. */
  | 'rest_soon'
  /** Fin du repos. */
  | 'rest_end';

const inWindow = (t: number, from: number, to: number) => t > from && t <= to;

/** Signaux du hold dont l'instant est dans ]from, to]. */
export function holdSignals(hold: HoldTimer, from: number, to: number): TimerSignal[] {
  const signals: TimerSignal[] = [];
  for (let k = 0; k < hold.countdownSec; k++) if (inWindow(hold.startedAt + k * 1000, from, to)) signals.push('count');
  const go = hold.startedAt + hold.countdownSec * 1000;
  if (inWindow(go, from, to)) signals.push('go');
  const first = Math.max(1, Math.floor((from - go) / 1000) + 1);
  const last = Math.floor((to - go) / 1000);
  for (let s = first; s <= last; s++) signals.push(s === hold.targetSec ? 'target' : 'tick');
  return signals;
}

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

const PRIORITY: TimerSignal[] = ['target', 'rest_end', 'go', 'rest_min', 'tick', 'count', 'rest_soon'];

/** Le signal le plus important d'un lot (un seul son à la fois, même après une longue pause). */
export function strongestSignal(signals: readonly TimerSignal[]): TimerSignal | null {
  for (const signal of PRIORITY) if (signals.includes(signal)) return signal;
  return null;
}
