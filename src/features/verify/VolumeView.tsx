import type { AppData } from '../../db/hooks';
import { dayInfo } from '../../domain/cycle';
import { VOLUME_STATUS_LABEL, formatDuration } from '../../domain/labels';
import {
  plannedComponentVolume,
  programIssues,
  realizedComponentVolume,
  skillTotals,
  type ProgramIssue,
  type VolumeStatus,
} from '../../domain/volume';
import { Badge, type Tone } from '../../ui/Badge';
import type { Lookups } from './lookups';

const STATUS_TONE: Record<VolumeStatus, Tone> = { ok: 'ok', under_min: 'danger', over_max: 'warn', deload: 'accent' };

function StatusBadge({ status }: { status: VolumeStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{VOLUME_STATUS_LABEL[status]}</Badge>;
}

function issueText(issue: ProgramIssue, lookups: Lookups, morningMaxMinutes: number): string {
  switch (issue.kind) {
    case 'component_volume':
      return `${lookups.elements.get(issue.elementId)?.name} : ${VOLUME_STATUS_LABEL[issue.status]}`;
    case 'evening_missing_skill':
      return `${lookups.templates.get(issue.templateId)?.name} : pas de ${lookups.elements.get(issue.elementId)?.name}`;
    case 'morning_too_long':
      return `${lookups.templates.get(issue.templateId)?.name} : jusqu’à ${formatDuration(issue.maxSec)} (max ${morningMaxMinutes} min)`;
  }
}

export function VolumeView({ data, lookups, today }: { data: AppData; lookups: Lookups; today: string }) {
  const { settings } = data;
  const info = dayInfo(today, settings);
  const planned = plannedComponentVolume(lookups.program, settings);
  const realized = realizedComponentVolume(data.sets, lookups.sessions, data.elements, settings, { week: info.week, isDeload: info.isDeload });
  const skills = skillTotals(lookups.program, settings);
  const issues = programIssues(lookups.program, settings);

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <h4 className="text-sm font-bold tracking-wide text-ink-3 uppercase">Composantes de renfo</h4>
        <p className="text-ink-2">
          Bornes : {settings.volumeMin} à {settings.volumeMax} séries par semaine. Le soir garantit le minimum, le matin complète.
        </p>
        {planned.map((row) => {
          const done = realized.find((r) => r.elementId === row.elementId);
          return (
            <div key={row.elementId} className="rounded-xl bg-card-2 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-lg font-semibold">{row.name}</span>
                <StatusBadge status={row.status} />
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 text-ink-2 tabular-nums">
                <span>
                  Soir <b className="text-ink">{row.eveningGuaranteed === row.eveningMax ? row.eveningMax : `${row.eveningGuaranteed}-${row.eveningMax}`}</b>
                </span>
                <span>
                  Matin <b className="text-ink">{row.morningMax}</b>
                </span>
                <span>
                  Total <b className="text-ink">{row.totalMax}</b>
                </span>
                <span>
                  Allégée <b className="text-ink">{row.deloadEvening}</b>
                </span>
              </div>
              {done && (
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-2 text-ink-2 tabular-nums">
                  <span>
                    Fait cette semaine : soir {done.evening} · matin {done.morning} · total {done.total}
                  </span>
                  <StatusBadge status={done.status} />
                </div>
              )}
            </div>
          );
        })}
      </section>

      <section className="flex flex-col gap-2">
        <h4 className="text-sm font-bold tracking-wide text-ink-3 uppercase">Totaux par skill</h4>
        {skills.map((row) => (
          <div key={`${row.blockTypeId}-${row.elementId}`} className="rounded-xl bg-card-2 p-3">
            <div className="font-semibold">
              {lookups.blocks.get(row.blockTypeId)?.name} · {lookups.elements.get(row.elementId)?.name}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 text-ink-2 tabular-nums">
              <span>
                Séries <b className="text-ink">{row.setsMin}-{row.setsMax}</b>
              </span>
              <span>
                Séances <b className="text-ink">{row.sessions}</b>
              </span>
              <span>
                Allégée <b className="text-ink">{row.deloadMax}</b>
              </span>
            </div>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-2">
        <h4 className="text-sm font-bold tracking-wide text-ink-3 uppercase">Contrôles du programme</h4>
        {issues.length === 0 ? (
          <p className="text-ok">Aucun problème : volume dans les bornes, planche et FL à chaque soir, matins sous {settings.morningMaxMinutes} min.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {issues.map((issue, i) => (
              <li key={i} className="text-warn">
                {issueText(issue, lookups, settings.morningMaxMinutes)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
