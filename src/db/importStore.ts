// Écriture d'un import de tableur dans la base, et lecture de ce qui existe déjà.
import { localISODate } from '../domain/cycle';
import { buildImport, type ExistingData, type ImportReport, type ImportResult } from '../io/xlsx/importWorkbook';
import { readWorkbook } from '../io/xlsx/readWorkbook';
import { newId } from '../lib/id';
import type { StreeterDB } from './db';

export interface LastImport {
  at: number;
  fileName: string;
  report: ImportReport;
}

export async function loadExisting(db: StreeterDB): Promise<ExistingData> {
  const [elements, blockTypes, sessionTypes, exercises, bands, templates, objectives, sessions, settings] = await Promise.all([
    db.elements.toArray(),
    db.blockTypes.toArray(),
    db.sessionTypes.toArray(),
    db.exercises.toArray(),
    db.bands.toArray(),
    db.templates.toArray(),
    db.objectives.toArray(),
    db.sessions.toArray(),
    db.settings.get('settings'),
  ]);
  return { elements, blockTypes, sessionTypes, exercises, bands, templates, objectives, sessions, settings: settings ?? null };
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
    await db.settings.put(result.settings);
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
  const existing = await loadExisting(db);
  const now = Date.now();
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
