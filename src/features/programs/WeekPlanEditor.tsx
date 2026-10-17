// Tous les créneaux de la semaine type (matin et soir de J1 à J7) et le volume prévu des composantes.
import { useState } from 'react';
import type { AppData } from '../../db/hooks';
import { useLookups } from '../../db/lookups';
import { dateOf, dayInfo, localISODate } from '../../domain/cycle';
import { MOMENT_LABEL, VOLUME_STATUS_LABEL, seqDayLabel } from '../../domain/labels';
import { SEQ_DAYS } from '../../domain/types';
import { plannedComponentVolume } from '../../domain/volume';
import { useNow } from '../../lib/device';
import { goBack } from '../../lib/router';
import { Badge } from '../../ui/Badge';
import { Screen } from '../../ui/Screen';
import { ProgramChecks } from './ProgramChecks';
import { SlotPickerSheet, type Slot } from './SlotPickerSheet';

const SHORT_WEEKDAY = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' });

export function WeekPlanEditor({ data }: { data: AppData }) {
  const lookups = useLookups(data);
  const { settings } = data;
  const [editing, setEditing] = useState<Slot | null>(null);
  const today = localISODate(new Date(useNow(60_000)));
  const info = dayInfo(today, settings);
  const volume = plannedComponentVolume(lookups.program, settings);

  return (
    <Screen title="Créneaux" subtitle="Matin et soir de J1 à J7 (jours de séquence, pas jours de la semaine)." onBack={() => goBack('/programs')}>
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

      <SlotPickerSheet slot={editing} onClose={() => setEditing(null)} data={data} lookups={lookups} />
    </Screen>
  );
}
