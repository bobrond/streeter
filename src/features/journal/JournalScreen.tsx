import { useState } from 'react';
import type { AppData } from '../../db/hooks';
import { useLookups, type Lookups } from '../../db/lookups';
import { isMonth, monthOf } from '../../domain/calendar';
import { localISODate } from '../../domain/cycle';
import { isFilterActive, journalEntries, loggedExerciseIds, sessionDurationSec, type JournalEntry, type JournalFilter } from '../../domain/journal';
import { MOMENT_LABEL, formatDateLong, formatDateShort, formatDuration, formatValueList, seqDayLabel } from '../../domain/labels';
import { bestSessionPerformance } from '../../domain/objectives';
import type { ID } from '../../domain/types';
import { navigate } from '../../lib/router';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { ChipSelect } from '../../ui/form';
import { CloseIcon } from '../../ui/icons';
import { ProgressNav } from '../../ui/ProgressNav';
import { Screen } from '../../ui/Screen';
import { Segmented } from '../../ui/Segmented';
import { Sheet } from '../../ui/Sheet';
import { ExportView } from '../settings/ExportView';
import { ExerciseDetail } from './ExerciseDetail';
import { SessionDetail } from './SessionDetail';
import { TrainingCalendar } from './TrainingCalendar';

const FILTER_KEYS = { exerciseId: 'exercice', elementId: 'element', blockTypeId: 'bloc', sessionTypeId: 'type' } as const;
type FilterKey = keyof typeof FILTER_KEYS;
type JournalView = 'sessions' | 'exercises';

interface JournalQuery {
  view: JournalView;
  filter: JournalFilter;
  /** Mois affiché par le calendrier (« AAAA-MM ») ; `null` : le mois en cours. */
  month: string | null;
}

function readQuery(path: string): JournalQuery {
  const params = new URLSearchParams(path.split('?')[1] ?? '');
  const filter: JournalFilter = {};
  for (const [key, param] of Object.entries(FILTER_KEYS) as [FilterKey, string][]) filter[key] = params.get(param);
  const month = params.get('mois');
  return { view: params.get('vue') === 'exercices' ? 'exercises' : 'sessions', filter, month: isMonth(month) ? month : null };
}

function writeQuery({ view, filter, month }: JournalQuery): string {
  const params = new URLSearchParams();
  if (view === 'exercises') params.set('vue', 'exercices');
  for (const [key, param] of Object.entries(FILTER_KEYS) as [FilterKey, string][]) {
    const value = filter[key];
    if (value) params.set(param, value);
  }
  if (month) params.set('mois', month);
  const query = params.toString();
  return query ? `/journal?${query}` : '/journal';
}

