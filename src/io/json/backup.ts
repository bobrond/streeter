// Sauvegarde JSON complète : toutes les tables, avec un numéro de version de format.
export const BACKUP_APP = 'streeter';
/** À incrémenter à chaque changement du format, avec une conversion à l'import. */
export const BACKUP_FORMAT_VERSION = 1;

export const BACKUP_TABLES = [
  'settings',
  'elements',
  'blockTypes',
  'sessionTypes',
  'exercises',
  'bands',
  'templates',
  'sessions',
  'sets',
  'objectives',
  'meta',
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];

export interface Backup {
  app: typeof BACKUP_APP;
  formatVersion: number;
  /** Version du schéma de la base au moment de l'export. */
  dbVersion: number;
  exportedAt: number;
  tables: Record<BackupTable, unknown[]>;
}

export function backupFileName(date: string): string {
  return `streeter-sauvegarde-${date}.json`;
}

export function serializeBackup(backup: Backup): string {
  return JSON.stringify(backup);
}
