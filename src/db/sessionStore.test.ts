import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { emptyResume } from '../domain/session';
import { sessionLog, setLog, settings } from '../test/builders';
import { StreeterDB } from './db';
import {
  SessionInProgressError,
  abandonSession,
  deleteSet,
  findActiveSession,
  finishSession,
  logSet,
  saveResume,
  shiftSequence,
  startSession,
  updateSet,
} from './sessionStore';

const databases: StreeterDB[] = [];
function freshDb(): StreeterDB {
  const db = new StreeterDB(`test-${Math.random()}`);
  databases.push(db);
  return db;
}

afterEach(async () => {
  for (const db of databases.splice(0)) await db.delete();
});

const inProgress = () => sessionLog('2026-10-08', { status: 'in_progress', startedAt: 1, resume: emptyResume() });

describe('séance en cours', () => {
  it('refuse une deuxième séance en cours', async () => {
    const db = freshDb();
    const first = inProgress();
    await startSession(db, first);
    await expect(startSession(db, inProgress())).rejects.toBeInstanceOf(SessionInProgressError);
    expect((await findActiveSession(db))?.id).toBe(first.id);
  });

  it('enregistre la série et l’état de reprise ensemble, et numérote les séries par bloc et exercice', async () => {
    const db = freshDb();
    const session = inProgress();
    await startSession(db, session);
    const resume = { ...emptyResume(), activeItemId: 'item-b' };
    await logSet(db, setLog({ sessionId: session.id, exerciseId: 'hold', blockTypeId: 'skill', setIndex: 0 }), resume);
    await logSet(db, setLog({ sessionId: session.id, exerciseId: 'pn', blockTypeId: 'skill', setIndex: 0 }), resume);
    await logSet(db, setLog({ sessionId: session.id, exerciseId: 'hold', blockTypeId: 'skill', setIndex: 0 }), resume);
    await logSet(db, setLog({ sessionId: session.id, exerciseId: 'hold', blockTypeId: 'assisted', setIndex: 0 }), resume);
    const sets = await db.sets.where('sessionId').equals(session.id).sortBy('createdAt');
    expect(sets.map((s) => s.setIndex)).toEqual([1, 1, 2, 1]);
    expect((await db.sessions.get(session.id))?.resume?.activeItemId).toBe('item-b');
  });

  it('renumérote après une suppression ou un changement d’exercice', async () => {
    const db = freshDb();
    const session = inProgress();
    await startSession(db, session);
    const sets = [1, 2, 3].map(() => setLog({ sessionId: session.id, exerciseId: 'hold', blockTypeId: 'skill' }));
    for (const set of sets) await logSet(db, set, emptyResume());
    await deleteSet(db, sets[0].id);
    expect((await db.sets.where('sessionId').equals(session.id).sortBy('createdAt')).map((s) => s.setIndex)).toEqual([1, 2]);
    await updateSet(db, sets[1].id, { exerciseId: 'pn', value: 4 });
    const after = await db.sets.where('sessionId').equals(session.id).sortBy('createdAt');
    expect(after.map((s) => [s.exerciseId, s.setIndex, s.value])).toEqual([
      ['pn', 1, 4],
      ['hold', 1, null],
    ]);
  });

  it('termine la séance et efface l’état de reprise', async () => {
    const db = freshDb();
    const session = inProgress();
    await startSession(db, session);
    await saveResume(db, session.id, { ...emptyResume(), closedItems: ['x'] });
    expect((await db.sessions.get(session.id))?.resume?.closedItems).toEqual(['x']);
    await finishSession(db, session.id, { note: 'bonne séance', now: 99 });
    expect(await db.sessions.get(session.id)).toMatchObject({ status: 'done', endedAt: 99, note: 'bonne séance', resume: null });
    expect(await findActiveSession(db)).toBeUndefined();
  });

  it('supprime une séance abandonnée sans série, garde les séries sinon', async () => {
    const db = freshDb();
    const empty = inProgress();
    await startSession(db, empty);
    expect(await abandonSession(db, empty.id, 5)).toBe('deleted');
    expect(await db.sessions.get(empty.id)).toBeUndefined();

    const started = inProgress();
    await startSession(db, started);
    await logSet(db, setLog({ sessionId: started.id, exerciseId: 'hold' }), emptyResume());
    expect(await abandonSession(db, started.id, 5)).toBe('abandoned');
    expect(await db.sessions.get(started.id)).toMatchObject({ status: 'abandoned', resume: null });
    expect(await db.sets.count()).toBe(1);
  });
});

describe('shiftSequence', () => {
  it('décale la date de début et renvoie l’ancienne', async () => {
    const db = freshDb();
    await db.settings.put(settings({ cycleStartDate: '2026-10-05' }));
    expect(await shiftSequence(db, 1)).toBe('2026-10-05');
    expect((await db.settings.get('settings'))?.cycleStartDate).toBe('2026-10-04');
    await shiftSequence(db, -1);
    expect((await db.settings.get('settings'))?.cycleStartDate).toBe('2026-10-05');
  });
});