function SessionCard({ entry, lookups }: { entry: JournalEntry; lookups: Lookups }) {
  const { session, lines, setCount } = entry;
  const duration = sessionDurationSec(session);
  const shown = lines.slice(0, 5);
  return (
    <button type="button" onClick={() => navigate(`/journal/session/${session.id}`)} className="rounded-2xl border border-line bg-card p-3 text-left active:scale-[0.99]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-lg font-bold first-letter:uppercase">{formatDateLong(session.date)}</span>
        {session.source === 'xlsx' && <Badge>tableur</Badge>}
        {session.status === 'abandoned' && <Badge tone="warn">abandonnée</Badge>}
        {session.deload && <Badge tone="accent">allégée</Badge>}
      </div>
      <div className="text-ink-2">
        {seqDayLabel(session.seqDay)} · {MOMENT_LABEL[session.moment]} · {session.sessionTypeName} · semaine {session.week} · {setCount} série{setCount > 1 ? 's' : ''}
        {duration ? ` · ${formatDuration(duration)}` : ''}
      </div>
      <ul className="mt-2 flex flex-col gap-0.5">
        {shown.map((line) => {
          const exercise = lookups.exercises.get(line.exerciseId);
          return (
            <li key={`${line.blockTypeId}|${line.exerciseId}`} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate">{exercise?.name ?? '?'}</span>
              <span className="shrink-0 text-ink-2 tabular-nums">
                {formatValueList(
                  line.sets.map((s) => s.value),
                  exercise?.measure ?? 'reps',
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {lines.length > shown.length && <div className="mt-1 text-sm text-ink-3">+ {lines.length - shown.length} autres</div>}
    </button>
  );
}

function ExercisesList({ data, lookups }: { data: AppData; lookups: Lookups }) {
  const ids = loggedExerciseIds(data.sets);
  if (ids.length === 0) return <p className="text-ink-2">Aucun exercice dans le journal.</p>;
  return (
    <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
      {ids.map((id) => {
        const exercise = lookups.exercises.get(id);
        const sets = data.sets.filter((s) => s.exerciseId === id);
        const sessionCount = new Set(sets.map((s) => s.sessionId)).size;
        const last = sets.at(-1);
        const lastDate = last ? lookups.sessions.get(last.sessionId)?.date : undefined;
        const best = exercise && exercise.measure !== 'none' ? bestSessionPerformance(id, data.sets, lookups.sessions) : null;
        return (
          <button key={id} type="button" onClick={() => navigate(`/journal/exercise/${id}`)} className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left active:bg-card-2">
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-semibold">{exercise?.name ?? '?'}</span>
              <span className="block text-sm text-ink-2">
                {sessionCount} séance{sessionCount > 1 ? 's' : ''}
                {lastDate ? ` · dernière le ${formatDateShort(lastDate)}` : ''}
              </span>
            </span>
            {best && exercise && (
              <span className="shrink-0 text-right">
                <span className="block font-bold tabular-nums">{formatValueList([best.value], exercise.measure)}</span>
                <span className="block text-xs text-ink-3">record sans élastique</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function JournalList({ data, path }: { data: AppData; path: string }) {
  const lookups = useLookups(data);
  const query = readQuery(path);
  const { view, filter } = query;
  const today = localISODate(new Date());
  const [filterOpen, setFilterOpen] = useState(false);
  const entries = journalEntries(data.sessions, data.sets, filter);
  const update = (patch: Partial<JournalQuery>) => navigate(writeQuery({ ...query, ...patch }), { replace: true });
  const setFilter = (next: JournalFilter) => update({ filter: next });
  const exerciseOptions = loggedExerciseIds(data.sets)
    .map((id) => lookups.exercises.get(id))
    .filter((e) => e !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name));
  const activeFilters = (Object.keys(FILTER_KEYS) as FilterKey[])
    .filter((key) => filter[key])
    .map((key) => {
      const id = filter[key]!;
      const name =
        key === 'exerciseId'
          ? lookups.exercises.get(id)?.name
          : key === 'elementId'
            ? lookups.elements.get(id)?.name
            : key === 'blockTypeId'
              ? lookups.blocks.get(id)?.name
              : lookups.sessionTypes.get(id)?.name;
      return { key, name: name ?? '?' };
    });
  const totalSets = entries.reduce((sum, e) => sum + e.lines.reduce((n, l) => n + l.sets.length, 0), 0);

  return (
    <Screen title="Progression" nav={<ProgressNav current="history" />}>
      <Segmented
        label="Historique"
        options={[
          { value: 'sessions', label: 'Séances' },
          { value: 'exercises', label: 'Exercices' },
        ]}
        value={view}
        onChange={(v) => update({ view: v })}
      />

      {view === 'exercises' ? (
        <ExercisesList data={data} lookups={lookups} />
      ) : (
        <>
          <TrainingCalendar
            month={query.month ?? monthOf(today)}
            today={today}
            sessions={entries.map((e) => e.session)}
            lookups={lookups}
            onMonth={(month) => update({ month: month === monthOf(today) ? null : month })}
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => setFilterOpen(true)} className="min-h-11 rounded-full border border-accent/70 px-4 font-semibold text-accent active:bg-card-2">
              Filtrer
            </button>
            {activeFilters.map(({ key, name }) => (
              <span key={key} className="flex min-h-11 items-center gap-1 rounded-full border border-line bg-card-2 pr-1 pl-3">
                {name}
                <button
                  type="button"
                  aria-label={`Retirer le filtre ${name}`}
                  onClick={() => setFilter({ ...filter, [key]: null })}
                  className="flex size-9 items-center justify-center rounded-full text-ink-3 active:bg-line"
                >
                  <CloseIcon className="size-4" />
                </button>
              </span>
            ))}
          </div>
          <p className="text-ink-2">
            {entries.length} séance{entries.length > 1 ? 's' : ''}
            {isFilterActive(filter) ? ` · ${totalSets} série${totalSets > 1 ? 's' : ''} correspondantes` : ''}
          </p>
          {filter.exerciseId && (
            <Button variant="secondary" onClick={() => navigate(`/journal/exercise/${filter.exerciseId}`)}>
              Fiche de l’exercice et courbe de progression
            </Button>
          )}
          {entries.map((entry) => (
            <SessionCard key={entry.session.id} entry={entry} lookups={lookups} />
          ))}
          {entries.length === 0 && <p className="text-ink-2">Aucune séance{isFilterActive(filter) ? ' pour ce filtre' : ''}.</p>}
          <section className="mt-2 flex flex-col gap-2 rounded-2xl border border-line bg-card p-4">
            <h2 className="text-lg font-semibold">Exporter tout le journal</h2>
            <ExportView data={data} />
          </section>
        </>
      )}

      <Sheet open={filterOpen} onClose={() => setFilterOpen(false)} title="Filtrer le journal" footer={<Button onClick={() => setFilterOpen(false)}>Voir {entries.length} séance{entries.length > 1 ? 's' : ''}</Button>}>
        <div className="flex flex-col gap-5">
          <FilterGroup label="Exercice" value={filter.exerciseId ?? null} options={exerciseOptions} onChange={(exerciseId) => setFilter({ ...filter, exerciseId })} />
          <FilterGroup label="Élément" value={filter.elementId ?? null} options={data.elements} onChange={(elementId) => setFilter({ ...filter, elementId })} />
          <FilterGroup label="Bloc" value={filter.blockTypeId ?? null} options={data.blockTypes} onChange={(blockTypeId) => setFilter({ ...filter, blockTypeId })} />
          <FilterGroup label="Type de séance" value={filter.sessionTypeId ?? null} options={data.sessionTypes} onChange={(sessionTypeId) => setFilter({ ...filter, sessionTypeId })} />
        </div>
      </Sheet>
    </Screen>
  );
}

function FilterGroup({ label, value, options, onChange }: { label: string; value: ID | null; options: readonly { id: ID; name: string }[]; onChange: (id: ID | null) => void }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-sm font-bold tracking-wide text-ink-3 uppercase">{label}</h3>
      <ChipSelect value={value} onChange={onChange} options={[{ value: null as ID | null, label: 'Tous' }, ...options.map((o) => ({ value: o.id as ID | null, label: o.name }))]} />
    </section>
  );
}

/** Journal et ses sous-écrans : #/journal, #/journal/session/:id, #/journal/exercise/:id. */
export function JournalScreen({ data, path }: { data: AppData; path: string }) {
  const parts = path.split('?')[0].split('/').filter(Boolean);
  if (parts[1] === 'session' && parts[2]) return <SessionDetail key={parts[2]} data={data} sessionId={parts[2]} />;
  if (parts[1] === 'exercise' && parts[2]) return <ExerciseDetail key={parts[2]} data={data} exerciseId={parts[2]} />;
  return <JournalList data={data} path={path} />;
}
