import type { AppData } from '../../db/hooks';
import { MOMENT_LABEL, UNIT_SHORT, formatDateLong, seqDayLabel } from '../../domain/labels';
import type { SetLog } from '../../domain/types';
import { Badge } from '../../ui/Badge';
import type { Lookups } from '../../db/lookups';

function distinct<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function JournalView({ data, lookups }: { data: AppData; lookups: Lookups }) {
  if (data.sessions.length === 0) return <p className="text-ink-2">Aucune séance.</p>;
  return (
    <div className="flex flex-col gap-3">
      {data.sessions.map((session) => {
        const groups: { key: string; sets: SetLog[] }[] = [];
        for (const set of data.sets) {
          if (set.sessionId !== session.id) continue;
          const key = `${set.blockTypeId}|${set.exerciseId}`;
          const group = groups.find((g) => g.key === key);
          if (group) group.sets.push(set);
          else groups.push({ key, sets: [set] });
        }
        return (
          <article key={session.id} className="rounded-xl bg-card-2 p-3">
            <header className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-lg font-semibold first-letter:uppercase">{formatDateLong(session.date)}</span>
              <span className="text-ink-2">
                {seqDayLabel(session.seqDay)} · {MOMENT_LABEL[session.moment]} · {session.sessionTypeName} · semaine {session.week}
              </span>
              {session.source === 'xlsx' && <Badge>tableur</Badge>}
            </header>
            <ul className="mt-2 divide-y divide-line">
              {groups.map(({ key, sets }) => {
                const exercise = lookups.exercises.get(sets[0].exerciseId);
                const unit = exercise && exercise.measure !== 'none' ? ` ${UNIT_SHORT[exercise.measure]}` : '';
                const values = sets.map((s) => s.value ?? '–').join(' ; ');
                const bands = distinct(sets.map((s) => (s.bandId ? lookups.bands.get(s.bandId)?.name : null)).filter(Boolean));
                const rpes = distinct(sets.map((s) => s.rpe).filter((r) => r !== null));
                const notes = sets.map((s) => s.note).filter(Boolean);
                return (
                  <li key={key} className="py-2">
                    <div className="text-sm text-ink-3">{lookups.blocks.get(sets[0].blockTypeId ?? '')?.name}</div>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="font-semibold">{exercise?.name}</span>
                      <span className="tabular-nums">
                        {values}
                        {unit}
                      </span>
                    </div>
                    <div className="text-ink-2">
                      {sets.length} série{sets.length > 1 ? 's' : ''}
                      {bands.length > 0 && ` · élastique ${bands.join(', ')}`}
                      {rpes.length > 0 && ` · RPE ${rpes.join(', ')}`}
                    </div>
                    {notes.map((note, i) => (
                      <p key={i} className="mt-1 text-ink-3 italic">
                        {note}
                      </p>
                    ))}
                  </li>
                );
              })}
            </ul>
          </article>
        );
      })}
    </div>
  );
}
