import { useMemo } from 'react';
import type { AppData } from '../../db/hooks';
import { useLookups } from '../../db/lookups';
import { progressPoints, sessionLines } from '../../domain/journal';
import { MEASURE_LABEL, UNIT_SHORT, formatDateShort, formatValueList } from '../../domain/labels';
import { bestSessionPerformance } from '../../domain/objectives';
import type { ID } from '../../domain/types';
import { goBack, navigate } from '../../lib/router';
import { Button } from '../../ui/Button';
import { BandSwatch } from '../../ui/inputs';
import { LineChart, type ChartSeries } from '../../ui/LineChart';
import { Screen } from '../../ui/Screen';

/** Couleur de la série « sans élastique » : l'encre neutre (pas d'élastique = pas de couleur). */
const NO_BAND_COLOR = '#ffffff';

export function ExerciseDetail({ data, exerciseId }: { data: AppData; exerciseId: string }) {
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
      <Screen title="Exercice introuvable" onBack={() => goBack('/journal')}>
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

  return (
    <Screen title={exercise.name} subtitle={[element?.name, MEASURE_LABEL[exercise.measure]].filter(Boolean).join(' · ')} onBack={() => goBack('/journal?vue=exercices')}>
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

      <Button variant="secondary" onClick={() => navigate(`/settings/exercises/${exercise.id}`)}>
        Modifier l’exercice
      </Button>
    </Screen>
  );
}
