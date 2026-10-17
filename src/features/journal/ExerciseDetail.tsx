import { useMemo } from 'react';
import type { AppData } from '../../db/hooks';
import { useLookups } from '../../db/lookups';
import { progressPoints, sessionLines } from '../../domain/journal';
import { exerciseUses } from '../../domain/editing';
import { MEASURE_LABEL, UNIT_SHORT, formatDateShort, formatSets, formatTarget, formatValueList } from '../../domain/labels';
import { bestSessionPerformance } from '../../domain/objectives';
import type { ID } from '../../domain/types';
import { goBack, navigate } from '../../lib/router';
import { Button } from '../../ui/Button';
import { NextIcon } from '../../ui/icons';
import { BandSwatch } from '../../ui/inputs';
import { LineChart, type ChartSeries } from '../../ui/LineChart';
import { Screen } from '../../ui/Screen';

/** Couleur de la série « sans élastique » : l'encre neutre (pas d'élastique = pas de couleur). */
const NO_BAND_COLOR = '#ffffff';

/** Fiche d'un exercice (Historique et bibliothèque de Programmes) ; `backTo` : écran de retour si on y arrive directement. */
export function ExerciseDetail({ data, exerciseId, backTo = '/journal?vue=exercices' }: { data: AppData; exerciseId: string; backTo?: string }) {
  const lookups = useLookups(data);
  const exercise = lookups.exercises.get(exerciseId);
  const sets = useMemo(() => data.sets.filter((s) => s.exerciseId === exerciseId), [data.sets, exerciseId]);

  const { bands, sessions } = lookups;
  const series = useMemo((): ChartSeries[] => {
    const byBand = new Map<ID | null, Map<string, number>>();
    for (const point of progressPoints(exerciseId, data.sets, sessions)) {
      const dates = byBand.get(point.bandId) ?? new Map<string, number>();
      dates.set(point.date, Math.max(dates.get(point.date) ?? 0, point.best));
      byBand.set(point.bandId, dates);
    }
    const order = (id: ID | null) => (id === null ? -1 : (bands.get(id)?.order ?? 99));
    return [...byBand.entries()]
      .sort((a, b) => order(a[0]) - order(b[0]))
      .map(([bandId, dates]) => {
        const band = bandId ? bands.get(bandId) : null;
        return {
          id: bandId ?? 'none',
          label: band ? `élastique ${band.name}` : 'sans élastique',
          shortLabel: band ? band.name : 'sans',
          color: band?.color ?? NO_BAND_COLOR,
          points: [...dates].map(([date, value]) => ({ date, value })),
        };
      });
  }, [data.sets, exerciseId, bands, sessions]);

  if (!exercise) {
    return (
      <Screen title="Exercice introuvable" onBack={() => goBack(backTo)}>
        <p className="text-ink-2">Cet exercice n’existe plus.</p>
      </Screen>
    );
  }

  const element = exercise.elementId ? lookups.elements.get(exercise.elementId) : undefined;
  const measured = exercise.measure !== 'none';
  const record = measured ? bestSessionPerformance(exercise.id, data.sets, lookups.sessions) : null;
  const sessionIds = [...new Set(sets.map((s) => s.sessionId))]
    .map((id) => lookups.sessions.get(id))
    .filter((s) => s !== undefined)
    .sort((a, b) => b.date.localeCompare(a.date));
  const last = sessionIds[0];
  const lastSets = last ? sets.filter((s) => s.sessionId === last.id) : [];
  const uses = exerciseUses(exercise.id, data.templates);

  return (
    <Screen
      title={exercise.name}
      subtitle={[element?.name, MEASURE_LABEL[exercise.measure], exercise.quick ? '⚡ rapide' : null, exercise.active ? null : 'désactivé'].filter(Boolean).join(' · ')}
      onBack={() => goBack(backTo)}
    >
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-card p-3">
          <div className="text-sm text-ink-2">Record sans élastique</div>
          <div className="text-3xl font-bold">{record ? formatValueList([record.value], exercise.measure) : '—'}</div>
          <div className="text-sm text-ink-3">{record ? `le ${formatDateShort(record.date)} · séries propres` : 'pas encore'}</div>
        </div>
        <div className="rounded-2xl bg-card p-3">
          <div className="text-sm text-ink-2">Dernière séance</div>
          <div className="text-xl font-bold tabular-nums">
            {last
              ? formatValueList(
                  lastSets.map((s) => s.value),
                  exercise.measure,
                )
              : '—'}
          </div>
          <div className="text-sm text-ink-3">
            {last ? `le ${formatDateShort(last.date)} · ${sessionIds.length} séance${sessionIds.length > 1 ? 's' : ''} en tout` : 'jamais fait'}
          </div>
        </div>
      </div>

      {measured && series.length > 0 && (
        <section className="rounded-2xl border border-line bg-card p-3">
          <h2 className="text-lg font-semibold">Meilleure série par séance</h2>
          <p className="mb-2 text-sm text-ink-2">Une courbe par élastique ; les séries dégradées ne comptent pas.</p>
          <LineChart series={series} unit={UNIT_SHORT[exercise.measure as 'reps' | 'seconds' | 'combos']} ariaLabel={`Progression sur ${exercise.name}`} />
        </section>
      )}

      <section className="flex flex-col gap-1.5">
        <h2 className="px-1 text-sm font-bold tracking-wide text-ink-3 uppercase">Historique</h2>
        <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
          {sessionIds.map((session) => {
            const lines = sessionLines(sets.filter((s) => s.sessionId === session.id));
            return (
              <button key={session.id} type="button" onClick={() => navigate(`/journal/session/${session.id}`)} className="flex w-full flex-col gap-1 px-4 py-3 text-left active:bg-card-2">
                <span className="text-ink-2">
                  {formatDateShort(session.date)} · {session.sessionTypeName}
                </span>
                {lines.map((line) => {
                  const bands = [...new Set(line.sets.map((s) => s.bandId))];
                  return (
                    <span key={line.blockTypeId ?? 'none'} className="flex items-center gap-2">
                      <span className="text-sm text-ink-3">{line.blockTypeId ? lookups.blocks.get(line.blockTypeId)?.name : ''}</span>
                      <span className="font-semibold tabular-nums">
                        {formatValueList(
                          line.sets.map((s) => s.value),
                          exercise.measure,
                        )}
                      </span>
                      {bands.map((id) => {
                        const band = id ? lookups.bands.get(id) : null;
                        return band ? <BandSwatch key={id} band={band} /> : null;
                      })}
                      {line.sets.some((s) => s.quality === 'degraded') && <span className="text-sm text-warn">dégradée</span>}
                    </span>
                  );
                })}
              </button>
            );
          })}
          {sessionIds.length === 0 && <p className="p-4 text-ink-2">Pas encore fait.</p>}
        </div>
      </section>

      <section className="flex flex-col gap-1.5">
        <h2 className="px-1 text-sm font-bold tracking-wide text-ink-3 uppercase">Dans le programme</h2>
        <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
          {uses.map(({ template, item }) => (
            <button key={item.id} type="button" onClick={() => navigate(`/programs/template/${template.id}`)} className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left active:bg-card-2">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{template.name}</span>
                <span className="block text-sm text-ink-2">
                  {[
                    lookups.blocks.get(item.blockTypeId)?.name,
                    `${formatSets(item.setsMin, item.setsMax)} séries`,
                    item.targets.map(formatTarget).join(' ou ') || item.targetText,
                    template.archived ? 'archivé' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              <NextIcon className="size-5 text-ink-3" />
            </button>
          ))}
          {uses.length === 0 && <p className="p-4 text-ink-2">Candidat dans aucune ligne de prescription.</p>}
        </div>
        <p className="px-1 text-sm text-ink-3">
          Temps par série : {exercise.workSecPerSet !== null ? `${exercise.workSecPerSet} s` : `${data.settings.avgWorkSecPerSet} s (réglage général)`}
        </p>
      </section>

      {exercise.notes && (
        <section className="rounded-2xl border border-line bg-card p-4">
          <h2 className="text-sm font-bold tracking-wide text-ink-3 uppercase">Notes techniques</h2>
          <p className="mt-1 whitespace-pre-line text-ink-2">{exercise.notes}</p>
        </section>
      )}

      <Button variant="secondary" onClick={() => navigate(`/programs/exercise/${exercise.id}/edit`)}>
        Modifier l’exercice
      </Button>
    </Screen>
  );
}
