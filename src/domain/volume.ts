// Volume hebdomadaire : composantes de renfo (prévu / réalisé / statut) et totaux par skill.
import { deloadSets } from './deload';
import { estimateDuration } from './duration';
import type {
  BlockType,
  Element,
  ID,
  Moment,
  SeqDay,
  SessionLog,
  SessionTemplate,
  SetLog,
  Settings,
  WeekPlan,
} from './types';
import { MOMENTS, SEQ_DAYS } from './types';

export interface Program {
  weekPlan: WeekPlan;
  templates: ReadonlyMap<ID, SessionTemplate>;
  elements: readonly Element[];
  blocks: ReadonlyMap<ID, BlockType>;
}

export type VolumeSettings = Pick<
  Settings,
  'volumeMin' | 'volumeMax' | 'deloadReductionPct' | 'hideMorningsInDeload'
>;

export type VolumeStatus = 'ok' | 'under_min' | 'over_max' | 'deload';

export interface PlannedSlot {
  seqDay: SeqDay;
  moment: Moment;
  template: SessionTemplate;
}

/** Séances de la semaine type, dans l'ordre J1 matin, J1 soir, J2 matin… */
export function plannedSlots(weekPlan: WeekPlan, templates: ReadonlyMap<ID, SessionTemplate>): PlannedSlot[] {
  const slots: PlannedSlot[] = [];
  for (const seqDay of SEQ_DAYS) {
    for (const moment of MOMENTS) {
      const template = templates.get(weekPlan[seqDay][moment] ?? '');
      if (template) slots.push({ seqDay, moment, template });
    }
  }
  return slots;
}

/** Statut du tableur : sous le minimum garanti par le soir, sinon au-dessus du maximum, sinon OK. */
export function volumeStatus(eveningGuaranteed: number, total: number, min: number, max: number): VolumeStatus {
  if (eveningGuaranteed < min) return 'under_min';
  if (total > max) return 'over_max';
  return 'ok';
}

export function componentElements(elements: readonly Element[]): Element[] {
  return elements.filter((e) => e.kind === 'component').sort((a, b) => a.order - b.order);
}

export interface PlannedComponentVolume {
  elementId: ID;
  name: string;
  /** Minimum garanti : Σ séries min des lignes obligatoires des séances du soir obligatoires. */
  eveningGuaranteed: number;
  /** Σ séries max des lignes du soir. */
  eveningMax: number;
  /** Σ séries max des lignes du matin (bonus). */
  morningMax: number;
  /** Soir + matin, séries max, optionnels compris : sert au contrôle du maximum. */
  totalMax: number;
  /** Σ séries max du soir une fois allégées, ligne par ligne. */
  deloadEvening: number;
  status: VolumeStatus;
}

export function plannedComponentVolume(program: Program, settings: VolumeSettings): PlannedComponentVolume[] {
  const rows = new Map<ID, PlannedComponentVolume>();
  for (const element of componentElements(program.elements)) {
    rows.set(element.id, {
      elementId: element.id,
      name: element.name,
      eveningGuaranteed: 0,
      eveningMax: 0,
      morningMax: 0,
      totalMax: 0,
      deloadEvening: 0,
      status: 'ok',
    });
  }
  for (const { moment, template } of plannedSlots(program.weekPlan, program.templates)) {
    for (const item of template.items) {
      const row = rows.get(item.elementId);
      if (!row) continue;
      if (moment === 'evening') {
        if (!item.optional && !template.optional) row.eveningGuaranteed += item.setsMin;
        row.eveningMax += item.setsMax;
        const reduced = program.blocks.get(item.blockTypeId)?.reducedInDeload ?? true;
        row.deloadEvening += reduced ? deloadSets(item.setsMax, settings.deloadReductionPct) : item.setsMax;
      } else {
        row.morningMax += item.setsMax;
      }
    }
  }
  return [...rows.values()].map((row) => {
    const totalMax = row.eveningMax + row.morningMax;
    return {
      ...row,
      totalMax,
      status: volumeStatus(row.eveningGuaranteed, totalMax, settings.volumeMin, settings.volumeMax),
    };
  });
}

export interface RealizedComponentVolume {
  elementId: ID;
  name: string;
  evening: number;
  morning: number;
  total: number;
  status: VolumeStatus;
}

