import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { block, element, exercise, item, setLog, settings, template, weekPlan } from '../test/builders';
import { StreeterDB } from './db';
import { InUseError, deleteBand, deleteElement, deleteExercise, deleteTemplate, saveOrder, setWeekSlot } from './programStore';

const databases: StreeterDB[] = [];
function freshDb(): StreeterDB {
  const db = new StreeterDB(`test-${Math.random()}`);
  databases.push(db);
  return db;
}

afterEach(async () => {
  for (const db of databases.splice(0)) await db.delete();
});

const dentele = element('Grand dentelé', 'component', 0);
const renfo = block('Renfo composantes', 0);
const wallSlide = exercise('Wall slide', dentele.id);
const uppercut = exercise('Uppercut', dentele.id);

async function seed(db: StreeterDB) {
  const line = item({ blockTypeId: renfo.id, elementId: dentele.id, candidateExerciseIds: [wallSlide.id, uppercut.id] });
  const tpl = template('Combo', 'evening', [line]);
  await db.elements.put(dentele);
  await db.blockTypes.put(renfo);
  await db.exercises.bulkPut([wallSlide, uppercut]);
  await db.templates.put(tpl);
  await db.settings.put(settings({ weekPlan: weekPlan({ 2: { evening: tpl.id }, 6: { evening: tpl.id } }) }));
  await db.objectives.put({ id: 'o', name: 'Obj', criterion: '', target: 1, unit: 'reps', exerciseId: uppercut.id, order: 0, tests: [] });
  return tpl;
}

describe('programStore', () => {
  it('supprime un exercice jamais fait et le retire des candidats et des objectifs', async () => {
    const db = freshDb();
    const tpl = await seed(db);
    await deleteExercise(db, uppercut.id);
    expect(await db.exercises.get(uppercut.id)).toBeUndefined();
    expect((await db.templates.get(tpl.id))?.items[0].candidateExerciseIds).toEqual([wallSlide.id]);
    expect((await db.objectives.get('o'))?.exerciseId).toBeNull();
  });

  it('refuse de supprimer un exercice déjà fait', async () => {
    const db = freshDb();
    await seed(db);
    await db.sets.put(setLog({ sessionId: 's', exerciseId: wallSlide.id }));
    await expect(deleteExercise(db, wallSlide.id)).rejects.toBeInstanceOf(InUseError);
    expect(await db.exercises.get(wallSlide.id)).toBeDefined();
  });

  it('refuse de supprimer un élément utilisé', async () => {
    const db = freshDb();
    await seed(db);
    await expect(deleteElement(db, dentele.id)).rejects.toBeInstanceOf(InUseError);
  });

  it('refuse de supprimer un élastique qui a servi', async () => {
    const db = freshDb();
    await db.bands.put({ id: 'vert', name: 'vert', color: '#0f0', order: 0, active: true });
    await db.sets.put(setLog({ sessionId: 's', exerciseId: 'x', bandId: 'vert' }));
    await expect(deleteBand(db, 'vert')).rejects.toBeInstanceOf(InUseError);
  });

  it('supprime un modèle et le retire de la semaine type', async () => {
    const db = freshDb();
    const tpl = await seed(db);
    await deleteTemplate(db, tpl.id);
    const plan = (await db.settings.get('settings'))!.weekPlan;
    expect(plan[2].evening).toBeNull();
    expect(plan[6].evening).toBeNull();
  });

  it('change un créneau de la semaine type et l’ordre d’une liste', async () => {
    const db = freshDb();
    const tpl = await seed(db);
    await setWeekSlot(db, 4, 'morning', tpl.id);
    expect((await db.settings.get('settings'))!.weekPlan[4].morning).toBe(tpl.id);
    await saveOrder(db, 'exercises', [
      { id: wallSlide.id, order: 1 },
      { id: uppercut.id, order: 0 },
    ]);
    expect((await db.exercises.get(uppercut.id))?.order).toBe(0);
  });
});
