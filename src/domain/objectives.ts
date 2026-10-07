import type { ID, Objective, ObjectiveTest, SessionLog, SetLog } from './types';

export type ObjectiveStatus = 'to_test' | 'in_progress' | 'achieved';

/** Meilleur test (valeur la plus haute ; à égalité, le plus ancien : la première fois). */
export function bestTest(tests: readonly ObjectiveTest[]): ObjectiveTest | null {
  let best: ObjectiveTest | null = null;
  for (const test of tests) {
    if (!best || test.value > best.value || (test.value === best.value && test.date < best.date)) best = test;
  }
  return best;
}

export interface ObjectiveState {
  status: ObjectiveStatus;
  best: ObjectiveTest | null;
  /** Cible − meilleur test ; `null` sans test. */
  gap: number | null;
}

/** Statut calculé sur le meilleur test (décision utilisateur ; le tableur prenait le dernier). */
export function objectiveState(objective: Pick<Objective, 'target' | 'tests'>): ObjectiveState {
  const best = bestTest(objective.tests);
  if (!best) return { status: 'to_test', best: null, gap: null };
  return {
    status: best.value >= objective.target ? 'achieved' : 'in_progress',
    best,
    gap: objective.target - best.value,
  };
}

export interface SessionPerformance {
  value: number;
  date: string;
  setId: ID;
}

/**
 * Meilleure performance enregistrée en séance sur un exercice : séries sans élastique et non dégradées.
 * Les séries sans qualité notée (import du tableur) comptent.
 */
export function bestSessionPerformance(
  exerciseId: ID,
  sets: readonly SetLog[],
  sessions: ReadonlyMap<ID, SessionLog>,
): SessionPerformance | null {
  let best: SessionPerformance | null = null;
  for (const set of sets) {
    if (set.exerciseId !== exerciseId || set.value === null || set.bandId !== null) continue;
    if (set.quality === 'degraded') continue;
    const date = sessions.get(set.sessionId)?.date;
    if (!date) continue;
    if (!best || set.value > best.value || (set.value === best.value && date < best.date)) {
      best = { value: set.value, date, setId: set.id };
    }
  }
  return best;
}
