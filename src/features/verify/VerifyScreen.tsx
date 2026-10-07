import { useMemo } from 'react';
import type { AppData } from '../../db/hooks';
import { dayInfo, firstTestSeqDay, isObjectiveTestDay, localISODate } from '../../domain/cycle';
import { morningsHidden } from '../../domain/deload';
import { formatDateLong, seqDayLabel } from '../../domain/labels';
import { plannedComponentVolume } from '../../domain/volume';
import type { ImportReport } from '../../io/xlsx/importWorkbook';
import { Badge } from '../../ui/Badge';
import { Screen } from '../../ui/Screen';
import { Section } from '../../ui/Section';
import { CatalogueView } from './CatalogueView';
import { DataView } from './DataView';
import { JournalView } from './JournalView';
import { buildLookups, type Lookups } from './lookups';
import { ObjectivesView } from './ObjectivesView';
import { VolumeView } from './VolumeView';
import { WeekPlanView } from './WeekPlanView';

function TodayCard({ data, lookups, today }: { data: AppData; lookups: Lookups; today: string }) {
  const { settings } = data;
  const info = dayInfo(today, settings);
  const slot = settings.weekPlan[info.seqDay];
  const hidden = morningsHidden(info.isDeload, settings);
  const morning = slot.morning ? lookups.templates.get(slot.morning) : undefined;
  const evening = slot.evening ? lookups.templates.get(slot.evening) : undefined;
  const testDay = isObjectiveTestDay(info, firstTestSeqDay(settings.weekPlan, lookups.templates, lookups.sessionTypes));
  return (
    <div className="rounded-2xl border border-accent/60 bg-card p-4">
      <div className="text-ink-2 first-letter:uppercase">{formatDateLong(today)}</div>
      {info.beforeStart ? (
        <p className="mt-1 text-xl font-semibold">Le programme commence le {formatDateLong(settings.cycleStartDate)}.</p>
      ) : (
        <>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
            <span className="text-4xl font-bold">{seqDayLabel(info.seqDay)}</span>
            <span className="text-xl font-semibold text-ink-2">semaine {info.week}</span>
          </div>
          <div className="text-ink-2">
            Cycle {info.cycle} · S{info.cycleWeek}/{settings.cycleLengthWeeks}
          </div>
          {(info.isDeload || testDay) && (
            <div className="mt-2 flex flex-wrap gap-2">
              {info.isDeload && <Badge tone="accent">Semaine allégée</Badge>}
              {testDay && <Badge tone="warn">Test des objectifs</Badge>}
            </div>
          )}
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-lg">
            <dt className="text-ink-3">Matin</dt>
            <dd>{morning ? (hidden ? `${morning.name} (masqué en semaine allégée)` : morning.name) : '—'}</dd>
            <dt className="text-ink-3">Soir</dt>
            <dd className="font-semibold">{evening?.name ?? 'Repos'}</dd>
          </dl>
        </>
      )}
      <p className="mt-3 text-ink-3">Le mode séance arrive avec la phase 1.</p>
    </div>
  );
}

export function VerifyScreen({
  data,
  onImported,
  onShowReport,
}: {
  data: AppData;
  onImported: (report: ImportReport) => void;
  onShowReport: (report: ImportReport) => void;
}) {
  const today = localISODate(new Date());
  const lookups = useMemo(() => buildLookups(data), [data]);
  const volumeOk = plannedComponentVolume(lookups.program, data.settings).every((r) => r.status === 'ok');
  const check = data.lastImport?.report.volumeCheck;

  return (
    <Screen title="Streeter" subtitle="Phase 0 · vérification de l’import">
      <TodayCard data={data} lookups={lookups} today={today} />
      <Section title="Semaine type" defaultOpen>
        <WeekPlanView settings={data.settings} lookups={lookups} today={today} />
      </Section>
      <Section
        title="Volume hebdo"
        aside={<Badge tone={volumeOk && check?.ok !== false ? 'ok' : 'warn'}>{volumeOk ? 'OK' : 'À revoir'}</Badge>}
      >
        <VolumeView data={data} lookups={lookups} today={today} />
      </Section>
      <Section title="Catalogue" aside={<Badge>{data.exercises.length}</Badge>}>
        <CatalogueView exercises={data.exercises} />
      </Section>
      <Section title="Objectifs" aside={<Badge>{data.objectives.length}</Badge>}>
        <ObjectivesView data={data} lookups={lookups} />
      </Section>
      <Section title="Journal" aside={<Badge>{data.sessions.length}</Badge>}>
        <JournalView data={data} lookups={lookups} />
      </Section>
      <Section title="Données">
        <DataView data={data} onImported={onImported} onShowReport={onShowReport} />
      </Section>
    </Screen>
  );
}
