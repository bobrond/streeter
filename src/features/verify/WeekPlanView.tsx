import { dateOf, dayInfo } from '../../domain/cycle';
import { estimateDuration } from '../../domain/duration';
import { MOMENT_LABEL, formatDateLong, formatDuration, seqDayLabel } from '../../domain/labels';
import { SEQ_DAYS, type ID, type Moment, type Settings } from '../../domain/types';
import { Badge } from '../../ui/Badge';
import type { Lookups } from './lookups';
import { TemplateItems } from './TemplateItems';

function SlotView({ moment, templateId, lookups, settings }: { moment: Moment; templateId: ID | null; lookups: Lookups; settings: Settings }) {
  const template = templateId ? lookups.templates.get(templateId) : undefined;
  if (!template) {
    if (moment === 'morning') return null;
    return (
      <div className="mt-2 flex min-h-12 items-center gap-2 px-3 text-ink-3">
        <span className="w-14 shrink-0">{MOMENT_LABEL[moment]}</span>
        <span>Repos</span>
      </div>
    );
  }
  const type = lookups.sessionTypes.get(template.sessionTypeId);
  const { minSec, maxSec } = estimateDuration(template, settings);
  return (
    <details className="group/slot mt-2 rounded-xl bg-card-2">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-3 py-2">
        <span className="w-14 shrink-0 text-ink-2">{MOMENT_LABEL[moment]}</span>
        <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: type?.color }} aria-hidden />
        <span className="flex-1 font-semibold">{template.name}</span>
        {template.optional && <Badge>optionnel</Badge>}
        <svg aria-hidden viewBox="0 0 20 20" className="size-5 shrink-0 text-ink-3 transition-transform group-open/slot:rotate-180">
          <path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="px-3 pb-3">
        <p className="mb-3 text-ink-2">
          {type?.description}
          {type?.description ? ' · ' : ''}durée estimée {formatDuration(minSec)} à {formatDuration(maxSec)}
        </p>
        <TemplateItems template={template} lookups={lookups} />
      </div>
    </details>
  );
}

/** Semaine type J1…J7, datée sur la semaine en cours. */
export function WeekPlanView({ settings, lookups, today }: { settings: Settings; lookups: Lookups; today: string }) {
  const info = dayInfo(today, settings);
  return (
    <div className="flex flex-col gap-3">
      {SEQ_DAYS.map((day) => {
        const slot = settings.weekPlan[day];
        const isToday = day === info.seqDay && !info.beforeStart;
        return (
          <div key={day} className={`rounded-xl border p-2 ${isToday ? 'border-accent' : 'border-line'}`}>
            <div className="flex flex-wrap items-baseline gap-x-2 px-1">
              <span className="text-xl font-bold">{seqDayLabel(day)}</span>
              <span className="text-ink-2">{formatDateLong(dateOf(Math.max(1, info.week), day, settings))}</span>
              {isToday && <Badge tone="accent">aujourd’hui</Badge>}
            </div>
            <SlotView moment="morning" templateId={slot.morning} lookups={lookups} settings={settings} />
            <SlotView moment="evening" templateId={slot.evening} lookups={lookups} settings={settings} />
          </div>
        );
      })}
    </div>
  );
}
