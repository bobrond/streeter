import Dexie, { type EntityTable } from 'dexie';
import type {
  Band,
  BlockType,
  Element,
  Exercise,
  Objective,
  SessionLog,
  SessionTemplate,
  SessionType,
  SetLog,
  Settings,
} from '../domain/types';

export interface MetaRecord {
  key: string;
  value: unknown;
}

/** Schéma de la version 1, publiée le 07/10/2026 (gardé à part pour tester les migrations). */
export const SCHEMA_V1 = {
  elements: 'id, name',
  blockTypes: 'id, name',
  sessionTypes: 'id, name',
  exercises: 'id, name, category, elementId',
  bands: 'id, name',
  templates: 'id, name',
  settings: 'id',
  sessions: 'id, date, [date+moment], week, status',
  sets: 'id, sessionId, exerciseId, elementId, createdAt',
  objectives: 'id, name',
  meta: 'key',
} as const;

export class StreeterDB extends Dexie {
  elements!: EntityTable<Element, 'id'>;
  blockTypes!: EntityTable<BlockType, 'id'>;
  sessionTypes!: EntityTable<SessionType, 'id'>;
  exercises!: EntityTable<Exercise, 'id'>;
  bands!: EntityTable<Band, 'id'>;
  templates!: EntityTable<SessionTemplate, 'id'>;
  settings!: EntityTable<Settings, 'id'>;
  sessions!: EntityTable<SessionLog, 'id'>;
  sets!: EntityTable<SetLog, 'id'>;
  objectives!: EntityTable<Objective, 'id'>;
  meta!: EntityTable<MetaRecord, 'key'>;

  constructor(name = 'streeter') {
    super(name);
    // Schéma publié : ne jamais modifier une version existante. Pour tout changement, ajouter
    // `this.version(n + 1).stores({...}).upgrade(tx => ...)` et tester la migration (voir CLAUDE.md).
    this.version(1).stores(SCHEMA_V1);
    // 2 (17/10/2026) : type de série (`SetLog.kind`), sans nouvel index ; les séries existantes sont normales.
    this.version(2)
      .stores({})
      .upgrade((tx) =>
        tx
          .table('sets')
          .toCollection()
          .modify((set: Partial<SetLog>) => {
            set.kind ??= 'normal';
          }),
      );
    // 3 (17/10/2026) : modèle archivé (`SessionTemplate.archived`, copies figées des séances comprises) et temps de
    // travail par série d'un exercice (`Exercise.workSecPerSet`, vide = réglage général), sans nouvel index.
    this.version(3)
      .stores({})
      .upgrade(async (tx) => {
        await tx
          .table('templates')
          .toCollection()
          .modify((template: Partial<SessionTemplate>) => {
            template.archived ??= false;
          });
        await tx
          .table('exercises')
          .toCollection()
          .modify((exercise: Partial<Exercise>) => {
            exercise.workSecPerSet ??= null;
          });
        await tx
          .table('sessions')
          .toCollection()
          .modify((session: Partial<SessionLog>) => {
            if (session.templateSnapshot) session.templateSnapshot.archived ??= false;
          });
      });
    // 4 (17/10/2026) : séance express (`SessionLog.expressMinutes`), sans nouvel index ; les séances existantes n'en
    // sont pas.
    this.version(4)
      .stores({})
      .upgrade((tx) =>
        tx
          .table('sessions')
          .toCollection()
          .modify((session: Partial<SessionLog>) => {
            session.expressMinutes ??= null;
          }),
      );
  }
}

export const db = new StreeterDB();
