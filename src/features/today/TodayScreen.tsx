import { useState } from 'react';
import { db } from '../../db/db';
import type { AppData } from '../../db/hooks';
import { useLookups, type Lookups } from '../../db/lookups';
import { setCycleStartDate, shiftSequence } from '../../db/sessionStore';
import { addDays, dayInfo, firstTestSeqDay, isObjectiveTestDay, localISODate, type DayInfo } from '../../domain/cycle';
import { deloadTemplate, morningsHidden } from '../../domain/deload';
import { estimateDuration } from '../../domain/duration';
import { MOMENT_LABEL, OBJECTIVE_STATUS_LABEL, formatDateLong, formatDuration, formatValue, seqDayLabel } from '../../domain/labels';
import { objectiveState } from '../../domain/objectives';
import type { Moment, SeqDay, SessionLog, SessionTemplate } from '../../domain/types';
import { useNow } from '../../lib/device';
import { navigate } from '../../lib/router';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { ChevronDownIcon, PlayIcon } from '../../ui/icons';
import { Screen } from '../../ui/Screen';
import { ConfirmSheet, Sheet } from '../../ui/Sheet';
import { showToast } from '../../ui/toastStore';
import { TemplateItems } from '../week/TemplateItems';
import { BackupReminder, InstallCard } from './Reminders';
import { startTemplate } from './startTemplate';

interface Planned {
  moment: Moment;
  template: SessionTemplate;
  /** Tel qu'il se pratique aujourd'hui (allégé en semaine allégée). */
  practiced: SessionTemplate;
  hidden: boolean;
  done: SessionLog[];
}

function plannedFor(info: DayInfo, data: AppData, lookups: Lookups): Planned[] {
  const slot = data.settings.weekPlan[info.seqDay];
  const list: Planned[] = [];
  for (const moment of ['morning', 'evening'] as const) {
    const template = lookups.templates.get(slot[moment] ?? '');
    if (!template) continue;
    list.push({
      moment,
      template,
      practiced: info.isDeload ? deloadTemplate(template, lookups.blocks, data.settings) : template,
      hidden: moment === 'morning' && morningsHidden(info.isDeload, data.settings),
      done: data.sessions.filter((s) => s.date === info.date && s.moment === moment && s.status !== 'in_progress'),
    });
  }
  return list;
}

function nameOfDay(day: SeqDay, data: AppData, lookups: Lookups): string {
  const slot = data.settings.weekPlan[day];
  const evening = lookups.templates.get(slot.evening ?? '');
  const morning = lookups.templates.get(slot.morning ?? '');
  return [morning?.name, evening?.name ?? 'Repos'].filter(Boolean).join(' + ');
}

