import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { SCHEMA_V1, StreeterDB } from './db';

const names: string[] = [];

afterEach(async () => {
  for (const name of names.splice(0)) await Dexie.delete(name);
});

describe('migrations du schéma', () => {
  it('version 2 : les séries existantes deviennent des séries normales, sans perte', async () => {
    const name = `migration-${Math.random()}`;
    names.push(name);
    // Base telle que l'écrivait la version 1 de l'appli.
    const v1 = new Dexie(name);
    v1.version(1).stores(SCHEMA_V1);
    const oldSet = {
      id: 's1',
      sessionId: 'ses',
      itemId: 'it',
      blockTypeId: 'skill',
      elementId: 'planche',
      exerciseId: 'hold',
      setIndex: 1,
      value: 12,
      bandId: null,
      rpe: 8,
      quality: 'clean',
      note: 'propre',
      createdAt: 1,
    };
    await v1.table('sets').bulkAdd([oldSet, { ...oldSet, id: 's2', setIndex: 2, value: 10, createdAt: 2 }]);
    await v1.table('sessions').add({ id: 'ses', date: '2026-10-16', status: 'done' });
    v1.close();

    const db = new StreeterDB(name);
    expect(await db.sets.orderBy('createdAt').toArray()).toEqual([
      { ...oldSet, kind: 'normal' },
      { ...oldSet, id: 's2', setIndex: 2, value: 10, createdAt: 2, kind: 'normal' },
    ]);
    expect(db.verno).toBe(9);
    expect(await db.sets.where('sessionId').equals('ses').count()).toBe(2);
    expect(await db.sessions.get('ses')).toMatchObject({ date: '2026-10-16', status: 'done' });
    db.close();
  });

  it('version 3 : modèles non archivés (copies figées comprises), exercices sans temps par série propre, sans perte', async () => {
    const name = `migration-${Math.random()}`;
    names.push(name);
    // Base telle que l'écrivait la version 2 de l'appli (même schéma que la 1, `kind` sur les séries).
    const v2 = new Dexie(name);
    v2.version(1).stores(SCHEMA_V1);
    v2.version(2).stores({});
    const oldTemplate = { id: 'tpl', name: 'Max', sessionTypeId: 'max', moment: 'evening', optional: false, notes: '', items: [{ id: 'it', setsMin: 4, setsMax: 5 }] };
    const oldExercise = { id: 'hold', name: 'Planche Hold', category: 'Planche skill', elementId: 'planche', measure: 'seconds', quick: false, active: true, notes: '', aliases: [], order: 0 };
    await v2.table('templates').add(oldTemplate);
    await v2.table('exercises').add(oldExercise);
    await v2.table('sessions').bulkAdd([
      { id: 'ses', date: '2026-10-16', status: 'done', templateSnapshot: oldTemplate },
      { id: 'xlsx', date: '2026-10-07', status: 'done', templateSnapshot: null },
    ]);
    await v2.table('sets').add({ id: 's1', sessionId: 'ses', exerciseId: 'hold', value: 12, kind: 'warmup', createdAt: 1 });
    v2.close();

    const db = new StreeterDB(name);
    expect(db.verno).toBe(9);
    expect(await db.templates.get('tpl')).toEqual({ ...oldTemplate, archived: false, sharedBlocks: {} });
    expect(await db.exercises.get('hold')).toEqual({ ...oldExercise, workSecPerSet: null, equipment: ['parallettes'] });
    expect((await db.sessions.get('ses'))?.templateSnapshot).toEqual({ ...oldTemplate, archived: false, sharedBlocks: {} });
    expect((await db.sessions.get('xlsx'))?.templateSnapshot).toBeNull();
    expect(await db.sets.get('s1')).toMatchObject({ value: 12, kind: 'warmup' });
    db.close();
  });

  it('version 4 : aucune séance existante n’est une séance express, sans perte', async () => {
    const name = `migration-${Math.random()}`;
    names.push(name);
    // Base telle que l'écrivait la version 3 de l'appli, avec une séance en cours.
    const v3 = new Dexie(name);
    v3.version(1).stores(SCHEMA_V1);
    v3.version(2).stores({});
    v3.version(3).stores({});
    const running = { id: 'run', date: '2026-10-17', moment: 'evening', status: 'in_progress', templateId: 'tpl', resume: { activeItemId: 'it', rest: null } };
    await v3.table('sessions').bulkAdd([running, { id: 'xlsx', date: '2026-10-07', status: 'done', source: 'xlsx' }]);
    await v3.table('sets').add({ id: 's1', sessionId: 'run', exerciseId: 'hold', value: 8, kind: 'normal', createdAt: 1 });
    v3.close();

    const db = new StreeterDB(name);
    expect(db.verno).toBe(9);
    expect(await db.sessions.get('run')).toEqual({ ...running, expressMinutes: null });
    expect(await db.sessions.get('xlsx')).toMatchObject({ source: 'xlsx', expressMinutes: null });
    expect(await db.sessions.where('status').equals('in_progress').count()).toBe(1);
    expect(await db.sets.get('s1')).toMatchObject({ sessionId: 'run', value: 8 });
    db.close();
  });
  it('version 5 : un premier programme reprend cycle, volume, matins et semaine type ; modèles et objectifs lui sont rattachés', async () => {
    const name = `migration-${Math.random()}`;
    names.push(name);
    // Base telle que l'écrivait la version 4 de l'appli.
    const v4 = new Dexie(name);
    v4.version(1).stores(SCHEMA_V1);
    v4.version(2).stores({});
    v4.version(3).stores({});
    v4.version(4).stores({});
    const weekPlan = { 1: { morning: null, evening: 'tpl' }, 2: { morning: null, evening: null }, 3: { morning: null, evening: null }, 4: { morning: null, evening: null }, 5: { morning: null, evening: null }, 6: { morning: null, evening: null }, 7: { morning: null, evening: null } };
    const legacy = {
      id: 'settings',
      cycleStartDate: '2026-10-05',
      cycleLengthWeeks: 4,
      deloadWeek: 4,
      deloadReductionPct: 40,
      hideMorningsInDeload: true,
      volumeMin: 4,
      volumeMax: 6,
      morningMaxMinutes: 30,
      avgWorkSecPerSet: 35,
      freeRestSec: 20,
      lastBackupAt: 123,
      weekPlan,
    };
    const oldTemplate = { id: 'tpl', name: 'Max', sessionTypeId: 'max', moment: 'evening', optional: false, notes: '', items: [], archived: false };
    await v4.table('settings').add(legacy);
    await v4.table('templates').add(oldTemplate);
    await v4.table('objectives').bulkAdd([{ id: 'o1', name: 'Planche hold' }, { id: 'o2', name: 'P/N' }]);
    await v4.table('sessions').bulkAdd([
      { id: 'ses', date: '2026-10-16', status: 'done', templateSnapshot: oldTemplate, expressMinutes: null },
      { id: 'xlsx', date: '2026-10-07', status: 'done', templateSnapshot: null, expressMinutes: null },
    ]);
    await v4.table('sets').add({ id: 's1', sessionId: 'ses', exerciseId: 'hold', value: 12, kind: 'normal', createdAt: 1 });
    v4.close();

    const db = new StreeterDB(name);
    expect(db.verno).toBe(9);
    const programs = await db.programs.toArray();
    expect(programs).toHaveLength(1);
    const [program] = programs;
    expect(program).toMatchObject({
      name: 'Octobre 2026',
      startWeek: 1,
      notes: '',
      cycleLengthWeeks: 4,
      deloadWeek: 4,
      deloadReductionPct: 40,
      hideMorningsInDeload: true,
      volumeMin: 4,
      volumeMax: 6,
      morningMaxMinutes: 30,
      weekPlan,
      objectiveIds: ['o1', 'o2'],
    });
    expect(await db.settings.get('settings')).toEqual({ id: 'settings', cycleStartDate: '2026-10-05', avgWorkSecPerSet: 35, freeRestSec: 20, lastBackupAt: 123 });
    expect(await db.templates.get('tpl')).toEqual({ ...oldTemplate, programId: program.id, sharedBlocks: {} });
    expect(await db.templates.where('programId').equals(program.id).count()).toBe(1);
    expect((await db.sessions.get('ses'))?.templateSnapshot).toEqual({ ...oldTemplate, programId: program.id, sharedBlocks: {} });
    expect((await db.sessions.get('xlsx'))?.templateSnapshot).toBeNull();
    expect(await db.sets.get('s1')).toMatchObject({ sessionId: 'ses', value: 12 });
    db.close();
  });

  it('version 6 : les programmes restent en semaine type, sans volume propre, sans perte', async () => {
    const name = `migration-${Math.random()}`;
    names.push(name);
    const v5 = new Dexie(name);
    v5.version(1).stores(SCHEMA_V1);
    v5.version(5).stores({ programs: 'id, startWeek', templates: 'id, name, programId' });
    await v5.open();
    const program = { id: 'p1', name: 'Octobre 2026', startWeek: 1, weekPlan: { 1: { morning: null, evening: 'tpl' } }, volumeMin: 4, volumeMax: 6, objectiveIds: ['o1'] };
    await v5.table('programs').add(program);
    v5.close();
    const db = new StreeterDB(name);
    expect(db.verno).toBe(9);
    expect(await db.programs.get('p1')).toEqual({ ...program, schedule: 'week', startDate: null, componentVolumes: [], components: [], componentBlockTypeId: null, componentAcceptance: {} });
    db.close();
  });

  it('version 7 : les blocs identiques d’un programme deviennent communs, sans perte', async () => {
    const name = `migration-${Math.random()}`;
    names.push(name);
    // Base telle que l'écrivait la version 6 de l'appli : trois séances du soir recopient le même échauffement.
    const v6 = new Dexie(name);
    v6.version(1).stores(SCHEMA_V1);
    v6.version(5).stores({ programs: 'id, startWeek', templates: 'id, name, programId' });
    v6.version(6).stores({});
    await v6.open();
    const line = (id: string, blockTypeId: string, elementId: string, setsMin = 1) => ({
      id,
      blockTypeId,
      elementId,
      candidateExerciseIds: ['cars'],
      candidatesText: 'CARs',
      setsMin,
      setsMax: 2,
      targetText: '8-10 reps',
      targets: [{ unit: 'reps', min: 8, max: 10 }],
      intensityText: 'RPE ≤ 5',
      intensity: { kind: 'rpe', min: null, max: 5 },
      restText: 'Libre',
      restMinSec: null,
      restMaxSec: null,
      superset: false,
      optional: false,
      notes: '',
    });
    const base = { sessionTypeId: 'type', moment: 'evening', optional: false, notes: '', archived: false, programId: 'nov' };
    const seanceType = { ...base, id: 'a', name: 'Séance type', items: [line('a1', 'echauf', 'connexion'), line('a2', 'principal', 'planche', 4)] };
    const combo = { ...base, id: 'b', name: 'Combo libre', items: [line('b1', 'echauf', 'connexion'), line('b2', 'principal', 'planche', 0)] };
    const archived = { ...base, id: 'c', name: 'Ancienne', archived: true, items: [line('c1', 'echauf', 'connexion')] };
    const october = { ...base, id: 'd', name: 'Max', programId: 'oct', items: [line('d1', 'echauf', 'connexion')] };
    await v6.table('templates').bulkAdd([seanceType, combo, archived, october]);
    await v6.table('sessions').add({ id: 'ses', date: '2026-10-31', status: 'done', templateSnapshot: combo });
    v6.close();

    const db = new StreeterDB(name);
    expect(db.verno).toBe(9);
    const [a, b, c, d] = await db.templates.bulkGet(['a', 'b', 'c', 'd']);
    expect(a!.sharedBlocks.echauf).toBeDefined();
    expect(b!.sharedBlocks).toEqual({ echauf: a!.sharedBlocks.echauf });
    expect(a!.sharedBlocks.principal).toBeUndefined();
    // Le bloc commun prend les lignes du premier modèle ; le reste ne bouge pas.
    expect(b!.items).toEqual([line('a1', 'echauf', 'connexion'), line('b2', 'principal', 'planche', 0)]);
    expect(a!.items).toEqual(seanceType.items);
    expect(c).toEqual({ ...archived, sharedBlocks: {} });
    expect(d).toEqual({ ...october, sharedBlocks: {} });
    expect((await db.sessions.get('ses'))?.templateSnapshot).toEqual({ ...combo, sharedBlocks: {} });
    db.close();
  });

  it('version 8 : les programmes gardent leurs composantes écrites, sans perte', async () => {
    const name = `migration-${Math.random()}`;
    names.push(name);
    const v7 = new Dexie(name);
    v7.version(1).stores(SCHEMA_V1);
    v7.version(5).stores({ programs: 'id, startWeek', templates: 'id, name, programId' });
    v7.version(7).stores({});
    await v7.open();
    const program = { id: 'nov', name: 'Novembre 2026', startWeek: 5, weekPlan: {}, volumeMin: 4, volumeMax: 6, schedule: 'sequence', startDate: '2026-10-29', componentVolumes: [{ elementId: 'gd', work: 'endurance', min: 8, max: 10 }] };
    const written = { id: 'st', name: 'Séance type', programId: 'nov', items: [{ id: 'gd1', blockTypeId: 'renfo', elementId: 'gd', setsMin: 2, setsMax: 2 }], sharedBlocks: {} };
    await v7.table('programs').add(program);
    await v7.table('templates').add(written);
    v7.close();
    const db = new StreeterDB(name);
    expect(db.verno).toBe(9);
    expect(await db.programs.get('nov')).toEqual({ ...program, components: [], componentBlockTypeId: null, componentAcceptance: {} });
    expect(await db.templates.get('st')).toEqual(written);
    db.close();
  });

  it('version 9 : déduit le matériel des exercices existants et ajoute la Victorienne au sol sur Touch FL, sans perte', async () => {
    const name = `migration-${Math.random()}`;
    names.push(name);
    const v8 = new Dexie(name);
    v8.version(1).stores(SCHEMA_V1);
    v8.version(5).stores({ programs: 'id, startWeek', templates: 'id, name, programId' });
    v8.version(8).stores({});
    await v8.open();
    await v8.table('elements').bulkAdd([
      { id: 'pl', name: 'Planche', kind: 'skill', order: 0 },
      { id: 'fl', name: 'Touch FL', kind: 'skill', order: 1 },
    ]);
    const exBase = { category: 'Planche skill', elementId: 'pl', measure: 'seconds', quick: false, active: true, notes: '', aliases: [], workSecPerSet: null };
    await v8.table('exercises').bulkAdd([
      { ...exBase, id: 'full', name: 'Planche Hold', order: 0 },
      { ...exBase, id: 'strad', name: 'Straddle planche hold', order: 1 },
      { ...exBase, id: 'fl1', name: 'Touch FL hold full', category: 'Touch FL skill', elementId: 'fl', order: 2 },
    ]);
    v8.close();

    const db = new StreeterDB(name);
    expect(db.verno).toBe(9);
    expect((await db.exercises.get('full'))?.equipment).toEqual(['parallettes']);
    expect((await db.exercises.get('strad'))?.equipment).toEqual(['floor', 'parallettes']);
    expect((await db.exercises.get('fl1'))?.equipment).toEqual(['bar']);
    const victorians = (await db.exercises.toArray())
      .filter((e) => e.name.startsWith('Victorienne au sol'))
      .sort((a, b) => a.order - b.order);
    expect(victorians.map((e) => [e.name, e.measure, e.elementId, e.equipment, e.order])).toEqual([
      ['Victorienne au sol hold', 'seconds', 'fl', ['floor'], 3],
      ['Victorienne au sol PU', 'reps', 'fl', ['floor'], 4],
    ]);
    db.close();
  });

    it('version 5 : une base vide reste vide (pas de programme sans réglages)', async () => {
    const name = `migration-${Math.random()}`;
    names.push(name);
    const v4 = new Dexie(name);
    v4.version(1).stores(SCHEMA_V1);
    v4.version(4).stores({});
    await v4.open();
    v4.close();
    const db = new StreeterDB(name);
    expect(await db.programs.count()).toBe(0);
    expect(await db.settings.count()).toBe(0);
    db.close();
  });
});
