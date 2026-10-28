// Période du volume : une semaine en semaine type, une tranche en séquence. Séances de la période et avancement de
// ses séances prévues (jours J1-J7, ou positions de la tranche), pour les jauges et les séries encore prévues.
import { morningsHidden } from './deload';
import { projectedDate, sequenceIds, sequenceState } from './sequence';
import type { ID, SessionLog, SessionTemplate, Settings } from './types';
import type { VolumePeriod } from './volume';
import { weekSessionIds } from './volume';
import { weekProgress, type DayProgress, type SlotProgress, type SlotStatus } from './week';
import { dateOf, dayInfo, type CycleSettings } from './cycle';

export interface PeriodView extends VolumePeriod {
  kind: 'week' | 'tranche';
  /** Semaine absolue, ou tranche depuis le début du programme (0 = la première). */
  number: number;
  /** Séances prévues et leur avancement : J1-J7, ou positions 1…n de la tranche (soir) et matins 1…m. */
  days: DayProgress[];
}

export function weekPeriod(
  week: number,
  today: string,
  settings: CycleSettings & Pick<Settings, 'weekPlan' | 'hideMorningsInDeload'>,
  templatesById: ReadonlyMap<ID, SessionTemplate>,
  sessions: readonly SessionLog[],
): PeriodView {
  const days = weekProgress(week, today, settings, templatesById, sessions);
  const isDeload = dayInfo(dateOf(week, 1, settings), settings).isDeload;
  return { kind: 'week', number: week, days, sessionIds: weekSessionIds(sessions, week), isDeload };
}

/**
 * Tranche `tranche` (0 = la première) d'un programme en séquence. `sessions` : celles du programme. Séance du soir de
 * la position k : faite, en cours, à faire (la prochaine : « aujourd'hui ») ou à venir, avec sa date indicative ; matins
 * de la tranche : faits, ou encore disponibles.
 */
export function tranchePeriod(
  tranche: number,
  today: string,
  settings: Pick<Settings, 'weekPlan' | 'hideMorningsInDeload' | 'cycleLengthWeeks' | 'deloadWeek'>,
  templatesById: ReadonlyMap<ID, SessionTemplate>,
  sessions: readonly SessionLog[],
): PeriodView {
  const state = sequenceState(settings.weekPlan, sessions);
  const evenings = sequenceIds(settings.weekPlan, 'evening');
  const mornings = sequenceIds(settings.weekPlan, 'morning');
  const n = state.length;
  const cycleWeek = (tranche % Math.max(1, settings.cycleLengthWeeks)) + 1;
  const isDeload = cycleWeek === settings.deloadWeek;
  const inTranche = sessions.filter((s) => state.trancheOf.get(s.id) === tranche);
  const morningSessions = inTranche.filter((s) => s.moment === 'morning').sort((a, b) => a.date.localeCompare(b.date) || (a.startedAt ?? 0) - (b.startedAt ?? 0));
  const days: DayProgress[] = [];
  for (let k = 0; k < Math.max(n, mornings.length, morningSessions.length); k++) {
    const index = tranche * n + k;
    let evening: SlotProgress;
    if (k < evenings.length) {
      const logged = inTranche.filter((s) => s.moment === 'evening' && state.indexOf.get(s.id) === index);
      let status: SlotStatus;
      if (logged.some((s) => s.status === 'done')) status = 'done';
      else if (logged.some((s) => s.status === 'in_progress')) status = 'in_progress';
      else status = index === state.done ? 'today' : index > state.done ? 'upcoming' : 'missed';
      evening = { moment: 'evening', planned: templatesById.get(evenings[k]) ?? null, sessions: logged, status };
    } else evening = { moment: 'evening', planned: null, sessions: [], status: 'none' };
    const morningLogged = morningSessions[k] ? [morningSessions[k]] : [];
    const morningPlanned = templatesById.get(mornings[k] ?? '') ?? null;
    let morningStatus: SlotStatus = 'none';
    if (morningLogged.length > 0) morningStatus = morningLogged[0].status === 'done' ? 'done' : morningLogged[0].status === 'in_progress' ? 'in_progress' : 'abandoned';
    else if (morningPlanned) morningStatus = morningsHidden(isDeload, settings) ? 'hidden' : tranche < Math.floor(state.done / n) ? 'skipped' : 'upcoming';
    const date = evening.sessions[0]?.date ?? (evening.status === 'today' || evening.status === 'upcoming' ? projectedDate(today, index - state.done, n) : '');
    days.push({
      seqDay: Math.min(7, k + 1) as DayProgress['seqDay'],
      date,
      isToday: evening.sessions.some((s) => s.date === today),
      slots: { evening, morning: { moment: 'morning', planned: morningPlanned, sessions: morningLogged, status: morningStatus } },
    });
  }
  return { kind: 'tranche', number: tranche, days, sessionIds: new Set(inTranche.map((s) => s.id)), isDeload };
}
