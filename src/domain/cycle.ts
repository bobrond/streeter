// Calendrier : jours de séquence J1…J7, semaines, cycles, semaine allégée, jour de test.
// Les dates sont des chaînes locales YYYY-MM-DD ; l'arithmétique se fait sur des numéros de jour
// (insensible aux changements d'heure).
import type { SequenceDay } from './sequence';
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

/**
 * `programStartWeek` : semaine absolue où commence le programme en vigueur, S1 de son premier cycle
 * (1 par défaut). Les cycles se comptent à partir de là.
 */
export type CycleSettings = Pick<Settings, 'cycleStartDate' | 'cycleLengthWeeks' | 'deloadWeek'> & { programStartWeek?: number };

export interface DayInfo {
  date: string;
  seqDay: SeqDay;
  /** Semaine absolue depuis le début (1, 2… 5, 6…). */
  week: number;
  /** Cycle dans le programme en vigueur (1 pour son premier cycle). */
  cycle: number;
  /** Semaine dans le cycle, 1…durée du cycle. */
  cycleWeek: number;
  isDeload: boolean;
  /** Date antérieure au début du programme. */
  beforeStart: boolean;
  /**
   * Programme en séquence : position du jour dans la séquence ; `seqDay` est alors la position dans la tranche (1…n),
   * `cycleWeek` la tranche dans le cycle, `week` la semaine du calendrier.
   */
  sequence?: SequenceDay;
}

export function dayInfo(date: string, s: CycleSettings): DayInfo {
  const days = diffDays(s.cycleStartDate, date);
  const length = Math.max(1, s.cycleLengthWeeks);
  const week = Math.floor(days / 7) + 1;
  const sinceProgram = week - (s.programStartWeek ?? 1);
  const cycleWeek = mod(sinceProgram, length) + 1;
  return {
    date,
    seqDay: (mod(days, 7) + 1) as SeqDay,
    week,
    cycle: Math.floor(sinceProgram / length) + 1,
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
 * Semaine de test des objectifs : la première semaine de chaque cycle (début d'un programme compris), sauf la toute
 * première semaine (semaine 1), qui n'a rien à tester.
 */
export function isObjectiveTestWeek(info: DayInfo): boolean {
  return !info.beforeStart && info.week >= 2 && info.cycleWeek === 1;
}

export function isObjectiveTestDay(info: DayInfo, testSeqDay: SeqDay | null): boolean {
  return testSeqDay !== null && isObjectiveTestWeek(info) && info.seqDay === testSeqDay;
}

/**
 * Prochain jour de test des objectifs d'un programme, aujourd'hui compris : le jour `testSeqDay` de la première
 * semaine du prochain cycle (semaines 5, 9… avec des cycles de 4 semaines commencés en semaine 1). `null` sans jour
 * de test dans la semaine type.
 */
export function nextObjectiveTestDate(today: string, s: CycleSettings, testSeqDay: SeqDay | null): { date: string; week: number } | null {
  if (testSeqDay === null) return null;
  const length = Math.max(1, s.cycleLengthWeeks);
  const start = s.programStartWeek ?? 1;
  // Première semaine d'un cycle : semaines start + k × durée, jamais la semaine 1.
  let week = Math.max(dayInfo(today, s).week, start, 2);
  week += mod(start - week, length);
  if (dateOf(week, testSeqDay, s) < today) week += length;
  return { date: dateOf(week, testSeqDay, s), week };
}
