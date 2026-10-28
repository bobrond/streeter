// Écritures de l'édition du programme et du catalogue (Réglages).
// Une suppression vérifie l'utilisation dans la même transaction : rien n'est perdu par mégarde.
import {
  bandUsage,
  blockUsage,
  elementUsage,
  isUnused,
  removeFromWeekPlan,
  sessionTypeUsage,
  swapWeekSlots,
  withoutExercise,
} from '../domain/editing';
import { splitSettingsPatch } from '../domain/programs';
import type { AppSettings, Band, BlockType, Element, Exercise, ID, Moment, Program, SeqDay, SessionTemplate, SessionType, Settings, WeekPlan } from '../domain/types';
import type { ProgramImport } from '../io/program/programFile';
import type { StreeterDB } from './db';

export class InUseError extends Error {}

export async function saveExercise(db: StreeterDB, exercise: Exercise): Promise<void> {
  await db.exercises.put(exercise);
}

/**
 * Supprime un exercice jamais fait : il est retiré des candidats des lignes et des objectifs liés.
 * Un exercice déjà fait ne se supprime pas (l'historique en dépend) : on le désactive.
 */
export async function deleteExercise(db: StreeterDB, id: ID): Promise<void> {
  await db.transaction('rw', [db.exercises, db.templates, db.sets, db.objectives], async () => {
    if ((await db.sets.where('exerciseId').equals(id).count()) > 0) {
      throw new InUseError('Cet exercice a déjà été fait : désactive-le plutôt que de le supprimer.');
    }
    const exercises = await db.exercises.toArray();
    const changed = withoutExercise(await db.templates.toArray(), id, new Map(exercises.map((e) => [e.id, e])));
    await db.templates.bulkPut(changed);
    const objectives = (await db.objectives.toArray()).filter((o) => o.exerciseId === id);
    await db.objectives.bulkPut(objectives.map((o) => ({ ...o, exerciseId: null })));
    await db.exercises.delete(id);
  });
}

export async function saveElement(db: StreeterDB, element: Element): Promise<void> {
  await db.elements.put(element);
}

export async function deleteElement(db: StreeterDB, id: ID): Promise<void> {
  await db.transaction('rw', [db.elements, db.templates, db.sets, db.exercises], async () => {
    const usage = elementUsage(id, await db.templates.toArray(), await db.sets.where('elementId').equals(id).toArray(), await db.exercises.toArray());
    if (!isUnused(usage)) throw new InUseError('Cet élément est utilisé (lignes, exercices ou séries) : impossible de le supprimer.');
    await db.elements.delete(id);
  });
}

export async function saveBlock(db: StreeterDB, block: BlockType): Promise<void> {
  await db.blockTypes.put(block);
}

export async function deleteBlock(db: StreeterDB, id: ID): Promise<void> {
  await db.transaction('rw', [db.blockTypes, db.templates, db.sets], async () => {
    const usage = blockUsage(id, await db.templates.toArray(), await db.sets.toArray());
    if (!isUnused(usage)) throw new InUseError('Ce bloc est utilisé (lignes ou séries) : impossible de le supprimer.');
    await db.blockTypes.delete(id);
  });
}

export async function saveSessionType(db: StreeterDB, type: SessionType): Promise<void> {
  await db.sessionTypes.put(type);
}

export async function deleteSessionType(db: StreeterDB, id: ID): Promise<void> {
  await db.transaction('rw', [db.sessionTypes, db.templates], async () => {
    if (!isUnused(sessionTypeUsage(id, await db.templates.toArray()))) {
      throw new InUseError('Ce type est utilisé par un modèle de séance : impossible de le supprimer.');
    }
    await db.sessionTypes.delete(id);
  });
}

export async function saveBand(db: StreeterDB, band: Band): Promise<void> {
  await db.bands.put(band);
}

export async function deleteBand(db: StreeterDB, id: ID): Promise<void> {
  await db.transaction('rw', [db.bands, db.sets], async () => {
    if (!isUnused(bandUsage(id, await db.sets.toArray()))) {
      throw new InUseError('Cet élastique a déjà servi : désactive-le plutôt que de le supprimer.');
    }
    await db.bands.delete(id);
  });
}

/** Enregistre un nouvel ordre (blocs, élastiques, éléments…). */
export async function saveOrder(db: StreeterDB, table: 'blockTypes' | 'bands' | 'elements' | 'objectives' | 'exercises', list: readonly { id: ID; order: number }[]): Promise<void> {
  await db.transaction('rw', db.table(table), async () => {
    for (const { id, order } of list) await db.table(table).update(id, { order });
  });
}

export async function saveTemplate(db: StreeterDB, template: SessionTemplate): Promise<void> {
  await db.templates.put(template);
}

/** Modifie la semaine type d'un programme dans la transaction en cours. */
async function editWeekPlan(db: StreeterDB, programId: ID, edit: (weekPlan: WeekPlan) => WeekPlan): Promise<void> {
  const program = await db.programs.get(programId);
  if (program) await db.programs.update(programId, { weekPlan: edit(structuredClone(program.weekPlan)) });
}

/** Change le moment d'un modèle : il est retiré des créneaux de l'ancien moment dans la semaine type. */
export async function changeTemplateMoment(db: StreeterDB, template: SessionTemplate, moment: Moment): Promise<void> {
  await db.transaction('rw', [db.templates, db.programs], async () => {
    await editWeekPlan(db, template.programId, (weekPlan) => {
      for (const slot of Object.values(weekPlan)) if (slot[template.moment] === template.id) slot[template.moment] = null;
      return weekPlan;
    });
    await db.templates.put({ ...template, moment });
  });
}

