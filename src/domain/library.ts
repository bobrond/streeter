// Bibliothèque d'exercices (Programmes › Exercices) : filtres par nature d'élément et par élément, recherche,
// exercices regroupés par élément dans l'ordre skills, composantes, autres.
import { fold } from './text';
import type { Element, ElementKind, Exercise, ID } from './types';

/** `all` : tous les exercices ; sinon la nature de leur élément (un exercice sans élément est rangé dans `other`). */
export type KindFilter = 'all' | ElementKind;

export interface LibraryFilter {
  kind: KindFilter;
  /** Un seul élément ; `null` : tous ceux de la nature choisie. */
  elementId: ID | null;
  query: string;
}

export interface LibraryGroup {
  /** `null` : exercices sans élément. */
  element: Element | null;
  exercises: Exercise[];
}

export interface Library {
  groups: LibraryGroup[];
  /** Exercices désactivés qui passent le filtre, à part. */
  inactive: Exercise[];
  /** Exercices actifs affichés. */
  count: number;
}

export const KIND_ORDER: Record<ElementKind, number> = { skill: 0, component: 1, other: 2 };

/** Éléments d'une nature, dans leur ordre. */
export function elementsOfKind(elements: readonly Element[], kind: ElementKind): Element[] {
  return elements.filter((e) => e.kind === kind).sort((a, b) => a.order - b.order);
}

export function filterLibrary(exercises: readonly Exercise[], elements: readonly Element[], filter: LibraryFilter): Library {
  const elementsById = new Map(elements.map((e) => [e.id, e]));
  const q = fold(filter.query);
  const kindOf = (exercise: Exercise): ElementKind => elementsById.get(exercise.elementId ?? '')?.kind ?? 'other';
  const matches = (exercise: Exercise): boolean => {
    if (filter.elementId ? exercise.elementId !== filter.elementId : filter.kind !== 'all' && kindOf(exercise) !== filter.kind) return false;
    if (!q) return true;
    const element = elementsById.get(exercise.elementId ?? '');
    return fold(`${exercise.name} ${exercise.category} ${exercise.aliases.join(' ')} ${element?.name ?? ''}`).includes(q);
  };
  const sorted = exercises.filter(matches).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  const groups = new Map<ID | null, LibraryGroup>();
  for (const exercise of sorted.filter((e) => e.active)) {
    const element = elementsById.get(exercise.elementId ?? '') ?? null;
    const key = element?.id ?? null;
    if (!groups.has(key)) groups.set(key, { element, exercises: [] });
    groups.get(key)!.exercises.push(exercise);
  }
  const rank = (g: LibraryGroup) => (g.element ? KIND_ORDER[g.element.kind] * 10_000 + g.element.order : Number.MAX_SAFE_INTEGER);
  const active = sorted.filter((e) => e.active);
  return { groups: [...groups.values()].sort((a, b) => rank(a) - rank(b)), inactive: sorted.filter((e) => !e.active), count: active.length };
}