/** Séries réellement faites dans la semaine `week` (numéro absolu). */
export function realizedComponentVolume(
  sets: readonly SetLog[],
  sessions: ReadonlyMap<ID, SessionLog>,
  elements: readonly Element[],
  settings: VolumeSettings,
  week: { week: number; isDeload: boolean },
): RealizedComponentVolume[] {
  const counts = new Map<ID, { evening: number; morning: number }>();
  for (const set of sets) {
    const session = sessions.get(set.sessionId);
    if (!session || session.week !== week.week || !set.elementId) continue;
    const count = counts.get(set.elementId) ?? { evening: 0, morning: 0 };
    count[session.moment] += 1;
    counts.set(set.elementId, count);
  }
  return componentElements(elements).map((element) => {
    const { evening, morning } = counts.get(element.id) ?? { evening: 0, morning: 0 };
    const total = evening + morning;
    return {
      elementId: element.id,
      name: element.name,
      evening,
      morning,
      total,
      status: week.isDeload ? 'deload' : volumeStatus(evening, total, settings.volumeMin, settings.volumeMax),
    };
  });
}

export interface SkillTotal {
  blockTypeId: ID;
  elementId: ID;
  setsMin: number;
  setsMax: number;
  /** Jours de séquence distincts où le couple (bloc, skill) apparaît, matin et soir confondus. */
  sessions: number;
  /** Σ séries max de la semaine allégée : soir réduit ligne par ligne, matins masqués ou non selon le réglage. */
  deloadMax: number;
}

export function skillTotals(program: Program, settings: VolumeSettings): SkillTotal[] {
  const skills = new Map(program.elements.filter((e) => e.kind === 'skill').map((e) => [e.id, e]));
  const totals = new Map<string, SkillTotal & { days: Set<SeqDay> }>();
  for (const { seqDay, moment, template } of plannedSlots(program.weekPlan, program.templates)) {
    for (const item of template.items) {
      if (!skills.has(item.elementId)) continue;
      const key = `${item.blockTypeId}|${item.elementId}`;
      const total = totals.get(key) ?? {
        blockTypeId: item.blockTypeId,
        elementId: item.elementId,
        setsMin: 0,
        setsMax: 0,
        sessions: 0,
        deloadMax: 0,
        days: new Set<SeqDay>(),
      };
      total.setsMin += item.setsMin;
      total.setsMax += item.setsMax;
      total.days.add(seqDay);
      if (moment === 'evening') {
        const reduced = program.blocks.get(item.blockTypeId)?.reducedInDeload ?? true;
        total.deloadMax += reduced ? deloadSets(item.setsMax, settings.deloadReductionPct) : item.setsMax;
      } else if (!settings.hideMorningsInDeload) {
        total.deloadMax += item.setsMax;
      }
      totals.set(key, total);
    }
  }
  const blockOrder = (id: ID) => program.blocks.get(id)?.order ?? Number.MAX_SAFE_INTEGER;
  const elementOrder = (id: ID) => skills.get(id)?.order ?? Number.MAX_SAFE_INTEGER;
  return [...totals.values()]
    .map(({ days, ...total }) => ({ ...total, sessions: days.size }))
    .sort((a, b) => blockOrder(a.blockTypeId) - blockOrder(b.blockTypeId) || elementOrder(a.elementId) - elementOrder(b.elementId));
}

export type ProgramIssue =
  | { kind: 'component_volume'; elementId: ID; status: 'under_min' | 'over_max' }
  | { kind: 'evening_missing_skill'; templateId: ID; elementId: ID }
  | { kind: 'morning_too_long'; templateId: ID; maxSec: number };

/** Contrôles à afficher dès qu'on modifie le programme. */
export function programIssues(
  program: Program,
  settings: VolumeSettings & Pick<Settings, 'morningMaxMinutes' | 'avgWorkSecPerSet' | 'freeRestSec'>,
): ProgramIssue[] {
  const issues: ProgramIssue[] = [];
  for (const row of plannedComponentVolume(program, settings)) {
    if (row.status === 'under_min' || row.status === 'over_max') {
      issues.push({ kind: 'component_volume', elementId: row.elementId, status: row.status });
    }
  }
  const skills = program.elements.filter((e) => e.kind === 'skill');
  const seen = new Set<ID>();
  for (const { moment, template } of plannedSlots(program.weekPlan, program.templates)) {
    if (seen.has(template.id)) continue;
    seen.add(template.id);
    if (moment === 'evening') {
      for (const skill of skills) {
        if (!template.items.some((item) => item.elementId === skill.id)) {
          issues.push({ kind: 'evening_missing_skill', templateId: template.id, elementId: skill.id });
        }
      }
    } else {
      const { maxSec } = estimateDuration(template, settings);
      if (maxSec > settings.morningMaxMinutes * 60) {
        issues.push({ kind: 'morning_too_long', templateId: template.id, maxSec });
      }
    }
  }
  return issues;
}
