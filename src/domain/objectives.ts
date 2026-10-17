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
 * Une série compte pour un record si elle a une valeur et n'est ni dégradée ni d'échauffement.
 * Les séries sans qualité notée (import du tableur) comptent ; l'échec aussi.
 */
export function countsForRecord(set: Pick<SetLog, 'value' | 'quality' | 'kind'>): boolean {
  return set.value !== null && set.quality !== 'degraded' && set.kind !== 'warmup';
}

/**
 * Records d'un exercice, un par élastique (`null` : sans élastique) : meilleure série qui compte pour
 * un record ; à égalité, la plus ancienne (la première fois).
 */
export function bandRecords(
  exerciseId: ID,
  sets: readonly SetLog[],
  sessions: ReadonlyMap<ID, Pick<SessionLog, 'date'>>,
): Map<ID | null, SessionPerformance> {
  const records = new Map<ID | null, SessionPerformance>();
  for (const set of sets) {
    if (set.exerciseId !== exerciseId || !countsForRecord(set)) continue;
    const date = sessions.get(set.sessionId)?.date;
    if (!date) continue;
    const value = set.value as number;
    const best = records.get(set.bandId);
    if (!best || value > best.value || (value === best.value && date < best.date)) {
      records.set(set.bandId, { value, date, setId: set.id });
    }
  }
  return records;
}

/** Meilleure performance enregistrée en séance sur un exercice : le record sans élastique. */
export function bestSessionPerformance(
  exerciseId: ID,
  sets: readonly SetLog[],
  sessions: ReadonlyMap<ID, Pick<SessionLog, 'date'>>,
): SessionPerformance | null {
  return bandRecords(exerciseId, sets, sessions).get(null) ?? null;
}
