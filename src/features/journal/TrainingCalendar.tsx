// Calendrier des jours d'entraînement : une pastille par séance, à la couleur de son type de séance.
import { useState } from 'react';
import type { Lookups } from '../../db/lookups';
import { monthGrid, monthOf, monthSummary, shiftMonth, type CalendarDay } from '../../domain/calendar';
import { MOMENT_LABEL, formatDateLong } from '../../domain/labels';
import type { SessionLog } from '../../domain/types';
import { navigate } from '../../lib/router';
import { Badge } from '../../ui/Badge';
import { BackIcon, NextIcon } from '../../ui/icons';
import { Sheet } from '../../ui/Sheet';

const MONTH = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function Dot({ session, lookups }: { session: SessionLog; lookups: Lookups }) {
  const color = (session.sessionTypeId && lookups.sessionTypes.get(session.sessionTypeId)?.color) || 'var(--color-accent)';
  // Séance abandonnée : anneau seulement.
  return session.status === 'abandoned' ? (
    <span className="size-2.5 rounded-full border-2" style={{ borderColor: color }} aria-hidden />
  ) : (
    <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} aria-hidden />
  );
}

export function TrainingCalendar({
  month,
  today,
  sessions,
  lookups,
  onMonth,
}: {
  month: string;
  today: string;
  sessions: readonly SessionLog[];
  lookups: Lookups;
  onMonth: (month: string) => void;
}) {
  const [opened, setOpened] = useState<CalendarDay | null>(null);
  const weeks = monthGrid(month, sessions, today);
  const summary = monthSummary(month, sessions);
  const monthSessions = weeks.flat().flatMap((d) => (d.inMonth ? d.sessions : []));
  const types = [...new Set(monthSessions.map((s) => s.sessionTypeId))]
    .map((id) => (id ? lookups.sessionTypes.get(id) : undefined))
    .filter((t) => t !== undefined);
  const abandoned = monthSessions.some((s) => s.status === 'abandoned');

  const open = (day: CalendarDay) => {
    if (day.sessions.length === 1) navigate(`/journal/session/${day.sessions[0].id}`);
    else if (day.sessions.length > 1) setOpened(day);
  };

  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-line bg-card p-3" aria-label="Calendrier des entraînements">
      <div className="flex items-center gap-2">
        <button type="button" aria-label="Mois précédent" onClick={() => onMonth(shiftMonth(month, -1))} className="flex size-12 items-center justify-center rounded-xl border border-line active:bg-card-2">
          <BackIcon />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <div className="font-display text-2xl leading-none tracking-wide">{MONTH.format(new Date(`${month}-15T12:00:00`))}</div>
          <div className="mt-1 text-sm text-ink-2">
            {summary.days} jour{summary.days > 1 ? 's' : ''} d’entraînement · {summary.sessions} séance{summary.sessions > 1 ? 's' : ''}
          </div>
        </div>
        <button type="button" aria-label="Mois suivant" onClick={() => onMonth(shiftMonth(month, 1))} className="flex size-12 items-center justify-center rounded-xl border border-line active:bg-card-2">
          <NextIcon />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center" role="grid">
        {WEEKDAYS.map((label, i) => (
          <div key={i} className="pb-1 text-sm font-semibold text-ink-3" aria-hidden>
            {label}
          </div>
        ))}
        {weeks.flat().map((day) => {
          const trained = day.sessions.length > 0;
          return (
            <button
              key={day.date}
              type="button"
              role="gridcell"
              disabled={!trained}
              onClick={() => open(day)}
              aria-label={`${formatDateLong(day.date)}${trained ? ` : ${day.sessions.length} séance${day.sessions.length > 1 ? 's' : ''}` : ''}`}
              className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-base tabular-nums ${day.inMonth ? '' : 'opacity-40'} ${
                trained ? 'bg-card-2 font-bold text-ink active:bg-line' : 'text-ink-2'
              } ${day.isToday ? 'ring-2 ring-accent' : ''}`}
            >
              {day.day}
              {trained && (
                <span className="flex gap-0.5">
                  {day.sessions.slice(0, 3).map((s) => (
                    <Dot key={s.id} session={s} lookups={lookups} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {types.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-ink-2">
          {types.map((type) => (
            <span key={type.id} className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full" style={{ backgroundColor: type.color }} aria-hidden />
              {type.name}
            </span>
          ))}
          {abandoned && (
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full border-2 border-ink-3" aria-hidden />
              abandonnée
            </span>
          )}
        </div>
      )}
      {month !== monthOf(today) && (
        <button type="button" onClick={() => onMonth(monthOf(today))} className="min-h-11 self-center rounded-full border border-line px-4 font-semibold text-accent active:bg-card-2">
          Revenir à ce mois-ci
        </button>
      )}

      <Sheet open={opened !== null} onClose={() => setOpened(null)} title={opened ? formatDateLong(opened.date) : undefined}>
        <ul className="flex flex-col gap-1">
          {opened?.sessions.map((session) => (
            <li key={session.id}>
              <button
                type="button"
                onClick={() => {
                  setOpened(null);
                  navigate(`/journal/session/${session.id}`);
                }}
                className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 py-2 text-left active:bg-card-2"
              >
                <Dot session={session} lookups={lookups} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{session.templateSnapshot?.name ?? session.sessionTypeName}</span>
                  <span className="block text-ink-2">{MOMENT_LABEL[session.moment]}</span>
                </span>
                {session.status === 'abandoned' && <Badge tone="warn">abandonnée</Badge>}
                {session.status === 'in_progress' && <Badge tone="accent">en cours</Badge>}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </section>
  );
}
