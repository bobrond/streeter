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
    this.version(1).stores({
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
    });
  }
}

export const db = new StreeterDB();
