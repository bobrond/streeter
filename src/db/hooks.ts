import { useLiveQuery } from 'dexie-react-hooks';
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
import { db } from './db';
import type { LastImport } from './importStore';

export interface AppData {
  settings: Settings;
  elements: Element[];
  blockTypes: BlockType[];
  sessionTypes: SessionType[];
  exercises: Exercise[];
  bands: Band[];
  templates: SessionTemplate[];
  objectives: Objective[];
  sessions: SessionLog[];
  sets: SetLog[];
  lastImport: LastImport | null;
}

/** Toutes les données, à jour en continu. `undefined` pendant le chargement, `null` avant le premier import. */
export function useAppData(): AppData | null | undefined {
  return useLiveQuery(async () => {
    const settings = await db.settings.get('settings');
    if (!settings) return null;
    const [elements, blockTypes, sessionTypes, exercises, bands, templates, objectives, sessions, sets, lastImport] = await Promise.all([
      db.elements.toArray(),
      db.blockTypes.toArray(),
      db.sessionTypes.toArray(),
      db.exercises.toArray(),
      db.bands.toArray(),
      db.templates.toArray(),
      db.objectives.toArray(),
      db.sessions.orderBy('date').reverse().toArray(),
      db.sets.orderBy('createdAt').toArray(),
      db.meta.get('lastImport'),
    ]);
    const byOrder = <T extends { order: number }>(list: T[]) => list.sort((a, b) => a.order - b.order);
    return {
      settings,
      elements: byOrder(elements),
      blockTypes: byOrder(blockTypes),
      sessionTypes,
      exercises: byOrder(exercises),
      bands: byOrder(bands),
      templates,
      objectives: byOrder(objectives),
      sessions,
      sets,
      lastImport: (lastImport?.value as LastImport | undefined) ?? null,
    };
  }, []);
}
