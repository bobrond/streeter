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
