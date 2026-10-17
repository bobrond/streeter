// Barre de la séance en cours, au-dessus des onglets hors de l'écran Séance : nom, chrono total, série à faire
// et repos ; un toucher rouvre la séance. Changer d'onglet ne perd jamais la séance.
import { useMemo } from 'react';
import type { AppData } from '../../db/hooks';
import type { Lookups } from '../../db/lookups';
import { formatClock } from '../../domain/labels';
import { buildPlan, proposeNext, readResume, tableProgress } from '../../domain/session';
import { restView } from '../../domain/timers';
import type { SessionLog } from '../../domain/types';
import { useNow } from '../../lib/device';
import { navigate } from '../../lib/router';
import { ChevronUpIcon } from '../../ui/icons';

/** Hauteur réservée au-dessus de la barre d'onglets quand la barre de séance est affichée. */
export const ACTIVE_BAR_SPACE = '4.75rem';

export function ActiveSessionBar({ session, data, lookups }: { session: SessionLog; data: AppData; lookups: Lookups }) {
  const now = useNow(1000);
  const resume = readResume(session.resume);
  const plan = useMemo(() => buildPlan(session.templateSnapshot ?? { items: [] }, lookups.blocks, lookups.elements), [session.templateSnapshot, lookups.blocks, lookups.elements]);
  // Même série proposée que dans le tableau de la séance.
  const progress = tableProgress(
    plan,
    data.sets.filter((s) => s.sessionId === session.id),
    resume.closedItems,
    resume.extraRows,
  );
  const itemId = proposeNext(plan, progress, resume.activeItemId);
  const item = itemId ? plan.itemsById.get(itemId) : undefined;
  const current = item ? `${lookups.elements.get(item.elementId)?.name ?? '?'}, série ${(progress.get(item.id)?.done ?? 0) + 1}` : 'séries prévues faites';
  const elapsed = session.startedAt ? (now - session.startedAt) / 1000 : 0;

  let rest: string | null = null;
  if (resume.rest) {
    const view = restView(resume.rest, now);
    rest =
      view.phase === 'free'
        ? `Libre ${formatClock(view.elapsedMs / 1000)}`
        : view.phase === 'over'
          ? 'Repos fini'
          : `Repos ${formatClock(Math.ceil((view.remainingMs ?? 0) / 1000))}`;
  }

  return (
    <button
      type="button"
      onClick={() => navigate(`/session/${session.id}`)}
      aria-label={`Rouvrir la séance ${session.templateSnapshot?.name ?? ''}`}
      className="fixed inset-x-2 bottom-[calc(4rem+env(safe-area-inset-bottom)+0.5rem)] z-30 mx-auto flex min-h-16 max-w-[calc(36rem-1rem)] items-center gap-3 rounded-xl bg-accent px-3.5 py-2 text-left text-accent-ink shadow-lg shadow-black active:scale-[0.99]"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-bold">{session.templateSnapshot?.name ?? session.sessionTypeName} en cours</span>
        <span className="block truncate text-sm font-semibold tabular-nums">
          {formatClock(elapsed)} · {current}
        </span>
      </span>
      {rest && <span className="shrink-0 rounded-lg bg-accent-ink px-2.5 py-1.5 text-sm font-bold text-accent tabular-nums">{rest}</span>}
      <ChevronUpIcon className="size-6 shrink-0" />
    </button>
  );
}
