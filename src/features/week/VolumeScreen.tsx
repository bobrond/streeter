// Progression › Volume : jauges des composantes (cible 4 à 6 séries, ou celle de leur type de travail), totaux des
// skills, séances de la semaine et semaines précédentes. La semaine affichée est dans l'adresse (« ?semaine=3 »). Un
// programme en séquence se suit par tranche (« ?tranche=2 », la 2e tranche du programme en cours).
import { useMemo, useState } from 'react';
import type { AppData } from '../../db/hooks';
import { useLookups, type Lookups } from '../../db/lookups';
import { dateOf, dayInfo, localISODate } from '../../domain/cycle';
import { emptyWeekPlan } from '../../domain/defaults';
import { practicedTemplate } from '../../domain/deload';
import { tranchePeriod, weekPeriod, type PeriodView } from '../../domain/period';
import { settingsAtWeek } from '../../domain/programs';
import { sequenceState, type SequenceInfo } from '../../domain/sequence';
import { MOMENT_LABEL, formatDayMonth, formatSets, seqDayLabel } from '../../domain/labels';
import type { SessionTemplate } from '../../domain/types';
import {
  componentBounds,
  componentElements,
  rangeStatus,
  realizedComponentVolume,
  realizedSkillSets,
  remainingEveningSets,
  skillTotals,
  weekSessionIds,
  type RemainingPlanned,
  type VolumePeriod,
} from '../../domain/volume';
import { weekRange, type DayProgress, type SlotProgress, type SlotStatus } from '../../domain/week';
import { useNow } from '../../lib/device';
import { navigate, queryParam } from '../../lib/router';
import { Badge } from '../../ui/Badge';
import { BarGauge, CellGauge } from '../../ui/Gauge';
import { GAUGE_LABEL, GAUGE_TEXT, type GaugeTone } from '../../ui/gaugeStyles';
import { BackIcon, NextIcon } from '../../ui/icons';
import { ProgressNav } from '../../ui/ProgressNav';
import { Screen } from '../../ui/Screen';
import { Sheet } from '../../ui/Sheet';
import { infoFor, programSessions } from '../today/planned';
import { TemplateItems } from './TemplateItems';

const SHORT_WEEKDAY = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric' });
const SECTION_TITLE = 'px-1 text-sm font-bold tracking-wide text-ink-3 uppercase';

const SLOT_STATUS: Record<SlotStatus, { label: string; className: string }> = {
  done: { label: 'faite', className: 'text-ok' },
  in_progress: { label: 'en cours', className: 'text-accent' },
  abandoned: { label: 'abandonnée', className: 'text-warn' },
  missed: { label: 'manquée', className: 'text-danger' },
  skipped: { label: 'pas faite (optionnelle)', className: 'text-ink-3' },
  today: { label: 'aujourd’hui', className: 'text-accent' },
  upcoming: { label: 'à venir', className: 'text-ink-3' },
  hidden: { label: 'masquée (allégé)', className: 'text-ink-3' },
  none: { label: '', className: 'text-ink-3' },
};

function volumePath(week: number, current: number): string {
  return week === current ? '/week' : `/week?semaine=${week}`;
}

/** Légende des jauges : fait, encore prévu le soir, zone cible. */
function GaugeLegend({ deload }: { deload: boolean }) {
  return (
    <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-3">
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-3 w-4 rounded-[2px] bg-accent" aria-hidden /> fait
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-3 w-4 rounded-[2px] border-2 border-dashed border-ink-3" aria-hidden /> encore prévu le soir
      </span>
      {!deload && (
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-4 rounded-[2px] bg-line" aria-hidden /> zone cible
        </span>
      )}
    </p>
  );
}

