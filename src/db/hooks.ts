import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { dayInfo, localISODate } from '../domain/cycle';
import { effectiveSettings, programAtWeek, sortPrograms } from '../domain/programs';
import type {
  AppSettings,
  Band,
  BlockType,
  Element,
  Exercise,
  Objective,
  Program,
  SessionLog,
  SessionTemplate,
  SessionType,
  SetLog,
  Settings,
} from '../domain/types';
import { db } from './db';
import type { LastImport } from './importStore';

export interface AppData {
  /** Réglages effectifs du programme en vigueur aujourd'hui. */
  settings: Settings;
  /** Réglages de l'appli, communs aux programmes. */
  appSettings: AppSettings;
  /** Par semaine de début. */
  programs: Program[];
  /** Programme en vigueur aujourd'hui. */
  program: Program;
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

/** Date du jour (YYYY-MM-DD), mise à jour au changement de jour. */
export function useToday(): string {
  const [today, setToday] = useState(() => localISODate(new Date()));
  useEffect(() => {
    const id = window.setInterval(() => setToday(localISODate(new Date())), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return today;
}

const byOrder = <T extends { order: number }>(list: T[]) => list.sort((a, b) => a.order - b.order);

/**
 * Toutes les données, à jour en continu. `undefined` pendant le chargement, `null` avant le premier import.
 * Une requête par table : une écriture ne recharge que la table modifiée.
 */
export function useAppData(): AppData | null | undefined {
  const today = useToday();
  const settings = useLiveQuery(async () => (await db.settings.get('settings')) ?? null, []);
  const programs = useLiveQuery(async () => sortPrograms(await db.programs.toArray()), []);
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
    const parts = [settings, programs, elements, blockTypes, sessionTypes, exercises, bands, templates, objectives, sessions, sets, lastImport];
    if (parts.some((p) => p === undefined)) return undefined;
    const week = settings ? dayInfo(today, { cycleStartDate: settings.cycleStartDate, cycleLengthWeeks: 1, deloadWeek: 0 }).week : 1;
    const program = programAtWeek(programs!, week);
    if (settings === null || !program) return null;
    return {
      settings: effectiveSettings(settings!, program),
      appSettings: settings!,
      programs: programs!,
      program,
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
  }, [today, settings, programs, elements, blockTypes, sessionTypes, exercises, bands, templates, objectives, sessions, sets, lastImport]);
}
