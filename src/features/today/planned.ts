// Séances prévues un jour donné (matin, soir), telles qu'elles se pratiquent ce jour-là : jour de la semaine type,
// ou position dans la séquence d'un programme en séquence.
import type { AppData } from '../../db/hooks';
import type { Lookups } from '../../db/lookups';
import { addDays, dayInfo, type DayInfo } from '../../domain/cycle';
import { morningsHidden, practicedTemplate } from '../../domain/deload';
import { seqDayLabel } from '../../domain/labels';
import { tranchePeriod, weekPeriod, type PeriodView } from '../../domain/period';
import { programDateWindow, programStartDate, settingsAtDate } from '../../domain/programs';
import { projectedDate, sequenceDayInfo, sequenceIds, sequencePosition, sessionsBetween } from '../../domain/sequence';
import type { Moment, Program, SeqDay, SessionLog, SessionTemplate } from '../../domain/types';
import { MOMENTS } from '../../domain/types';

export interface Planned {
  moment: Moment;
  template: SessionTemplate;
  /** Tel qu'il se pratique aujourd'hui (valeurs de la tranche, allégé en semaine allégée). */
  practiced: SessionTemplate;
  hidden: boolean;
  done: SessionLog[];
}

/** Jour de séquence (« J3 »), ou position dans la tranche d'un programme en séquence (« Séance 3/5 »). */
export function dayLabel(info: DayInfo, moment: Moment = 'evening'): string {
  if (!info.sequence) return seqDayLabel(info.seqDay);
  return moment === 'morning' ? 'hors séquence' : `Séance ${info.seqDay}/${info.sequence.length}`;
}

/** Séances d'un programme : de son début au début du suivant. */
export function programSessions(data: AppData, program: Program = data.program): SessionLog[] {
  const window = programDateWindow(data.programs, data.appSettings, program);
  return sessionsBetween(data.sessions, window.start, window.end);
}

/** Un jour pour le programme en vigueur aujourd'hui : jour de la semaine type, ou position dans la séquence. */
export function infoFor(date: string, data: AppData): DayInfo {
  const s = data.settings;
  if (s.schedule !== 'sequence') return dayInfo(date, s);
  return sequenceDayInfo(date, { ...s, startDate: programStartDate(data.appSettings, data.program) }, programSessions(data));
}

/** Période du volume d'un jour : sa semaine, ou sa tranche en séquence. */
export function periodFor(info: DayInfo, data: AppData, lookups: Lookups): PeriodView {
  if (info.sequence) return tranchePeriod(info.sequence.tranche, info.date, data.settings, lookups.templates, programSessions(data));
  return weekPeriod(info.week, info.date, data.settings, lookups.templates, data.sessions);
}

export function plannedFor(info: DayInfo, data: AppData, lookups: Lookups): Planned[] {
  if (info.beforeStart) return [];
  const slot = info.sequence?.slot ?? data.settings.weekPlan[info.seqDay];
  const list: Planned[] = [];
  // En séquence, la séance du soir d'abord : c'est elle qui fait avancer la séquence ; le matin est un bonus.
  const moments = info.sequence ? (['evening', 'morning'] as const) : (['morning', 'evening'] as const);
  for (const moment of moments) {
    const template = lookups.templates.get(slot[moment] ?? '');
    if (!template) continue;
    list.push({
      moment,
      template,
      practiced: practicedTemplate(template, info, lookups.blocks, data.settings),
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

export interface NextPlanned {
  /** Date prévue ; en séquence, date indicative (si aucune séance n'est ratée). */
  date: string;
  seqDay: SeqDay;
  moment: Moment;
  template: SessionTemplate;
}

/**
 * Prochaine séance prévue après aujourd'hui (matins masqués en semaine allégée exclus), dans les 7 jours. En
 * séquence : la séance du soir qui suit celle du jour (la même, si celle du jour a été abandonnée).
 */
export function nextPlanned(info: DayInfo, data: AppData, lookups: Lookups): NextPlanned | null {
  if (info.sequence) {
    const { index, done, length } = info.sequence;
    const evenings = sequenceIds(data.settings.weekPlan, 'evening');
    const today = data.sessions.filter((s) => s.date === info.date && s.moment === 'evening');
    const next = today.length === 0 ? index + 1 : today.some((s) => s.status === 'in_progress') ? done + 1 : done;
    const template = lookups.templates.get(evenings[next % Math.max(1, evenings.length)] ?? '');
    if (!template) return null;
    const date = projectedDate(info.date, Math.max(1, next - index), length);
    return { date, seqDay: sequencePosition(next, length, data.settings).seqDay, moment: 'evening', template };
  }
  for (let delta = 1; delta <= 7; delta++) {
    const date = addDays(info.date, delta);
    // Le programme suivant peut commencer dans la semaine.
    const settings = settingsAtDate(data.appSettings, data.programs, date) ?? data.settings;
    if (settings.schedule === 'sequence') {
      // Un programme en séquence qui commence : sa première séance.
      const first = lookups.templates.get(sequenceIds(settings.weekPlan, 'evening')[0] ?? '');
      if (first) return { date, seqDay: 1, moment: 'evening', template: first };
      continue;
    }
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
