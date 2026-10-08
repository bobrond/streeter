import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
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
  /** Plus récentes d'abord. */
  sessions: SessionLog[];
  /** Ordre chronologique de saisie. */
  sets: SetLog[];
  lastImport: LastImport | null;
}

const byOrder = <T extends { order: number }>(list: T[]) => list.sort((a, b) => a.order - b.order);

/**
 * Toutes les données, à jour en continu. `undefined` pendant le chargement, `null` avant le premier import.
 * Une requête par table : une écriture ne recharge que la table modifiée.
 */
export function useAppData(): AppData | null | undefined {
  const settings = useLiveQuery(async () => (await db.settings.get('settings')) ?? null, []);
  const elements = useLiveQuery(async () => byOrder(await db.elements.toArray()), []);
  const blockTypes = useLiveQuery(async () => byOrder(await db.blockTypes.toArray()), []);
  const sessionTypes = useLiveQuery(() => db.sessionTypes.toArray(), []);
  const exercises = useLiveQuery(async () => byOrder(await db.exercises.toArray()), []);
  const bands = useLiveQuery(async () => byOrder(await db.bands.toArray()), []);
  const templates = useLiveQuery(() => db.templates.toArray(), []);
  const objectives = useLiveQuery(async () => byOrder(await db.objectives.toArray()), []);
  const sessions = useLiveQuery(
    async () => (await db.sessions.toArray()).sort((a, b) => b.date.localeCompare(a.date) || (b.startedAt ?? 0) - (a.startedAt ?? 0)),
    [],
  );
  const sets = useLiveQuery(() => db.sets.orderBy('createdAt').toArray(), []);
  const lastImport = useLiveQuery(async () => ((await db.meta.get('lastImport'))?.value as LastImport | undefined) ?? null, []);

  return useMemo(() => {
    const parts = [settings, elements, blockTypes, sessionTypes, exercises, bands, templates, objectives, sessions, sets, lastImport];
    if (parts.some((p) => p === undefined)) return undefined;
    if (settings === null) return null;
    return {
      settings: settings!,
      elements: elements!,
      blockTypes: blockTypes!,
      sessionTypes: sessionTypes!,
      exercises: exercises!,
      bands: bands!,
      templates: templates!,
      objectives: objectives!,
      sessions: sessions!,
      sets: sets!,
      lastImport: lastImport!,
    };
  }, [settings, elements, blockTypes, sessionTypes, exercises, bands, templates, objectives, sessions, sets, lastImport]);
}
