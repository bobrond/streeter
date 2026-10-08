// Journal : séances filtrées, lignes par (bloc, exercice), historique d'un exercice.
import type { ID, SessionLog, SetLog } from './types';

export interface JournalFilter {
  exerciseId?: ID | null;
  elementId?: ID | null;
  blockTypeId?: ID | null;
  sessionTypeId?: ID | null;
}

export function isFilterActive(filter: JournalFilter): boolean {
  return Boolean(filter.exerciseId || filter.elementId || filter.blockTypeId || filter.sessionTypeId);
}

/** Séries d'une même séance, d'un même bloc et d'un même exercice : une ligne du Journal. */
export interface JournalLine {
  blockTypeId: ID | null;
  exerciseId: ID;
  sets: SetLog[];
}

/** Lignes d'une séance dans l'ordre de leur première série. */
export function sessionLines(sets: readonly SetLog[]): JournalLine[] {
  const lines = new Map<string, JournalLine>();
  for (const set of [...sets].sort((a, b) => a.createdAt - b.createdAt)) {
    const key = `${set.blockTypeId ?? ''}|${set.exerciseId}`;
    const line = lines.get(key);
    if (line) line.sets.push(set);
    else lines.set(key, { blockTypeId: set.blockTypeId, exerciseId: set.exerciseId, sets: [set] });
  }
  return [...lines.values()];
}

export interface JournalEntry {
  session: SessionLog;
  /** Toutes les séries de la séance. */
  setCount: number;
  /** Lignes qui passent le filtre. */
  lines: JournalLine[];
}

/**
 * Séances du journal, les plus récentes d'abord. Un filtre sur l'exercice, l'élément ou le bloc
 * ne garde que les séances (et les lignes) qui ont des séries correspondantes.
 */
export function journalEntries(sessions: readonly SessionLog[], sets: readonly SetLog[], filter: JournalFilter = {}): JournalEntry[] {
  const bySession = new Map<ID, SetLog[]>();
  for (const set of sets) {
    const list = bySession.get(set.sessionId);
    if (list) list.push(set);
    else bySession.set(set.sessionId, [set]);
  }
  const setFilter = Boolean(filter.exerciseId || filter.elementId || filter.blockTypeId);
  const keep = (s: SetLog) =>
    (!filter.exerciseId || s.exerciseId === filter.exerciseId) &&
    (!filter.elementId || s.elementId === filter.elementId) &&
    (!filter.blockTypeId || s.blockTypeId === filter.blockTypeId);
  const entries: JournalEntry[] = [];
  for (const session of sessions) {
    if (session.status === 'in_progress') continue;
    if (filter.sessionTypeId && session.sessionTypeId !== filter.sessionTypeId) continue;
    const all = bySession.get(session.id) ?? [];
    const kept = all.filter(keep);
    if (setFilter && kept.length === 0) continue;
    entries.push({ session, setCount: all.length, lines: sessionLines(kept) });
  }
  return entries.sort((a, b) => b.session.date.localeCompare(a.session.date) || (b.session.startedAt ?? 0) - (a.session.startedAt ?? 0));
}

/** Meilleure valeur d'une séance sur un exercice, pour un élastique donné. */
export interface ProgressPoint {
  sessionId: ID;
  date: string;
  bandId: ID | null;
  best: number;
}

/**
 * Courbe de progression : meilleure valeur par séance et par élastique (le skill sans élastique
 * et le skill assisté ne se comparent pas). Les séries dégradées ne comptent pas.
 */
export function progressPoints(exerciseId: ID, sets: readonly SetLog[], sessionsById: ReadonlyMap<ID, Pick<SessionLog, 'date'>>): ProgressPoint[] {
  const points = new Map<string, ProgressPoint>();
  for (const set of sets) {
    if (set.exerciseId !== exerciseId || set.value === null || set.quality === 'degraded') continue;
    const date = sessionsById.get(set.sessionId)?.date;
    if (!date) continue;
    const key = `${set.sessionId}|${set.bandId ?? ''}`;
    const point = points.get(key);
    if (!point) points.set(key, { sessionId: set.sessionId, date, bandId: set.bandId, best: set.value });
    else point.best = Math.max(point.best, set.value);
  }
  return [...points.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Exercices présents dans le journal, du plus récent au plus ancien. */
export function loggedExerciseIds(sets: readonly SetLog[]): ID[] {
  const seen = new Set<ID>();
  for (let i = sets.length - 1; i >= 0; i--) seen.add(sets[i].exerciseId);
  return [...seen];
}

/** Durée d'une séance enregistrée dans l'appli, en secondes. */
export function sessionDurationSec(session: Pick<SessionLog, 'startedAt' | 'endedAt'>): number | null {
  if (session.startedAt === null || session.endedAt === null) return null;
  return Math.max(0, Math.round((session.endedAt - session.startedAt) / 1000));
}
