// Écritures de l'édition du programme et du catalogue (Réglages).
// Une suppression vérifie l'utilisation dans la même transaction : rien n'est perdu par mégarde.
import { detachAllBlocks, syncSharedBlocks } from '../domain/blocks';
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
import { splitSettingsPatch, weekOfDate } from '../domain/programs';
import { sequenceIds, sequenceWeekPlan } from '../domain/sequence';
import type { AppSettings, Band, BlockType, Element, Exercise, ID, Moment, Program, SeqDay, SessionTemplate, SessionType, Settings, WeekPlan } from '../domain/types';
import type { ComponentConversion } from '../domain/componentConversion';
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

/**
 * Enregistre un modèle ; ses blocs communs sont recopiés dans les modèles qui les partagent, dans la même transaction.
 * Renvoie l'état d'avant des modèles modifiés qui existaient déjà, pour « Annuler » (`restoreTemplates`).
 */
export async function saveTemplate(db: StreeterDB, template: SessionTemplate): Promise<SessionTemplate[]> {
  return db.transaction('rw', db.templates, async () => {
    const program = await db.templates.where('programId').equals(template.programId).toArray();
    const { saved, partners } = syncSharedBlocks(template, program);
    return writeTemplates(db, [saved, ...partners], program);
  });
}

/**
 * Écrit des modèles tels quels (blocs communs déjà cohérents : reprise d'un bloc, bloc rendu propre ou retiré,
 * séance avec les mêmes blocs). Renvoie l'état d'avant de ceux qui existaient déjà, pour « Annuler ».
 */
export async function replaceTemplates(db: StreeterDB, templates: readonly SessionTemplate[]): Promise<SessionTemplate[]> {
  return db.transaction('rw', db.templates, async () => writeTemplates(db, templates, await db.templates.bulkGet(templates.map((t) => t.id))));
}

async function writeTemplates(db: StreeterDB, templates: readonly SessionTemplate[], current: readonly (SessionTemplate | undefined)[]): Promise<SessionTemplate[]> {
  const before = new Map(current.filter((t): t is SessionTemplate => t !== undefined).map((t) => [t.id, t]));
  await db.templates.bulkPut([...templates]);
  return templates.map((t) => before.get(t.id)).filter((t): t is SessionTemplate => t !== undefined);
}

/** « Annuler » : remet des modèles dans l'état renvoyé par `saveTemplate` ou `replaceTemplates`. */
export async function restoreTemplates(db: StreeterDB, previous: readonly SessionTemplate[]): Promise<void> {
  await db.templates.bulkPut([...previous]);
}

/**
 * Modifie la semaine type d'un programme dans la transaction en cours. En séquence, les séances restent tassées sur
 * J1…Jn (soirs) et J1…Jm (matins) : une séance retirée rend sa place à la suivante.
 */
async function editWeekPlan(db: StreeterDB, programId: ID, edit: (weekPlan: WeekPlan) => WeekPlan): Promise<void> {
  const program = await db.programs.get(programId);
  if (!program) return;
  const weekPlan = edit(structuredClone(program.weekPlan));
  await db.programs.update(programId, {
    weekPlan: program.schedule === 'sequence' ? sequenceWeekPlan(sequenceIds(weekPlan, 'evening'), sequenceIds(weekPlan, 'morning')) : weekPlan,
  });
}

/**
 * Après un changement de la date de début de la semaine 1 : la semaine de début d'un programme en séquence (dont la
 * date ne bouge pas) se recalcule.
 */
export async function refreshSequenceStartWeeks(db: StreeterDB, cycleStartDate: string): Promise<void> {
  for (const program of await db.programs.toArray()) {
    if (program.schedule === 'sequence' && program.startDate) {
      await db.programs.update(program.id, { startWeek: weekOfDate({ cycleStartDate }, program.startDate) });
    }
  }
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
 * (sans revenir dans la semaine type). Ses blocs communs deviennent propres : le modifier ne touche plus les autres
 * séances. Les séances déjà faites gardent leur copie.
 */
export async function setTemplateArchived(db: StreeterDB, id: ID, archived: boolean): Promise<void> {
  await db.transaction('rw', [db.templates, db.programs], async () => {
    const template = await db.templates.get(id);
    if (!template) return;
    if (archived) await editWeekPlan(db, template.programId, (weekPlan) => removeFromWeekPlan(weekPlan, id));
    await db.templates.put({ ...(archived ? detachAllBlocks(template, () => crypto.randomUUID()) : template), archived });
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
    if (app.cycleStartDate) await refreshSequenceStartWeeks(db, app.cycleStartDate);
  });
}

/** État d'un programme et de ses modèles avant une écriture, pour « Annuler ». */
export interface ProgramUndo {
  program: Program;
  templates: SessionTemplate[];
  /** Modèles créés par l'écriture, à supprimer pour annuler. */
  created: ID[];
}

/**
 * Passe un programme aux composantes réparties en une transaction : ses réglages, ses séances sans leurs lignes de
 * composantes ; une séance fusionnée dans une autre est archivée si elle a servi, supprimée sinon. Les séances déjà
 * faites gardent leur copie. Renvoie l'état d'avant, pour « Annuler » (`restoreProgram`).
 */
export async function applyComponentConversion(db: StreeterDB, conversion: ComponentConversion): Promise<ProgramUndo> {
  return db.transaction('rw', [db.programs, db.templates], async () => {
    const program = await db.programs.get(conversion.program.id);
    if (!program) throw new InUseError('Ce programme n’existe plus.');
    if (program.components.length > 0) throw new InUseError('Les composantes de ce programme sont déjà réparties par l’appli.');
    const touched = [...conversion.templates.map((t) => t.id), ...conversion.merged.map((m) => m.template.id)];
    const before = (await db.templates.bulkGet(touched)).filter((t): t is SessionTemplate => t !== undefined);
    await db.programs.put(conversion.program);
    await db.templates.bulkPut(conversion.templates);
    await db.templates.bulkDelete(conversion.merged.filter((m) => !m.archive).map((m) => m.template.id));
    return { program, templates: before, created: [] };
  });
}

/** « Annuler » : remet un programme et ses modèles dans l'état d'avant. */
export async function restoreProgram(db: StreeterDB, undo: ProgramUndo): Promise<void> {
  await db.transaction('rw', [db.programs, db.templates], async () => {
    await db.programs.put(undo.program);
    await db.templates.bulkPut(undo.templates);
    await db.templates.bulkDelete(undo.created);
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
      if (archive) await db.templates.update(template.id, { archived: true, sharedBlocks: {} });
      else await db.templates.delete(template.id);
    }
    await db.templates.bulkPut(imported.templates);
    await db.programs.put(imported.program);
  });
}
