// Aujourd'hui (maquette de l'utilisateur) : qu'est-ce que je fais maintenant ? Séance prévue, séance express,
// volume de la semaine, dernière séance ; puis les rappels et les autres options.
import { useState } from 'react';
import { db } from '../../db/db';
import type { AppData } from '../../db/hooks';
import { useLookups, type Lookups } from '../../db/lookups';
import { setCycleStartDate, shiftSequence } from '../../db/sessionStore';
import { addDays, dayInfo, diffDays, firstTestSeqDay, isObjectiveTestDay, localISODate, type DayInfo } from '../../domain/cycle';
import { estimateDuration } from '../../domain/duration';
import { EXPRESS_MINUTES, blockRoles } from '../../domain/express';
import { sessionDurationSec } from '../../domain/journal';
import {
  MOMENT_LABEL,
  OBJECTIVE_STATUS_LABEL,
  formatDateLong,
  formatDuration,
  formatDurationRange,
  formatRelativeDay,
  formatValue,
  seqDayLabel,
} from '../../domain/labels';
import { objectiveState, recordsBeaten } from '../../domain/objectives';
import type { Moment, SeqDay, SessionLog, SessionTemplate } from '../../domain/types';
import { rangeStatus, realizedComponentVolume, remainingEveningSets } from '../../domain/volume';
import { weekProgress } from '../../domain/week';
import { useNow } from '../../lib/device';
import { navigate } from '../../lib/router';
import { readLocal, writeLocal } from '../../lib/storage';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { CellGauge } from '../../ui/Gauge';
import { GAUGE_TEXT, type GaugeTone } from '../../ui/gaugeStyles';
import { NextIcon } from '../../ui/icons';
import { Screen } from '../../ui/Screen';
import { Segmented } from '../../ui/Segmented';
import { ConfirmSheet, Sheet } from '../../ui/Sheet';
import { showToast } from '../../ui/toastStore';
import { TemplateItems } from '../week/TemplateItems';
import { ChooseSessionSheet } from './ChooseSessionSheet';
import { ExpressSheet } from './ExpressSheet';
import { lineExerciseName } from './lineNames';
import { nextPlanned, pendingPlanned, plannedFor, replaceablePlanned, type Planned } from './planned';
import { BackupReminder, InstallCard } from './Reminders';
import { startExpress, startTemplate } from './startTemplate';

const LABEL = 'font-display text-lg leading-none tracking-wider';
const START_BUTTON =
  'flex min-h-14 w-full items-center justify-center rounded-2xl bg-action font-display text-2xl tracking-wider text-action-ink transition-transform active:scale-[0.98]';
const EXPRESS_KEY = 'streeter.expressMinutes';

function readExpressMinutes(): number {
  const saved = Number(readLocal(EXPRESS_KEY));
  return (EXPRESS_MINUTES as readonly number[]).includes(saved) ? saved : 30;
}

function nameOfDay(day: SeqDay, data: AppData, lookups: Lookups): string {
  const slot = data.settings.weekPlan[day];
  const evening = lookups.templates.get(slot.evening ?? '');
  const morning = lookups.templates.get(slot.morning ?? '');
  return [morning?.name, evening?.name ?? 'Repos'].filter(Boolean).join(' + ');
}

/** « demain », sinon le jour de la semaine. */
function upcomingDay(date: string, today: string): string {
  return diffDays(today, date) === 1 ? 'demain' : formatDateLong(date).split(' ')[0];
}

/** Exercices de la séance, échauffement à part : ceux que la séance proposera par défaut. */
function exerciseNames(planned: Planned, data: AppData, lookups: Lookups): string[] {
  const roles = blockRoles(lookups.blocks);
  const names = planned.practiced.items.filter((i) => roles.get(i.blockTypeId) !== 'warmup').map((i) => lineExerciseName(i, planned.moment, data, lookups));
  return [...new Set(names)];
}

