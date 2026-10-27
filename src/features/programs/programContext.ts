// Programme affiché dans l'onglet Programmes (le programme en cours par défaut) : ses réglages effectifs, sa semaine
// type pour les contrôles et ses modèles.
import type { AppData } from '../../db/hooks';
import type { Lookups } from '../../db/lookups';
import { dateOf, dayInfo } from '../../domain/cycle';
import { formatDateShort } from '../../domain/labels';
import { effectiveSettings, programStartDate, programWeeks, templatesOf, type ProgramPhase } from '../../domain/programs';
import type { ID, Program, SessionTemplate, Settings } from '../../domain/types';
import type { PlanContext } from '../../domain/volume';

export interface ProgramContext {
  program: Program;
  settings: Settings;
  plan: PlanContext;
  templates: SessionTemplate[];
}

export function programContext(data: AppData, lookups: Lookups, programId: ID | null | undefined): ProgramContext {
  const program = data.programs.find((p) => p.id === programId) ?? data.program;
  return {
    program,
    settings: effectiveSettings(data.appSettings, program),
    plan: { ...lookups.program, weekPlan: program.weekPlan },
    templates: templatesOf(data.templates, program.id),
  };
}

/** Adresse d'une page de l'onglet Programmes pour un programme ; rien à ajouter pour le programme en cours. */
export function withProgram(path: string, data: AppData, programId: ID): string {
  if (programId === data.program.id) return path;
  return `${path}${path.includes('?') ? '&' : '?'}programme=${encodeURIComponent(programId)}`;
}

export const PHASE_LABEL: Record<ProgramPhase, string> = { past: 'Programme passé', current: 'Programme en cours', upcoming: 'Programme à venir' };

export function currentWeekOf(data: AppData, today: string): number {
  return dayInfo(today, data.settings).week;
}

/** « du 05/10/2026 au 01/11/2026 », ou « à partir du 02/11/2026 » sans programme suivant. */
export function programDates(data: AppData, program: Program): string {
  const { endWeek } = programWeeks(data.programs, program);
  const start = formatDateShort(programStartDate(data.appSettings, program));
  return endWeek === null ? `à partir du ${start}` : `du ${start} au ${formatDateShort(dateOf(endWeek, 7, data.appSettings))}`;
}
