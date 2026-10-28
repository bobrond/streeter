// Onglet Séance sans séance en cours : lancer la séance prévue (ou une autre), revoir la dernière.
import { useEffect, useState } from 'react';
import type { AppData } from '../../db/hooks';
import { useLookups } from '../../db/lookups';
import { localISODate } from '../../domain/cycle';
import { estimateDuration } from '../../domain/duration';
import { sessionDurationSec } from '../../domain/journal';
import { MOMENT_LABEL, formatDateLong, formatDuration } from '../../domain/labels';
import type { SessionTemplate } from '../../domain/types';
import { useNow } from '../../lib/device';
import { navigate } from '../../lib/router';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { NextIcon, PlayIcon } from '../../ui/icons';
import { Screen } from '../../ui/Screen';
import { ChooseSessionSheet } from '../today/ChooseSessionSheet';
import { dayLabel, infoFor, pendingPlanned, plannedFor } from '../today/planned';
import { startTemplate } from '../today/startTemplate';

export function SessionLauncher({ data }: { data: AppData }) {
  const lookups = useLookups(data);
  const today = localISODate(new Date(useNow(60_000)));
  const info = infoFor(today, data);
  const active = data.sessions.find((s) => s.status === 'in_progress');
  const pending = pendingPlanned(plannedFor(info, data, lookups));
  const last = data.sessions.find((s) => s.status !== 'in_progress');
  const lastSets = last ? data.sets.filter((s) => s.sessionId === last.id).length : 0;
  const lastDuration = last ? sessionDurationSec(last) : null;
  const [choosing, setChoosing] = useState(false);

  // Une séance en cours s'affiche directement (lien direct, retour arrière…).
  useEffect(() => {
    if (active) navigate(`/session/${active.id}`, { replace: true });
  }, [active]);

  const start = (template: SessionTemplate) => void startTemplate(template, info, data, lookups, { replace: true });
  const estimate = pending ? estimateDuration(pending.practiced, data.settings, lookups) : null;

  return (
    <Screen
      title="Séance"
      actions={
        pending ? (
          <Button onClick={() => start(pending.template)}>
            <PlayIcon className="size-5" /> Commencer · {pending.template.name}
          </Button>
        ) : undefined
      }
    >
      <section className="rounded-2xl border border-line bg-card p-4">
        <p className="text-lg text-ink-2">Aucune séance en cours.</p>
        {pending ? (
          <>
            <div className="mt-3 font-semibold text-accent">
              Prévue aujourd’hui · {dayLabel(info, pending.moment)} · {MOMENT_LABEL[pending.moment]}
            </div>
            <h2 className="font-display text-3xl tracking-wide">{pending.template.name}</h2>
            {estimate && (
              <p className="text-ink-2">
                {formatDuration(estimate.minSec)} à {formatDuration(estimate.maxSec)}
                {info.isDeload ? ' · semaine allégée' : ''}
              </p>
            )}
          </>
        ) : (
          <p className="mt-2 text-ink-2">{info.beforeStart ? 'Le programme n’a pas commencé.' : 'Rien de prévu pour le reste de la journée.'}</p>
        )}
      </section>

      <Button variant="secondary" onClick={() => setChoosing(true)}>
        Choisir une autre séance
      </Button>

      {last && (
        <section className="flex flex-col gap-1.5">
          <h2 className="px-1 text-sm font-bold tracking-wide text-ink-3 uppercase">Dernière séance</h2>
          <button
            type="button"
            onClick={() => navigate(`/journal/session/${last.id}`)}
            className="flex min-h-16 items-center gap-3 rounded-2xl border border-line bg-card px-4 py-3 text-left active:bg-card-2"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-semibold first-letter:uppercase">{formatDateLong(last.date)}</span>
              <span className="block text-ink-2">
                {last.templateSnapshot?.name ?? last.sessionTypeName} · {lastSets} série{lastSets > 1 ? 's' : ''}
                {lastDuration ? ` · ${formatDuration(lastDuration)}` : ''}
              </span>
              <span className="block text-sm text-ink-3">Toucher pour revoir ou corriger une série</span>
            </span>
            {last.status === 'abandoned' && <Badge tone="warn">abandonnée</Badge>}
            <NextIcon className="size-5 text-ink-3" />
          </button>
        </section>
      )}

      <ChooseSessionSheet open={choosing} onClose={() => setChoosing(false)} data={data} lookups={lookups} onChoose={start} />
    </Screen>
  );
}
