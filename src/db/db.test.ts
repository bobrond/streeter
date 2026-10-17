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
    expect(db.verno).toBe(3);
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
    expect(db.verno).toBe(3);
    expect(await db.templates.get('tpl')).toEqual({ ...oldTemplate, archived: false });
    expect(await db.exercises.get('hold')).toEqual({ ...oldExercise, workSecPerSet: null });
    expect((await db.sessions.get('ses'))?.templateSnapshot).toEqual({ ...oldTemplate, archived: false });
    expect((await db.sessions.get('xlsx'))?.templateSnapshot).toBeNull();
    expect(await db.sets.get('s1')).toMatchObject({ value: 12, kind: 'warmup' });
    db.close();
  });
});