function PlannedCard({
  planned,
  info,
  data,
  lookups,
  active,
  onStart,
  onDetail,
}: {
  planned: Planned;
  info: DayInfo;
  data: AppData;
  lookups: Lookups;
  active: SessionLog | undefined;
  onStart: () => void;
  onDetail: () => void;
}) {
  const { template, practiced, done } = planned;
  const running = active !== undefined && active.date === info.date && active.moment === planned.moment;
  const type = lookups.sessionTypes.get(template.sessionTypeId);
  const { minSec, maxSec } = estimateDuration(practiced, data.settings, lookups);
  const names = exerciseNames(planned, data, lookups);
  const shown = names.slice(0, 3);
  const doneSession = done.find((s) => s.status === 'done') ?? done[0];
  const doneSets = doneSession ? data.sets.filter((s) => s.sessionId === doneSession.id).length : 0;
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className={`${LABEL} ${doneSession ? 'text-ok' : 'text-accent'}`}>
          {doneSession ? 'Séance du jour' : 'Séance prévue'} · {seqDayLabel(info.seqDay)} · {MOMENT_LABEL[planned.moment]}
        </div>
        <div className="shrink-0 text-sm text-ink-2">{formatDurationRange(minSec, maxSec)}</div>
      </div>
      <h2 className="flex items-center gap-2.5 font-display text-3xl leading-none tracking-wide">
        <span className="size-3.5 shrink-0 rounded-full" style={{ backgroundColor: type?.color }} aria-hidden />
        <span className="min-w-0">{template.name}</span>
      </h2>
      {(template.optional || info.isDeload || doneSession || running) && (
        <div className="flex flex-wrap gap-2">
          {running && <Badge tone="accent">en cours{active.expressMinutes !== null ? ` · express ${active.expressMinutes} min` : ''}</Badge>}
          {doneSession && (
            <Badge tone={doneSession.status === 'done' ? 'ok' : 'warn'}>
              {doneSession.status === 'done' ? `✓ faite · ${doneSets} série${doneSets > 1 ? 's' : ''}` : 'abandonnée'}
            </Badge>
          )}
          {template.optional && <Badge>optionnelle</Badge>}
          {info.isDeload && <Badge tone="accent">semaine allégée</Badge>}
        </div>
      )}
      <button type="button" onClick={onDetail} aria-label="Contenu de la séance" className="-m-1 flex min-h-11 items-center gap-1.5 rounded-xl p-1 text-left active:bg-card-2">
        <span className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {shown.map((name) => (
            <span key={name} className="rounded-md bg-card-2 px-2.5 py-1 text-sm">
              {name}
            </span>
          ))}
          {names.length > shown.length && <span className="rounded-md bg-card-2 px-2.5 py-1 text-sm text-ink-2">+{names.length - shown.length}</span>}
        </span>
        <NextIcon className="size-5 shrink-0 text-ink-3" />
      </button>
      {doneSession ? (
        <Button variant="secondary" onClick={() => navigate(`/journal/session/${doneSession.id}`)}>
          Revoir la séance
        </Button>
      ) : active ? (
        <p className="text-ink-2">Une séance est en cours : touche la barre en bas pour la rouvrir.</p>
      ) : (
        <button type="button" className={START_BUTTON} onClick={onStart}>
          Démarrer
        </button>
      )}
    </article>
  );
}

/** Autre séance du jour (matin ou soir), en une ligne. */
function OtherPlannedRow({
  planned,
  data,
  lookups,
  running,
  canStart,
  onStart,
}: {
  planned: Planned;
  data: AppData;
  lookups: Lookups;
  /** Séance en cours sur ce créneau (la séance prévue ou une séance express à sa place). */
  running: SessionLog | undefined;
  canStart: boolean;
  onStart: () => void;
}) {
  const { minSec, maxSec } = estimateDuration(planned.practiced, data.settings, lookups);
  const done = planned.done.find((s) => s.status === 'done');
  const status = running
    ? `en cours${running.expressMinutes !== null ? ` (express ${running.expressMinutes} min)` : ''}`
    : done
      ? '✓ faite'
      : planned.done.length > 0
        ? 'abandonnée'
        : planned.hidden
          ? 'masquée (semaine allégée)'
          : formatDurationRange(minSec, maxSec);
  return (
    <div className={`flex items-center gap-3 rounded-2xl border border-line bg-card py-2 pr-2 pl-4 ${planned.hidden ? 'opacity-60' : ''}`}>
      <div className="min-w-0 flex-1">
        <div className={`text-sm ${running ? 'text-accent' : done ? 'text-ok' : 'text-ink-2'}`}>
          Aussi aujourd’hui · {MOMENT_LABEL[planned.moment]} · <span className="whitespace-nowrap">{status}</span>
        </div>
        <div className="font-semibold">{planned.template.name}</div>
      </div>
      {canStart && (
        <button type="button" onClick={onStart} className="min-h-12 shrink-0 rounded-xl border border-line bg-card-2 px-4 font-semibold active:scale-[0.97]">
          Démarrer
        </button>
      )}
    </div>
  );
}

