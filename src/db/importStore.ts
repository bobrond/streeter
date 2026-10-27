// Écriture d'un import de tableur dans la base, et lecture de ce qui existe déjà.
import { localISODate } from '../domain/cycle';
import { APP_SETTINGS_KEYS, PROGRAM_CONFIG_KEYS, programNameFor, settingsAtDate } from '../domain/programs';
import type { AppSettings, Program } from '../domain/types';
import { buildImport, type ExistingData, type ImportReport, type ImportResult } from '../io/xlsx/importWorkbook';
import { readWorkbook } from '../io/xlsx/readWorkbook';
import { newId } from '../lib/id';
import type { StreeterDB } from './db';

export interface LastImport {
  at: number;
  fileName: string;
  report: ImportReport;
}

/** Données existantes ; l'import va dans le programme en vigueur `today`. */
export async function loadExisting(db: StreeterDB, today: string): Promise<ExistingData> {
  const [elements, blockTypes, sessionTypes, exercises, bands, templates, objectives, sessions, app, programs] = await Promise.all([
    db.elements.toArray(),
    db.blockTypes.toArray(),
    db.sessionTypes.toArray(),
    db.exercises.toArray(),
    db.bands.toArray(),
    db.templates.toArray(),
    db.objectives.toArray(),
    db.sessions.toArray(),
    db.settings.get('settings'),
    db.programs.toArray(),
  ]);
  const settings = app ? settingsAtDate(app, programs, today) : null;
  return { elements, blockTypes, sessionTypes, exercises, bands, templates, objectives, sessions, settings };
}

/** Écrit tout l'import dans une seule transaction : en cas d'erreur, rien n'est modifié. */
export async function saveImport(db: StreeterDB, result: ImportResult, source: { fileName: string; at: number }): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await db.elements.bulkPut(result.elements);
    await db.blockTypes.bulkPut(result.blockTypes);
    await db.sessionTypes.bulkPut(result.sessionTypes);
    await db.exercises.bulkPut(result.exercises);
    await db.bands.bulkPut(result.bands);
    await db.templates.bulkPut(result.templates);
    const app = Object.fromEntries(APP_SETTINGS_KEYS.map((key) => [key, result.settings[key]])) as unknown as AppSettings;
    await db.settings.put(app);
    const config = Object.fromEntries(PROGRAM_CONFIG_KEYS.map((key) => [key, result.settings[key]]));
    const program = await db.programs.get(result.settings.programId);
    const followed = [...new Set([...(program?.objectiveIds ?? []), ...result.importedObjectiveIds])];
    const saved: Program = program
      ? { ...program, ...config, objectiveIds: followed }
      : {
          ...(config as unknown as Omit<Program, 'id' | 'name' | 'startWeek' | 'notes' | 'objectiveIds' | 'createdAt'>),
          id: result.settings.programId,
          name: programNameFor(app.cycleStartDate),
          startWeek: result.settings.programStartWeek,
          notes: '',
          objectiveIds: followed,
          createdAt: source.at,
        };
    await db.programs.put(saved);
    await db.objectives.bulkPut(result.objectives);
    if (result.replacedSessionIds.length > 0) {
      await db.sets.where('sessionId').anyOf(result.replacedSessionIds).delete();
    }
    await db.sessions.bulkPut(result.sessions);
    await db.sets.bulkPut(result.sets);
    const lastImport: LastImport = { at: source.at, fileName: source.fileName, report: result.report };
    await db.meta.put({ key: 'lastImport', value: lastImport });
  });
}

/** Import complet d'un fichier .xlsx choisi par l'utilisateur. SheetJS n'est chargé qu'ici. */
export async function importSpreadsheet(db: StreeterDB, file: File): Promise<ImportReport> {
  const [XLSX, buffer] = await Promise.all([import('xlsx'), file.arrayBuffer()]);
  const data = readWorkbook(XLSX, buffer);
  if (!data.programme) {
    throw new Error(data.errors.join('\n') || 'Onglet Programme introuvable : ce fichier ne ressemble pas au tableur.');
  }
  const now = Date.now();
  const existing = await loadExisting(db, localISODate(new Date(now)));
  const result = buildImport(data, existing, { newId, today: localISODate(new Date(now)) });
  await saveImport(db, result, { fileName: file.name, at: now });
  return result.report;
}

/** Efface toutes les données de l'appli. */
export async function clearAll(db: StreeterDB): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()));
  });
}
