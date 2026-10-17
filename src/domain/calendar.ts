// Calendrier des jours d'entraînement (Progression › Historique) : grille d'un mois, semaines du lundi au dimanche.
import { addDays, toDayNumber } from './cycle';
import type { SessionLog } from './types';

/** Mois « AAAA-MM » d'une date « AAAA-MM-JJ ». */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** « 2026-12 » + 1 → « 2027-01 ». */
export function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split('-').map(Number);
  const index = year * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

export function isMonth(text: string | null): text is string {
  return text !== null && /^\d{4}-(0[1-9]|1[0-2])$/.test(text);
}

/** Jour de la semaine, 1 = lundi … 7 = dimanche (le 01/01/1970 était un jeudi). */
export function isoWeekday(date: string): number {
  return ((((toDayNumber(date) + 3) % 7) + 7) % 7) + 1;
}

export interface CalendarDay {
  date: string;
  /** Numéro du jour dans le mois. */
  day: number;
  inMonth: boolean;
  isToday: boolean;
  /** Séances du jour, matin avant soir. */
  sessions: SessionLog[];
}

/** Grille du mois : semaines complètes du lundi au dimanche (jours des mois voisins compris). */
export function monthGrid(month: string, sessions: readonly SessionLog[], today: string): CalendarDay[][] {
  const byDate = new Map<string, SessionLog[]>();
  for (const session of sessions) {
    const list = byDate.get(session.date);
    if (list) list.push(session);
    else byDate.set(session.date, [session]);
  }
  for (const list of byDate.values()) {
    list.sort((a, b) => (a.moment === b.moment ? (a.startedAt ?? 0) - (b.startedAt ?? 0) : a.moment === 'morning' ? -1 : 1));
  }
  const first = `${month}-01`;
  let date = addDays(first, 1 - isoWeekday(first));
  const weeks: CalendarDay[][] = [];
  do {
    const week: CalendarDay[] = [];
    for (let i = 0; i < 7; i++) {
      week.push({ date, day: Number(date.slice(8)), inMonth: monthOf(date) === month, isToday: date === today, sessions: byDate.get(date) ?? [] });
      date = addDays(date, 1);
    }
    weeks.push(week);
  } while (monthOf(date) === month);
  return weeks;
}

/** Séances et jours d'entraînement du mois. */
export function monthSummary(month: string, sessions: readonly SessionLog[]): { sessions: number; days: number } {
  const inMonth = sessions.filter((s) => monthOf(s.date) === month);
  return { sessions: inMonth.length, days: new Set(inMonth.map((s) => s.date)).size };
}