/** Supprime un modèle et le retire de la semaine type. Les séances déjà faites gardent leur copie. */
export async function deleteTemplate(db: StreeterDB, id: ID): Promise<void> {
  await db.transaction('rw', [db.templates, db.programs], async () => {
    const template = await db.templates.get(id);
    if (template) await editWeekPlan(db, template.programId, (weekPlan) => removeFromWeekPlan(weekPlan, id));
    await db.templates.delete(id);
  });
}

/**
 * Archive un modèle : il quitte la semaine type et n'est plus proposé, mais reste modifiable et peut être désarchivé
 * (sans revenir dans la semaine type). Les séances déjà faites gardent leur copie.
 */
export async function setTemplateArchived(db: StreeterDB, id: ID, archived: boolean): Promise<void> {
  await db.transaction('rw', [db.templates, db.programs], async () => {
    const template = await db.templates.get(id);
    if (archived && template) await editWeekPlan(db, template.programId, (weekPlan) => removeFromWeekPlan(weekPlan, id));
    await db.templates.update(id, { archived });
  });
}

/** Échange les séances d'un moment entre deux jours de la semaine type d'un programme. */
export async function swapWeekSlotsOf(db: StreeterDB, programId: ID, moment: Moment, from: SeqDay, to: SeqDay): Promise<void> {
  await db.transaction('rw', db.programs, () => editWeekPlan(db, programId, (weekPlan) => swapWeekSlots(weekPlan, moment, from, to)));
}

export async function setWeekSlot(db: StreeterDB, programId: ID, day: SeqDay, moment: Moment, templateId: ID | null): Promise<void> {
  await db.transaction('rw', db.programs, () =>
    editWeekPlan(db, programId, (weekPlan) => {
      weekPlan[day][moment] = templateId;
      return weekPlan;
    }),
  );
}

/** Réglages de l'appli, communs à tous les programmes. */
export async function updateSettings(db: StreeterDB, patch: Partial<Omit<AppSettings, 'id'>>): Promise<void> {
  await db.settings.update('settings', patch);
}

export async function updateProgram(db: StreeterDB, programId: ID, patch: Partial<Omit<Program, 'id'>>): Promise<void> {
  await db.programs.update(programId, patch);
}

/** Écrit des réglages effectifs : ceux de l'appli dans les réglages, les autres dans le programme. */
export async function updateEffectiveSettings(db: StreeterDB, programId: ID, patch: Partial<Omit<Settings, 'id'>>): Promise<void> {
  const { app, program } = splitSettingsPatch(patch);
  await db.transaction('rw', [db.settings, db.programs], async () => {
    if (Object.keys(app).length > 0) await db.settings.update('settings', app);
    if (Object.keys(program).length > 0) await db.programs.update(programId, program);
  });
}

/** Ajoute un programme et ses modèles (copie pour la suite). */
export async function addProgram(db: StreeterDB, program: Program, templates: readonly SessionTemplate[]): Promise<void> {
  await db.transaction('rw', [db.programs, db.templates], async () => {
    await db.programs.add(program);
    await db.templates.bulkAdd([...templates]);
  });
}

/**
 * Supprime un programme à venir et ses modèles. Un programme déjà commencé ne se supprime pas : ses semaines
 * reviendraient au programme précédent et changeraient l'historique du volume.
 */
export async function deleteProgram(db: StreeterDB, programId: ID, currentWeek: number): Promise<void> {
  await db.transaction('rw', [db.programs, db.templates], async () => {
    const program = await db.programs.get(programId);
    if (!program) return;
    if (program.startWeek <= currentWeek) throw new InUseError('Ce programme a déjà commencé : impossible de le supprimer.');
    if ((await db.programs.count()) <= 1) throw new InUseError('Il faut garder au moins un programme.');
    await db.templates.where('programId').equals(programId).delete();
    await db.programs.delete(programId);
  });
}

/**
 * Écrit l'import d'un fichier programme en une transaction : nouveautés du catalogue, objectifs, programme et ses
 * modèles. Un programme remplacé garde son identifiant ; ses modèles absents du fichier sont archivés s'ils ont servi,
 * supprimés sinon. Les séances déjà faites gardent leur copie.
 */
export async function applyProgramImport(db: StreeterDB, imported: ProgramImport): Promise<void> {
  await db.transaction('rw', [db.elements, db.blockTypes, db.sessionTypes, db.exercises, db.objectives, db.programs, db.templates], async () => {
    if (imported.replaces) {
      const current = await db.programs.get(imported.replaces.id);
      if (!current || current.startWeek !== imported.program.startWeek) throw new InUseError('Le programme à remplacer a changé entre-temps : relis le fichier.');
    }
    await db.elements.bulkAdd(imported.newElements);
    await db.blockTypes.bulkPut(imported.blockTypes);
    await db.sessionTypes.bulkAdd(imported.newSessionTypes);
    await db.exercises.bulkAdd(imported.newExercises);
    await db.objectives.bulkAdd(imported.newObjectives);
    // Objectifs repris : leurs tests ne sont pas réécrits.
    for (const { id, criterion, target, unit, exerciseId } of imported.updatedObjectives) {
      await db.objectives.update(id, { criterion, target, unit, exerciseId });
    }
    for (const { template, archive } of imported.removedTemplates) {
      if (archive) await db.templates.update(template.id, { archived: true });
      else await db.templates.delete(template.id);
    }
    await db.templates.bulkPut(imported.templates);
    await db.programs.put(imported.program);
  });
}
