import { useState } from 'react';
import { createPortal } from 'react-dom';
import { formatClock } from '../../domain/labels';
import { holdSignals, holdView, restSignals, restView } from '../../domain/timers';
import type { HoldTimer, RestTimer } from '../../domain/types';
import { useNow, vibrate } from '../../lib/device';
import { useTimerSignals } from './signals';

const PHASE_STYLE = {
  free: 'border-line',
  running: 'border-line',
  can_go: 'border-ok/70 bg-ok/10',
  over: 'border-warn/70 bg-warn/10',
} as const;

/** Repos : décompte jusqu'au maximum (signal au minimum d'une fourchette), chronomètre si « Libre ». */
export function RestBanner({
  rest,
  sound,
  onAdd,
  onSkip,
  onUndo,
}: {
  rest: RestTimer;
  sound: boolean;
  onAdd: () => void;
  onSkip: () => void;
  onUndo: () => void;
}) {
  const now = useNow(200);
  useTimerSignals(rest, now, restSignals, sound);
  const view = restView(rest, now);
  const remaining = view.remainingMs ?? 0;
  let clock: string;
  let label: string;
  if (view.phase === 'free') {
    clock = formatClock(view.elapsedMs / 1000);
    label = 'Repos libre';
  } else if (view.phase === 'over') {
    clock = `+${formatClock(-remaining / 1000)}`;
    label = 'Repos terminé';
  } else {
    clock = formatClock(Math.ceil(remaining / 1000));
    label =
      view.phase === 'can_go'
        ? 'Tu peux y aller'
        : view.minMs !== null
          ? `Repos · signal à ${formatClock(view.minMs / 1000)}`
          : 'Repos';
  }
  const progress = view.endMs ? Math.min(1, view.elapsedMs / view.endMs) : 0;
  const tone = view.phase === 'can_go' ? 'text-ok' : view.phase === 'over' ? 'text-warn' : 'text-ink';

  return (
    <section className={`mx-4 mb-2 rounded-2xl border px-3 pt-2 ${PHASE_STYLE[view.phase]}`} aria-live="polite" aria-label="Minuteur de repos">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className={`text-sm font-semibold ${view.phase === 'running' || view.phase === 'free' ? 'text-ink-2' : tone}`}>{label}</div>
          <div className={`text-5xl leading-none font-bold tabular-nums ${tone}`}>{clock}</div>
        </div>
        {view.phase !== 'free' && (
          <button type="button" onClick={onAdd} className="min-h-14 shrink-0 rounded-2xl border border-line bg-card-2 px-3 text-lg font-semibold active:scale-[0.97]">
            +30 s
          </button>
        )}
        <button type="button" onClick={onSkip} className="min-h-14 shrink-0 rounded-2xl border border-line bg-card-2 px-3 text-lg font-semibold active:scale-[0.97]">
          {view.phase === 'over' || view.phase === 'free' ? 'Fermer' : 'Passer'}
        </button>
      </div>
      <div className="flex min-h-11 items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
          {view.endMs !== null && (
            <div className={`h-full rounded-full ${view.phase === 'running' ? 'bg-ink-2' : view.phase === 'can_go' ? 'bg-ok' : 'bg-warn'}`} style={{ width: `${progress * 100}%` }} />
          )}
        </div>
        <button type="button" onClick={onUndo} className="min-h-11 shrink-0 px-1 text-sm font-semibold text-ink-3 underline underline-offset-4">
          Annuler la série
        </button>
      </div>
    </section>
  );
}

/** Minuteur de hold en plein écran : décompte de 3 s, comptage avec bips ; toucher n'importe où l'arrête. */
export function HoldOverlay({
  hold,
  sound,
  title,
  onStop,
  onCancel,
}: {
  hold: HoldTimer;
  sound: boolean;
  title: string;
  onStop: (stoppedAt: number) => void;
  onCancel: () => void;
}) {
  const now = useNow(50);
  const [stoppedAt, setStoppedAt] = useState<number | null>(null);
  useTimerSignals(stoppedAt === null ? hold : null, now, holdSignals, sound);
  const view = holdView(hold, stoppedAt ?? now);

  const stop = () => {
    if (stoppedAt !== null) return;
    const at = Date.now();
    setStoppedAt(at);
    vibrate(60);
    // L'écran reste affiché un instant : le toucher ne déclenche rien en dessous.
    window.setTimeout(() => onStop(at), 700);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex touch-none flex-col items-center justify-center bg-black select-none"
      onPointerDown={stop}
      role="timer"
      aria-label="Minuteur de hold"
    >
      <button
        type="button"
        className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 min-h-14 rounded-2xl border border-line bg-card px-5 text-lg font-semibold text-ink-2"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onCancel}
      >
        Annuler
      </button>
      <div className="px-6 text-center text-2xl font-semibold text-ink-2">{title}</div>
      {view.phase === 'countdown' ? (
        <div className="text-[45vw] leading-none font-black text-accent tabular-nums">{view.count}</div>
      ) : (
        <div className={`text-[45vw] leading-none font-black tabular-nums ${view.targetReached ? 'text-ok' : 'text-ink'}`}>{view.seconds}</div>
      )}
      <div className="text-2xl text-ink-2">
        {view.phase === 'countdown' ? 'Mets-toi en place' : hold.targetSec !== null ? `cible ${hold.targetSec} s` : 'secondes'}
      </div>
      <div className="absolute bottom-[max(2.5rem,env(safe-area-inset-bottom))] px-6 text-center text-xl font-semibold text-ink-3">
        {stoppedAt !== null ? (view.phase === 'running' ? `${view.seconds} s enregistrées` : 'Annulé') : 'Touche l’écran pour arrêter'}
      </div>
    </div>,
    document.body,
  );
}
