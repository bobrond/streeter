// Programmes datés : un programme commence en S1 de son cycle à sa semaine de début et dure jusqu'au début du
// suivant. Les réglages effectifs d'une date sont ceux de l'appli et ceux du programme en vigueur cette semaine-là.
import { dateOf, dayInfo, firstTestSeqDay, nextObjectiveTestDate } from './cycle';
import type { AppSettings, ID, Objective, Program, ProgramConfig, SessionTemplate, SessionType, Settings, WeekPlan } from './types';
import { SEQ_DAYS } from './types';

/** Champs d'un programme qui font partie des réglages effectifs. */
export const PROGRAM_CONFIG_KEYS = [
  'cycleLengthWeeks',
  'deloadWeek',
  'deloadReductionPct',
  'hideMorningsInDeload',
  'volumeMin',
  'volumeMax',
  'morningMaxMinutes',
  'weekPlan',
] as const satisfies readonly (keyof ProgramConfig)[];

export const APP_SETTINGS_KEYS = ['id', 'cycleStartDate', 'avgWorkSecPerSet', 'freeRestSec', 'lastBackupAt'] as const satisfies readonly (keyof AppSettings)[];

export function sortPrograms(programs: readonly Program[]): Program[] {
  return [...programs].sort((a, b) => a.startWeek - b.startWeek || a.createdAt - b.createdAt);
}

/** Programme en vigueur la semaine `week` : le dernier commencé ; avant le premier, le premier. */
export function programAtWeek(programs: readonly Program[], week: number): Program | undefined {
  const sorted = sortPrograms(programs);
  let current = sorted[0];
  for (const program of sorted) if (program.startWeek <= week) current = program;
  return current;
}

/** Semaines d'un programme : de sa semaine de début à la veille du suivant (`null` : pas de suivant). */
export function programWeeks(programs: readonly Program[], program: Program): { startWeek: number; endWeek: number | null } {
  const next = sortPrograms(programs).find((p) => p.startWeek > program.startWeek);
  return { startWeek: program.startWeek, endWeek: next ? next.startWeek - 1 : null };
}

export function effectiveSettings(app: AppSettings, program: Program): Settings {
  const config = Object.fromEntries(PROGRAM_CONFIG_KEYS.map((key) => [key, program[key]])) as unknown as ProgramConfig;
  return { ...app, ...config, programId: program.id, programStartWeek: program.startWeek };
}

/** Sépare une écriture de réglages en réglages de l'appli et réglages du programme. */
export function splitSettingsPatch(patch: Partial<Settings>): { app: Partial<AppSettings>; program: Partial<ProgramConfig> } {
  const app: Partial<AppSettings> = {};
  const program: Partial<ProgramConfig> = {};
  for (const [key, value] of Object.entries(patch)) {
    if ((APP_SETTINGS_KEYS as readonly string[]).includes(key)) (app as Record<string, unknown>)[key] = value;
    else if ((PROGRAM_CONFIG_KEYS as readonly string[]).includes(key)) (program as Record<string, unknown>)[key] = value;
  }
  return { app, program };
}

export function settingsAtWeek(app: AppSettings, programs: readonly Program[], week: number): Settings | null {
  const program = programAtWeek(programs, week);
  return program ? effectiveSettings(app, program) : null;
}

export function settingsAtDate(app: AppSettings, programs: readonly Program[], date: string): Settings | null {
  const week = dayInfo(date, { cycleStartDate: app.cycleStartDate, cycleLengthWeeks: 1, deloadWeek: 0 }).week;
  return settingsAtWeek(app, programs, week);
}

/** Date du J1 de la semaine de début d'un programme. */
export function programStartDate(app: Pick<AppSettings, 'cycleStartDate'>, program: Pick<Program, 'startWeek'>): string {
  return dateOf(program.startWeek, 1, app);
}

export type ProgramPhase = 'past' | 'current' | 'upcoming';

export function programPhase(programs: readonly Program[], program: Program, currentWeek: number): ProgramPhase {
  if (program.startWeek > currentWeek) return 'upcoming';
  return programAtWeek(programs, currentWeek)?.id === program.id ? 'current' : 'past';
}

const MONTH = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });

/** Nom par défaut d'un programme : le mois de son début (« Novembre 2026 »). */
export function programNameFor(startDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate ?? '')) return 'Programme';
  const name = MONTH.format(new Date(`${startDate}T12:00:00`));
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Semaine de début proposée pour le programme qui suivra le dernier : la fin du cycle en cours du dernier programme
 * (la fin de son premier cycle s'il n'a pas commencé), jamais avant la semaine prochaine.
 */
export function nextProgramStartWeek(programs: readonly Program[], currentWeek: number): number {
  const sorted = sortPrograms(programs);
  const last = sorted[sorted.length - 1];
  if (!last) return Math.max(1, currentWeek);
  const length = Math.max(1, last.cycleLengthWeeks);
  let week = last.startWeek + length;
  while (week <= currentWeek) week += length;
  return week;
}

