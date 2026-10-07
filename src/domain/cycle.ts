// Calendrier : jours de séquence J1…J7, semaines, cycles, semaine allégée, jour de test.
// Les dates sont des chaînes locales YYYY-MM-DD ; l'arithmétique se fait sur des numéros de jour
// (insensible aux changements d'heure).
import type { ID, SeqDay, SessionTemplate, SessionType, Settings, WeekPlan } from './types';
import { SEQ_DAYS } from './types';

const MS_PER_DAY = 86_400_000;

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

/** Numéro de jour (jours depuis le 1970-01-01) d'une date YYYY-MM-DD. */
export function toDayNumber(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

export function fromDayNumber(n: number): string {
  return new Date(n * MS_PER_DAY).toISOString().slice(0, 10);
}

export function addDays(iso: string, delta: number): string {
  return fromDayNumber(toDayNumber(iso) + delta);
}

export function diffDays(from: string, to: string): number {
  return toDayNumber(to) - toDayNumber(from);
}

/** 0 = dimanche … 6 = samedi, comme `Date.getDay()`. */
export function weekdayOf(iso: string): number {
  return new Date(toDayNumber(iso) * MS_PER_DAY).getUTCDay();
}

/** Date calendaire locale d'un instant. */
export function localISODate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export type CycleSettings = Pick<Settings, 'cycleStartDate' | 'cycleLengthWeeks' | 'deloadWeek'>;

export interface DayInfo {
  date: string;
  seqDay: SeqDay;
  /** Semaine absolue depuis le début (1, 2… 5, 6…). */
  week: number;
  cycle: number;
  /** Semaine dans le cycle, 1…durée du cycle. */
  cycleWeek: number;
  isDeload: boolean;
  /** Date antérieure au début du programme. */
  beforeStart: boolean;
}

export function dayInfo(date: string, s: CycleSettings): DayInfo {
  const days = diffDays(s.cycleStartDate, date);
  const length = Math.max(1, s.cycleLengthWeeks);
  const week = Math.floor(days / 7) + 1;
  const cycleWeek = mod(week - 1, length) + 1;
  return {
    date,
    seqDay: (mod(days, 7) + 1) as SeqDay,
    week,
    cycle: Math.floor((week - 1) / length) + 1,
    cycleWeek,
    isDeload: cycleWeek === s.deloadWeek,
    beforeStart: days < 0,
  };
}

/** Date du jour de séquence `seqDay` de la semaine absolue `week`. */
export function dateOf(week: number, seqDay: SeqDay, s: Pick<Settings, 'cycleStartDate'>): string {
  return addDays(s.cycleStartDate, (week - 1) * 7 + (seqDay - 1));
}

/**
 * Nouvelle date de début après un décalage de la séquence.
 * `+1` = « Passer au jour suivant » (aujourd'hui devient le jour de séquence suivant) ;
 * `-1` = « Reporter à demain » (demain reprend le jour de séquence d'aujourd'hui).
 */
export function shiftedStartDate(s: Pick<Settings, 'cycleStartDate'>, deltaDays: number): string {
  return addDays(s.cycleStartDate, -deltaDays);
}

/** Premier jour de séquence de la semaine dont la séance du soir est d'un type « jour de test » (Max). */
export function firstTestSeqDay(
  weekPlan: WeekPlan,
  templatesById: ReadonlyMap<ID, SessionTemplate>,
  sessionTypesById: ReadonlyMap<ID, SessionType>,
): SeqDay | null {
  for (const day of SEQ_DAYS) {
    const template = templatesById.get(weekPlan[day].evening ?? '');
    if (template && sessionTypesById.get(template.sessionTypeId)?.isTestDay) return day;
  }
  return null;
}

/**
 * Semaine de test des objectifs : début de la semaine 5, c'est-à-dire la première semaine
 * de chaque cycle à partir du deuxième.
 */
export function isObjectiveTestWeek(info: DayInfo): boolean {
  return !info.beforeStart && info.cycle >= 2 && info.cycleWeek === 1;
}

export function isObjectiveTestDay(info: DayInfo, testSeqDay: SeqDay | null): boolean {
  return testSeqDay !== null && isObjectiveTestWeek(info) && info.seqDay === testSeqDay;
}
