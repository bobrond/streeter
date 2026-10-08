import { useState } from 'react';
import type { AppData } from '../../db/hooks';
import { useLookups, type Lookups } from '../../db/lookups';
import { dayInfo, localISODate } from '../../domain/cycle';
import { deloadTemplate } from '../../domain/deload';
import { MOMENT_LABEL, VOLUME_STATUS_LABEL, formatDateShort, seqDayLabel } from '../../domain/labels';
import type { SessionTemplate } from '../../domain/types';
import { plannedComponentVolume, realizedComponentVolume, realizedSkillSets, skillTotals, type VolumeStatus } from '../../domain/volume';
import { weekProgress, weekRange, type SlotProgress, type SlotStatus } from '../../domain/week';
import { useNow } from '../../lib/device';
import { navigate } from '../../lib/router';
import { Badge, type Tone } from '../../ui/Badge';
import { BackIcon, NextIcon } from '../../ui/icons';
import { Screen } from '../../ui/Screen';
import { Sheet } from '../../ui/Sheet';
import { TemplateItems } from './TemplateItems';

const SHORT_WEEKDAY = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric' });

const SLOT_STATUS: Record<SlotStatus, { label: string; className: string }> = {
  done: { label: 'faite', className: 'text-ok' },
  in_progress: { label: 'en cours', className: 'text-accent' },
  abandoned: { label: 'abandonnée', className: 'text-warn' },
  missed: { label: 'manquée', className: 'text-danger' },
  skipped: { label: 'pas faite (optionnelle)', className: 'text-ink-3' },
  today: { label: 'aujourd’hui', className: 'text-accent' },
  upcoming: { label: 'à venir', className: 'text-ink-3' },
  hidden: { label: 'masquée (semaine allégée)', className: 'text-ink-3' },
  none: { label: '', className: 'text-ink-3' },
};

const STATUS_TONE: Record<VolumeStatus, Tone> = { ok: 'ok', under_min: 'danger', over_max: 'warn', deload: 'accent' };

function SlotRow({ slot, data, onPreview }: { slot: SlotProgress; data: AppData; onPreview: (template: SessionTemplate) => void }) {
  const session = slot.sessions.find((s) => s.status === 'done') ?? slot.sessions[0];
  const sets = session ? data.sets.filter((s) => s.sessionId === session.id).length : 0;
  const name = session ? (session.templateSnapshot?.name ?? session.sessionTypeName) : slot.planned?.name;
  if (!name && slot.moment === 'morning') return null;
  const status = SLOT_STATUS[slot.status];
  const onClick = () => {
    if (session && session.status === 'in_progress') navigate(`/session/${session.id}`);
    else if (session) navigate(`/journal/session/${session.id}`);
    else if (slot.planned) onPreview(slot.planned);
  };
  return (
    <button
      type="button"
      disabled={!session && !slot.planned}
      onClick={onClick}
      className="mt-1 flex min-h-14 w-full items-center gap-3 rounded-xl bg-card-2 px-3 py-2 text-left active:scale-[0.99] disabled:active:scale-100"
    >
      <span className="w-12 shrink-0 text-ink-2">{MOMENT_LABEL[slot.moment]}</span>
      <span className="min-w-0 flex-1">
        <span className={`block ${name ? 'font-semibold' : 'text-ink-3'} ${slot.status === 'hidden' || slot.status === 'skipped' ? 'text-ink-3' : ''}`}>{name ?? 'Repos'}</span>
        {status.label && (
          <span className={`block text-sm ${status.className}`}>
            {slot.status === 'done' ? `✓ faite · ${sets} série${sets > 1 ? 's' : ''}` : status.label}
          </span>
        )}
      </span>
    </button>
  );
}

