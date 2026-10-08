import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { sessionLog, setLog } from '../test/builders';
import { StreeterDB } from './db';
import { deleteSession, deleteTest, saveTest } from './objectiveStore';

const databases: StreeterDB[] = [];
function freshDb(): StreeterDB {
  const db = new StreeterDB(`test-${Math.random()}`);
  databases.push(db);
  return db;
}

afterEach(async () => {
  for (const db of databases.splice(0)) await db.delete();
});

describe('objectiveStore', () => {
  it('ajoute, corrige et supprime des tests, triés par date', async () => {
    const db = freshDb();
    await db.objectives.put({ id: 'o', name: 'Planche hold', criterion: '', target: 10, unit: 'seconds', exerciseId: null, order: 0, tests: [] });
    await saveTest(db, 'o', { id: 't2', date: '2026-11-02', value: 6, note: '' });
    await saveTest(db, 'o', { id: 't1', date: '2026-10-05', value: 4, note: '' });
    expect((await db.objectives.get('o'))?.tests.map((t) => t.id)).toEqual(['t1', 't2']);
    await saveTest(db, 'o', { id: 't2', date: '2026-11-02', value: 7, note: 'corrigé' });
    expect((await db.objectives.get('o'))?.tests.find((t) => t.id === 't2')?.value).toBe(7);
    await deleteTest(db, 'o', 't1');
    expect((await db.objectives.get('o'))?.tests.map((t) => t.id)).toEqual(['t2']);
  });

  it('supprime une séance et ses séries', async () => {
    const db = freshDb();
    const session = sessionLog('2026-10-07');
    await db.sessions.put(session);
    await db.sets.bulkPut([setLog({ sessionId: session.id, exerciseId: 'x' }), setLog({ sessionId: 'autre', exerciseId: 'x' })]);
    await deleteSession(db, session.id);
    expect(await db.sessions.count()).toBe(0);
    expect(await db.sets.count()).toBe(1);
  });
});
