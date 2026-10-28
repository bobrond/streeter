import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { appSettings, block, element, exercise, item, program, setLog, template, weekPlan } from '../test/builders';
import { programToFile, readProgramFile } from '../io/program/programFile';
import { StreeterDB } from './db';
import {
  InUseError,
  addProgram,
  applyProgramImport,
  deleteBand,
  deleteElement,
  deleteExercise,
  deleteProgram,
  deleteTemplate,
  saveOrder,
  setTemplateArchived,
  setWeekSlot,
  swapWeekSlotsOf,
  updateEffectiveSettings,
} from './programStore';

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
  await db.settings.put(appSettings());
  await db.programs.put(program({ weekPlan: weekPlan({ 2: { evening: tpl.id }, 6: { evening: tpl.id } }) }));
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
    const plan = (await db.programs.get('prog'))!.weekPlan;
    expect(plan[2].evening).toBeNull();
    expect(plan[6].evening).toBeNull();
  });

  it('change un créneau de la semaine type et l’ordre d’une liste', async () => {
    const db = freshDb();
    const tpl = await seed(db);
    await setWeekSlot(db, 'prog', 4, 'morning', tpl.id);
    expect((await db.programs.get('prog'))!.weekPlan[4].morning).toBe(tpl.id);
    await saveOrder(db, 'exercises', [
      { id: wallSlide.id, order: 1 },
      { id: uppercut.id, order: 0 },
    ]);
    expect((await db.exercises.get(uppercut.id))?.order).toBe(0);
  });

  it('archive un modèle : il quitte la semaine type ; le désarchiver ne l’y remet pas', async () => {
    const db = freshDb();
    const tpl = await seed(db);
    await setTemplateArchived(db, tpl.id, true);
    expect(await db.templates.get(tpl.id)).toMatchObject({ archived: true, items: tpl.items });
    const plan = (await db.programs.get('prog'))!.weekPlan;
    expect([plan[2].evening, plan[6].evening]).toEqual([null, null]);
    await setTemplateArchived(db, tpl.id, false);
    expect((await db.templates.get(tpl.id))?.archived).toBe(false);
    expect((await db.programs.get('prog'))!.weekPlan[2].evening).toBeNull();
  });

  it('échange les séances du soir de deux jours', async () => {
    const db = freshDb();
    const tpl = await seed(db);
    await swapWeekSlotsOf(db, 'prog', 'evening', 2, 4);
    const plan = (await db.programs.get('prog'))!.weekPlan;
    expect([plan[2].evening, plan[4].evening, plan[6].evening]).toEqual([null, tpl.id, tpl.id]);
  });

  it('écrit les réglages effectifs : séquence et durées dans les réglages, cycle et volume dans le programme', async () => {
    const db = freshDb();
    await seed(db);
    await updateEffectiveSettings(db, 'prog', { cycleStartDate: '2026-10-06', freeRestSec: 45, volumeMin: 3, deloadWeek: 3 });
    expect(await db.settings.get('settings')).toMatchObject({ cycleStartDate: '2026-10-06', freeRestSec: 45 });
    expect(await db.settings.get('settings')).not.toHaveProperty('volumeMin');
    expect(await db.programs.get('prog')).toMatchObject({ volumeMin: 3, deloadWeek: 3 });
  });

  it('ajoute un programme avec ses modèles ; seul un programme à venir se supprime, avec ses modèles', async () => {
    const db = freshDb();
    const tpl = await seed(db);
    const copy = { ...tpl, id: 'copie', programId: 'nov' };
    await addProgram(db, program({ id: 'nov', name: 'Novembre 2026', startWeek: 5, weekPlan: weekPlan({ 2: { evening: 'copie' } }) }), [copy]);
    expect(await db.templates.where('programId').equals('nov').count()).toBe(1);
    await expect(deleteProgram(db, 'prog', 4)).rejects.toBeInstanceOf(InUseError);
    await expect(deleteProgram(db, 'nov', 5)).rejects.toBeInstanceOf(InUseError);
    await deleteProgram(db, 'nov', 4);
    expect(await db.programs.get('nov')).toBeUndefined();
    expect(await db.templates.get('copie')).toBeUndefined();
    expect(await db.templates.get(tpl.id)).toBeDefined();
  });

  it('écrit un fichier programme importé : nouveautés, objectifs repris avec leurs tests, modèles remplacés', async () => {
    const db = freshDb();
    const tpl = await seed(db);
    await db.objectives.update('o', { tests: [{ id: 't', date: '2026-10-07', value: 3, note: '' }] });
    const unused = template('Matin A', 'morning', [], { id: 'matin' });
    await db.templates.put(unused);
    const catalog = {
      elements: await db.elements.toArray(),
      blockTypes: await db.blockTypes.toArray(),
      sessionTypes: [{ id: 'type', name: 'Combo', moment: 'evening' as const, description: '', color: '#ffb020', isTestDay: false }],
      exercises: await db.exercises.toArray(),
      bands: [],
      objectives: await db.objectives.toArray(),
    };
    const october = (await db.programs.get('prog'))!;
    const file = programToFile({ ...october, objectiveIds: ['o'] }, [tpl, unused], catalog, appSettings());
    file.seances = file.seances.filter((s) => s.nom === 'Combo');
    file.seances[0].lignes[0].exercices = ['Face pull'];
    file.nouveautes.exercices = [{ nom: 'Face pull', element: 'Grand dentelé', mesure: 'reps', categorie: '', rapide: true, tempsParSerieSec: null, autresNoms: [], notes: '' }];
    file.objectifs = [{ nom: 'Obj', critere: 'Propre', cible: 5, unite: 'reps', exercice: 'Uppercut' }];
    const read = readProgramFile(JSON.stringify(file), {
      ...catalog,
      app: appSettings(),
      programs: [october],
      templates: [tpl, unused],
      usedTemplateIds: new Set(),
      today: '2026-10-13',
      currentWeek: 2,
      newId: () => crypto.randomUUID(),
      now: 1,
    });
    if (!read.ok) throw new Error(read.errors.join(' | '));
    await applyProgramImport(db, read.value);

    const faceKey = (await db.exercises.toArray()).find((e) => e.name === 'Face pull')!;
    expect((await db.templates.get(tpl.id))!.items[0].candidateExerciseIds).toEqual([faceKey.id]);
    expect(await db.templates.get('matin')).toBeUndefined();
    expect(await db.objectives.get('o')).toMatchObject({ criterion: 'Propre', target: 5, tests: [{ id: 't', value: 3 }] });
    expect((await db.programs.get('prog'))!.objectiveIds).toEqual(['o']);
    expect(await db.programs.count()).toBe(1);
  });
});
