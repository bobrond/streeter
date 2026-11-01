// Matériel d'entraînement par exercice : déduction pour le catalogue existant, compatibilité pour la séance express
// et ajout des variantes de Victorienne au sol (seul renfo Touch FL faisable sans barre, décidé avec l'utilisateur).
import { nextOrder } from './editing';
import { nameKey } from './text';
import type { Element, Equipment, Exercise, ID, Target } from './types';
import { EQUIPMENTS } from './types';

/** Liste sans doublons, dans l'ordre canonique de `EQUIPMENTS`. */
export function normalizeEquipment(list: readonly Equipment[]): Equipment[] {
  return EQUIPMENTS.filter((eq) => list.includes(eq));
}

const RAW_KNOWN_EQUIPMENT: readonly (readonly [string, readonly Equipment[]])[] = [
  // Planche : full hold et mouvements dynamiques sur parallèles uniquement au niveau actuel ;
  // adv tuck hold, straddle hold et exercices pieds surélevés faisables au sol comme sur parallèles.
  ['Planche Hold', ['parallettes']],
  ['Planche Hold to press', ['parallettes']],
  ['Lean to press', ['parallettes']],
  ['P/N', ['parallettes']],
  ['Planche press to négative', ['parallettes']],
  ['Planche PU to press', ['parallettes']],
  ['Planche lean-up', ['parallettes']],
  ['Planche lean up', ['parallettes']],
  ['Lean-up', ['parallettes']],
  ['Lean up', ['parallettes']],
  ['Planche négative', ['parallettes']],
  ['Négative de press planche', ['parallettes']],
  ['Lean-up to play to press', ['parallettes']],
  ['Lean up to play to press', ['parallettes']],
  ['Straddle planche hold', ['floor', 'parallettes']],
  ['Adv tuck planche hold sol', ['floor', 'parallettes']],
  ['Planche lean surélevé press', ['floor', 'parallettes']],
  ['Planche lean surélevé hold to press', ['floor', 'parallettes']],
  ['Lean planche PU surélevé', ['floor', 'parallettes']],

  // Touch FL : barre pour toutes les variantes suspendues (y compris pseudo FL pieds au mur) ;
  // Victorienne au sol (hold et PU) au sol uniquement.
  ['Touch FL hold full', ['bar']],
  ['Touch FL hold one leg', ['bar']],
  ['Touch FL hold adv tuck extrême', ['bar']],
  ['Touch FL hold adv tuck', ['bar']],
  ['FL PU full', ['bar']],
  ['FL PU one leg', ['bar']],
  ['PU to touch full', ['bar']],
  ['PU to touch one leg', ['bar']],
  ['FL press', ['bar']],
  ['Pseudo touch FL hold wall', ['bar']],
  ['Pseudo FL PU to touch wall', ['bar']],
  ['Pseudo FL PU wall', ['bar']],
  ['Victorienne au sol hold', ['floor']],
  ['Victorienne au sol PU', ['floor']],
  ['Victorienne au sol push-up', ['floor']],

  // Grand dentelé.
  ['Lean planche hold', ['floor', 'parallettes']],
  ['Lean planche scapula PU to press', ['floor', 'parallettes']],
  ['Pike handstand surélevé hold', ['floor', 'parallettes']],
  ['Pike handstand surélevé scapula PU', ['floor', 'parallettes']],
  ['Wall slide', ['floor']],
  ['Uppercut', ['band']],

  // Rhomboïde.
  ['Reverse planche PU', ['floor']],
  ['Adv tuck FL scapula PU', ['bar']],
  ['Rétraction élastique', ['band']],

  // Deltoïde antérieur.
  ['Handstand push-up', ['floor', 'parallettes']],
  ['Handstand push up', ['floor', 'parallettes']],
  ['HSPU', ['floor', 'parallettes']],
  ['Zanetti fly elastic', ['band']],
  ['Dumbbell raise', ['dumbbell']],

  // Extension thoracique.
  ['Extension thoracique contre mur', ['floor']],
  ['Extension thoracique contre banc', ['floor']],

  // Connexion / échauffement.
  ['CARs scapulaire position pompe', ['floor']],
  ['Scapula PU', ['floor', 'parallettes']],
  ['CARs scapulaire tiré (sous barre)', ['bar']],
  ['CARs scapulaire handstand élastique', ['band']],
  ['CARs scapulaire 90 élastique', ['band']],
  ['Rétraction élastique (léger)', ['band']],
  ['Activation élastique', ['band']],
];

const KNOWN_EQUIPMENT = new Map<string, readonly Equipment[]>(
  RAW_KNOWN_EQUIPMENT.map(([name, equipment]) => [nameKey(name), equipment]),
);

/**
 * Matériel initial d'un exercice connu du catalogue ou déduit de son nom (exercices personnalisés tels que les
 * rotateurs externes, imports sans matériel précisé).
 */
