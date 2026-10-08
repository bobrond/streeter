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

export class BackupError extends Error {}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/**
 * Conversion d'une sauvegarde d'un format plus ancien vers le format courant.
 * À compléter à chaque nouvelle version du format (une étape par version).
 */
function migrate(backup: Backup): Backup {
  return backup;
}

/** Lit et vérifie un fichier de sauvegarde ; lève une `BackupError` au message lisible sinon. */
export function parseBackup(text: string, currentDbVersion: number): Backup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError('Ce fichier n’est pas une sauvegarde Streeter (JSON illisible).');
  }
  if (!isObject(raw) || raw.app !== BACKUP_APP || typeof raw.formatVersion !== 'number' || !isObject(raw.tables)) {
    throw new BackupError('Ce fichier n’est pas une sauvegarde Streeter.');
  }
  if (raw.formatVersion > BACKUP_FORMAT_VERSION || (typeof raw.dbVersion === 'number' && raw.dbVersion > currentDbVersion)) {
    throw new BackupError('Cette sauvegarde vient d’une version plus récente de l’appli : mets l’appli à jour avant de la restaurer.');
  }
  const tables = {} as Record<BackupTable, unknown[]>;
  for (const name of BACKUP_TABLES) {
    const list = raw.tables[name] ?? [];
    if (!Array.isArray(list)) throw new BackupError(`Sauvegarde abîmée : la table « ${name} » est illisible.`);
    const key = name === 'meta' ? 'key' : 'id';
    if (!list.every((record) => isObject(record) && typeof record[key] === 'string')) {
      throw new BackupError(`Sauvegarde abîmée : un enregistrement de « ${name} » n’a pas d’identifiant.`);
    }
    tables[name] = list;
  }
  const settings = tables.settings[0];
  if (tables.settings.length !== 1 || !isObject(settings) || settings.id !== 'settings' || !isObject(settings.weekPlan)) {
    throw new BackupError('Sauvegarde abîmée : réglages manquants.');
  }
  return migrate({
    app: BACKUP_APP,
    formatVersion: raw.formatVersion,
    dbVersion: typeof raw.dbVersion === 'number' ? raw.dbVersion : currentDbVersion,
    exportedAt: typeof raw.exportedAt === 'number' ? raw.exportedAt : 0,
    tables,
  });
}

export interface BackupSummary {
  exportedAt: number;
  sessions: number;
  sets: number;
  exercises: number;
  templates: number;
  objectives: number;
}

export function backupSummary(backup: Backup): BackupSummary {
  return {
    exportedAt: backup.exportedAt,
    sessions: backup.tables.sessions.length,
    sets: backup.tables.sets.length,
    exercises: backup.tables.exercises.length,
    templates: backup.tables.templates.length,
    objectives: backup.tables.objectives.length,
  };
}

export const BACKUP_REMINDER_DAYS = 7;

/**
 * Rappel de sauvegarde : dernière sauvegarde de plus de 7 jours, ou aucune alors que des séances
 * ont déjà été faites dans l'appli (avant cela, il n'y a rien à perdre que le tableur n'ait déjà).
 */
export function isBackupDue(lastBackupAt: number | null, now: number, appSessionCount: number): boolean {
  if (lastBackupAt === null) return appSessionCount > 0;
  return now - lastBackupAt > BACKUP_REMINDER_DAYS * 86_400_000;
}

/** Jours entiers écoulés depuis la dernière sauvegarde. */
export function daysSince(at: number, now: number): number {
  return Math.floor((now - at) / 86_400_000);
}
