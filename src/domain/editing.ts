// Édition du programme et du catalogue : utilisation avant suppression, ordre, validation,
// lignes de prescription saisies en texte (mêmes règles de lecture qu'à l'import).
import { parseIntensity, parseRest, parseTargets } from './parse';
import { nameKey } from './text';
import type { BlockType, Exercise, ID, Objective, PrescriptionItem, SessionTemplate, SetLog, WeekPlan } from './types';
import { SEQ_DAYS } from './types';

export interface Usage {
  /** Lignes de prescription concernées. */
  items: number;
  /** Modèles de séance concernés. */
  templates: number;
  /** Séries enregistrées. */
  sets: number;
  exercises: number;
  objectives: number;
}

const EMPTY_USAGE: Usage = { items: 0, templates: 0, sets: 0, exercises: 0, objectives: 0 };

function countItems(templates: readonly SessionTemplate[], match: (item: PrescriptionItem) => boolean): Pick<Usage, 'items' | 'templates'> {
  let items = 0;
  let count = 0;
  for (const template of templates) {
    const n = template.items.filter(match).length;
    items += n;
    if (n > 0) count++;
  }
  return { items, templates: count };
}

export function exerciseUsage(id: ID, templates: readonly SessionTemplate[], sets: readonly SetLog[], objectives: readonly Objective[]): Usage {
  return {
    ...EMPTY_USAGE,
    ...countItems(templates, (item) => item.candidateExerciseIds.includes(id)),
    sets: sets.filter((s) => s.exerciseId === id).length,
    objectives: objectives.filter((o) => o.exerciseId === id).length,
  };
}

export function elementUsage(id: ID, templates: readonly SessionTemplate[], sets: readonly SetLog[], exercises: readonly Exercise[]): Usage {
  return {
    ...EMPTY_USAGE,
    ...countItems(templates, (item) => item.elementId === id),
    sets: sets.filter((s) => s.elementId === id).length,
    exercises: exercises.filter((e) => e.elementId === id).length,
  };
}

export function blockUsage(id: ID, templates: readonly SessionTemplate[], sets: readonly SetLog[]): Usage {
  return { ...EMPTY_USAGE, ...countItems(templates, (item) => item.blockTypeId === id), sets: sets.filter((s) => s.blockTypeId === id).length };
}

export function sessionTypeUsage(id: ID, templates: readonly SessionTemplate[]): Usage {
  return { ...EMPTY_USAGE, templates: templates.filter((t) => t.sessionTypeId === id).length };
}

export function bandUsage(id: ID, sets: readonly SetLog[]): Usage {
  return { ...EMPTY_USAGE, sets: sets.filter((s) => s.bandId === id).length };
}

export function isUnused(usage: Usage): boolean {
  return Object.values(usage).every((n) => n === 0);
}

/** Jours de la semaine type où un modèle est prévu. */
export function templateDays(id: ID, weekPlan: WeekPlan): string[] {
  const days: string[] = [];
  for (const day of SEQ_DAYS) {
    if (weekPlan[day].morning === id) days.push(`J${day} matin`);
    if (weekPlan[day].evening === id) days.push(`J${day} soir`);
  }
  return days;
}

/** Retire un modèle de la semaine type (créneau vide : pas de séance / Repos). */
export function removeFromWeekPlan(weekPlan: WeekPlan, id: ID): WeekPlan {
  const plan = structuredClone(weekPlan);
  for (const day of SEQ_DAYS) {
    if (plan[day].morning === id) plan[day].morning = null;
    if (plan[day].evening === id) plan[day].evening = null;
  }
  return plan;
}

/**
 * Déplace un élément d'une liste ordonnée (`delta` = −1 : vers le haut) ;
 * renvoie toute la liste renumérotée 0, 1, 2…, ou une liste vide si le déplacement est impossible.
 */
