// Écritures de l'édition du programme et du catalogue (Réglages).
// Une suppression vérifie l'utilisation dans la même transaction : rien n'est perdu par mégarde.
import {
  bandUsage,
  blockUsage,
  elementUsage,
  isUnused,
  removeFromWeekPlan,
  sessionTypeUsage,
  withoutExercise,
} from '../domain/editing';
import type { Band, BlockType, Element, Exercise, ID, Moment, SeqDay, SessionTemplate, SessionType, Settings } from '../domain/types';
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

/** Change le moment d'un modèle : il est retiré des créneaux de l'ancien moment dans la semaine type. */
export async function changeTemplateMoment(db: StreeterDB, template: SessionTemplate, moment: Moment): Promise<void> {
  await db.transaction('rw', [db.templates, db.settings], async () => {
    const settings = await db.settings.get('settings');
    if (settings) {
      const weekPlan = structuredClone(settings.weekPlan);
      for (const slot of Object.values(weekPlan)) if (slot[template.moment] === template.id) slot[template.moment] = null;
      await db.settings.update('settings', { weekPlan });
    }
    await db.templates.put({ ...template, moment });
  });
}

/** Supprime un modèle et le retire de la semaine type. Les séances déjà faites gardent leur copie. */
export async function deleteTemplate(db: StreeterDB, id: ID): Promise<void> {
  await db.transaction('rw', [db.templates, db.settings], async () => {
    const settings = await db.settings.get('settings');
    if (settings) await db.settings.update('settings', { weekPlan: removeFromWeekPlan(settings.weekPlan, id) });
    await db.templates.delete(id);
  });
}

export async function setWeekSlot(db: StreeterDB, day: SeqDay, moment: Moment, templateId: ID | null): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const settings = await db.settings.get('settings');
    if (!settings) return;
    const weekPlan = structuredClone(settings.weekPlan);
    weekPlan[day][moment] = templateId;
    await db.settings.update('settings', { weekPlan });
  });
}

export async function updateSettings(db: StreeterDB, patch: Partial<Omit<Settings, 'id'>>): Promise<void> {
  await db.settings.update('settings', patch);
}