function ComponentGauges({ data, lookups, period, remaining }: { data: AppData; lookups: Lookups; period: VolumePeriod & { kind: 'week' | 'tranche' }; remaining: RemainingPlanned }) {
  const { isDeload } = period;
  const realized = realizedComponentVolume(data.sets, lookups.sessions, data.elements, data.settings, period);
  const perComponent = data.settings.componentVolumes.length > 0;
  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-2xl leading-none tracking-wide">Composantes</h2>
        <span className="text-sm text-ink-2">
          {isDeload ? `${period.kind === 'tranche' ? 'tranche' : 'semaine'} allégée` : perComponent ? 'cible selon le travail' : `cible ${data.settings.volumeMin} à ${data.settings.volumeMax} séries`}
        </span>
      </div>
      <ul className="mt-4 flex flex-col gap-4">
        {realized.map((row) => {
          const { min, max, work } = componentBounds(data.settings, row.elementId);
          const planned = remaining.byElement.get(row.elementId) ?? 0;
          const status = rangeStatus(row.total, min, max);
          const tone: GaugeTone = isDeload ? 'neutral' : status;
          return (
            <li key={row.elementId} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold">
                  {row.name}
                  {work && (
                    <span className="font-normal text-ink-2">
                      {' '}
                      · {work} {min}-{max}
                    </span>
                  )}
                </span>
                <span className={`text-xl font-bold tabular-nums ${GAUGE_TEXT[tone]}`}>
                  {row.total}
                  {!isDeload && <span className="text-base font-normal text-ink-3">/{max}</span>}
                </span>
              </div>
              <CellGauge done={row.total} planned={planned} max={max} zone={isDeload ? null : { min, max }} tone={tone} label={`${row.name} : ${row.total} séries faites`} />
              <div className="flex flex-wrap justify-between gap-x-3 text-sm">
                <span className="text-ink-3">
                  {row.evening} soir · {row.morning} matin
                  {planned > 0 ? ` · encore ${planned} prévue${planned > 1 ? 's' : ''}` : ''}
                </span>
                {!isDeload && <span className={status === 'above' ? 'text-warn' : status === 'within' ? 'text-ink' : 'text-ink-2'}>{GAUGE_LABEL[status]}</span>}
              </div>
            </li>
          );
        })}
      </ul>
      <GaugeLegend deload={isDeload} />
    </section>
  );
}

