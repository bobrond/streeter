// Programmes en séquence : les séances du soir d'une tranche se font dans l'ordre, quel que soit le jour. La séance
// proposée suit la dernière faite ; une séance ratée n'est ni décomptée ni sautée. Une tranche tient lieu de semaine
// (volume, semaine allégée, test des objectifs) ; les matins sont hors séquence, disponibles n'importe quel jour.
// La position se déduit des séances faites : rien n'est stocké, une séance supprimée du journal rend sa place.
import { addDays, dayInfo, type DayInfo } from './cycle';
import type { ID, SessionLog, SessionTemplate, SessionType, Settings, WeekPlan, WeekSlot } from './types';
import { SEQ_DAYS } from './types';

/** Séances d'un moment, dans l'ordre J1…J7 (les créneaux vides sont ignorés). */
export function sequenceIds(weekPlan: WeekPlan, moment: 'evening' | 'morning'): ID[] {
  return SEQ_DAYS.map((day) => weekPlan[day][moment]).filter((id): id is ID => id !== null);
}

/** Semaine type tirée d'une séquence : soirs J1…Jn, matins J1…Jm. Au plus 7 de chaque. */
export function sequenceWeekPlan(evenings: readonly ID[], mornings: readonly ID[]): WeekPlan {
  const plan = {} as WeekPlan;
  for (const day of SEQ_DAYS) plan[day] = { morning: mornings[day - 1] ?? null, evening: evenings[day - 1] ?? null };
  return plan;
}

export interface SequenceState {
  /** Séances du soir d'une tranche. */
  length: number;
  /** Tranche de chaque séance du programme (0 = la première), d'après les séances du soir faites avant elle. */
  trancheOf: Map<ID, number>;
  /** Position (0 = la première séance du programme) de chaque séance du soir faite ou en cours. */
  indexOf: Map<ID, number>;
  /** Séances du soir faites : la prochaine est à cette position. */
  done: number;
}

const chronological = (a: SessionLog, b: SessionLog) => a.date.localeCompare(b.date) || (a.startedAt ?? 0) - (b.startedAt ?? 0);

/**
 * Avancement d'un programme en séquence. `sessions` : celles de sa période (de son début au début du suivant). Chaque
 * séance du soir faite prend la position suivante, quelle qu'elle soit (séance express ou autre séance comprise) ;
 * une séance abandonnée ne compte pas.
 */
export function sequenceState(weekPlan: WeekPlan, sessions: readonly SessionLog[]): SequenceState {
  const length = Math.max(1, sequenceIds(weekPlan, 'evening').length);
  const trancheOf = new Map<ID, number>();
  const indexOf = new Map<ID, number>();
  let done = 0;
  for (const session of [...sessions].sort(chronological)) {
    trancheOf.set(session.id, Math.floor(done / length));
    if (session.moment !== 'evening') continue;
    if (session.status === 'done') indexOf.set(session.id, done++);
    else if (session.status === 'in_progress') indexOf.set(session.id, done);
  }
  return { length, trancheOf, indexOf, done };
}

export interface SequencePosition {
  /** Position dans la tranche, 1…n. */
  seqDay: DayInfo['seqDay'];
  /** Tranche depuis le début du programme, 0 = la première. */
  tranche: number;
  cycle: number;
  /** Tranche dans le cycle, 1…nombre de tranches. */
  cycleWeek: number;
  isDeload: boolean;
}

export function sequencePosition(index: number, length: number, s: Pick<Settings, 'cycleLengthWeeks' | 'deloadWeek'>): SequencePosition {
  const n = Math.max(1, length);
  const tranches = Math.max(1, s.cycleLengthWeeks);
  const tranche = Math.floor(index / n);
  const cycleWeek = (tranche % tranches) + 1;
  return {
    seqDay: (Math.min(7, (index % n) + 1)) as DayInfo['seqDay'],
    tranche,
    cycle: Math.floor(tranche / tranches) + 1,
    cycleWeek,
    isDeload: cycleWeek === s.deloadWeek,
  };
}

/** Ce qu'un jour est dans un programme en séquence. */
export interface SequenceDay {
  /** Séances proposées ce jour-là : la séance du soir de la position, le prochain matin disponible de la tranche. */
  slot: WeekSlot;
  /** Position de la séance du soir de ce jour (0 = la première séance du programme). */
  index: number;
  /** Tranche depuis le début du programme, 0 = la première. */
  tranche: number;
  /** Séances du soir d'une tranche. */
  length: number;
  /** Séances du soir faites dans le programme. */
  done: number;
}

export type SequenceInfo = DayInfo & { sequence: SequenceDay };

/**
 * Jour `date` d'un programme en séquence (en principe aujourd'hui). La position est celle de la séance du soir faite,
 * en cours ou abandonnée ce jour-là s'il y en a une, sinon la prochaine à faire. Le matin proposé : le suivant de la
 * liste des matins tant que la tranche n'a pas fait tous les siens.
 */
