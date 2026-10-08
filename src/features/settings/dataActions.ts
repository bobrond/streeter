// Sauvegarde, restauration et exports : actions partagées par Aujourd'hui, Journal et Réglages.
import { markBackupDone, readBackup, restoreBackup } from '../../db/backupStore';
import { db } from '../../db/db';
import type { AppData } from '../../db/hooks';
import { localISODate } from '../../domain/cycle';
import { journalCsv, journalExportRows, journalXlsx } from '../../io/journal/exportJournal';
import { backupFileName, parseBackup, serializeBackup, type Backup } from '../../io/json/backup';
import { downloadFile, shareFile } from '../../lib/device';
import { showToast } from '../../ui/toastStore';

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function backupBlob(): Promise<{ name: string; blob: Blob; at: number }> {
  const at = Date.now();
  const backup = await readBackup(db, at);
  return { name: backupFileName(localISODate(new Date(at))), blob: new Blob([serializeBackup(backup)], { type: 'application/json' }), at };
}

/** Enregistre une sauvegarde complète dans les téléchargements. */
export async function downloadBackup(): Promise<void> {
  try {
    const { name, blob, at } = await backupBlob();
    downloadFile(name, blob);
    await markBackupDone(db, at);
    showToast('Sauvegarde enregistrée dans les téléchargements.');
  } catch (e) {
    showToast(`Sauvegarde impossible : ${errorText(e)}`, { tone: 'error' });
  }
}

/** Envoie la sauvegarde par le menu de partage (Drive, e-mail…). */
export async function shareBackup(): Promise<void> {
  try {
    const { name, blob, at } = await backupBlob();
    if (await shareFile(name, blob, 'Sauvegarde Streeter')) {
      await markBackupDone(db, at);
      showToast('Sauvegarde envoyée.');
    }
  } catch (e) {
    showToast(`Sauvegarde impossible : ${errorText(e)}`, { tone: 'error' });
  }
}

export async function readBackupFile(file: File): Promise<Backup> {
  return parseBackup(await file.text(), db.verno);
}

export async function restoreFromBackup(backup: Backup): Promise<void> {
  try {
    await restoreBackup(db, backup);
    showToast('Sauvegarde restaurée.');
  } catch (e) {
    showToast(`Restauration impossible : ${errorText(e)}`, { tone: 'error' });
  }
}

/** Export du journal aux colonnes de l'onglet Journal du tableur. */
export async function exportJournal(data: AppData, format: 'xlsx' | 'csv'): Promise<void> {
  try {
    const rows = journalExportRows({
      sessions: data.sessions,
      sets: data.sets,
      exercises: new Map(data.exercises.map((e) => [e.id, e])),
      blocks: new Map(data.blockTypes.map((b) => [b.id, b])),
      bands: new Map(data.bands.map((b) => [b.id, b])),
    });
    const name = `streeter-journal-${localISODate(new Date())}.${format}`;
    if (format === 'csv') {
      downloadFile(name, new Blob([journalCsv(rows)], { type: 'text/csv;charset=utf-8' }));
    } else {
      const XLSX = await import('xlsx');
      downloadFile(name, new Blob([journalXlsx(XLSX, rows)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    }
    showToast(`Journal exporté : ${rows.length} ligne${rows.length > 1 ? 's' : ''}.`);
  } catch (e) {
    showToast(`Export impossible : ${errorText(e)}`, { tone: 'error' });
  }
}
