// Nom d'une ligne de prescription par son exercice : celui que la séance proposera par défaut (règle 4).
import type { AppData } from '../../db/hooks';
import type { Lookups } from '../../db/lookups';
import { defaultExerciseId, itemCandidates } from '../../domain/session';
import type { Moment, PrescriptionItem } from '../../domain/types';

export function lineExerciseName(item: PrescriptionItem, moment: Moment, data: AppData, lookups: Lookups): string {
  const candidates = itemCandidates(item, data.exercises, moment).map((e) => e.id);
  const id = defaultExerciseId(item, candidates, [], data.sets);
  return (id ? lookups.exercises.get(id)?.name : undefined) ?? lookups.elements.get(item.elementId)?.name ?? '?';
}
