import { formatClock } from '../../domain/labels';
import { restView } from '../../domain/timers';
import type { RestTimer } from '../../domain/types';
import { useNow } from '../../lib/device';

const PHASE_STYLE = {
  free: 'border-line bg-card',
  running: 'border-line bg-card',
  can_go: 'border-ok/70 bg-[#13261a]',
  over: 'border-warn/70 bg-[#2b2210]',
} as const;

/**
 * Repos, en bas de l'écran (zone du pouce) : décompte jusqu'au maximum, chronomètre si « Libre ».
 * Affichage seulement : les signaux (minimum d'une fourchette, fin) sont joués au niveau de l'appli.
 */
export function RestBar({ rest, label, onAdjust, onSkip }: { rest: RestTimer; label: string; onAdjust: (deltaSec: number) => void; onSkip: () => void }) {
  const now = useNow(200);
  const view = restView(rest, now);
  const remaining = view.remainingMs ?? 0;
  let clock: string;
  let title: string;
  if (view.phase === 'free') {
    clock = formatClock(view.elapsedMs / 1000);
    title = `Repos libre · ${label}`;
  } else if (view.phase === 'over') {
    clock = `+${formatClock(-remaining / 1000)}`;
    title = 'Repos terminé';
  } else {
    clock = formatClock(Math.ceil(remaining / 1000));
    title = view.phase === 'can_go' ? 'Tu peux y aller' : view.minMs !== null ? `Repos · ${label} · signal à ${formatClock(view.minMs / 1000)}` : `Repos · ${label}`;
  }
  const progress = view.endMs ? Math.min(1, view.elapsedMs / view.endMs) : 0;
  const tone = view.phase === 'can_go' ? 'text-ok' : view.phase === 'over' ? 'text-warn' : 'text-ink';
  const button = 'min-h-14 rounded-xl border border-line bg-card-2 text-lg font-semibold active:scale-[0.97]';

  return (
    <section
      className={`flex flex-col gap-2 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] ${PHASE_STYLE[view.phase]}`}
      aria-live="polite"
      aria-label="Minuteur de repos"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className={`min-w-0 truncate text-sm font-semibold ${view.phase === 'running' || view.phase === 'free' ? 'text-ink-2' : tone}`}>{title}</span>
        <span className={`shrink-0 text-5xl leading-none font-bold tabular-nums ${tone}`}>{clock}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-line">
        {view.endMs !== null && (
          <div className={`h-full rounded-full ${view.phase === 'running' ? 'bg-accent' : view.phase === 'can_go' ? 'bg-ok' : 'bg-warn'}`} style={{ width: `${progress * 100}%` }} />
        )}
      </div>
      {view.phase === 'free' ? (
        <button type="button" onClick={onSkip} className={button}>
          Fermer
        </button>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={() => onAdjust(-15)} className={button}>
            −15 s
          </button>
          <button type="button" onClick={() => onAdjust(15)} className={button}>
            +15 s
          </button>
          <button type="button" onClick={onSkip} className={`${button} border-ink bg-ink text-page`}>
            {view.phase === 'over' ? 'Fermer' : 'Passer'}
          </button>
        </div>
      )}
    </section>
  );
}
