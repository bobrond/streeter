// Sauvegarde JSON complète : toutes les tables, avec un numéro de version de format.
import { programFromLegacySettings } from '../../domain/programs';

export const BACKUP_APP = 'streeter';
/**
 * À incrémenter à chaque changement du format, avec une conversion à l'import.
 * 2 (17/10/2026) : type de série (`kind`) sur chaque série.
 * 3 (17/10/2026) : modèle archivé (`archived`, copies figées des séances comprises), temps par série d'un exercice.
 * 4 (17/10/2026) : séance express (`expressMinutes`) sur chaque séance.
 * 5 (27/10/2026) : programmes datés (table `programs`) ; cycle, volume, matins et semaine type passent des réglages
 * au programme ; `programId` sur chaque modèle et chaque copie figée.
 * 6 (28/10/2026) : déroulé du programme (`schedule`, `startDate`) et volume par type de travail (`componentVolumes`).
 */
export const BACKUP_FORMAT_VERSION = 6;

export const BACKUP_TABLES = [
  'settings',
  'programs',
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

/**
 * Nom de la sauvegarde envoyée par le menu de partage. Chrome, Android compris, ne partage qu'une liste fermée
 * de types de fichier, sans le JSON : la sauvegarde part en texte (.txt, text/plain), avec le même contenu.
 */
export function sharedBackupFileName(date: string): string {
  return `streeter-sauvegarde-${date}.txt`;
}

/** Fichiers proposés à la restauration : sauvegarde enregistrée (.json) ou envoyée (.txt). */
export const BACKUP_ACCEPT = '.json,.txt,application/json,text/plain';

export function serializeBackup(backup: Backup): string {
  return JSON.stringify(backup);
}

export class BackupError extends Error {}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/**
 * Conversion d'une sauvegarde d'un format plus ancien vers le format courant.
 * À compléter à chaque nouvelle version du format (une étape par version).
 */
function migrate(backup: Backup, newId: () => string): Backup {
  let current = backup;
  if (current.formatVersion < 2) {
    // Format 1 → 2 : les séries d'avant le type de série sont des séries normales.
    const sets = current.tables.sets.map((set) => ({ kind: 'normal', ...(set as Record<string, unknown>) }));
    current = { ...current, formatVersion: 2, tables: { ...current.tables, sets } };
  }
  if (current.formatVersion < 3) {
    // Format 2 → 3 : aucun modèle archivé, aucun exercice avec un temps par série propre.
    const unarchived = (template: unknown) => ({ archived: false, ...(template as Record<string, unknown>) });
    const templates = current.tables.templates.map(unarchived);
    const exercises = current.tables.exercises.map((exercise) => ({ workSecPerSet: null, ...(exercise as Record<string, unknown>) }));
    const sessions = current.tables.sessions.map((record) => {
      const session = record as Record<string, unknown>;
      return isObject(session.templateSnapshot) ? { ...session, templateSnapshot: unarchived(session.templateSnapshot) } : session;
    });
    current = { ...current, formatVersion: 3, tables: { ...current.tables, templates, exercises, sessions } };
  }
  if (current.formatVersion < 4) {
    // Format 3 → 4 : aucune séance express avant ce format.
    const sessions = current.tables.sessions.map((session) => ({ expressMinutes: null, ...(session as Record<string, unknown>) }));
    current = { ...current, formatVersion: 4, tables: { ...current.tables, sessions } };
  }
  if (current.formatVersion < 5) {
    // Format 4 → 5 : un premier programme reprend le cycle, le volume, les matins et la semaine type des réglages ;
    // il commence en semaine 1, suit tous les objectifs et porte tous les modèles.
    const legacy = current.tables.settings[0] as Record<string, unknown>;
    const objectiveIds = current.tables.objectives.map((o) => (o as { id: string }).id);
    const { program, app } = programFromLegacySettings(legacy, { id: newId(), objectiveIds, now: current.exportedAt });
    const attached = (template: unknown) => ({ programId: program.id, ...(template as Record<string, unknown>) });
    const templates = current.tables.templates.map(attached);
    const sessions = current.tables.sessions.map((record) => {
      const session = record as Record<string, unknown>;
      return isObject(session.templateSnapshot) ? { ...session, templateSnapshot: attached(session.templateSnapshot) } : session;
    });
    current = { ...current, formatVersion: 5, tables: { ...current.tables, settings: [app], programs: [program], templates, sessions } };
  }
  if (current.formatVersion < 6) {
    // Format 5 → 6 : les programmes restent en semaine type, sans volume propre à une composante.
    const programs = current.tables.programs.map((program) => ({ schedule: 'week', startDate: null, componentVolumes: [], ...(program as Record<string, unknown>) }));
    current = { ...current, formatVersion: 6, tables: { ...current.tables, programs } };
  }
  return current;
}

/** Lit et vérifie un fichier de sauvegarde ; lève une `BackupError` au message lisible sinon. */
export function parseBackup(text: string, currentDbVersion: number, newId: () => string = () => crypto.randomUUID()): Backup {
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
  if (tables.settings.length !== 1 || !isObject(settings) || settings.id !== 'settings') {
    throw new BackupError('Sauvegarde abîmée : réglages manquants.');
  }
  if (raw.formatVersion < 5 && !isObject(settings.weekPlan)) throw new BackupError('Sauvegarde abîmée : semaine type manquante.');
  const backup = migrate(
    {
      app: BACKUP_APP,
      formatVersion: raw.formatVersion,
      dbVersion: typeof raw.dbVersion === 'number' ? raw.dbVersion : currentDbVersion,
      exportedAt: typeof raw.exportedAt === 'number' ? raw.exportedAt : 0,
      tables,
    },
    newId,
  );
  if (backup.tables.programs.length === 0 || !backup.tables.programs.every((p) => isObject(p) && isObject(p.weekPlan) && typeof p.startWeek === 'number')) {
    throw new BackupError('Sauvegarde abîmée : programme manquant.');
  }
  return backup;
}

export interface BackupSummary {
  exportedAt: number;
  programs: number;
  sessions: number;
  sets: number;
  exercises: number;
  templates: number;
  objectives: number;
}

export function backupSummary(backup: Backup): BackupSummary {
  return {
    exportedAt: backup.exportedAt,
    programs: backup.tables.programs.length,
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