function RestCard({ info, data, lookups, today }: { info: DayInfo; data: AppData; lookups: Lookups; today: string }) {
  const next = nextPlanned(info, data, lookups);
  return (
    <article className="flex flex-col gap-2 rounded-2xl border border-line bg-card p-4">
      <div className={`${LABEL} text-accent`}>
        {seqDayLabel(info.seqDay)} · {MOMENT_LABEL.evening}
      </div>
      <h2 className="font-display text-3xl leading-none tracking-wide">Repos</h2>
      {next && (
        <p className="text-ink-2">
          Prochaine séance {upcomingDay(next.date, today)} ({seqDayLabel(next.seqDay)}, {MOMENT_LABEL[next.moment].toLowerCase()}) :{' '}
          <b className="text-ink">{next.template.name}</b>
        </p>
      )}
    </article>
  );
}

function ExpressCard({ minutes, onMinutes, replaceable, onGenerate }: { minutes: number; onMinutes: (m: number) => void; replaceable: readonly Planned[]; onGenerate: () => void }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-4">
      <div className="flex flex-col gap-1">
        <h2 className={`${LABEL} text-ink-2`}>Séance express</h2>
        {replaceable.length > 0 ? (
          <p className="leading-snug text-ink-2">À la place de la séance du jour : ses lignes planche et FL, puis les composantes en retard cette semaine.</p>
        ) : (
          <p className="leading-snug text-ink-3">Rien à remplacer aujourd’hui : pas de séance prévue, ou elle est déjà faite.</p>
        )}
      </div>
      {replaceable.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <Segmented label="Durée de la séance express" options={EXPRESS_MINUTES.map((m) => ({ value: String(m), label: `${m} min` }))} value={String(minutes)} onChange={(v) => onMinutes(Number(v))} />
          </div>
          <button type="button" onClick={onGenerate} className="min-h-[52px] shrink-0 rounded-xl bg-ink px-4 font-display text-xl tracking-wider text-page active:scale-[0.97]">
            Générer
          </button>
        </div>
      )}
    </section>
  );
}

/** Jauges compactes des composantes ; un toucher ouvre Progression › Volume. */
function WeekVolume({ info, today, data, lookups }: { info: DayInfo; today: string; data: AppData; lookups: Lookups }) {
  const { volumeMin: min, volumeMax: max } = data.settings;
  const realized = realizedComponentVolume(data.sets, lookups.sessions, data.elements, data.settings, { week: info.week, isDeload: info.isDeload });
  if (realized.length === 0) return null;
  const days = weekProgress(info.week, today, data.settings, lookups.templates, data.sessions);
  const remaining = remainingEveningSets(days, data.sets, lookups.blocks, data.settings, info.isDeload);
  return (
    <button type="button" onClick={() => navigate('/week')} className="-mx-2 flex flex-col gap-2.5 rounded-2xl px-2 py-2 text-left active:bg-card">
      <span className="flex w-full items-baseline justify-between gap-2">
        <span className="font-display text-2xl leading-none tracking-wide">
          Volume de la <span className="text-accent">semaine</span>
        </span>
        <span className="text-sm text-ink-2">{info.isDeload ? 'semaine allégée' : `cible ${min}–${max} séries`}</span>
      </span>
      {realized.map((row) => {
        const tone: GaugeTone = info.isDeload ? 'neutral' : rangeStatus(row.total, min, max);
        const planned = remaining.byElement.get(row.elementId) ?? 0;
        return (
          <span key={row.elementId} className="grid w-full grid-cols-[7.5rem_minmax(0,1fr)_2.75rem] items-center gap-2.5">
            <span className="text-sm leading-tight text-ink-2">{row.name}</span>
            <CellGauge done={row.total} planned={planned} max={max} zone={info.isDeload ? null : { min, max }} tone={tone} label={`${row.name} : ${row.total} séries faites`} />
            <span className={`text-right font-semibold tabular-nums ${GAUGE_TEXT[tone]}`}>
              {row.total}
              {!info.isDeload && <span className="font-normal text-ink-3">/{max}</span>}
            </span>
          </span>
        );
      })}
    </button>
  );
}

