import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { SAMPLE_SHEETS, workbook } from '../test/sampleWorkbook';
import { StreeterDB } from './db';
import { clearAll, importSpreadsheet, type LastImport } from './importStore';

const file = () => new File([workbook(SAMPLE_SHEETS)], 'programme.xlsx');
const databases: StreeterDB[] = [];
function freshDb(): StreeterDB {
  const db = new StreeterDB(`test-${Math.random()}`);
  databases.push(db);
  return db;
}

afterEach(async () => {
  for (const db of databases.splice(0)) await db.delete();
});

describe('importSpreadsheet', () => {
  it('écrit programme, catalogue, objectifs et journal dans la base', async () => {
    const db = freshDb();
    const report = await importSpreadsheet(db, file());
    expect(report.counts).toMatchObject({ templates: 2, sessions: 2, sets: 8, objectives: 1 });
    expect(await db.templates.count()).toBe(2);
    expect(await db.sessions.count()).toBe(2);
    expect(await db.sets.count()).toBe(8);
    expect(await db.objectives.count()).toBe(1);
    const settings = await db.settings.get('settings');
    expect(settings?.cycleStartDate).toBe('2026-10-05');
    const last = (await db.meta.get('lastImport'))?.value as LastImport;
    expect(last.fileName).toBe('programme.xlsx');
  });

  it('se ré-importe sans doublon, en remplaçant les séries des séances importées', async () => {
    const db = freshDb();
    await importSpreadsheet(db, file());
    const exerciseIds = (await db.exercises.toArray()).map((e) => e.id).sort();
    const sessionIds = (await db.sessions.toArray()).map((s) => s.id).sort();
    await importSpreadsheet(db, file());
    expect((await db.exercises.toArray()).map((e) => e.id).sort()).toEqual(exerciseIds);
    expect((await db.sessions.toArray()).map((s) => s.id).sort()).toEqual(sessionIds);
    expect(await db.sets.count()).toBe(8);
    expect(await db.templates.count()).toBe(2);
    expect((await db.objectives.toArray())[0].tests).toHaveLength(1);
  });

  it('garde la date de début réglée dans l’appli lors d’un ré-import', async () => {
    const db = freshDb();
    await importSpreadsheet(db, file());
    await db.settings.update('settings', { cycleStartDate: '2026-10-06' });
    await importSpreadsheet(db, file());
    expect((await db.settings.get('settings'))?.cycleStartDate).toBe('2026-10-06');
  });

  it('refuse un fichier sans onglet Programme', async () => {
    const db = freshDb();
    const other = new File([workbook({ Feuil1: [['a', 'b']] })], 'autre.xlsx');
    await expect(importSpreadsheet(db, other)).rejects.toThrow('Onglet « Programme » introuvable.');
    expect(await db.templates.count()).toBe(0);
  });
});

describe('clearAll', () => {
  it('vide toutes les tables', async () => {
    const db = freshDb();
    await importSpreadsheet(db, file());
    await clearAll(db);
    const counts = await Promise.all(db.tables.map((t) => t.count()));
    expect(counts.every((c) => c === 0)).toBe(true);
  });
});
