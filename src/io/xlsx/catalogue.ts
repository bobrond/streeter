// Rapprochement des noms d'exercices du tableur avec le catalogue.
import { fold, nameKey, nameTokens, startsWithWords } from '../../domain/text';
import type { Element, Exercise, Measure } from '../../domain/types';

export class ExerciseMatcher {
  private readonly byKey = new Map<string, Exercise>();
  private readonly entries: { exercise: Exercise; key: string; tokens: Set<string> }[] = [];

  constructor(exercises: readonly Exercise[] = []) {
    for (const exercise of exercises) this.add(exercise);
  }

  add(exercise: Exercise): void {
    for (const name of [exercise.name, ...exercise.aliases]) {
      const key = nameKey(name);
      if (!this.byKey.has(key)) this.byKey.set(key, exercise);
    }
    const key = nameKey(exercise.name);
    this.entries.push({ exercise, key, tokens: new Set(nameTokens(exercise.name)) });
  }

  exact(key: string): Exercise | undefined {
    return this.byKey.get(key);
  }

  /** Exercices dont le nom commence par `prefix` (« fl pu » → FL PU full, FL PU one leg). */
  family(prefix: string): Exercise[] {
    return this.entries.filter((e) => startsWithWords(e.key, prefix)).map((e) => e.exercise);
  }

  /** Exercices dont le nom contient tous les mots de `key`. */
  containingAll(key: string): Exercise[] {
    const words = key.split(' ').filter(Boolean);
    return this.entries.filter((e) => words.every((w) => e.tokens.has(w))).map((e) => e.exercise);
  }

  /** Exercices dont tous les mots figurent dans `key`. */
  containedIn(key: string): Exercise[] {
    const words = new Set(key.split(' ').filter(Boolean));
    return this.entries.filter((e) => [...e.tokens].every((w) => words.has(w))).map((e) => e.exercise);
  }
}

export interface NameMatch {
  exercise: Exercise | null;
  /** Rapprochement approximatif, à signaler dans le rapport. */
  approximate: boolean;
}

/** Un nom d'exercice isolé (Journal, Objectifs) → un exercice du catalogue. */
export function matchExerciseName(name: string, matcher: ExerciseMatcher): NameMatch {
  const key = nameKey(name);
  const exact = matcher.exact(key);
  if (exact) return { exercise: exact, approximate: false };
  // « Planche press to négative (P/N) » → P/N
  for (const m of fold(name).matchAll(/\(([^()]+)\)/g)) {
    const inner = matcher.exact(nameKey(m[1]));
    if (inner) return { exercise: inner, approximate: true };
  }
  const containing = matcher.containingAll(key);
  if (containing.length === 1) return { exercise: containing[0], approximate: true };
  const contained = matcher.containedIn(key);
  if (contained.length === 1) return { exercise: contained[0], approximate: true };
  return { exercise: null, approximate: false };
}

/**
 * Type de mesure déduit du nom : combos pour les enchaînements des catégories skill
 * (hold to press, PU to press, PU to touch, FL press), secondes pour les hold, reps pour le reste.
 */
export function inferMeasure(name: string, category: string): Measure {
  const n = nameKey(name);
  const isSkillCategory = /\bskill\b/.test(nameKey(category));
  if (isSkillCategory && (/\b(hold|pu) to (press|touch)\b/.test(n) || n === 'fl press')) return 'combos';
  if (/\bhold\b/.test(n) && !/\bhold to\b/.test(n)) return 'seconds';
  return 'reps';
}

/** Élément d'une catégorie du catalogue : celui dont le nom est le plus long préfixe (« Planche renfo spé » → Planche). */
export function elementForCategory(category: string, elements: readonly Element[]): Element | null {
  const key = nameKey(category);
  let best: Element | null = null;
  let bestLength = -1;
  for (const element of elements) {
    const elementKey = nameKey(element.name);
    if (startsWithWords(key, elementKey) && elementKey.length > bestLength) {
      best = element;
      bestLength = elementKey.length;
    }
  }
  return best;
}