/** Dernière séance en une ligne : jour, nom, durée, records battus. */
function LastSession({ data, lookups, today }: { data: AppData; lookups: Lookups; today: string }) {
  const last = data.sessions.find((s) => s.status !== 'in_progress');
  if (!last) return null;
  const duration = sessionDurationSec(last);
  const records = recordsBeaten(last.id, data.sets, lookups.sessions);
  const name = last.templateSnapshot?.name ?? last.sessionTypeName;
  return (
    <button
      type="button"
      onClick={() => navigate(`/journal/session/${last.id}`)}
      className="flex min-h-12 items-center gap-3 border-t border-line pt-3 text-left active:opacity-70"
    >
      <span className="min-w-0 flex-1 text-ink-2">
        Dernière séance · {formatRelativeDay(last.date, today)} · {name}
        {duration ? ` · ${formatDuration(duration)}` : ''}
        {last.status === 'abandoned' ? ' · abandonnée' : ''}
      </span>
      {records > 0 && (
        <span className="shrink-0 font-semibold text-ink">
          {records} record{records > 1 ? 's' : ''}
        </span>
      )}
    </button>
  );
}

function TestDayBanner({ data }: { data: AppData }) {
  return (
    <section className="rounded-2xl border border-warn/70 bg-warn/10 p-4">
      <h2 className="text-xl font-bold text-warn">Jour de test des objectifs</h2>
      <p className="mt-1 text-ink-2">Début de cycle, séance Max : teste tes objectifs après l’échauffement, puis touche un objectif pour noter le résultat.</p>
      <ul className="mt-2 flex flex-col gap-1">
        {data.objectives.map((objective) => {
          const state = objectiveState(objective);
          return (
            <li key={objective.id}>
              <button
                type="button"
                onClick={() => navigate(`/objectives/${objective.id}`)}
                className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-2 text-left active:bg-card-2"
              >
                <span>{objective.name}</span>
                <span className="shrink-0 text-ink-2">
                  {formatValue(objective.target, objective.unit)} · {OBJECTIVE_STATUS_LABEL[state.status]}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function TodayScreen({ data }: { data: AppData }) {
  const lookups = useLookups(data);
  const now = useNow(60_000);
  const today = localISODate(new Date(now));
  const info = dayInfo(today, data.settings);
  const active = data.sessions.find((s) => s.status === 'in_progress');
  const planned = plannedFor(info, data, lookups);
  const pending = pendingPlanned(planned);
  const main = pending ?? planned.find((p) => !p.hidden) ?? null;
  const replaceable = replaceablePlanned(planned);
  const testDay = isObjectiveTestDay(info, firstTestSeqDay(data.settings.weekPlan, lookups.templates, lookups.sessionTypes));
  const [sheet, setSheet] = useState<'choose' | 'next' | 'postpone' | 'express' | null>(null);
  const [detail, setDetail] = useState<Planned | null>(null);
  const [minutes, setMinutes] = useState(readExpressMinutes);
  const [expressMoment, setExpressMoment] = useState<Moment | null>(null);

  const start = (template: SessionTemplate) => startTemplate(template, info, data, lookups);
  const chooseMinutes = (value: number) => {
    setMinutes(value);
    writeLocal(EXPRESS_KEY, String(value));
  };

  const shift = async (delta: 1 | -1) => {
    const previous = await shiftSequence(db, delta);
    if (previous === null) return;
    showToast(delta === 1 ? 'Séquence avancée d’un jour.' : 'Séance reportée à demain.', {
      action: { label: 'Annuler', run: () => void setCycleStartDate(db, previous) },
    });
  };

  const nextDay = ((info.seqDay % 7) + 1) as SeqDay;

  return (
    <Screen
      kicker={formatDateLong(today)}
      title="Aujourd’hui"
      subtitle={
        info.beforeStart ? undefined : (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              <b className="text-ink">{seqDayLabel(info.seqDay)}</b> · semaine {info.week} · cycle {info.cycle} · S{info.cycleWeek}/{data.settings.cycleLengthWeeks}
            </span>
            {info.isDeload && <Badge tone="accent">Semaine allégée</Badge>}
          </span>
        )
      }
    >
      {info.beforeStart && <p className="rounded-2xl border border-line bg-card p-4 text-lg">Le programme commence le {formatDateLong(data.settings.cycleStartDate)}.</p>}

      {testDay && <TestDayBanner data={data} />}

      {main ? (
        <PlannedCard planned={main} info={info} data={data} lookups={lookups} active={active} onStart={() => void start(main.template)} onDetail={() => setDetail(main)} />
      ) : (
        !info.beforeStart && <RestCard info={info} data={data} lookups={lookups} today={today} />
      )}
      {planned
        .filter((p) => p !== main)
        .map((p) => (
          <OtherPlannedRow
            key={p.moment}
            planned={p}
            data={data}
            lookups={lookups}
            running={active?.date === info.date && active.moment === p.moment ? active : undefined}
            canStart={!active && !p.hidden && p.done.length === 0} onStart={() => void start(p.template)} />
        ))}

      {!active && !info.beforeStart && (
        <ExpressCard
          minutes={minutes}
          onMinutes={chooseMinutes}
          replaceable={replaceable}
          onGenerate={() => {
            setExpressMoment(pending && replaceable.includes(pending) ? pending.moment : (replaceable[0]?.moment ?? null));
            setSheet('express');
          }}
        />
      )}

      {!info.beforeStart && <WeekVolume info={info} today={today} data={data} lookups={lookups} />}
      <LastSession data={data} lookups={lookups} today={today} />

      <BackupReminder data={data} now={now} />
      <InstallCard />

      <section className="mt-2 flex flex-col gap-2">
        <h2 className="text-sm font-bold tracking-wide text-ink-3 uppercase">Autres options</h2>
        <Button variant="secondary" onClick={() => setSheet('choose')}>
          Choisir une autre séance
        </Button>
        {!info.beforeStart && (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" className="text-base" onClick={() => setSheet('next')}>
              Passer au jour suivant
            </Button>
            <Button variant="secondary" className="text-base" onClick={() => setSheet('postpone')}>
              Reporter à demain
            </Button>
          </div>
        )}
      </section>

      <Sheet open={detail !== null} onClose={() => setDetail(null)} title={detail?.template.name}>
        {detail && <TemplateItems template={detail.practiced} lookups={lookups} />}
      </Sheet>
      <ExpressSheet
        open={sheet === 'express'}
        onClose={() => setSheet(null)}
        minutes={minutes}
        onMinutes={chooseMinutes}
        replaceable={replaceable}
        moment={expressMoment ?? replaceable[0]?.moment ?? 'evening'}
        onMoment={setExpressMoment}
        info={info}
        data={data}
        lookups={lookups}
        onStart={(template, replaced) => {
          setSheet(null);
          void startExpress(template, minutes, replaced.template, info, data, lookups);
        }}
      />
      <ChooseSessionSheet open={sheet === 'choose'} onClose={() => setSheet(null)} data={data} lookups={lookups} onChoose={(template) => void start(template)} />
      <ConfirmSheet
        open={sheet === 'next'}
        onClose={() => setSheet(null)}
        title="Passer au jour suivant ?"
        message={
          <>
            Aujourd’hui devient <b className="text-ink">{seqDayLabel(nextDay)}</b> ({nameOfDay(nextDay, data, lookups)}). Toute la suite de la séquence avance d’un
            jour, les limites de semaine aussi.
          </>
        }
        confirmLabel="Passer au jour suivant"
        onConfirm={() => void shift(1)}
      />
      <ConfirmSheet
        open={sheet === 'postpone'}
        onClose={() => setSheet(null)}
        title="Reporter à demain ?"
        message={
          <>
            Demain ({formatDateLong(addDays(today, 1))}) devient <b className="text-ink">{seqDayLabel(info.seqDay)}</b> ({nameOfDay(info.seqDay, data, lookups)}).
            Toute la séquence recule d’un jour, les limites de semaine aussi.
          </>
        }
        confirmLabel="Reporter à demain"
        onConfirm={() => void shift(-1)}
      />
    </Screen>
  );
}
