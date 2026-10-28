// Changements d'un programme par rapport à un autre (aperçu d'un import de fichier programme) : réglages, semaine
// type, séances (rapprochées par nom) et leurs lignes, objectifs.
import { MOMENT_LABEL, formatSets, formatValue, seqDayLabel } from './labels';
import { cleanSpaces, nameKey } from './text';
import type { BlockType, Element, Exercise, ID, Moment, Objective, PrescriptionItem, Program, SeqDay, SessionTemplate, SessionType } from './types';
import { MOMENTS, SEQ_DAYS } from './types';

export interface DiffNames {
  elements: ReadonlyMap<ID, Element>;
  blocks: ReadonlyMap<ID, BlockType>;
  exercises: ReadonlyMap<ID, Exercise>;
  sessionTypes: ReadonlyMap<ID, SessionType>;
}

export interface ProgramSide {
  program: Program;
  /** Modèles du programme (les archivés sont ignorés). */
  templates: readonly SessionTemplate[];
}

export interface ValueChange {
  label: string;
  before: string;
  after: string;
}

export interface SlotChange {
  day: SeqDay;
  moment: Moment;
  before: string | null;
  after: string | null;
}

export interface TemplateChange {
  name: string;
  changes: string[];
}

export interface ProgramDiff {
  settings: ValueChange[];
  weekPlan: SlotChange[];
  added: SessionTemplate[];
  removed: SessionTemplate[];
  changed: TemplateChange[];
  unchanged: string[];
}

function settingsRows(p: Program): [string, string][] {
  return [
    ['Cycle', `${p.cycleLengthWeeks} semaine${p.cycleLengthWeeks > 1 ? 's' : ''}`],
    ['Semaine allégée', p.deloadWeek > 0 ? `S${p.deloadWeek}` : 'aucune'],
    ['Réduction en semaine allégée', `−${p.deloadReductionPct} %`],
    ['Matins en semaine allégée', p.hideMorningsInDeload ? 'masqués' : 'gardés'],
    ['Volume par composante', `${p.volumeMin} à ${p.volumeMax} séries`],
    ['Durée maximum des matins', `${p.morningMaxMinutes} min`],
  ];
}

/** Texte comparé sans espaces superflus ; « — » vaut vide. */
function norm(text: string): string {
  const t = cleanSpaces(text);
  return /^[—–-]*$/.test(t) ? '' : t;
}

function shown(text: string): string {
  return norm(text) || '—';
}

function lineLabel(item: PrescriptionItem, names: DiffNames): string {
  return `${names.blocks.get(item.blockTypeId)?.name ?? '?'} · ${names.elements.get(item.elementId)?.name ?? '?'}`;
}

function exerciseList(ids: readonly ID[], names: DiffNames): string {
  return ids.map((id) => names.exercises.get(id)?.name ?? '?').join(', ');
}

