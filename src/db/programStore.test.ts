import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { appSettings, block, element, exercise, item, program, setLog, template, weekPlan } from '../test/builders';
import { convertToComponents } from '../domain/componentConversion';
import { programToFile, readProgramFile } from '../io/program/programFile';
import { StreeterDB } from './db';
import {
  InUseError,
  addProgram,
  applyComponentConversion,
  applyProgramImport,
  deleteBand,
  deleteElement,
  deleteExercise,
  deleteProgram,
  deleteTemplate,
  replaceTemplates,
  restoreProgram,
  restoreTemplates,
  saveOrder,
  saveTemplate,
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

  it('enregistre un bloc commun dans toutes les séances qui le partagent ; « Annuler » remet tout', async () => {
    const db = freshDb();
    const warmup = item({ blockTypeId: renfo.id, elementId: dentele.id, candidateExerciseIds: [wallSlide.id] });
    const st = template('Séance type', 'evening', [warmup], { sharedBlocks: { [renfo.id]: 'commun' } });
    const combo = template('Combo libre', 'evening', [warmup], { sharedBlocks: { [renfo.id]: 'commun' } });
    const elsewhere = template('Max', 'evening', [warmup], { programId: 'oct', sharedBlocks: { [renfo.id]: 'commun' } });
    await db.templates.bulkPut([st, combo, elsewhere]);
    const previous = await saveTemplate(db, { ...combo, items: [{ ...warmup, setsMax: 3 }] });
    expect((await db.templates.get(st.id))!.items[0].setsMax).toBe(3);
    expect((await db.templates.get(combo.id))!.items[0].setsMax).toBe(3);
    expect((await db.templates.get(elsewhere.id))!.items[0].setsMax).toBe(2);
    expect(previous.map((t) => t.id).sort()).toEqual([st.id, combo.id].sort());
    await restoreTemplates(db, previous);
    expect((await db.templates.get(st.id))!.items[0].setsMax).toBe(2);
    expect((await db.templates.get(combo.id))!.items[0].setsMax).toBe(2);
  });

  it('archiver une séance rend ses blocs propres : les autres séances ne la suivent plus', async () => {
    const db = freshDb();
    await seed(db);
    const warmup = item({ blockTypeId: renfo.id, elementId: dentele.id, candidateExerciseIds: [wallSlide.id] });
    const st = template('Séance type', 'evening', [warmup], { sharedBlocks: { [renfo.id]: 'commun' } });
    const old = template('Séance type 5', 'evening', [warmup], { sharedBlocks: { [renfo.id]: 'commun' } });
    await replaceTemplates(db, [st, old]);
    await setTemplateArchived(db, old.id, true);
    const archived = (await db.templates.get(old.id))!;
    expect(archived).toMatchObject({ archived: true, sharedBlocks: {} });
    expect(archived.items[0].id).not.toBe(warmup.id);
    expect({ ...archived.items[0], id: warmup.id }).toEqual(warmup);
    await saveTemplate(db, { ...st, items: [{ ...warmup, notes: 'modifié' }] });
    expect((await db.templates.get(old.id))!.items[0].notes).toBe('');
  });

  it('un programme importé met en commun les blocs identiques de ses séances', async () => {
    const db = freshDb();
    const tpl = await seed(db);
    const catalog = {
      elements: await db.elements.toArray(),
      blockTypes: await db.blockTypes.toArray(),
      sessionTypes: [{ id: 'type', name: 'Combo', moment: 'evening' as const, description: '', color: '#ffb020', isTestDay: false }],
      exercises: await db.exercises.toArray(),
      bands: [],
      objectives: await db.objectives.toArray(),
    };
    const october = (await db.programs.get('prog'))!;
    const file = programToFile(october, [tpl, { ...tpl, id: 'copie', name: 'Combo bis' }], catalog, appSettings());
    const read = readProgramFile(JSON.stringify(file), {
      ...catalog,
      app: appSettings(),
      programs: [october],
      templates: [tpl],
      usedTemplateIds: new Set(),
      today: '2026-10-13',
      currentWeek: 2,
      newId: () => crypto.randomUUID(),
      now: 1,
    });
    if (!read.ok) throw new Error(read.errors.join(' | '));
    const [a, b] = read.value.templates;
    expect(a.sharedBlocks[renfo.id]).toBeDefined();
    expect(b.sharedBlocks).toEqual(a.sharedBlocks);
    expect(b.items[0].id).toBe(a.items[0].id);
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

  it('passe un programme aux composantes réparties en une transaction ; « Annuler » remet tout', async () => {
    const db = freshDb();
    const skill = item({ blockTypeId: 'skill', elementId: 'planche' });
    const line = item({ blockTypeId: renfo.id, elementId: dentele.id, candidateExerciseIds: [wallSlide.id] });
    const max = template('Max', 'evening', [skill, line], { sessionTypeId: 'max' });
    const max5 = template('Max 5', 'evening', [skill, { ...line, id: 'autre' }], { sessionTypeId: 'max' });
    const unused = template('Max bis', 'evening', [skill, { ...line, id: 'encore' }], { sessionTypeId: 'max' });
    const source = program({ weekPlan: weekPlan({ 1: { evening: max.id }, 3: { evening: max5.id }, 5: { evening: unused.id } }) });
    await db.elements.add(dentele);
    await db.programs.add(source);
    await db.templates.bulkAdd([max, max5, unused]);
    const conversion = convertToComponents(source, [max, max5, unused], [dentele], { newId: () => crypto.randomUUID(), usedTemplateIds: new Set([max5.id]) })!;
    expect(conversion.merged.map((m) => [m.template.name, m.archive])).toEqual([
      ['Max 5', true],
      ['Max bis', false],
    ]);
    const undo = await applyComponentConversion(db, conversion);
    const after = (await db.programs.get(source.id))!;
    expect(after.components.map((c) => c.elementId)).toEqual([dentele.id]);
    expect([after.weekPlan[1].evening, after.weekPlan[3].evening, after.weekPlan[5].evening]).toEqual([max.id, max.id, max.id]);
    expect((await db.templates.get(max.id))!.items).toEqual([skill]);
    expect(await db.templates.get(max5.id)).toMatchObject({ archived: true });
    expect(await db.templates.get(unused.id)).toBeUndefined();
    await expect(applyComponentConversion(db, conversion)).rejects.toBeInstanceOf(InUseError);

    await restoreProgram(db, undo);
    expect(await db.programs.get(source.id)).toEqual(source);
    expect(await db.templates.bulkGet([max.id, max5.id, unused.id])).toEqual([max, max5, unused]);
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
