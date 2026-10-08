// Lecture de toute la base pour la sauvegarde JSON.
import { BACKUP_APP, BACKUP_FORMAT_VERSION, BACKUP_TABLES, type Backup, type BackupTable } from '../io/json/backup';
import type { StreeterDB } from './db';

export async function readBackup(db: StreeterDB, now: number): Promise<Backup> {
  return db.transaction('r', db.tables, async () => {
    const entries = await Promise.all(BACKUP_TABLES.map(async (name) => [name, await db.table(name).toArray()] as const));
    return {
      app: BACKUP_APP,
      formatVersion: BACKUP_FORMAT_VERSION,
      dbVersion: db.verno,
      exportedAt: now,
      tables: Object.fromEntries(entries) as Record<BackupTable, unknown[]>,
    };
  });
}

/** Note la date de la dernière sauvegarde (rappel au-delà de 7 jours). */
export async function markBackupDone(db: StreeterDB, at: number): Promise<void> {
  await db.settings.update('settings', { lastBackupAt: at });
}

/** Remplace toutes les données par celles d'une sauvegarde, dans une seule transaction (tout ou rien). */
export async function restoreBackup(db: StreeterDB, backup: Backup): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const name of BACKUP_TABLES) {
      const table = db.table(name);
      await table.clear();
      await table.bulkPut(backup.tables[name]);
    }
  });
}