/** Lignes rapprochées par (bloc, élément) et par rang parmi les lignes de même bloc et même élément. */
function lineKeys(items: readonly PrescriptionItem[]): string[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const base = `${item.blockTypeId}|${item.elementId}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return `${base}|${n}`;
  });
}

function itemChanges(before: PrescriptionItem, after: PrescriptionItem, names: DiffNames): string[] {
  const changes: string[] = [];
  const removed = before.candidateExerciseIds.filter((id) => !after.candidateExerciseIds.includes(id));
  const added = after.candidateExerciseIds.filter((id) => !before.candidateExerciseIds.includes(id));
  if (added.length > 0) changes.push(`+ ${exerciseList(added, names)}`);
  if (removed.length > 0) changes.push(`− ${exerciseList(removed, names)}`);
  if (before.setsMin !== after.setsMin || before.setsMax !== after.setsMax) {
    changes.push(`séries ${formatSets(before.setsMin, before.setsMax)} → ${formatSets(after.setsMin, after.setsMax)}`);
  }
  const texts: [string, string, string][] = [
    ['cible', before.targetText, after.targetText],
    ['intensité', before.intensityText, after.intensityText],
    ['repos', before.restText, after.restText],
  ];
  for (const [label, a, b] of texts) if (norm(a) !== norm(b)) changes.push(`${label} ${shown(a)} → ${shown(b)}`);
  if (before.superset !== after.superset) changes.push(after.superset ? 'en superset' : 'plus en superset');
  if (before.optional !== after.optional) changes.push(after.optional ? 'optionnelle' : 'obligatoire');
  if (norm(before.notes) !== norm(after.notes)) changes.push('notes modifiées');
  return changes;
}

function templateChanges(before: SessionTemplate, after: SessionTemplate, names: DiffNames): string[] {
  const changes: string[] = [];
  if (before.sessionTypeId !== after.sessionTypeId) {
    changes.push(`Type : ${names.sessionTypes.get(before.sessionTypeId)?.name ?? '?'} → ${names.sessionTypes.get(after.sessionTypeId)?.name ?? '?'}`);
  }
  if (before.moment !== after.moment) changes.push(`Moment : ${MOMENT_LABEL[before.moment]} → ${MOMENT_LABEL[after.moment]}`);
  if (before.optional !== after.optional) changes.push(after.optional ? 'Devient optionnelle' : 'Devient obligatoire');
  if (norm(before.notes) !== norm(after.notes)) changes.push('Notes modifiées');

  const beforeKeys = lineKeys(before.items);
  const afterKeys = lineKeys(after.items);
  const beforeByKey = new Map(beforeKeys.map((key, i) => [key, before.items[i]]));
  const afterByKey = new Map(afterKeys.map((key, i) => [key, after.items[i]]));
  after.items.forEach((item, i) => {
    const old = beforeByKey.get(afterKeys[i]);
    if (!old) changes.push(`Ligne ajoutée : ${lineLabel(item, names)} (${exerciseList(item.candidateExerciseIds, names)}, ${formatSets(item.setsMin, item.setsMax)} séries)`);
    else {
      const detail = itemChanges(old, item, names);
      if (detail.length > 0) changes.push(`${lineLabel(item, names)} : ${detail.join(' ; ')}`);
    }
  });
  before.items.forEach((item, i) => {
    if (!afterByKey.has(beforeKeys[i])) changes.push(`Ligne retirée : ${lineLabel(item, names)} (${exerciseList(item.candidateExerciseIds, names)})`);
  });
  const common = afterKeys.filter((key) => beforeByKey.has(key));
  const commonBefore = beforeKeys.filter((key) => afterByKey.has(key));
  if (common.join() !== commonBefore.join()) changes.push('Ordre des lignes changé');
  return changes;
}

/** Changements de `after` par rapport à `before` ; sans `before`, toutes les séances sont nouvelles. */
export function diffPrograms(before: ProgramSide | null, after: ProgramSide, names: DiffNames): ProgramDiff {
  const live = (side: ProgramSide) => side.templates.filter((t) => !t.archived && t.programId === side.program.id);
  const afterTemplates = live(after);
  if (!before) return { settings: [], weekPlan: [], added: afterTemplates, removed: [], changed: [], unchanged: [] };
  const beforeTemplates = live(before);

  const beforeRows = settingsRows(before.program);
  const settings = settingsRows(after.program)
    .map(([label, value], i) => ({ label, before: beforeRows[i][1], after: value }))
    .filter((row) => row.before !== row.after);

  const nameOf = (side: ProgramSide, id: ID | null) => (id ? (side.templates.find((t) => t.id === id)?.name ?? null) : null);
  const weekPlan: SlotChange[] = [];
  for (const day of SEQ_DAYS) {
    for (const moment of MOMENTS) {
      const a = nameOf(before, before.program.weekPlan[day][moment]);
      const b = nameOf(after, after.program.weekPlan[day][moment]);
      if (nameKey(a ?? '') !== nameKey(b ?? '')) weekPlan.push({ day, moment, before: a, after: b });
    }
  }

  const find = (list: readonly SessionTemplate[], name: string) => list.find((t) => nameKey(t.name) === nameKey(name));
  const added: SessionTemplate[] = [];
  const changed: TemplateChange[] = [];
  const unchanged: string[] = [];
  for (const template of afterTemplates) {
    const old = find(beforeTemplates, template.name);
    if (!old) added.push(template);
    else {
      const changes = templateChanges(old, template, names);
      if (changes.length > 0) changed.push({ name: template.name, changes });
      else unchanged.push(template.name);
    }
  }
  const removed = beforeTemplates.filter((t) => !find(afterTemplates, t.name));
  return { settings, weekPlan, added, removed, changed, unchanged };
}

export function isEmptyDiff(diff: ProgramDiff): boolean {
  return diff.settings.length + diff.weekPlan.length + diff.added.length + diff.removed.length + diff.changed.length === 0;
}

/** « J4 matin : Matin A → Matin endurance ». */
export function slotChangeText(change: SlotChange): string {
  const empty = change.moment === 'evening' ? 'Repos' : 'rien';
  return `${seqDayLabel(change.day)} ${MOMENT_LABEL[change.moment].toLowerCase()} : ${change.before ?? empty} → ${change.after ?? empty}`;
}

export interface ObjectiveChange {
  name: string;
  status: 'new' | 'kept' | 'changed' | 'dropped';
  changes: string[];
}

/**
 * Objectifs du programme importé par rapport au programme de référence : nouveaux, repris (avec ou sans changement),
 * et ceux qui deviennent d'anciens objectifs.
 */
export function objectiveChanges(
  baseIds: readonly ID[],
  imported: readonly Objective[],
  existing: ReadonlyMap<ID, Objective>,
  exercises: ReadonlyMap<ID, Exercise>,
): ObjectiveChange[] {
  const result: ObjectiveChange[] = imported.map((objective) => {
    const old = existing.get(objective.id);
    if (!old) return { name: objective.name, status: 'new', changes: [`cible ${formatValue(objective.target, objective.unit)}`] };
    const changes: string[] = [];
    if (old.target !== objective.target || old.unit !== objective.unit) {
      changes.push(`cible ${formatValue(old.target, old.unit)} → ${formatValue(objective.target, objective.unit)}`);
    }
    if (norm(old.criterion) !== norm(objective.criterion)) changes.push('critère modifié');
    if (old.exerciseId !== objective.exerciseId) {
      const name = (id: ID | null) => (id ? (exercises.get(id)?.name ?? '?') : 'aucun');
      changes.push(`exercice ${name(old.exerciseId)} → ${name(objective.exerciseId)}`);
    }
    return { name: objective.name, status: changes.length > 0 ? 'changed' : 'kept', changes };
  });
  const importedIds = new Set(imported.map((o) => o.id));
  for (const id of baseIds) {
    const old = existing.get(id);
    if (old && !importedIds.has(id)) result.push({ name: old.name, status: 'dropped', changes: [] });
  }
  return result;
}