function PlannedCard({
  planned,
  data,
  lookups,
  primary,
  onStart,
}: {
  planned: Planned;
  data: AppData;
  lookups: Lookups;
  primary: boolean;
  onStart: () => void;
}) {
  const { template, practiced, hidden, done } = planned;
  const type = lookups.sessionTypes.get(template.sessionTypeId);
  const { minSec, maxSec } = estimateDuration(practiced, data.settings);
  const doneSets = done.reduce((sum, s) => sum + data.sets.filter((set) => set.sessionId === s.id).length, 0);
  return (
    <article className={`rounded-2xl border bg-card p-4 ${primary ? 'border-accent/70' : 'border-line'} ${hidden ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-center gap-2 text-ink-2">
        <span className="font-semibold">{MOMENT_LABEL[planned.moment]}</span>
        {template.optional && <Badge>optionnel</Badge>}
        {hidden && <Badge tone="accent">masqué en semaine allégée</Badge>}
        {done.length > 0 && <Badge tone="ok">faite · {doneSets} séries</Badge>}
      </div>
      <h2 className="mt-1 flex items-center gap-2 text-2xl font-bold">
        <span className="size-3.5 shrink-0 rounded-full" style={{ backgroundColor: type?.color }} aria-hidden />
        {template.name}
      </h2>
      <p className="mt-1 text-ink-2">
        {type?.description}
        {type?.description ? ' · ' : ''}
        {formatDuration(minSec)} à {formatDuration(maxSec)}
      </p>
      <details className="group/content mt-2">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 font-semibold text-ink-2">
          Contenu de la séance
          <ChevronDownIcon className="size-5 transition-transform group-open/content:rotate-180" />
        </summary>
        <div className="pt-2">
          <TemplateItems template={practiced} lookups={lookups} />
        </div>
      </details>
      {!primary && !hidden && (
        <Button variant="secondary" className="mt-3" onClick={onStart}>
          <PlayIcon className="size-5" /> {done.length > 0 ? 'Refaire cette séance' : 'Commencer'}
        </Button>
      )}
    </article>
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
  const planned = info.beforeStart ? [] : plannedFor(info, data, lookups);
  const pending = planned.find((p) => !p.hidden && p.done.length === 0);
  const testDay = isObjectiveTestDay(info, firstTestSeqDay(data.settings.weekPlan, lookups.templates, lookups.sessionTypes));
  const [sheet, setSheet] = useState<'choose' | 'next' | 'postpone' | null>(null);

  const start = (template: SessionTemplate) => startTemplate(template, info, data, lookups);

  const shift = async (delta: 1 | -1) => {
    const previous = await shiftSequence(db, delta);
    if (previous === null) return;
    showToast(delta === 1 ? 'Séquence avancée d’un jour.' : 'Séance reportée à demain.', {
      action: { label: 'Annuler', run: () => void setCycleStartDate(db, previous) },
    });
  };

  const nextDay = (((info.seqDay % 7) + 1) as SeqDay);
  const templatesByMoment = [...data.templates].sort((a, b) => (a.moment === b.moment ? a.name.localeCompare(b.name) : a.moment === 'evening' ? -1 : 1));

  return (
    <Screen
      title={<span className="first-letter:uppercase">{formatDateLong(today)}</span>}
      actions={
        active ? (
          <Button onClick={() => navigate(`/session/${active.id}`)}>
            <PlayIcon className="size-5" /> Reprendre la séance
          </Button>
        ) : pending ? (
          <Button onClick={() => void start(pending.template)}>
            <PlayIcon className="size-5" /> Commencer · {pending.template.name}
          </Button>
        ) : undefined
      }
    >
      {info.beforeStart ? (
        <p className="rounded-2xl border border-line bg-card p-4 text-lg">Le programme commence le {formatDateLong(data.settings.cycleStartDate)}.</p>
      ) : (
        <section className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-5xl font-bold">{seqDayLabel(info.seqDay)}</span>
          <span className="text-xl text-ink-2">
            semaine {info.week} · cycle {info.cycle} · S{info.cycleWeek}/{data.settings.cycleLengthWeeks}
          </span>
          {info.isDeload && <Badge tone="accent">Semaine allégée</Badge>}
        </section>
      )}

      {active && (
        <article className="rounded-2xl border border-accent bg-accent/10 p-4">
          <div className="font-semibold text-accent">Séance en cours</div>
          <div className="text-xl font-bold">{active.templateSnapshot?.name ?? active.sessionTypeName}</div>
          <p className="text-ink-2">
            Commencée le {formatDateLong(active.date)}
            {active.startedAt ? ` à ${new Date(active.startedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : ''}.
          </p>
        </article>
      )}

      {testDay && <TestDayBanner data={data} />}

      {planned.map((p) => (
        <PlannedCard key={p.moment} planned={p} data={data} lookups={lookups} primary={!active && p === pending} onStart={() => void start(p.template)} />
      ))}
      {!info.beforeStart && !planned.some((p) => p.moment === 'evening') && (
        <article className="rounded-2xl border border-line bg-card p-4">
          <div className="font-semibold text-ink-2">Soir</div>
          <h2 className="text-2xl font-bold">Repos</h2>
        </article>
      )}

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

      <Sheet open={sheet === 'choose'} onClose={() => setSheet(null)} title="Choisir une séance">
        <p className="mb-3 text-ink-2">Pour aujourd’hui seulement : la séquence ne change pas.</p>
        <ul className="flex flex-col gap-1">
          {templatesByMoment.map((template) => {
            const type = lookups.sessionTypes.get(template.sessionTypeId);
            return (
              <li key={template.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSheet(null);
                    void start(template);
                  }}
                  className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 py-2 text-left active:bg-card-2"
                >
                  <span className="size-3.5 shrink-0 rounded-full" style={{ backgroundColor: type?.color }} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{template.name}</span>
                    <span className="block text-ink-2">{MOMENT_LABEL[template.moment]}</span>
                  </span>
                  {template.optional && <Badge>optionnel</Badge>}
                </button>
              </li>
            );
          })}
        </ul>
      </Sheet>
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