export function moveInOrder<T extends { id: ID; order: number }>(list: readonly T[], id: ID, delta: number): T[] {
  const sorted = [...list].sort((a, b) => a.order - b.order);
  const index = sorted.findIndex((x) => x.id === id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= sorted.length) return [];
  const [moved] = sorted.splice(index, 1);
  sorted.splice(target, 0, moved);
  return sorted.map((x, order) => ({ ...x, order }));
}

export function nextOrder(list: readonly { order: number }[]): number {
  return list.reduce((max, x) => Math.max(max, x.order), -1) + 1;
}

/** Nom vide ou déjà pris (sans accents ni casse) par une autre entité. */
export function nameError(name: string, id: ID, others: readonly { id: ID; name: string }[]): string | null {
  const key = nameKey(name);
  if (!key) return 'Le nom est obligatoire.';
  if (others.some((o) => o.id !== id && nameKey(o.name) === key)) return 'Ce nom existe déjà.';
  return null;
}

/** Saisie d'une ligne de prescription : les textes sont lus comme à l'import. */
export interface ItemForm {
  blockTypeId: ID;
  elementId: ID;
  candidateExerciseIds: ID[];
  setsMin: number;
  setsMax: number;
  targetText: string;
  intensityText: string;
  restText: string;
  superset: boolean;
  optional: boolean;
  notes: string;
}

export function itemToForm(item: PrescriptionItem): ItemForm {
  return {
    blockTypeId: item.blockTypeId,
    elementId: item.elementId,
    candidateExerciseIds: [...item.candidateExerciseIds],
    setsMin: item.setsMin,
    setsMax: item.setsMax,
    targetText: item.targetText,
    intensityText: item.intensityText,
    restText: item.restText,
    superset: item.superset,
    optional: item.optional,
    notes: item.notes,
  };
}

export function formErrors(form: ItemForm): string[] {
  const errors: string[] = [];
  if (!form.blockTypeId) errors.push('Choisis un bloc.');
  if (!form.elementId) errors.push('Choisis un élément.');
  if (form.setsMin < 0 || form.setsMax < 1) errors.push('Il faut au moins 1 série max.');
  if (form.setsMin > form.setsMax) errors.push('Séries min supérieures aux séries max.');
  if (form.candidateExerciseIds.length === 0) errors.push('Ajoute au moins un exercice candidat.');
  return errors;
}

/**
 * Ligne de prescription à partir de la saisie. « Superset » est coché à part ;
 * le texte de repos peut aussi le contenir (« Superset, 60-90 s »), comme dans le tableur.
 */
export function formToItem(id: ID, form: ItemForm, exercisesById: ReadonlyMap<ID, Exercise>): PrescriptionItem {
  const rest = parseRest(form.restText);
  return {
    id,
    blockTypeId: form.blockTypeId,
    elementId: form.elementId,
    candidateExerciseIds: [...form.candidateExerciseIds],
    candidatesText: form.candidateExerciseIds.map((e) => exercisesById.get(e)?.name ?? '?').join(', '),
    setsMin: form.setsMin,
    setsMax: form.setsMax,
    targetText: form.targetText.trim(),
    targets: parseTargets(form.targetText),
    intensityText: form.intensityText.trim(),
    intensity: parseIntensity(form.intensityText),
    restText: form.restText.trim(),
    restMinSec: rest.minSec,
    restMaxSec: rest.maxSec,
    superset: form.superset || rest.superset,
    optional: form.optional,
    notes: form.notes.trim(),
  };
}

export function emptyItemForm(blockTypeId: ID, elementId: ID): ItemForm {
  return {
    blockTypeId,
    elementId,
    candidateExerciseIds: [],
    setsMin: 2,
    setsMax: 2,
    targetText: '',
    intensityText: '',
    restText: '90 s',
    superset: false,
    optional: false,
    notes: '',
  };
}

