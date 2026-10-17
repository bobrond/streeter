// Séances prévues un jour donné (matin, soir), telles qu'elles se pratiquent ce jour-là.
import type { AppData } from '../../db/hooks';
import type { Lookups } from '../../db/lookups';
import type { DayInfo } from '../../domain/cycle';
import { deloadTemplate, morningsHidden } from '../../domain/deload';
import type { Moment, SessionLog, SessionTemplate } from '../../domain/types';

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
