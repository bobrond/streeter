// Objectifs : édition et historique des tests.
import type { ID, Objective, ObjectiveTest } from '../domain/types';
import type { StreeterDB } from './db';

export async function saveObjective(db: StreeterDB, objective: Objective): Promise<void> {
  await db.objectives.put(objective);
}

export async function deleteObjective(db: StreeterDB, id: ID): Promise<void> {
  await db.objectives.delete(id);
}

/** Ajoute un test, ou le remplace s'il a le même identifiant. */
export async function saveTest(db: StreeterDB, objectiveId: ID, test: ObjectiveTest): Promise<void> {
  await db.transaction('rw', db.objectives, async () => {
    const objective = await db.objectives.get(objectiveId);
    if (!objective) return;
    const tests = [...objective.tests.filter((t) => t.id !== test.id), test].sort((a, b) => a.date.localeCompare(b.date));
    await db.objectives.update(objectiveId, { tests });
  });
}

export async function deleteTest(db: StreeterDB, objectiveId: ID, testId: ID): Promise<void> {
  await db.transaction('rw', db.objectives, async () => {
    const objective = await db.objectives.get(objectiveId);
    if (!objective) return;
    await db.objectives.update(objectiveId, { tests: objective.tests.filter((t) => t.id !== testId) });
  });
}

/** Supprime une séance terminée et ses séries (correction du journal). */
export async function deleteSession(db: StreeterDB, sessionId: ID): Promise<void> {
  await db.transaction('rw', db.sessions, db.sets, async () => {
    await db.sets.where('sessionId').equals(sessionId).delete();
    await db.sessions.delete(sessionId);
  });
}

export async function updateSessionNote(db: StreeterDB, sessionId: ID, note: string): Promise<void> {
  await db.sessions.update(sessionId, { note });
}