function VolumeSection({ data, lookups, week, isDeload }: { data: AppData; lookups: Lookups; week: number; isDeload: boolean }) {
  const { settings } = data;
  const planned = plannedComponentVolume(lookups.program, settings);
  const realized = realizedComponentVolume(data.sets, lookups.sessions, data.elements, settings, { week, isDeload });
  return (
    <section className="rounded-2xl border border-line bg-card p-3">
      <h2 className="text-sm font-bold tracking-wide text-ink-3 uppercase">Volume des composantes</h2>
      <p className="mt-1 text-sm text-ink-2">
        Bornes {settings.volumeMin} à {settings.volumeMax} séries. Prévu : soir (minimum garanti) + matin (bonus).
      </p>
      <table className="mt-2 w-full text-left tabular-nums">
        <thead className="text-xs text-ink-3">
          <tr>
            <th className="py-1 font-semibold">Composante</th>
            <th className="py-1 text-right font-semibold">Prévu</th>
            <th className="py-1 text-right font-semibold">Fait</th>
          </tr>
        </thead>
        <tbody>
          {planned.map((row) => {
            const done = realized.find((r) => r.elementId === row.elementId);
            return (
              <tr key={row.elementId} className="border-t border-line align-top">
                <td className="py-2">
                  <div className="font-semibold">{row.name}</div>
                  {done && (
                    <div className="mt-1">
                      <Badge tone={STATUS_TONE[done.status]}>{VOLUME_STATUS_LABEL[done.status]}</Badge>
                    </div>
                  )}
                </td>
                <td className="py-2 text-right">
                  <div>
                    {isDeload ? row.deloadEvening : row.eveningGuaranteed === row.eveningMax ? row.eveningMax : `${row.eveningGuaranteed}-${row.eveningMax}`}
                    <span className="text-ink-3"> soir</span>
                  </div>
                  {!isDeload || !settings.hideMorningsInDeload ? (
                    <div>
                      {row.morningMax}
                      <span className="text-ink-3"> matin</span>
                    </div>
                  ) : null}
                </td>
                <td className="py-2 text-right">
                  <div>
                    {done?.evening ?? 0}
                    <span className="text-ink-3"> soir</span>
                  </div>
                  <div>
                    {done?.morning ?? 0}
                    <span className="text-ink-3"> matin</span>
                  </div>
                  <div className="font-bold">
                    {done?.total ?? 0}
                    <span className="font-normal text-ink-3"> total</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function SkillSection({ data, lookups, week }: { data: AppData; lookups: Lookups; week: number }) {
  const totals = skillTotals(lookups.program, data.settings);
  const realized = realizedSkillSets(data.sets, lookups.sessions, data.elements, week);
  return (
    <section className="rounded-2xl border border-line bg-card p-3">
      <h2 className="text-sm font-bold tracking-wide text-ink-3 uppercase">Totaux par skill</h2>
      <table className="mt-2 w-full text-left tabular-nums">
        <thead className="text-xs text-ink-3">
          <tr>
            <th className="py-1 font-semibold">Bloc · skill</th>
            <th className="py-1 text-right font-semibold">Séries</th>
            <th className="py-1 text-right font-semibold">Allégée</th>
            <th className="py-1 text-right font-semibold">Fait</th>
          </tr>
        </thead>
        <tbody>
          {totals.map((row) => (
            <tr key={`${row.blockTypeId}-${row.elementId}`} className="border-t border-line">
              <td className="py-2">
                <div className="font-semibold">{lookups.elements.get(row.elementId)?.name}</div>
                <div className="text-sm text-ink-2">
                  {lookups.blocks.get(row.blockTypeId)?.name} · {row.sessions} séance{row.sessions > 1 ? 's' : ''}
                </div>
              </td>
              <td className="py-2 text-right">
                {row.setsMin}-{row.setsMax}
              </td>
              <td className="py-2 text-right">{row.deloadMax}</td>
              <td className="py-2 text-right font-bold">{realized.get(`${row.blockTypeId}|${row.elementId}`) ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function WeekScreen({ data }: { data: AppData }) {
  const lookups = useLookups(data);
  const today = localISODate(new Date(useNow(60_000)));
  const current = dayInfo(today, data.settings);
  const [offset, setOffset] = useState(0);
  const [preview, setPreview] = useState<SessionTemplate | null>(null);
  const week = Math.max(1, current.week + offset);
  const range = weekRange(week, data.settings);
  const info = dayInfo(range.from, data.settings);
  const days = weekProgress(week, today, data.settings, lookups.templates, data.sessions);
  const previewTemplate = preview && info.isDeload ? deloadTemplate(preview, lookups.blocks, data.settings) : preview;

  return (
    <Screen
      title={`Semaine ${week}`}
      subtitle={`${formatDateShort(range.from)} → ${formatDateShort(range.to)} · cycle ${info.cycle} · S${info.cycleWeek}/${data.settings.cycleLengthWeeks}`}
      aside={
        <div className="flex gap-1">
          <button type="button" aria-label="Semaine précédente" disabled={week <= 1} onClick={() => setOffset(offset - 1)} className="flex size-12 items-center justify-center rounded-2xl border border-line active:bg-card-2 disabled:opacity-30">
            <BackIcon />
          </button>
          <button type="button" aria-label="Semaine suivante" onClick={() => setOffset(offset + 1)} className="flex size-12 items-center justify-center rounded-2xl border border-line active:bg-card-2">
            <NextIcon />
          </button>
        </div>
      }
    >
      {(info.isDeload || offset !== 0) && (
        <div className="flex flex-wrap gap-2">
          {info.isDeload && <Badge tone="accent">Semaine allégée</Badge>}
          {offset !== 0 && (
            <button type="button" onClick={() => setOffset(0)} className="min-h-11 rounded-full border border-line px-4 font-semibold text-accent">
              Revenir à cette semaine
            </button>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {days.map((day) => (
          <section key={day.seqDay} className={`rounded-2xl border bg-card p-2 ${day.isToday ? 'border-accent' : 'border-line'}`}>
            <div className="flex items-baseline gap-2 px-2 pt-1">
              <span className="text-xl font-bold">{seqDayLabel(day.seqDay)}</span>
              <span className="text-ink-2 first-letter:uppercase">{SHORT_WEEKDAY.format(new Date(`${day.date}T12:00:00`))}</span>
              {day.isToday && <Badge tone="accent">aujourd’hui</Badge>}
            </div>
            <SlotRow slot={day.slots.morning} data={data} onPreview={setPreview} />
            <SlotRow slot={day.slots.evening} data={data} onPreview={setPreview} />
          </section>
        ))}
      </div>

      <VolumeSection data={data} lookups={lookups} week={week} isDeload={info.isDeload} />
      <SkillSection data={data} lookups={lookups} week={week} />

      <Sheet open={previewTemplate !== null} onClose={() => setPreview(null)} title={previewTemplate?.name}>
        {previewTemplate && <TemplateItems template={previewTemplate} lookups={lookups} />}
      </Sheet>
    </Screen>
  );
}
