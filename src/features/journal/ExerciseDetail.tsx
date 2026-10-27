import { useMemo } from 'react';
import type { AppData } from '../../db/hooks';
import { useLookups } from '../../db/lookups';
import { sessionLines } from '../../domain/journal';
import { exerciseUses } from '../../domain/editing';
import { MEASURE_LABEL, UNIT_SHORT, formatDateShort, formatSets, formatTarget, formatValueList } from '../../domain/labels';
import { bandRecords } from '../../domain/objectives';
import { goBack, navigate } from '../../lib/router';
import { Button } from '../../ui/Button';
import { NextIcon } from '../../ui/icons';
import { BandSwatch } from '../../ui/inputs';
import { LineChart } from '../../ui/LineChart';
import { Screen } from '../../ui/Screen';
import { BandLadder } from '../objectives/BandLadder';
import { bandSeries } from '../objectives/bandSeries';

/** Fiche d'un exercice (Historique et bibliothèque de Programmes) ; `backTo` : écran de retour si on y arrive directement. */
export function ExerciseDetail({ data, exerciseId, backTo = '/journal?vue=exercices' }: { data: AppData; exerciseId: string; backTo?: string }) {
  const lookups = useLookups(data);
  const exercise = lookups.exercises.get(exerciseId);
  const sets = useMemo(() => data.sets.filter((s) => s.exerciseId === exerciseId), [data.sets, exerciseId]);

  const { bands, sessions } = lookups;
  const series = useMemo(() => bandSeries(exerciseId, data.sets, sessions, bands), [data.sets, exerciseId, bands, sessions]);
  const records = useMemo(() => bandRecords(exerciseId, data.sets, sessions), [data.sets, exerciseId, sessions]);

  if (!exercise) {
    return (
      <Screen title="Exercice introuvable" onBack={() => goBack(backTo)}>
        <p className="text-ink-2">Cet exercice n’existe plus.</p>
      </Screen>
    );
  }

  const element = exercise.elementId ? lookups.elements.get(exercise.elementId) : undefined;
  const measured = exercise.measure !== 'none';
  const record = measured ? (records.get(null) ?? null) : null;
  const sessionIds = [...new Set(sets.map((s) => s.sessionId))]
    .map((id) => lookups.sessions.get(id))
    .filter((s) => s !== undefined)
    .sort((a, b) => b.date.localeCompare(a.date));
  const last = sessionIds[0];
  const lastSets = last ? sets.filter((s) => s.sessionId === last.id) : [];
  const uses = exerciseUses(exercise.id, data.templates.filter((t) => t.programId === data.program.id));

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

      {measured && [...records.keys()].some((id) => id !== null) && (
        <section className="rounded-2xl border border-line bg-card p-3">
          <h2 className="mb-2 text-lg font-semibold">Records par élastique</h2>
          <BandLadder records={records} bands={data.bands} unit={exercise.measure as 'reps' | 'seconds' | 'combos'} dates />
        </section>
      )}

      {measured && series.length > 0 && (
        <section className="rounded-2xl border border-line bg-card p-3">
          <h2 className="text-lg font-semibold">Meilleure série par séance</h2>
          <p className="mb-2 text-sm text-ink-2">Une courbe par élastique ; séries dégradées et d’échauffement exclues.</p>
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
