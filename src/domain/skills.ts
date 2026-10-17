// Progression › Skills : objectifs et records des exercices de chaque skill (pas d'échelle de progression,
// décidé avec l'utilisateur : l'exercice se change parmi les candidats de la ligne).
import { bandRecords, type SessionPerformance } from './objectives';
import type { Element, Exercise, ID, Objective, SessionLog, SetLog } from './types';

export interface ExerciseRecords {
  exercise: Exercise;
  /** Un record par élastique ; `null` : sans élastique. */
  records: Map<ID | null, SessionPerformance>;
  /** Dernière séance où l'exercice a été fait. */
  lastDate: string;
}

/** Objectifs rangés par skill, d'après l'élément de leur exercice lié ; les autres (sans exercice, ou hors skill) à part. */
export function objectivesBySkill(
  objectives: readonly Objective[],
  exercisesById: ReadonlyMap<ID, Exercise>,
  skills: readonly Element[],
): { bySkill: Map<ID, Objective[]>; others: Objective[] } {
  const bySkill = new Map<ID, Objective[]>(skills.map((s) => [s.id, []]));
  const others: Objective[] = [];
  for (const objective of [...objectives].sort((a, b) => a.order - b.order)) {
    const elementId = objective.exerciseId ? exercisesById.get(objective.exerciseId)?.elementId : null;
    const list = elementId ? bySkill.get(elementId) : undefined;
    if (list) list.push(objective);
    else others.push(objective);
  }
  return { bySkill, others };
}

/**
 * Exercices mesurés d'un élément qui ont au moins un record : d'abord ceux des objectifs, dans l'ordre
 * des objectifs, puis les plus récemment faits.
 */
export function skillRecords(
  elementId: ID,
  exercises: readonly Exercise[],
  sets: readonly SetLog[],
  sessions: ReadonlyMap<ID, Pick<SessionLog, 'date'>>,
  objectives: readonly Objective[],
): ExerciseRecords[] {
  const own = new Map(exercises.filter((e) => e.elementId === elementId && e.measure !== 'none').map((e) => [e.id, e]));
  const setsByExercise = new Map<ID, SetLog[]>();
  for (const set of sets) {
    if (!own.has(set.exerciseId)) continue;
    const list = setsByExercise.get(set.exerciseId);
    if (list) list.push(set);
    else setsByExercise.set(set.exerciseId, [set]);
  }
  const rows: ExerciseRecords[] = [];
  for (const [exerciseId, list] of setsByExercise) {
    const records = bandRecords(exerciseId, list, sessions);
    if (records.size === 0) continue;
    let lastDate = '';
    for (const set of list) {
      const date = sessions.get(set.sessionId)?.date ?? '';
      if (date > lastDate) lastDate = date;
    }
    rows.push({ exercise: own.get(exerciseId)!, records, lastDate });
  }
  const objectiveRank = new Map<ID, number>();
  [...objectives]
    .sort((a, b) => a.order - b.order)
    .forEach((o, i) => {
      if (o.exerciseId && !objectiveRank.has(o.exerciseId)) objectiveRank.set(o.exerciseId, i);
    });
  const rank = (id: ID) => objectiveRank.get(id) ?? Number.MAX_SAFE_INTEGER;
  return rows.sort(
    (a, b) =>
      rank(a.exercise.id) - rank(b.exercise.id) || b.lastDate.localeCompare(a.lastDate) || a.exercise.order - b.exercise.order,
  );
}