/**
 * Erreur d'une semaine de début, `null` si elle convient : un programme commence après la semaine en cours (sauf
 * le premier programme, qui peut commencer en semaine 1), à une semaine qu'aucun autre programme n'occupe déjà.
 */
export function startWeekError(programs: readonly Program[], programId: ID | null, week: number, currentWeek: number): string | null {
  if (!Number.isInteger(week) || week < 1) return 'Semaine de début invalide.';
  if (programs.some((p) => p.id !== programId && p.startWeek === week)) return 'Un autre programme commence déjà cette semaine-là.';
  const others = programs.filter((p) => p.id !== programId);
  if (others.length > 0 && week <= currentWeek) return 'Un nouveau programme commence au plus tôt la semaine prochaine.';
  return null;
}

export function templatesOf(templates: readonly SessionTemplate[], programId: ID): SessionTemplate[] {
  return templates.filter((t) => t.programId === programId);
}

function remapWeekPlan(weekPlan: WeekPlan, ids: ReadonlyMap<ID, ID>): WeekPlan {
  const plan = structuredClone(weekPlan);
  for (const day of SEQ_DAYS) {
    plan[day].morning = plan[day].morning ? (ids.get(plan[day].morning) ?? null) : null;
    plan[day].evening = plan[day].evening ? (ids.get(plan[day].evening) ?? null) : null;
  }
  return plan;
}

/**
 * Copie d'un programme pour la suite : mêmes réglages, mêmes objectifs, copie de tous ses modèles (archivés compris,
 * avec de nouveaux identifiants de modèle et de ligne) placés aux mêmes créneaux.
 */
export function duplicateProgram(
  source: Program,
  templates: readonly SessionTemplate[],
  args: { newId: () => ID; name: string; startWeek: number; now: number },
): { program: Program; templates: SessionTemplate[] } {
  const ids = new Map<ID, ID>();
  const copies = templatesOf(templates, source.id).map((template) => {
    const id = args.newId();
    ids.set(template.id, id);
    return {
      ...structuredClone(template),
      id,
      programId: '',
      items: template.items.map((item) => ({ ...structuredClone(item), id: args.newId() })),
    };
  });
  const program: Program = {
    ...structuredClone(source),
    id: args.newId(),
    name: args.name,
    startWeek: args.startWeek,
    notes: '',
    createdAt: args.now,
    weekPlan: remapWeekPlan(source.weekPlan, ids),
  };
  return { program, templates: copies.map((t) => ({ ...t, programId: program.id })) };
}

/** Objectifs d'un programme (dans l'ordre des objectifs) et anciens objectifs. */
export function programObjectives(objectives: readonly Objective[], program: Pick<Program, 'objectiveIds'>): { current: Objective[]; former: Objective[] } {
  const ids = new Set(program.objectiveIds);
  return { current: objectives.filter((o) => ids.has(o.id)), former: objectives.filter((o) => !ids.has(o.id)) };
}

/**
 * Prochain jour de test des objectifs, aujourd'hui compris, en suivant les programmes à venir : début de chaque
 * cycle d'un programme, au premier jour de test de sa semaine type. `null` si aucun programme n'en a.
 */
export function nextTestDate(
  today: string,
  app: AppSettings,
  programs: readonly Program[],
  templatesById: ReadonlyMap<ID, SessionTemplate>,
  sessionTypesById: ReadonlyMap<ID, SessionType>,
): { date: string; week: number; programId: ID } | null {
  const todayWeek = dayInfo(today, { cycleStartDate: app.cycleStartDate, cycleLengthWeeks: 1, deloadWeek: 0 }).week;
  const sorted = sortPrograms(programs);
  for (const program of sorted) {
    const { endWeek } = programWeeks(sorted, program);
    if (endWeek !== null && endWeek < todayWeek) continue;
    const s = effectiveSettings(app, program);
    const from = today > programStartDate(app, program) ? today : programStartDate(app, program);
    const next = nextObjectiveTestDate(from, s, firstTestSeqDay(program.weekPlan, templatesById, sessionTypesById));
    if (next && (endWeek === null || next.week <= endWeek)) return { ...next, programId: program.id };
  }
  return null;
}

/**
 * Premier programme tiré des réglages d'avant les programmes datés (base de version 4, sauvegarde de format 4) :
 * il commence en semaine 1 et porte le nom du mois de la date de début.
 */
export function programFromLegacySettings(
  legacy: Record<string, unknown>,
  args: { id: ID; objectiveIds: ID[]; now: number },
): { program: Program; app: AppSettings } {
  const app = Object.fromEntries(APP_SETTINGS_KEYS.map((key) => [key, legacy[key]])) as unknown as AppSettings;
  const config = Object.fromEntries(PROGRAM_CONFIG_KEYS.map((key) => [key, legacy[key]])) as unknown as ProgramConfig;
  const program: Program = {
    ...config,
    id: args.id,
    name: programNameFor(app.cycleStartDate),
    startWeek: 1,
    notes: '',
    objectiveIds: args.objectiveIds,
    createdAt: args.now,
  };
  return { program, app };
}
