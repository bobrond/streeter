// Objectifs : édition et historique des tests.
import type { ID, Objective, ObjectiveTest } from '../domain/types';
import type { StreeterDB } from './db';

/** Enregistre un objectif ; `programId` : programme qui le suit (ajouté à ses objectifs s'il n'y est pas). */
export async function saveObjective(db: StreeterDB, objective: Objective, programId?: ID): Promise<void> {
  await db.transaction('rw', [db.objectives, db.programs], async () => {
    await db.objectives.put(objective);
    const program = programId ? await db.programs.get(programId) : undefined;
    if (program && !program.objectiveIds.includes(objective.id)) {
      await db.programs.update(program.id, { objectiveIds: [...program.objectiveIds, objective.id] });
    }
  });
}

/** Suit ou ne suit plus un objectif dans un programme (ancien objectif : gardé avec ses tests). */
export async function setObjectiveFollowed(db: StreeterDB, programId: ID, objectiveId: ID, followed: boolean): Promise<void> {
  await db.transaction('rw', db.programs, async () => {
    const program = await db.programs.get(programId);
    if (!program) return;
    const others = program.objectiveIds.filter((id) => id !== objectiveId);
    await db.programs.update(programId, { objectiveIds: followed ? [...others, objectiveId] : others });
  });
}

/** Supprime un objectif, retiré aussi des objectifs des programmes. */
export async function deleteObjective(db: StreeterDB, id: ID): Promise<void> {
  await db.transaction('rw', [db.objectives, db.programs], async () => {
    await db.objectives.delete(id);
    for (const program of await db.programs.toArray()) {
      if (program.objectiveIds.includes(id)) await db.programs.update(program.id, { objectiveIds: program.objectiveIds.filter((o) => o !== id) });
    }
  });
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