/** Insère une ligne à la fin de son bloc (l'ordre des lignes d'un bloc est celui du modèle). */
export function insertItem(items: readonly PrescriptionItem[], item: PrescriptionItem, blocksById: ReadonlyMap<ID, BlockType>): PrescriptionItem[] {
  const order = (i: PrescriptionItem) => blocksById.get(i.blockTypeId)?.order ?? Number.MAX_SAFE_INTEGER;
  const target = order(item);
  let index = items.length;
  for (let i = items.length - 1; i >= 0; i--) {
    if (order(items[i]) <= target) {
      index = i + 1;
      break;
    }
    index = i;
  }
  return [...items.slice(0, index), item, ...items.slice(index)];
}

/** Échange une ligne avec la précédente ou la suivante du même bloc. */
export function moveItem(items: readonly PrescriptionItem[], id: ID, delta: -1 | 1): PrescriptionItem[] {
  const index = items.findIndex((i) => i.id === id);
  if (index < 0) return [...items];
  const blockId = items[index].blockTypeId;
  let j = index + delta;
  while (j >= 0 && j < items.length && items[j].blockTypeId !== blockId) j += delta;
  if (j < 0 || j >= items.length) return [...items];
  const copy = [...items];
  [copy[index], copy[j]] = [copy[j], copy[index]];
  return copy;
}

/** Copie d'un modèle avec de nouveaux identifiants. */
export function duplicateTemplate(template: SessionTemplate, newId: () => ID, name: string): SessionTemplate {
  return { ...structuredClone(template), id: newId(), name, items: template.items.map((item) => ({ ...structuredClone(item), id: newId() })) };
}

/** Retire un exercice supprimé des candidats de toutes les lignes ; renvoie les modèles modifiés. */
export function withoutExercise(templates: readonly SessionTemplate[], exerciseId: ID, exercisesById: ReadonlyMap<ID, Exercise>): SessionTemplate[] {
  const changed: SessionTemplate[] = [];
  for (const template of templates) {
    if (!template.items.some((i) => i.candidateExerciseIds.includes(exerciseId))) continue;
    changed.push({
      ...template,
      items: template.items.map((item) => {
        if (!item.candidateExerciseIds.includes(exerciseId)) return item;
        const ids = item.candidateExerciseIds.filter((id) => id !== exerciseId);
        return { ...item, candidateExerciseIds: ids, candidatesText: ids.map((id) => exercisesById.get(id)?.name ?? '?').join(', ') };
      }),
    });
  }
  return changed;
}

export const SESSION_TYPE_COLORS = ['#ff5c5c', '#ffb020', '#4da3ff', '#2dd4bf', '#c084fc', '#f472b6', '#a3e635', '#a3a3a3'] as const;
export const BAND_COLORS = ['#f97316', '#facc15', '#22c55e', '#3b82f6', '#ef4444', '#a855f7', '#111827', '#a3a3a3'] as const;


/** « Nouveau modèle », « Nouveau modèle 2 »… : premier nom libre. */
export function uniqueName(base: string, existing: readonly { name: string }[]): string {
  const taken = new Set(existing.map((e) => nameKey(e.name)));
  if (!taken.has(nameKey(base))) return base;
  for (let n = 2; ; n++) if (!taken.has(nameKey(`${base} ${n}`))) return `${base} ${n}`;
}

/** Groupes de lignes consécutives d'un même bloc, dans l'ordre des blocs. */
export function itemsByBlock(items: readonly PrescriptionItem[], blocksById: ReadonlyMap<ID, BlockType>): { blockTypeId: ID; items: PrescriptionItem[] }[] {
  const order = (i: PrescriptionItem) => blocksById.get(i.blockTypeId)?.order ?? Number.MAX_SAFE_INTEGER;
  const sorted = items.map((item, index) => ({ item, index })).sort((a, b) => order(a.item) - order(b.item) || a.index - b.index);
  const groups: { blockTypeId: ID; items: PrescriptionItem[] }[] = [];
  for (const { item } of sorted) {
    const last = groups.at(-1);
    if (last && last.blockTypeId === item.blockTypeId) last.items.push(item);
    else groups.push({ blockTypeId: item.blockTypeId, items: [item] });
  }
  return groups;
}