function SkillGauges({ data, lookups, period, remaining }: { data: AppData; lookups: Lookups; period: VolumePeriod; remaining: RemainingPlanned }) {
  const { isDeload } = period;
  const totals = skillTotals(lookups.program, data.settings);
  const realized = realizedSkillSets(data.sets, period.sessionIds, data.elements);
  const skills = data.elements.filter((e) => e.kind === 'skill');
  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-2xl leading-none tracking-wide">Skills</h2>
        <span className="text-sm text-ink-2">{isDeload ? 'fait / prévu au plus' : 'fait / prévu'}</span>
      </div>
      <div className="mt-3 flex flex-col gap-4">
        {skills.map((skill) => {
          const rows = totals.filter((t) => t.elementId === skill.id);
          if (rows.length === 0) return null;
          return (
            <div key={skill.id} className="flex flex-col gap-2.5">
              <h3 className="font-semibold">{skill.name}</h3>
              {rows.map((row) => {
                const key = `${row.blockTypeId}|${row.elementId}`;
                const done = realized.get(key) ?? 0;
                const planned = remaining.byBlockElement.get(key) ?? 0;
                const tone: GaugeTone = isDeload ? 'neutral' : rangeStatus(done, row.setsMin, row.setsMax);
                const blockName = lookups.blocks.get(row.blockTypeId)?.name ?? '';
                return (
                  <div key={key} className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-ink-2">{blockName}</span>
                      <span className="tabular-nums">
                        <b className={`text-lg ${GAUGE_TEXT[tone]}`}>{done}</b>
                        <span className="text-ink-3"> / {isDeload ? row.deloadMax : formatSets(row.setsMin, row.setsMax)}</span>
                      </span>
                    </div>
                    <BarGauge
                      done={done}
                      planned={planned}
                      zone={isDeload ? null : { min: row.setsMin, max: row.setsMax }}
                      tone={tone}
                      label={`${skill.name}, ${blockName} : ${done} séries faites`}
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
        {totals.length === 0 && <p className="text-ink-2">Aucun skill dans le programme.</p>}
      </div>
    </section>
  );
}

function SlotRow({ slot, data, onPreview }: { slot: SlotProgress; data: AppData; onPreview: (template: SessionTemplate) => void }) {
  const session = slot.sessions.find((s) => s.status === 'done') ?? slot.sessions[0];
  const name = session ? (session.templateSnapshot?.name ?? session.sessionTypeName) : slot.planned?.name;
  if (!name && slot.moment === 'morning') return null;
  const sets = session ? data.sets.filter((s) => s.sessionId === session.id).length : 0;
  const status = SLOT_STATUS[slot.status];
  const dim = slot.status === 'hidden' || slot.status === 'skipped';
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
      className="flex min-h-12 w-full items-center gap-2 rounded-xl px-2 text-left active:bg-card-2 disabled:active:bg-transparent"
    >
      <span className="w-11 shrink-0 text-sm text-ink-3">{MOMENT_LABEL[slot.moment]}</span>
      <span className="min-w-0 flex-1">
        <span className={`block leading-tight ${name ? 'font-semibold' : 'text-ink-3'} ${dim ? 'text-ink-3' : ''}`}>{name ?? 'Repos'}</span>
        {status.label && (
          <span className={`block text-sm ${status.className}`}>{slot.status === 'done' ? `✓ faite · ${sets} série${sets > 1 ? 's' : ''}` : status.label}</span>
        )}
      </span>
    </button>
  );
}

function WeekSessions({ days, data, onPreview, tranche = false }: { days: DayProgress[]; data: AppData; onPreview: (template: SessionTemplate) => void; tranche?: boolean }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h2 className={SECTION_TITLE}>{tranche ? 'Séances de la tranche' : 'Séances de la semaine'}</h2>
      <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
        {days.map((day) => (
          <div key={day.seqDay} className={`flex gap-2 py-1 pr-1 pl-3 ${day.isToday ? 'border-l-4 border-l-accent' : ''}`}>
            <div className="w-14 shrink-0 pt-2.5">
              <div className="leading-tight font-bold">{tranche ? `n° ${day.seqDay}` : seqDayLabel(day.seqDay)}</div>
              {day.date && (
                <div className="text-sm text-ink-3 first-letter:uppercase">
                  {tranche && day.slots.evening.sessions.length === 0 ? '≈ ' : ''}
                  {SHORT_WEEKDAY.format(new Date(`${day.date}T12:00:00`))}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <SlotRow slot={day.slots.morning} data={data} onPreview={onPreview} />
              <SlotRow slot={day.slots.evening} data={data} onPreview={onPreview} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Séries faites par composante sur les dernières semaines ; toucher une semaine l'affiche. */
function WeekHistory({ data, lookups, currentWeek, shownWeek }: { data: AppData; lookups: Lookups; currentWeek: number; shownWeek: number }) {
  const components = componentElements(data.elements);
  const columns = useMemo(() => {
    const first = Math.max(1, currentWeek - 5);
    return Array.from({ length: currentWeek - first + 1 }, (_, i) => {
      const week = first + i;
      // Chaque semaine avec les réglages de son programme.
      const settings = settingsAtWeek(data.appSettings, data.programs, week) ?? data.settings;
      const isDeload = dayInfo(dateOf(week, 1, settings), settings).isDeload;
      const realized = realizedComponentVolume(data.sets, lookups.sessions, data.elements, settings, { sessionIds: weekSessionIds(data.sessions, week), isDeload });
      return { week, isDeload, settings, totals: new Map(realized.map((r) => [r.elementId, r.total])) };
    });
  }, [currentWeek, data.appSettings, data.programs, data.settings, data.sets, data.sessions, data.elements, lookups.sessions]);
  if (components.length === 0 || columns.length === 0) return null;
  const cellClass = (total: number, isDeload: boolean, settings: Parameters<typeof componentBounds>[0], elementId: string) => {
    if (isDeload) return 'text-ink-2';
    const { min, max } = componentBounds(settings, elementId);
    const status = rangeStatus(total, min, max);
    return status === 'within' ? 'bg-accent text-accent-ink' : status === 'above' ? 'text-warn' : 'text-ink-3';
  };
  return (
    <section className="flex flex-col gap-1.5">
      <h2 className={SECTION_TITLE}>Semaines</h2>
      <div className="overflow-hidden rounded-2xl border border-line bg-card">
        <table className="w-full table-fixed text-center tabular-nums">
          <thead>
            <tr>
              <th className="w-[36%]" />
              {columns.map((column) => (
                <th key={column.week} className="p-0.5 font-semibold">
                  <button
                    type="button"
                    aria-pressed={column.week === shownWeek}
                    onClick={() => navigate(volumePath(column.week, currentWeek), { replace: true })}
                    className={`flex min-h-11 w-full flex-col items-center justify-center rounded-xl leading-tight ${column.week === shownWeek ? 'bg-ink text-page' : 'text-ink-2 active:bg-card-2'}`}
                  >
                    S{column.week}
                    {column.isDeload && <span className="text-xs font-normal">allégée</span>}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {components.map((element) => (
              <tr key={element.id} className="border-t border-line">
                <th scope="row" className="px-3 py-2 text-left text-sm leading-tight font-normal text-ink-2">
                  {element.name}
                </th>
                {columns.map((column) => {
                  const total = column.totals.get(element.id) ?? 0;
                  return (
                    <td key={column.week} className="p-0.5">
                      <span className={`flex min-h-9 items-center justify-center rounded-md font-semibold ${cellClass(total, column.isDeload, column.settings, element.id)}`}>{total}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-1 text-sm text-ink-3">Séries faites, hors échauffement ; fond orange : dans la cible.</p>
    </section>
  );
}

function tranchePath(tranche: number, current: number): string {
  return tranche === current ? '/week' : `/week?tranche=${tranche + 1}`;
}

/** Séries faites par composante sur les dernières tranches du programme ; toucher une tranche l'affiche. */
function TrancheHistory({ data, lookups, current, shown }: { data: AppData; lookups: Lookups; current: number; shown: number }) {
  const components = componentElements(data.elements);
  const columns = useMemo(() => {
    const state = sequenceState(data.settings.weekPlan, programSessions(data));
    const first = Math.max(0, current - 5);
    return Array.from({ length: current - first + 1 }, (_, i) => {
      const tranche = first + i;
      const sessionIds = new Set([...state.trancheOf].filter(([, t]) => t === tranche).map(([id]) => id));
      const isDeload = (tranche % Math.max(1, data.settings.cycleLengthWeeks)) + 1 === data.settings.deloadWeek;
      const realized = realizedComponentVolume(data.sets, lookups.sessions, data.elements, data.settings, { sessionIds, isDeload });
      return { tranche, isDeload, totals: new Map(realized.map((r) => [r.elementId, r.total])) };
    });
  }, [current, data, lookups.sessions]);
  if (components.length === 0) return null;
  const cellClass = (total: number, isDeload: boolean, elementId: string) => {
    if (isDeload) return 'text-ink-2';
    const { min, max } = componentBounds(data.settings, elementId);
    const status = rangeStatus(total, min, max);
    return status === 'within' ? 'bg-accent text-accent-ink' : status === 'above' ? 'text-warn' : 'text-ink-3';
  };
  return (
    <section className="flex flex-col gap-1.5">
      <h2 className={SECTION_TITLE}>Tranches</h2>
      <div className="overflow-hidden rounded-2xl border border-line bg-card">
        <table className="w-full table-fixed text-center tabular-nums">
          <thead>
            <tr>
              <th className="w-[36%]" />
              {columns.map((column) => (
                <th key={column.tranche} className="p-0.5 font-semibold">
                  <button
                    type="button"
                    aria-pressed={column.tranche === shown}
                    onClick={() => navigate(tranchePath(column.tranche, current), { replace: true })}
                    className={`flex min-h-11 w-full flex-col items-center justify-center rounded-xl leading-tight ${column.tranche === shown ? 'bg-ink text-page' : 'text-ink-2 active:bg-card-2'}`}
                  >
                    T{column.tranche + 1}
                    {column.isDeload && <span className="text-xs font-normal">allégée</span>}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {components.map((element) => (
              <tr key={element.id} className="border-t border-line">
                <th scope="row" className="px-3 py-2 text-left text-sm leading-tight font-normal text-ink-2">
                  {element.name}
                </th>
                {columns.map((column) => {
                  const total = column.totals.get(element.id) ?? 0;
                  return (
                    <td key={column.tranche} className="p-0.5">
                      <span className={`flex min-h-9 items-center justify-center rounded-md font-semibold ${cellClass(total, column.isDeload, element.id)}`}>{total}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-1 text-sm text-ink-3">Séries faites, hors échauffement ; fond orange : dans la cible.</p>
    </section>
  );
}

/** Volume d'un programme en séquence, tranche par tranche (tranches numérotées depuis le début du programme). */
function TrancheVolume({ data, path, today }: { data: AppData; path: string; today: string }) {
  const lookups = useLookups(data);
  const info = infoFor(today, data) as SequenceInfo;
  const current = info.sequence.tranche;
  const asked = Number(queryParam(path, 'tranche'));
  const tranche = Number.isInteger(asked) && asked >= 1 ? asked - 1 : current;
  const [preview, setPreview] = useState<SessionTemplate | null>(null);
  const period: PeriodView = tranchePeriod(tranche, today, data.settings, lookups.templates, programSessions(data));
  const tranches = Math.max(1, data.settings.cycleLengthWeeks);
  const at = { isDeload: period.isDeload, cycleWeek: (tranche % tranches) + 1 };
  const remaining = remainingEveningSets(period.days, data.sets, lookups.blocks, data.settings, at);
  const previewTemplate = preview && practicedTemplate(preview, at, lookups.blocks, data.settings);
  const done = period.days.filter((d) => d.slots.evening.status === 'done').length;
  const go = (target: number) => navigate(tranchePath(target, current), { replace: true });
  return (
    <Screen title="Progression" nav={<ProgressNav current="volume" />}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-3xl leading-none tracking-wide">Tranche {tranche + 1}</h2>
          <p className="mt-1 text-ink-2">
            {data.program.name} · cycle {Math.floor(tranche / tranches) + 1} · T{at.cycleWeek}/{tranches} · {done}/{info.sequence.length} séances faites
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <button type="button" aria-label="Tranche précédente" disabled={tranche <= 0} onClick={() => go(tranche - 1)} className="flex size-12 items-center justify-center rounded-2xl border border-line active:bg-card-2 disabled:opacity-30">
            <BackIcon />
          </button>
          <button type="button" aria-label="Tranche suivante" onClick={() => go(tranche + 1)} className="flex size-12 items-center justify-center rounded-2xl border border-line active:bg-card-2">
            <NextIcon />
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {period.isDeload && <Badge tone="accent">Tranche allégée</Badge>}
        {tranche !== current && (
          <button type="button" onClick={() => go(current)} className="min-h-11 rounded-full border border-line px-4 font-semibold text-accent">
            Revenir à la tranche en cours
          </button>
        )}
        <button type="button" onClick={() => navigate(`/week?semaine=${Math.max(1, info.week)}`)} className="min-h-11 rounded-full border border-line px-4 font-semibold text-ink-2">
          Par semaine
        </button>
      </div>

      <ComponentGauges data={data} lookups={lookups} period={period} remaining={remaining} />
      <SkillGauges data={data} lookups={lookups} period={period} remaining={remaining} />
      <WeekSessions days={period.days} data={data} onPreview={setPreview} tranche />
      <TrancheHistory data={data} lookups={lookups} current={current} shown={tranche} />

      <Sheet open={previewTemplate !== null} onClose={() => setPreview(null)} title={previewTemplate?.name}>
        {previewTemplate && <TemplateItems template={previewTemplate} lookups={lookups} />}
      </Sheet>
    </Screen>
  );
}

export function VolumeScreen({ data, path }: { data: AppData; path: string }) {
  const today = localISODate(new Date(useNow(60_000)));
  const byWeek = Number.isInteger(Number(queryParam(path, 'semaine'))) && Number(queryParam(path, 'semaine')) >= 1;
  if (data.settings.schedule === 'sequence' && !byWeek) return <TrancheVolume data={data} path={path} today={today} />;
  return <WeekVolumeScreen todayData={data} path={path} today={today} />;
}

function WeekVolumeScreen({ todayData, path, today }: { todayData: AppData; path: string; today: string }) {
  const todayLookups = useLookups(todayData);
  const current = dayInfo(today, todayData.settings);
  const currentWeek = Math.max(1, current.week);
  const asked = Number(queryParam(path, 'semaine'));
  const week = Number.isInteger(asked) && asked >= 1 ? asked : currentWeek;
  // La semaine affichée se lit avec les réglages et la semaine type de son programme.
  const data = useMemo(() => {
    const found = settingsAtWeek(todayData.appSettings, todayData.programs, week) ?? todayData.settings;
    // Un programme en séquence n'a pas de semaine type : seules les séances faites s'affichent par semaine.
    const settings = found.schedule === 'sequence' ? { ...found, weekPlan: emptyWeekPlan() } : found;
    return settings === todayData.settings ? todayData : { ...todayData, settings };
  }, [todayData, week]);
  const lookups = useMemo(
    () => (data === todayData ? todayLookups : { ...todayLookups, program: { ...todayLookups.program, weekPlan: data.settings.weekPlan, sequence: false } }),
    [data, todayData, todayLookups],
  );
  const [preview, setPreview] = useState<SessionTemplate | null>(null);
  const range = weekRange(week, data.settings);
  const info = dayInfo(range.from, data.settings);
  const period = weekPeriod(week, today, data.settings, lookups.templates, data.sessions);
  const remaining = remainingEveningSets(period.days, data.sets, lookups.blocks, data.settings, info);
  const previewTemplate = preview && practicedTemplate(preview, info, lookups.blocks, data.settings);
  const go = (target: number) => navigate(volumePath(target, currentWeek), { replace: true });

  return (
    <Screen title="Progression" nav={<ProgressNav current="volume" />}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-3xl leading-none tracking-wide">Semaine {week}</h2>
          <p className="mt-1 text-ink-2">
            {formatDayMonth(range.from)} → {formatDayMonth(range.to)} · cycle {info.cycle} · S{info.cycleWeek}/{data.settings.cycleLengthWeeks}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <button type="button" aria-label="Semaine précédente" disabled={week <= 1} onClick={() => go(week - 1)} className="flex size-12 items-center justify-center rounded-2xl border border-line active:bg-card-2 disabled:opacity-30">
            <BackIcon />
          </button>
          <button type="button" aria-label="Semaine suivante" onClick={() => go(week + 1)} className="flex size-12 items-center justify-center rounded-2xl border border-line active:bg-card-2">
            <NextIcon />
          </button>
        </div>
      </div>
      {(info.isDeload || week !== currentWeek) && (
        <div className="flex flex-wrap items-center gap-2">
          {info.isDeload && <Badge tone="accent">Semaine allégée</Badge>}
          {week !== currentWeek && (
            <button type="button" onClick={() => go(currentWeek)} className="min-h-11 rounded-full border border-line px-4 font-semibold text-accent">
              Revenir à cette semaine
            </button>
          )}
        </div>
      )}

      <ComponentGauges data={data} lookups={lookups} period={period} remaining={remaining} />
      <SkillGauges data={data} lookups={lookups} period={period} remaining={remaining} />
      <WeekSessions days={period.days} data={data} onPreview={setPreview} />
      <WeekHistory data={data} lookups={lookups} currentWeek={currentWeek} shownWeek={week} />

      <Sheet open={previewTemplate !== null} onClose={() => setPreview(null)} title={previewTemplate?.name}>
        {previewTemplate && <TemplateItems template={previewTemplate} lookups={lookups} />}
      </Sheet>
    </Screen>
  );
}
