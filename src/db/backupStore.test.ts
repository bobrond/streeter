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
    expect(backupSummary(backup)).toMatchObject({ exportedAt: 123, programs: 1, sessions: 2, sets: 8, objectives: 1 });

    const target = freshDb();
    await target.exercises.put({ id: 'à-effacer', name: 'x', category: '', elementId: null, measure: 'reps', quick: false, active: true, notes: '', aliases: [], order: 0, workSecPerSet: null });
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

  it('convertit une sauvegarde du format 1 : les séries deviennent normales', async () => {
    const oldSet = { id: 's1', sessionId: 'ses', exerciseId: 'hold', value: 12, quality: 'clean', createdAt: 1 };
    const text = JSON.stringify({
      app: 'streeter',
      formatVersion: 1,
      dbVersion: 1,
      exportedAt: 0,
      tables: { settings: [{ id: 'settings', weekPlan: {} }], sets: [oldSet, { ...oldSet, id: 's2', kind: 'warmup' }] },
    });
    const backup = parseBackup(text, 2);
    expect(backup.formatVersion).toBe(6);
    expect(backup.tables.sets).toEqual([
      { ...oldSet, kind: 'normal' },
      { ...oldSet, id: 's2', kind: 'warmup' },
    ]);

    const target = freshDb();
    await restoreBackup(target, backup);
    expect(await target.sets.get('s1')).toMatchObject({ kind: 'normal', value: 12 });
  });

  it('convertit une sauvegarde du format 2 : modèles non archivés, exercices sans temps par série propre', async () => {
    const oldTemplate = { id: 'tpl', name: 'Max', sessionTypeId: 'max', moment: 'evening', optional: false, notes: '', items: [] };
    const oldExercise = { id: 'hold', name: 'Planche Hold', category: '', elementId: null, measure: 'seconds', quick: false, active: true, notes: '', aliases: [], order: 0 };
    const text = JSON.stringify({
      app: 'streeter',
      formatVersion: 2,
      dbVersion: 2,
      exportedAt: 0,
      tables: {
        settings: [{ id: 'settings', weekPlan: {} }],
        templates: [oldTemplate, { ...oldTemplate, id: 'old', archived: true }],
        exercises: [oldExercise, { ...oldExercise, id: 'slow', workSecPerSet: 60 }],
        sessions: [
          { id: 'ses', date: '2026-10-16', templateSnapshot: oldTemplate },
          { id: 'xlsx', date: '2026-10-07', templateSnapshot: null },
        ],
      },
    });
    const backup = parseBackup(text, 3, () => 'p1');
    expect(backup.formatVersion).toBe(6);
    expect(backup.tables.templates).toEqual([
      { ...oldTemplate, archived: false, programId: 'p1' },
      { ...oldTemplate, id: 'old', archived: true, programId: 'p1' },
    ]);
    expect(backup.tables.exercises).toEqual([
      { ...oldExercise, workSecPerSet: null },
      { ...oldExercise, id: 'slow', workSecPerSet: 60 },
    ]);
    expect(backup.tables.sessions).toEqual([
      { id: 'ses', date: '2026-10-16', templateSnapshot: { ...oldTemplate, archived: false, programId: 'p1' }, expressMinutes: null },
      { id: 'xlsx', date: '2026-10-07', templateSnapshot: null, expressMinutes: null },
    ]);

    const target = freshDb();
    await restoreBackup(target, backup);
    expect(await target.templates.get('tpl')).toMatchObject({ archived: false });
    expect(await target.exercises.get('slow')).toMatchObject({ workSecPerSet: 60 });
  });

  it('convertit une sauvegarde du format 3 : aucune séance express', async () => {
    const text = JSON.stringify({
      app: 'streeter',
      formatVersion: 3,
      dbVersion: 3,
      exportedAt: 0,
      tables: {
        settings: [{ id: 'settings', weekPlan: {} }],
        sessions: [
          { id: 'ses', date: '2026-10-16', status: 'done' },
          { id: 'new', date: '2026-10-17', status: 'done', expressMinutes: 30 },
        ],
      },
    });
    const backup = parseBackup(text, 4);
    expect(backup.formatVersion).toBe(6);
    expect(backup.tables.sessions).toEqual([
      { id: 'ses', date: '2026-10-16', status: 'done', expressMinutes: null },
      { id: 'new', date: '2026-10-17', status: 'done', expressMinutes: 30 },
    ]);

    const target = freshDb();
    await restoreBackup(target, backup);
    expect(await target.sessions.get('ses')).toMatchObject({ expressMinutes: null });
  });

  it('convertit une sauvegarde du format 4 : un premier programme reprend cycle, volume, matins et semaine type', async () => {
    const weekPlan = { 1: { morning: null, evening: 'tpl' } };
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
      avgWorkSecPerSet: 30,
      freeRestSec: 30,
      lastBackupAt: 7,
      weekPlan,
    };
    const oldTemplate = { id: 'tpl', name: 'Max', sessionTypeId: 'max', moment: 'evening', optional: false, notes: '', items: [], archived: false };
    const text = JSON.stringify({
      app: 'streeter',
      formatVersion: 4,
      dbVersion: 4,
      exportedAt: 99,
      tables: {
        settings: [legacy],
        templates: [oldTemplate],
        objectives: [{ id: 'o1', name: 'P/N' }],
        sessions: [{ id: 'ses', date: '2026-10-16', status: 'done', templateSnapshot: oldTemplate, expressMinutes: null }],
      },
    });
    const backup = parseBackup(text, 5, () => 'p1');
    expect(backup.formatVersion).toBe(6);
    expect(backup.tables.settings).toEqual([{ id: 'settings', cycleStartDate: '2026-10-05', avgWorkSecPerSet: 30, freeRestSec: 30, lastBackupAt: 7 }]);
    expect(backup.tables.programs).toEqual([
      {
        id: 'p1',
        name: 'Octobre 2026',
        startWeek: 1,
        notes: '',
        objectiveIds: ['o1'],
        createdAt: 99,
        cycleLengthWeeks: 4,
        deloadWeek: 4,
        deloadReductionPct: 40,
        hideMorningsInDeload: true,
        volumeMin: 4,
        volumeMax: 6,
        morningMaxMinutes: 30,
        weekPlan,
        schedule: 'week',
        startDate: null,
        componentVolumes: [],
      },
    ]);
    expect(backup.tables.templates).toEqual([{ ...oldTemplate, programId: 'p1' }]);
    expect(backup.tables.sessions).toEqual([{ id: 'ses', date: '2026-10-16', status: 'done', templateSnapshot: { ...oldTemplate, programId: 'p1' }, expressMinutes: null }]);

    const target = freshDb();
    await restoreBackup(target, backup);
    expect(await target.programs.get('p1')).toMatchObject({ startWeek: 1, weekPlan });
  });

  it('convertit une sauvegarde du format 5 : programmes en semaine type, sans volume propre', () => {
    const program = { id: 'p1', name: 'Octobre 2026', startWeek: 1, weekPlan: {}, volumeMin: 4, volumeMax: 6 };
    const text = JSON.stringify({ app: 'streeter', formatVersion: 5, dbVersion: 5, exportedAt: 0, tables: { settings: [{ id: 'settings' }], programs: [program] } });
    const backup = parseBackup(text, 6);
    expect(backup.formatVersion).toBe(6);
    expect(backup.tables.programs).toEqual([{ ...program, schedule: 'week', startDate: null, componentVolumes: [] }]);
  });

  it('refuse une sauvegarde du format 5 sans programme', () => {
    const text = JSON.stringify({ app: 'streeter', formatVersion: 5, dbVersion: 5, exportedAt: 0, tables: { settings: [{ id: 'settings' }], programs: [] } });
    expect(() => parseBackup(text, 5)).toThrow('programme manquant');
  });
});