export function sequenceDayInfo(
  date: string,
  settings: Pick<Settings, 'cycleStartDate' | 'cycleLengthWeeks' | 'deloadWeek' | 'weekPlan'> & { startDate: string },
  sessions: readonly SessionLog[],
): SequenceInfo {
  const state = sequenceState(settings.weekPlan, sessions);
  const evenings = sequenceIds(settings.weekPlan, 'evening');
  const mornings = sequenceIds(settings.weekPlan, 'morning');
  const todays = sessions.filter((s) => s.date === date).sort(chronological);
  const evening = todays.filter((s) => s.moment === 'evening').at(-1);
  const index = evening ? (state.indexOf.get(evening.id) ?? doneBefore(evening, sessions)) : state.done;
  const position = sequencePosition(index, state.length, settings);
  const morningsBefore = sessions.filter(
    (s) => s.moment === 'morning' && s.status === 'done' && s.date < date && state.trancheOf.get(s.id) === position.tranche,
  ).length;
  const hasMorningToday = todays.some((s) => s.moment === 'morning');
  const morning = mornings.length === 0 ? null : morningsBefore < mornings.length ? mornings[morningsBefore] : hasMorningToday ? mornings[mornings.length - 1] : null;
  const calendar = dayInfo(date, { cycleStartDate: settings.cycleStartDate, cycleLengthWeeks: 1, deloadWeek: 0 });
  return {
    date,
    seqDay: position.seqDay,
    week: calendar.week,
    cycle: position.cycle,
    cycleWeek: position.cycleWeek,
    isDeload: position.isDeload,
    beforeStart: date < settings.startDate,
    sequence: {
      slot: { morning, evening: evenings.length > 0 ? evenings[index % evenings.length] : null },
      index,
      tranche: position.tranche,
      length: state.length,
      done: state.done,
    },
  };
}

/** Séances du soir faites avant une séance (pour une séance abandonnée, qui ne prend pas de position). */
function doneBefore(session: SessionLog, sessions: readonly SessionLog[]): number {
  return sessions.filter((s) => s.moment === 'evening' && s.status === 'done' && chronological(s, session) < 0).length;
}

/** Jours comptés par séance pour les dates indicatives : une tranche dure environ une semaine. */
export function daysPerSession(length: number): number {
  return 7 / Math.max(1, length);
}

/**
 * Date indicative de la séance qui est `steps` positions après celle d'aujourd'hui (0 : aujourd'hui), si aucune
 * séance n'est ratée : une tranche par semaine environ.
 */
export function projectedDate(today: string, steps: number, length: number): string {
  return addDays(today, Math.round(Math.max(0, steps) * daysPerSession(length)));
}

/** Fin indicative du cycle en cours : date de sa dernière séance si aucune n'est ratée. */
export function projectedCycleEnd(info: SequenceInfo, s: Pick<Settings, 'cycleLengthWeeks'>): string {
  const { index, length } = info.sequence;
  const perCycle = length * Math.max(1, s.cycleLengthWeeks);
  const last = (Math.floor(index / perCycle) + 1) * perCycle - 1;
  return projectedDate(info.date, last - index, length);
}

/** Position, dans la tranche (1…n), de la première séance du soir d'un type « jour de test ». */
export function firstTestPosition(
  weekPlan: WeekPlan,
  templatesById: ReadonlyMap<ID, SessionTemplate>,
  sessionTypesById: ReadonlyMap<ID, SessionType>,
): number | null {
  const evenings = sequenceIds(weekPlan, 'evening');
  const k = evenings.findIndex((id) => {
    const template = templatesById.get(id);
    return template !== undefined && sessionTypesById.get(template.sessionTypeId)?.isTestDay === true;
  });
  return k === -1 ? null : k + 1;
}

/**
 * Prochaine séance de test d'un programme en séquence, aujourd'hui compris : la première séance d'un type « jour de
 * test » de la première tranche de chaque cycle (début du programme compris), jamais en semaine 1. Date indicative.
 */
export function nextSequenceTest(info: SequenceInfo, s: Pick<Settings, 'cycleLengthWeeks'>, testPosition: number | null): { date: string; index: number } | null {
  if (testPosition === null) return null;
  const { index, length } = info.sequence;
  const perCycle = length * Math.max(1, s.cycleLengthWeeks);
  for (let cycle = Math.floor(index / perCycle); cycle < Math.floor(index / perCycle) + 2; cycle++) {
    const at = cycle * perCycle + testPosition - 1;
    if (at < index) continue;
    const date = projectedDate(info.date, at - index, length);
    if (info.week < 2 && date === info.date) continue;
    return { date, index: at };
  }
  return null;
}

/** Séances d'un programme : de son début (inclus) au début du suivant (exclu). */
export function sessionsBetween(sessions: readonly SessionLog[], from: string, to: string | null): SessionLog[] {
  return sessions.filter((s) => s.date >= from && (to === null || s.date < to));
}

