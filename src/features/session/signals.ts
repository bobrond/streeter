// Sons et vibrations des minuteurs : on ne regarde pas l'écran en planche.
import { useEffect, useRef } from 'react';
import { strongestSignal, type TimerSignal } from '../../domain/timers';
import { playTones, type Tone } from '../../lib/audio';
import { vibrate } from '../../lib/device';

const SIGNALS: Record<TimerSignal, { tones: Tone[]; vibrate?: number | number[] }> = {
  count: { tones: [{ freq: 880, ms: 120 }] },
  go: { tones: [{ freq: 1320, ms: 380 }], vibrate: 120 },
  tick: { tones: [{ freq: 1000, ms: 70, gain: 0.18 }] },
  // Cible atteinte : trois notes montantes, nettement différentes du bip des secondes.
  target: {
    tones: [
      { freq: 1320, ms: 140 },
      { freq: 1760, ms: 140, at: 170 },
      { freq: 2350, ms: 320, at: 340 },
    ],
    vibrate: [250, 100, 250],
  },
  rest_min: {
    tones: [
      { freq: 880, ms: 200 },
      { freq: 880, ms: 200, at: 300 },
    ],
    vibrate: [200, 100, 200],
  },
  rest_soon: { tones: [{ freq: 990, ms: 90, gain: 0.18 }] },
  rest_end: {
    tones: [
      { freq: 1320, ms: 250 },
      { freq: 1760, ms: 600, at: 300 },
    ],
    vibrate: [500, 150, 500],
  },
};

export function playSignal(signal: TimerSignal, sound: boolean): void {
  const { tones, vibrate: pattern } = SIGNALS[signal];
  if (sound) playTones(tones);
  if (pattern) vibrate(pattern);
}

/**
 * Joue les signaux d'un minuteur au fil du temps. Un minuteur qui vient d'être lancé joue
 * ses signaux depuis son début ; un minuteur repris (rechargement) ne rejoue pas les signaux passés.
 */
export function useTimerSignals<T extends { startedAt: number }>(
  timer: T | null,
  now: number,
  signalsBetween: (timer: T, from: number, to: number) => TimerSignal[],
  sound: boolean,
): void {
  const previous = useRef<{ timer: T | null; at: number }>({ timer: null, at: 0 });
  useEffect(() => {
    if (!timer) {
      previous.current = { timer: null, at: now };
      return;
    }
    if (previous.current.timer !== timer) {
      const fresh = now - timer.startedAt < 1500;
      previous.current = { timer, at: fresh ? timer.startedAt - 1 : now };
    }
    const signal = strongestSignal(signalsBetween(timer, previous.current.at, now));
    previous.current.at = now;
    if (signal) playSignal(signal, sound);
  }, [timer, now, signalsBetween, sound]);
}
