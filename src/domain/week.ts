// Avancement d'une semaine : séances prévues J1…J7 et séances réellement faites, par date.
import { addDays, dateOf, dayInfo, type CycleSettings } from './cycle';
import { morningsHidden } from './deload';
import type { ID, Moment, SeqDay, SessionLog, SessionTemplate, Settings } from './types';
import { MOMENTS, SEQ_DAYS } from './types';

export type SlotStatus =
  /** Séance faite. */
  | 'done'
  | 'in_progress'
  | 'abandoned'
  /** Séance obligatoire passée, pas faite. */
  | 'missed'
  /** Séance optionnelle passée, pas faite. */
  | 'skipped'
  /** Prévue aujourd'hui, pas encore faite. */
  | 'today'
  | 'upcoming'
  /** Matin masqué en semaine allégée. */
  | 'hidden'
  /** Rien de prévu ni de fait. */
  | 'none';

export interface SlotProgress {
  moment: Moment;
  planned: SessionTemplate | null;
  /** Séances enregistrées ce jour-là à ce moment (quel que soit le modèle). */
  sessions: SessionLog[];
  status: SlotStatus;
}

export interface DayProgress {
  seqDay: SeqDay;
  date: string;
  isToday: boolean;
  slots: Record<Moment, SlotProgress>;
}

export function weekProgress(
  week: number,
  today: string,
  settings: CycleSettings & Pick<Settings, 'weekPlan' | 'hideMorningsInDeload'>,
  templatesById: ReadonlyMap<ID, SessionTemplate>,
  sessions: readonly SessionLog[],
): DayProgress[] {
  const isDeload = dayInfo(dateOf(week, 1, settings), settings).isDeload;
  return SEQ_DAYS.map((seqDay) => {
    const date = dateOf(week, seqDay, settings);
    const slots = {} as Record<Moment, SlotProgress>;
    for (const moment of MOMENTS) {
      const planned = templatesById.get(settings.weekPlan[seqDay][moment] ?? '') ?? null;
      const logged = sessions.filter((s) => s.date === date && s.moment === moment);
      let status: SlotStatus;
      if (logged.some((s) => s.status === 'done')) status = 'done';
      else if (logged.some((s) => s.status === 'in_progress')) status = 'in_progress';
      else if (logged.length > 0) status = 'abandoned';
      else if (!planned) status = 'none';
      else if (moment === 'morning' && morningsHidden(isDeload, settings)) status = 'hidden';
      else if (date < today) status = planned.optional ? 'skipped' : 'missed';
      else if (date === today) status = 'today';
      else status = 'upcoming';
      slots[moment] = { moment, planned, sessions: logged, status };
    }
    return { seqDay, date, isToday: date === today, slots };
  });
}

/** Première et dernière date de la semaine absolue `week`. */
export function weekRange(week: number, settings: Pick<Settings, 'cycleStartDate'>): { from: string; to: string } {
  const from = dateOf(week, 1, settings);
  return { from, to: addDays(from, 6) };
}
