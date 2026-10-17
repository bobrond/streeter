// Bibliothèque d'exercices (Programmes › Exercices) : recherche, filtres par nature (skills, composantes, autres)
// puis par élément, exercices regroupés par élément ; toucher un exercice ouvre sa fiche (celle de l'historique).
import { useMemo, useState } from 'react';
import type { AppData } from '../../db/hooks';
import { MEASURE_LABEL, formatDateShort } from '../../domain/labels';
import { elementsOfKind, filterLibrary, type KindFilter } from '../../domain/library';
import type { Exercise, ID } from '../../domain/types';
import { navigate, queryParam } from '../../lib/router';
import { Button } from '../../ui/Button';
import { ListGroup, ListRow, TextInput } from '../../ui/form';
import { ChevronDownIcon, PlusIcon } from '../../ui/icons';
import { Screen } from '../../ui/Screen';
import { chipClass } from '../../ui/styles';
import { PROGRAMS_EXERCISES_PATH } from '../../ui/TabBar';
import { ProgramsNav, SettingsButton } from './ProgramsNav';

/** Valeurs de « ?nature= » dans l'adresse. */
const KIND_PARAMS: Record<Exclude<KindFilter, 'all'>, string> = { skill: 'skills', component: 'composantes', other: 'autres' };
const KIND_LABELS: Record<KindFilter, string> = { all: 'Tous', skill: 'Skills', component: 'Composantes', other: 'Autres' };

function readKind(path: string): KindFilter {
  const param = queryParam(path, 'nature');
  const kind = (Object.keys(KIND_PARAMS) as (keyof typeof KIND_PARAMS)[]).find((k) => KIND_PARAMS[k] === param);
  return kind ?? 'all';
}

function libraryPath(kind: KindFilter, elementId: ID | null): string {
  const params = new URLSearchParams({ vue: 'exercices' });
  if (kind !== 'all') params.set('nature', KIND_PARAMS[kind]);
  if (elementId) params.set('element', elementId);
  return kind === 'all' && !elementId ? PROGRAMS_EXERCISES_PATH : `/programs?${params.toString()}`;
}

interface ExerciseStats {
  sessions: number;
  lastDate: string | null;
}

function ExerciseRow({ exercise, stats }: { exercise: Exercise; stats: ExerciseStats | undefined }) {
  const details = [
    MEASURE_LABEL[exercise.measure],
    stats ? `${stats.sessions} séance${stats.sessions > 1 ? 's' : ''}` : 'jamais fait',
    stats?.lastDate ? `dernière le ${formatDateShort(stats.lastDate)}` : null,
    exercise.workSecPerSet !== null ? `${exercise.workSecPerSet} s par série` : null,
  ].filter(Boolean);
  return (
    <ListRow
      title={
        <>
          {exercise.name}
          {exercise.quick && <span className="text-accent" aria-label="rapide"> ⚡</span>}
        </>
      }
      subtitle={<span className="text-sm">{details.join(' · ')}</span>}
      onClick={() => navigate(`/programs/exercise/${exercise.id}`)}
    />
  );
}

export function ExerciseLibrary({ data, path }: { data: AppData; path: string }) {
  const [query, setQuery] = useState('');
  const kind = readKind(path);
  const elementId = kind === 'all' ? null : queryParam(path, 'element');
  const library = filterLibrary(data.exercises, data.elements, { kind, elementId, query });
  const kindElements = kind === 'all' ? [] : elementsOfKind(data.elements, kind);
  const update = (nextKind: KindFilter, nextElement: ID | null) => navigate(libraryPath(nextKind, nextElement), { replace: true });

  const stats = useMemo(() => {
    const dates = new Map(data.sessions.map((s) => [s.id, s.date]));
    const byExercise = new Map<ID, { sessions: Set<ID>; lastDate: string | null }>();
    for (const set of data.sets) {
      const entry = byExercise.get(set.exerciseId) ?? { sessions: new Set<ID>(), lastDate: null };
      entry.sessions.add(set.sessionId);
      const date = dates.get(set.sessionId) ?? null;
      if (date && (!entry.lastDate || date > entry.lastDate)) entry.lastDate = date;
      byExercise.set(set.exerciseId, entry);
    }
    return new Map([...byExercise].map(([id, e]) => [id, { sessions: e.sessions.size, lastDate: e.lastDate }]));
  }, [data.sets, data.sessions]);

  return (
    <Screen
      title="Programmes"
      aside={<SettingsButton />}
      nav={<ProgramsNav current="exercises" />}
      actions={
        <Button onClick={() => navigate(`/programs/exercise/new${elementId ? `?element=${elementId}` : ''}`)}>
          <PlusIcon /> Nouvel exercice
        </Button>
      }
    >
      <TextInput value={query} onChange={setQuery} placeholder="Rechercher un exercice" />
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Nature de l’élément">
        {(Object.keys(KIND_LABELS) as KindFilter[]).map((k) => (
          <button key={k} type="button" aria-pressed={k === kind} onClick={() => update(k, null)} className={chipClass(k === kind, 'min-h-11', 'text-base')}>
            {KIND_LABELS[k]}
          </button>
        ))}
      </div>
      {kindElements.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Élément">
          {kindElements.map((element) => (
            <button
              key={element.id}
              type="button"
              aria-pressed={element.id === elementId}
              onClick={() => update(kind, element.id === elementId ? null : element.id)}
              className={chipClass(element.id === elementId, 'min-h-11', 'text-sm')}
            >
              {element.name}
            </button>
          ))}
        </div>
      )}
      <p className="text-ink-2">
        {library.count} exercice{library.count > 1 ? 's' : ''}
        {query ? ` pour « ${query.trim()} »` : ''} · ⚡ = rapide (mis en avant le matin)
      </p>

      {library.groups.map((group) => (
        <ListGroup key={group.element?.id ?? 'aucun'} title={`${group.element?.name ?? 'Sans élément'} · ${group.exercises.length}`}>
          {group.exercises.map((exercise) => (
            <ExerciseRow key={exercise.id} exercise={exercise} stats={stats.get(exercise.id)} />
          ))}
        </ListGroup>
      ))}
      {library.count === 0 && <p className="text-ink-2">Aucun exercice trouvé.</p>}

      {library.inactive.length > 0 && (
        <details className="group/inactive">
          <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-1 text-sm font-bold tracking-wide text-ink-3 uppercase">
            Désactivés ({library.inactive.length}) <ChevronDownIcon className="size-4 transition-transform group-open/inactive:rotate-180" />
          </summary>
          <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
            {library.inactive.map((exercise) => (
              <ExerciseRow key={exercise.id} exercise={exercise} stats={stats.get(exercise.id)} />
            ))}
          </div>
        </details>
      )}
    </Screen>
  );
}
