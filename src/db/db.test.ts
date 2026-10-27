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
    expect(db.verno).toBe(5);
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
    expect(db.verno).toBe(5);
    expect(await db.templates.get('tpl')).toEqual({ ...oldTemplate, archived: false });
    expect(await db.exercises.get('hold')).toEqual({ ...oldExercise, workSecPerSet: null });
    expect((await db.sessions.get('ses'))?.templateSnapshot).toEqual({ ...oldTemplate, archived: false });
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
    expect(db.verno).toBe(5);
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
    expect(db.verno).toBe(5);
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
    expect(await db.templates.get('tpl')).toEqual({ ...oldTemplate, programId: program.id });
    expect(await db.templates.where('programId').equals(program.id).count()).toBe(1);
    expect((await db.sessions.get('ses'))?.templateSnapshot).toEqual({ ...oldTemplate, programId: program.id });
    expect((await db.sessions.get('xlsx'))?.templateSnapshot).toBeNull();
    expect(await db.sets.get('s1')).toMatchObject({ sessionId: 'ses', value: 12 });
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
