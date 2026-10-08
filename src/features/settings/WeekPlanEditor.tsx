import { useState } from 'react';
import { db } from '../../db/db';
import type { AppData } from '../../db/hooks';
import { useLookups } from '../../db/lookups';
import { setWeekSlot } from '../../db/programStore';
import { dateOf, dayInfo, localISODate } from '../../domain/cycle';
import { MOMENT_LABEL, VOLUME_STATUS_LABEL, seqDayLabel } from '../../domain/labels';
import { SEQ_DAYS, type ID, type Moment, type SeqDay } from '../../domain/types';
import { plannedComponentVolume } from '../../domain/volume';
import { useNow } from '../../lib/device';
import { goBack, navigate } from '../../lib/router';
import { Badge } from '../../ui/Badge';
import { CheckIcon } from '../../ui/icons';
import { Screen } from '../../ui/Screen';
import { Sheet } from '../../ui/Sheet';
import { ProgramChecks } from './ProgramChecks';

const SHORT_WEEKDAY = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' });

export function WeekPlanEditor({ data }: { data: AppData }) {
  const lookups = useLookups(data);
  const { settings } = data;
  const [editing, setEditing] = useState<{ day: SeqDay; moment: Moment } | null>(null);
  const today = localISODate(new Date(useNow(60_000)));
  const info = dayInfo(today, settings);
  const volume = plannedComponentVolume(lookups.program, settings);
  const choices = editing ? data.templates.filter((t) => t.moment === editing.moment).sort((a, b) => a.name.localeCompare(b.name)) : [];
  const current = editing ? settings.weekPlan[editing.day][editing.moment] : null;

  const choose = (templateId: ID | null) => {
    if (editing) void setWeekSlot(db, editing.day, editing.moment, templateId);
    setEditing(null);
  };

  return (
    <Screen title="Semaine type" subtitle="J1…J7 sont des jours de séquence, pas des jours de la semaine." onBack={() => goBack('/settings')}>
      <ProgramChecks program={lookups.program} settings={settings} lookups={lookups} />

      <section className="rounded-2xl border border-line bg-card p-3">
        <h2 className="mb-2 text-sm font-bold tracking-wide text-ink-3 uppercase">Volume prévu des composantes</h2>
        <table className="w-full text-left tabular-nums">
          <thead className="text-sm text-ink-3">
            <tr>
              <th className="py-1 font-semibold">Composante</th>
              <th className="py-1 text-right font-semibold">Soir</th>
              <th className="py-1 text-right font-semibold">Matin</th>
              <th className="py-1 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {volume.map((row) => (
              <tr key={row.elementId} className="border-t border-line">
                <td className="py-1.5">
                  {row.name}
                  {row.status !== 'ok' && <span className="block text-sm text-warn">{VOLUME_STATUS_LABEL[row.status]}</span>}
                </td>
                <td className="py-1.5 text-right">{row.eveningGuaranteed === row.eveningMax ? row.eveningMax : `${row.eveningGuaranteed}-${row.eveningMax}`}</td>
                <td className="py-1.5 text-right">{row.morningMax}</td>
                <td className={`py-1.5 text-right font-semibold ${row.status === 'ok' ? 'text-ok' : 'text-warn'}`}>{row.totalMax}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="flex flex-col gap-2">
        {SEQ_DAYS.map((day) => {
          const date = dateOf(Math.max(1, info.week), day, settings);
          return (
            <section key={day} className={`rounded-2xl border bg-card p-2 ${day === info.seqDay && !info.beforeStart ? 'border-accent' : 'border-line'}`}>
              <div className="flex items-baseline gap-2 px-2 pt-1">
                <span className="text-xl font-bold">{seqDayLabel(day)}</span>
                <span className="text-ink-2">{SHORT_WEEKDAY.format(new Date(`${date}T12:00:00`))}</span>
              </div>
              {(['morning', 'evening'] as const).map((moment) => {
                const template = lookups.templates.get(settings.weekPlan[day][moment] ?? '');
                const type = template ? lookups.sessionTypes.get(template.sessionTypeId) : undefined;
                return (
                  <button
                    key={moment}
                    type="button"
                    onClick={() => setEditing({ day, moment })}
                    className="mt-1 flex min-h-14 w-full items-center gap-3 rounded-xl bg-card-2 px-3 py-2 text-left active:scale-[0.99]"
                  >
                    <span className="w-12 shrink-0 text-ink-2">{MOMENT_LABEL[moment]}</span>
                    {template && <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: type?.color }} aria-hidden />}
                    <span className={`min-w-0 flex-1 ${template ? 'font-semibold' : 'text-ink-3'}`}>
                      {template?.name ?? (moment === 'evening' ? 'Repos' : 'Pas de séance')}
                    </span>
                    {template?.optional && <Badge>optionnel</Badge>}
                  </button>
                );
              })}
            </section>
          );
        })}
      </div>

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `${seqDayLabel(editing.day)} · ${MOMENT_LABEL[editing.moment].toLowerCase()}` : ''}
        footer={
          <button
            type="button"
            className="min-h-14 rounded-2xl border border-line bg-card-2 px-5 text-lg font-semibold"
            onClick={() => navigate('/settings/templates')}
          >
            Gérer les modèles de séance
          </button>
        }
      >
        <ul className="flex flex-col gap-1">
          {[{ id: null as ID | null, name: editing?.moment === 'evening' ? 'Repos' : 'Pas de séance', color: undefined as string | undefined }, ...choices.map((t) => ({ id: t.id as ID | null, name: t.name, color: lookups.sessionTypes.get(t.sessionTypeId)?.color }))].map(
            (choice) => (
              <li key={choice.id ?? 'none'}>
                <button
                  type="button"
                  onClick={() => choose(choice.id)}
                  className={`flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 text-left active:bg-card-2 ${choice.id === current ? 'bg-card-2' : ''}`}
                >
                  <span className="size-3.5 shrink-0 rounded-full" style={{ backgroundColor: choice.color ?? 'transparent' }} aria-hidden />
                  <span className={`flex-1 text-lg ${choice.id ? 'font-semibold' : 'text-ink-2'}`}>{choice.name}</span>
                  {choice.id === current && <CheckIcon className="size-6 text-accent" />}
                </button>
              </li>
            ),
          )}
        </ul>
        {choices.length === 0 && <p className="mt-3 text-ink-2">Aucun modèle de séance du {editing?.moment === 'morning' ? 'matin' : 'soir'}.</p>}
      </Sheet>
    </Screen>
  );
}
