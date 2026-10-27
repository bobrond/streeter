// Séances prévues un jour donné (matin, soir), telles qu'elles se pratiquent ce jour-là.
import type { AppData } from '../../db/hooks';
import type { Lookups } from '../../db/lookups';
import { addDays, dayInfo, type DayInfo } from '../../domain/cycle';
import { deloadTemplate, morningsHidden } from '../../domain/deload';
import { settingsAtDate } from '../../domain/programs';
import type { Moment, SeqDay, SessionLog, SessionTemplate } from '../../domain/types';
import { MOMENTS } from '../../domain/types';

export interface Planned {
  moment: Moment;
  template: SessionTemplate;
  /** Tel qu'il se pratique aujourd'hui (allégé en semaine allégée). */
  practiced: SessionTemplate;
  hidden: boolean;
  done: SessionLog[];
}

export function plannedFor(info: DayInfo, data: AppData, lookups: Lookups): Planned[] {
  if (info.beforeStart) return [];
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

/** La prochaine séance à faire aujourd'hui : visible et pas encore faite. */
export function pendingPlanned(planned: readonly Planned[]): Planned | undefined {
  return planned.find((p) => !p.hidden && p.done.length === 0);
}

/** Séances du jour qu'une séance express peut remplacer : visibles, ni faites ni abandonnées. */
export function replaceablePlanned(planned: readonly Planned[]): Planned[] {
  return planned.filter((p) => !p.hidden && p.done.length === 0);
}

/** Prochaine séance prévue après aujourd'hui (matins masqués en semaine allégée exclus), dans les 7 jours. */
export function nextPlanned(info: DayInfo, data: AppData, lookups: Lookups): { date: string; seqDay: SeqDay; moment: Moment; template: SessionTemplate } | null {
  for (let delta = 1; delta <= 7; delta++) {
    const date = addDays(info.date, delta);
    // Le programme suivant peut commencer dans la semaine.
    const settings = settingsAtDate(data.appSettings, data.programs, date) ?? data.settings;
    const day = dayInfo(date, settings);
    if (day.beforeStart) continue;
    for (const moment of MOMENTS) {
      const template = lookups.templates.get(settings.weekPlan[day.seqDay][moment] ?? '');
      if (!template || (moment === 'morning' && morningsHidden(day.isDeload, settings))) continue;
      return { date: day.date, seqDay: day.seqDay, moment, template };
    }
  }
  return null;
}
