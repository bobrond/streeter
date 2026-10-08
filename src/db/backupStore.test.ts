import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { BACKUP_TABLES, BackupError, backupSummary, parseBackup, serializeBackup } from '../io/json/backup';
import { SAMPLE_SHEETS, workbook } from '../test/sampleWorkbook';
import { readBackup, restoreBackup } from './backupStore';
import { StreeterDB } from './db';
import { importSpreadsheet } from './importStore';

const databases: StreeterDB[] = [];
function freshDb(): StreeterDB {
  const db = new StreeterDB(`test-${Math.random()}`);
  databases.push(db);
  return db;
}

afterEach(async () => {
  for (const db of databases.splice(0)) await db.delete();
});

async function dump(db: StreeterDB) {
  return Object.fromEntries(await Promise.all(BACKUP_TABLES.map(async (name) => [name, await db.table(name).toArray()] as const)));
}

describe('sauvegarde JSON', () => {
  it('restaure exactement toutes les tables', async () => {
    const source = freshDb();
    await importSpreadsheet(source, new File([workbook(SAMPLE_SHEETS)], 'programme.xlsx'));
    const text = serializeBackup(await readBackup(source, 123));
    const backup = parseBackup(text, source.verno);
    expect(backupSummary(backup)).toMatchObject({ exportedAt: 123, sessions: 2, sets: 8, objectives: 1 });

    const target = freshDb();
    await target.exercises.put({ id: 'à-effacer', name: 'x', category: '', elementId: null, measure: 'reps', quick: false, active: true, notes: '', aliases: [], order: 0 });
    await restoreBackup(target, backup);
    expect(await dump(target)).toEqual(await dump(source));
  });

  it('refuse un fichier qui n’est pas une sauvegarde', () => {
    expect(() => parseBackup('pas du json', 1)).toThrow(BackupError);
    expect(() => parseBackup('{"app":"autre"}', 1)).toThrow('Ce fichier n’est pas une sauvegarde Streeter.');
  });

  it('refuse une sauvegarde d’une version plus récente ou abîmée', () => {
    const base = { app: 'streeter', formatVersion: 1, dbVersion: 1, exportedAt: 0 };
    const settings = [{ id: 'settings', weekPlan: {} }];
    expect(() => parseBackup(JSON.stringify({ ...base, formatVersion: 99, tables: { settings } }), 1)).toThrow('version plus récente');
    expect(() => parseBackup(JSON.stringify({ ...base, dbVersion: 5, tables: { settings } }), 1)).toThrow('version plus récente');
    expect(() => parseBackup(JSON.stringify({ ...base, tables: { settings, sets: [{ value: 3 }] } }), 1)).toThrow('identifiant');
    expect(() => parseBackup(JSON.stringify({ ...base, tables: { settings: [] } }), 1)).toThrow('réglages manquants');
    expect(parseBackup(JSON.stringify({ ...base, tables: { settings } }), 1).tables.sets).toEqual([]);
  });
});