export function inferExerciseEquipment(name: string, category = '', aliases: readonly string[] = []): Equipment[] {
  for (const candidate of [name, ...aliases]) {
    const known = KNOWN_EQUIPMENT.get(nameKey(candidate));
    if (known) return [...known];
  }
  const text = `${nameKey(name)} ${nameKey(category)}`;
  if (/\b(elastique|elastic|band)\b/.test(text)) return ['band'];
  if (/\b(dumbbell|halteres?)\b/.test(text)) return ['dumbbell'];
  if (/\bvictorienne\b/.test(text) && /\bsol\b/.test(text)) return ['floor'];
  if (/\b(sous barre|traction|muscle[- ]up|touch fl|fl pu|fl press|pu to touch|pseudo fl|pseudo touch fl)\b/.test(text)) return ['bar'];
  if (/\b(wall|mur|banc|pompe|reverse planche)\b/.test(text)) return ['floor'];
  if (/\bsureleve\b/.test(text)) return ['floor', 'parallettes'];
  return ['floor'];
}

/** Un exercice est faisable si au moins un de ses matériels est disponible (vide = aucune restriction, tant qu'au moins un matériel est coché). */
export function isExerciseCompatible(exercise: Pick<Exercise, 'equipment'>, available: ReadonlySet<Equipment>): boolean {
  if (available.size === 0) return false;
  return exercise.equipment.length === 0 || exercise.equipment.some((eq) => available.has(eq));
}

/** Cibles de repli pour la Victorienne au sol (décidé avec l'utilisateur : 8-15 s en hold, 8-10 reps en push-up). */
export const FLOOR_VICTORIAN_TARGETS: readonly Target[] = [
  { unit: 'seconds', min: 8, max: 15 },
  { unit: 'reps', min: 8, max: 10 },
];

export function isFloorVictorian(exercise: Pick<Exercise, 'name' | 'aliases'>): boolean {
  return [exercise.name, ...exercise.aliases].some((n) => /\bvictorienne\b/.test(nameKey(n)));
}

/**
 * Vrai si un exercice rattaché à un skill est une variante ou progression de la figure elle-même (ex. Straddle planche
 * hold, Adv tuck planche hold sol), par opposition à un exercice de renforcement spécifique (lean / PU pieds surélevés,
 * pseudo FL mur, Victorienne au sol). Sert à privilégier les vraies variantes de la figure en repli du bloc Skill.
 */
export function isSkillVariant(exercise: Pick<Exercise, 'name' | 'category'>): boolean {
  const name = nameKey(exercise.name);
  const cat = nameKey(exercise.category);
  if (/\b(sureleve|victorienne|pseudo)\b/.test(name)) return false;
  if (/\bplanche hold\b/.test(name) && !/\blean\b/.test(name)) return true;
  return !/\brenfo\b/.test(cat);
}

const VICTORIAN_SPECS: readonly {
  name: string;
  measure: 'seconds' | 'reps';
  aliases: string[];
  notes: string;
}[] = [
  {
    name: 'Victorienne au sol hold',
    measure: 'seconds',
    aliases: ['Victorienne sol hold', 'Victorian hold sol'],
    notes: 'Renfo front lever isométrique au sol, sans barre (cible 8-15 s).',
  },
  {
    name: 'Victorienne au sol PU',
    measure: 'reps',
    aliases: ['Victorienne au sol push-up', 'Victorienne sol PU', 'Victorienne sol push-up'],
    notes: 'Renfo front lever dynamique au sol, sans barre (cible 8-10 reps).',
  },
];

/**
 * Ajoute « Victorienne au sol hold » et « Victorienne au sol PU » au catalogue si l'élément Touch FL existe et qu'ils
 * n'y figurent pas encore. Sans élément Touch FL (base vide ou programme sans FL), ne touche à rien.
 */
export function ensureFloorVictorianExercises(
  exercises: readonly Exercise[],
  elements: readonly Element[],
  newId: () => ID,
): Exercise[] {
  const flElement = elements.find((e) => e.kind === 'skill' && /\b(fl|front lever)\b/.test(nameKey(e.name)));
  if (!flElement) return [...exercises];
  const knownKeys = new Set(exercises.flatMap((e) => [e.name, ...e.aliases].map(nameKey)));
  const result = [...exercises];
  for (const spec of VICTORIAN_SPECS) {
    if ([spec.name, ...spec.aliases].some((n) => knownKeys.has(nameKey(n)))) continue;
    result.push({
      id: newId(),
      name: spec.name,
      category: 'Touch FL renfo spé',
      elementId: flElement.id,
      measure: spec.measure,
      quick: true,
      active: true,
      notes: spec.notes,
      aliases: [...spec.aliases],
      order: nextOrder(result),
      workSecPerSet: null,
      equipment: ['floor'],
    });
  }
  return result;
}
