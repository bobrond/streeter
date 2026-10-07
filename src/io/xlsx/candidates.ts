// Résolution du texte libre « Exercices au choix » du Programme en exercices candidats.
import { fold, nameKey, nameTokens, startsWithWords } from '../../domain/text';
import type { Exercise } from '../../domain/types';
import type { ExerciseMatcher } from './catalogue';

export interface CandidateContext {
  matcher: ExerciseMatcher;
  /** Nom de l'élément de la ligne (« Planche », « Touch FL »…), pour compléter « Hold » en « Planche hold ». */
  elementName: string;
  /** Catégories du catalogue et leurs exercices, pour « Au choix (skill planche) ». */
  exercisesByCategory: ReadonlyMap<string, readonly Exercise[]>;
  /** Exercice générique de l'élément, créé au besoin (« Au choix » sans précision). */
  genericExercise: () => Exercise;
  /** Candidats de la ligne Skill du même élément dans la même séance (« Même combo qu'au bloc skill »). */
  skillLineCandidates: () => readonly Exercise[] | null;
}

export interface CandidateResolution {
  exercises: Exercise[];
  /** Morceaux de texte non reconnus. */
  unresolved: string[];
  /** Rapprochements approximatifs : texte → noms d'exercices. */
  approximations: { text: string; exercises: string[] }[];
  /** Ligne « Repos » : aucun exercice attendu. */
  rest: boolean;
}

/** Vrai si le texte renvoie aux candidats de la ligne Skill (à résoudre après les autres lignes). */
export function refersToSkillLine(text: string): boolean {
  return /^meme combo\b/.test(fold(text));
}

function categoryMatching(query: string, categories: Iterable<string>): string | null {
  const wanted = nameTokens(query);
  const matches = [...categories].filter((category) => {
    const tokens = new Set(nameTokens(category));
    return wanted.every((w) => tokens.has(w));
  });
  return matches.length === 1 ? matches[0] : null;
}

/** Découpe sur « , » et « ou » hors parenthèses. */
function splitAlternatives(t: string): string[] {
  const groups: string[] = [];
  const masked = t.replace(/\([^()]*\)/g, (m) => `§${groups.push(m) - 1}§`);
  return masked
    .split(/,|\bou\b/)
    .map((part) => part.replace(/§(\d+)§/g, (_, i: string) => groups[Number(i)]).trim())
    .filter(Boolean);
}

/**
 * Variantes d'un morceau selon ses parenthèses : cibles « (5-8) » ignorées, alternatives
 * « (full / one leg) » développées, mots optionnels « (to touch) » avec et sans.
 */
function expandParentheses(segment: string): string[] {
  const m = segment.match(/\(([^()]*)\)/);
  if (!m || m.index === undefined) return [segment.replace(/\s+/g, ' ').trim()];
  const before = segment.slice(0, m.index);
  const after = segment.slice(m.index + m[0].length);
  const inner = m[1].trim();
  let options: string[];
  if (/\d/.test(inner)) options = [''];
  else if (inner.includes('/')) options = inner.split('/').map((o) => o.trim());
  else options = [inner, ''];
  return options.flatMap((option) => expandParentheses(`${before} ${option} ${after}`));
}

interface Match {
  exercises: Exercise[];
  approximate: boolean;
}

function matchKey(key: string, elementKey: string, matcher: ExerciseMatcher): Match {
  const direct = (k: string): Exercise[] => {
    const prefixed = elementKey && !startsWithWords(k, elementKey) ? `${elementKey} ${k}` : null;
    const exact = matcher.exact(k) ?? (prefixed ? matcher.exact(prefixed) : undefined);
    if (exact) return [exact];
    const family = matcher.family(k);
    if (family.length > 0) return family;
    return prefixed ? matcher.family(prefixed) : [];
  };
  const found = direct(key);
  if (found.length > 0) return { exercises: found, approximate: false };
  const containing = matcher.containingAll(key);
  if (containing.length === 1) return { exercises: containing, approximate: true };
  const words = key.split(' ');
  for (let n = words.length - 1; n >= 1; n--) {
    const shorter = direct(words.slice(0, n).join(' '));
    if (shorter.length > 0) return { exercises: shorter, approximate: true };
  }
  return { exercises: [], approximate: false };
}

/**
 * « Planche lean surélevé press / hold to press » : la partie après « / » remplace la fin de la partie
 * avant (→ Planche lean surélevé hold to press). On garde le plus court remplacement qui existe.
 */
function matchSlashTail(head: string, tail: string, matcher: ExerciseMatcher): Exercise | null {
  const words = head.split(' ');
  for (let n = words.length - 1; n >= 1; n--) {
    const exercise = matcher.exact(`${words.slice(0, n).join(' ')} ${tail}`);
    if (exercise) return exercise;
  }
  return null;
}

export function resolveCandidates(text: string, ctx: CandidateContext): CandidateResolution {
  const t = fold(text);
  const result: CandidateResolution = { exercises: [], unresolved: [], approximations: [], rest: false };
  const add = (exercises: readonly Exercise[]) => {
    for (const exercise of exercises) if (!result.exercises.includes(exercise)) result.exercises.push(exercise);
  };

  if (/^aucun entrainement\b/.test(t)) return { ...result, rest: true };
  if (t === 'au choix' || t === '') {
    add([ctx.genericExercise()]);
    return result;
  }
  const choiceIn = t.match(/^au choix \((.+)\)$/) ?? t.match(/^(?:\d+|un|une|deux|trois|quatre) exercices? (?:de |d')(.+?) au choix$/);
  if (choiceIn) {
    const category = categoryMatching(choiceIn[1], ctx.exercisesByCategory.keys());
    if (category) add(ctx.exercisesByCategory.get(category) ?? []);
    else result.unresolved.push(text);
    return result;
  }
  if (refersToSkillLine(text)) {
    const skillLine = ctx.skillLineCandidates();
    if (skillLine && skillLine.length > 0) add(skillLine);
    else result.unresolved.push(text);
    return result;
  }

  const elementKey = nameKey(ctx.elementName);
  for (const raw of splitAlternatives(t)) {
    const segment = raw.replace(/\b(?:a|avec)\s+(?:l'\s*)?elastiques?\b/g, ' ').trim();
    if (!segment) continue;
    for (const variant of expandParentheses(segment)) {
      // « press / hold to press » (barre entourée d'espaces) ; « P/N » reste un seul nom.
      const [head, ...tails] = variant.split(/\s+\/\s+/).map((p) => nameKey(p));
      if (!head) continue;
      const match = matchKey(head, elementKey, ctx.matcher);
      if (match.exercises.length === 0) result.unresolved.push(variant);
      else {
        add(match.exercises);
        if (match.approximate) result.approximations.push({ text: variant, exercises: match.exercises.map((e) => e.name) });
      }
      for (const tail of tails) {
        const exercise = matchSlashTail(head, tail, ctx.matcher);
        if (exercise) add([exercise]);
        else result.unresolved.push(`${variant} (« ${tail} »)`);
      }
    }
  }
  return result;
}
