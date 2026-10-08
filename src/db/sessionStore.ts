// Écritures du mode séance : chaque action est enregistrée aussitôt, pour une reprise exacte.
import { shiftedStartDate } from '../domain/cycle';
import type { ID, SessionLog, SessionResume, SetLog } from '../domain/types';
import type { StreeterDB } from './db';

export class SessionInProgressError extends Error {
  readonly session: SessionLog;
  constructor(session: SessionLog) {
    super('Une séance est déjà en cours : termine-la avant d’en commencer une autre.');
    this.session = session;
  }
}

export function findActiveSession(db: StreeterDB): Promise<SessionLog | undefined> {
  return db.sessions.where('status').equals('in_progress').first();
}

/** Enregistre une nouvelle séance ; refuse s'il y en a déjà une en cours. */
export async function startSession(db: StreeterDB, session: SessionLog): Promise<void> {
  await db.transaction('rw', db.sessions, async () => {
    const active = await findActiveSession(db);
    if (active) throw new SessionInProgressError(active);
    await db.sessions.add(session);
  });
}

export async function saveResume(db: StreeterDB, sessionId: ID, resume: SessionResume): Promise<void> {
  await db.sessions.update(sessionId, { resume });
}

/** Numéros de série : 1, 2, 3… par (bloc, exercice) dans la séance, dans l'ordre de saisie. */
async function renumber(db: StreeterDB, sessionId: ID): Promise<void> {
  const sets = await db.sets.where('sessionId').equals(sessionId).sortBy('createdAt');
  const counters = new Map<string, number>();
  for (const set of sets) {
    const key = `${set.blockTypeId ?? ''}|${set.exerciseId}`;
    const setIndex = (counters.get(key) ?? 0) + 1;
    counters.set(key, setIndex);
    if (set.setIndex !== setIndex) await db.sets.update(set.id, { setIndex });
  }
}

/** Ajoute une série et l'état de reprise qui va avec, dans une seule transaction. */
export async function logSet(db: StreeterDB, set: SetLog, resume: SessionResume): Promise<void> {
  await db.transaction('rw', db.sets, db.sessions, async () => {
    await db.sets.add(set);
    await renumber(db, set.sessionId);
    await db.sessions.update(set.sessionId, { resume });
  });
}

export async function updateSet(db: StreeterDB, setId: ID, changes: Partial<Omit<SetLog, 'id' | 'sessionId'>>): Promise<void> {
  await db.transaction('rw', db.sets, async () => {
    const set = await db.sets.get(setId);
    if (!set) return;
    await db.sets.update(setId, changes);
    await renumber(db, set.sessionId);
  });
}

export async function deleteSet(db: StreeterDB, setId: ID): Promise<void> {
  await db.transaction('rw', db.sets, async () => {
    const set = await db.sets.get(setId);
    if (!set) return;
    await db.sets.delete(setId);
    await renumber(db, set.sessionId);
  });
}

export async function finishSession(db: StreeterDB, sessionId: ID, args: { note: string; now: number }): Promise<void> {
  await db.sessions.update(sessionId, { status: 'done', endedAt: args.now, note: args.note, resume: null });
}

/** Abandon : une séance sans série est supprimée ; sinon elle est gardée, marquée abandonnée, avec ses séries. */
export async function abandonSession(db: StreeterDB, sessionId: ID, now: number): Promise<'deleted' | 'abandoned'> {
  return db.transaction('rw', db.sessions, db.sets, async () => {
    const count = await db.sets.where('sessionId').equals(sessionId).count();
    if (count === 0) {
      await db.sessions.delete(sessionId);
      return 'deleted';
    }
    await db.sessions.update(sessionId, { status: 'abandoned', endedAt: now, resume: null });
    return 'abandoned';
  });
}

/**
 * Décale la séquence : `+1` « Passer au jour suivant », `-1` « Reporter à demain ».
 * Renvoie l'ancienne date de début (pour annuler).
 */
export async function shiftSequence(db: StreeterDB, deltaDays: number): Promise<string | null> {
  return db.transaction('rw', db.settings, async () => {
    const settings = await db.settings.get('settings');
    if (!settings) return null;
    await db.settings.update('settings', { cycleStartDate: shiftedStartDate(settings, deltaDays) });
    return settings.cycleStartDate;
  });
}

export async function setCycleStartDate(db: StreeterDB, date: string): Promise<void> {
  await db.settings.update('settings', { cycleStartDate: date });
}
