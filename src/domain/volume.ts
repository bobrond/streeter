// Volume hebdomadaire : composantes de renfo (prévu / réalisé / statut) et totaux par skill.
import { deloadSets, practicedTemplate } from './deload';
import { estimateDuration } from './duration';
import type {
  BlockType,
  Element,
  Exercise,
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
import type { DayProgress } from './week';

export interface PlanContext {
  weekPlan: WeekPlan;
  templates: ReadonlyMap<ID, SessionTemplate>;
  elements: readonly Element[];
  blocks: ReadonlyMap<ID, BlockType>;
  /** Catalogue : temps par série des exercices, pour la durée des matins. */
  exercises: ReadonlyMap<ID, Exercise>;
  /** Programme en séquence : chaque séance compte à part dans le nombre de séances d'un skill. */
  sequence?: boolean;
}

export type VolumeSettings = Pick<
  Settings,
  'volumeMin' | 'volumeMax' | 'deloadReductionPct' | 'hideMorningsInDeload'
> &
  Partial<Pick<Settings, 'componentVolumes'>>;

/** Bornes d'une composante : celles de son type de travail dans le programme, sinon les bornes par défaut. */
export function componentBounds(settings: VolumeSettings, elementId: ID): { min: number; max: number; work: string | null } {
  const own = settings.componentVolumes?.find((v) => v.elementId === elementId);
  return own ? { min: own.min, max: own.max, work: own.work } : { min: settings.volumeMin, max: settings.volumeMax, work: null };
}

/** Séances d'une semaine absolue. */
export function weekSessionIds(sessions: Iterable<SessionLog>, week: number): Set<ID> {
  const ids = new Set<ID>();
  for (const session of sessions) if (session.week === week) ids.add(session.id);
  return ids;
}

/** Période du volume : une semaine en semaine type, une tranche en séquence. */
export interface VolumePeriod {
  sessionIds: ReadonlySet<ID>;
  isDeload: boolean;
}

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
  /** Minimum garanti de la semaine allégée : séries min allégées, ligne par ligne (séance express). */
  deloadEveningGuaranteed: number;
  status: VolumeStatus;
}

export function plannedComponentVolume(program: PlanContext, settings: VolumeSettings): PlannedComponentVolume[] {
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
      deloadEveningGuaranteed: 0,
      status: 'ok',
    });
  }
  for (const { moment, template } of plannedSlots(program.weekPlan, program.templates)) {
    for (const item of template.items) {
      const row = rows.get(item.elementId);
      if (!row) continue;
      if (moment === 'evening') {
        const reduced = program.blocks.get(item.blockTypeId)?.reducedInDeload ?? true;
        const deloaded = (sets: number) => (reduced ? deloadSets(sets, settings.deloadReductionPct) : sets);
        if (!item.optional && !template.optional) {
          row.eveningGuaranteed += item.setsMin;
          row.deloadEveningGuaranteed += deloaded(item.setsMin);
        }
        row.eveningMax += item.setsMax;
        row.deloadEvening += deloaded(item.setsMax);
      } else {
        row.morningMax += item.setsMax;
      }
    }
  }
  return [...rows.values()].map((row) => {
    const totalMax = row.eveningMax + row.morningMax;
    const bounds = componentBounds(settings, row.elementId);
    return {
      ...row,
      totalMax,
      status: volumeStatus(row.eveningGuaranteed, totalMax, bounds.min, bounds.max),
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

/** Les séries d'échauffement ne comptent pas dans le volume (décision de l'utilisateur). */
export function countsInVolume(set: Pick<SetLog, 'kind'>): boolean {
  return set.kind !== 'warmup';
}

/** Séries réellement faites dans la période (semaine ou tranche), hors échauffement. */
export function realizedComponentVolume(
  sets: readonly SetLog[],
  sessions: ReadonlyMap<ID, SessionLog>,
  elements: readonly Element[],
  settings: VolumeSettings,
  period: VolumePeriod,
): RealizedComponentVolume[] {
  const counts = new Map<ID, { evening: number; morning: number }>();
  for (const set of sets) {
    const session = sessions.get(set.sessionId);
    if (!session || !period.sessionIds.has(session.id) || !set.elementId || !countsInVolume(set)) continue;
    const count = counts.get(set.elementId) ?? { evening: 0, morning: 0 };
    count[session.moment] += 1;
    counts.set(set.elementId, count);
  }
  return componentElements(elements).map((element) => {
    const { evening, morning } = counts.get(element.id) ?? { evening: 0, morning: 0 };
    const total = evening + morning;
    const bounds = componentBounds(settings, element.id);
    return {
      elementId: element.id,
      name: element.name,
      evening,
      morning,
      total,
      status: period.isDeload ? 'deload' : volumeStatus(evening, total, bounds.min, bounds.max),
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

export function skillTotals(program: PlanContext, settings: VolumeSettings): SkillTotal[] {
  const skills = new Map(program.elements.filter((e) => e.kind === 'skill').map((e) => [e.id, e]));
  const totals = new Map<string, SkillTotal & { days: Set<string> }>();
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
        days: new Set<string>(),
      };
      total.setsMin += item.setsMin;
      total.setsMax += item.setsMax;
      total.days.add(program.sequence ? `${moment}${seqDay}` : String(seqDay));
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

type CheckSettings = VolumeSettings & Pick<Settings, 'morningMaxMinutes' | 'avgWorkSecPerSet' | 'freeRestSec'>;

/**
 * Contrôles d'un modèle seul, qu'il soit ou non dans la semaine type : planche et FL à chaque soir (règle 2),
 * durée maximum d'un matin.
 */
export function templateIssues(template: SessionTemplate, program: PlanContext, settings: CheckSettings): ProgramIssue[] {
  const issues: ProgramIssue[] = [];
  if (template.moment === 'evening') {
    for (const skill of program.elements.filter((e) => e.kind === 'skill')) {
      if (!template.items.some((item) => item.elementId === skill.id)) {
        issues.push({ kind: 'evening_missing_skill', templateId: template.id, elementId: skill.id });
      }
    }
  } else {
    const structure = { blocks: program.blocks, elements: new Map(program.elements.map((e) => [e.id, e])), exercises: program.exercises };
    const { maxSec } = estimateDuration(template, settings, structure);
    if (maxSec > settings.morningMaxMinutes * 60) issues.push({ kind: 'morning_too_long', templateId: template.id, maxSec });
  }
  return issues;
}

/** Contrôles à afficher dès qu'on modifie le programme : volume des composantes, puis chaque modèle de la semaine type. */
export function programIssues(program: PlanContext, settings: CheckSettings): ProgramIssue[] {
  const issues: ProgramIssue[] = [];
  for (const row of plannedComponentVolume(program, settings)) {
    if (row.status === 'under_min' || row.status === 'over_max') {
      issues.push({ kind: 'component_volume', elementId: row.elementId, status: row.status });
    }
  }
  const seen = new Set<ID>();
  for (const { template } of plannedSlots(program.weekPlan, program.templates)) {
    if (seen.has(template.id)) continue;
    seen.add(template.id);
    issues.push(...templateIssues(template, program, settings));
  }
  return issues;
}

/** Contrôles affichés dans l'éditeur d'un modèle : ceux du programme, plus ceux du modèle s'il n'est pas dans la semaine type. */
export function editorIssues(program: PlanContext, settings: CheckSettings, template: SessionTemplate): ProgramIssue[] {
  const issues = programIssues(program, settings);
  const inWeek = plannedSlots(program.weekPlan, program.templates).some((slot) => slot.template.id === template.id);
  return inWeek ? issues : [...issues, ...templateIssues(template, program, settings)];
}

/** Séries de skill réellement faites dans la période, hors échauffement, par (bloc, skill) : clé « blocId|elementId ». */
export function realizedSkillSets(sets: readonly SetLog[], sessionIds: ReadonlySet<ID>, elements: readonly Element[]): Map<string, number> {
  const skills = new Set(elements.filter((e) => e.kind === 'skill').map((e) => e.id));
  const counts = new Map<string, number>();
  for (const set of sets) {
    if (!set.elementId || !skills.has(set.elementId) || !sessionIds.has(set.sessionId) || !countsInVolume(set)) continue;
    const key = `${set.blockTypeId ?? ''}|${set.elementId}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** Position dans une fourchette : jauges de la vue Volume (spec de l'utilisateur). */
export type RangeStatus = 'below' | 'within' | 'above';

/** Sous le minimum : à compléter ; de min à max : dans la cible ; au-delà du maximum. */
export function rangeStatus(value: number, min: number, max: number): RangeStatus {
  if (value < min) return 'below';
  if (value > max) return 'above';
  return 'within';
}

export interface RemainingPlanned {
  /** Par élément, tous blocs confondus. */
  byElement: Map<ID, number>;
  /** Par (bloc, élément) : clé « blocId|elementId », comme `realizedSkillSets`. */
  byBlockElement: Map<string, number>;
}

/**
 * Séries du soir encore prévues dans la semaine : séances du soir obligatoires d'aujourd'hui et des jours
 * suivants pas encore commencées (séries min des lignes obligatoires, allégées en semaine allégée), plus ce qu'il
 * reste des lignes de la séance du soir en cours. Le matin (bonus) et les séances optionnelles ne comptent pas :
 * c'est le soir qui garantit le minimum.
 */
export function remainingEveningSets(
  days: readonly DayProgress[],
  sets: readonly SetLog[],
  blocks: ReadonlyMap<ID, BlockType>,
  settings: Pick<Settings, 'deloadReductionPct'>,
  at: { isDeload: boolean; cycleWeek: number },
): RemainingPlanned {
  const byElement = new Map<ID, number>();
  const byBlockElement = new Map<string, number>();
  const add = (blockTypeId: ID, elementId: ID, count: number) => {
    if (count <= 0) return;
    byElement.set(elementId, (byElement.get(elementId) ?? 0) + count);
    const key = `${blockTypeId}|${elementId}`;
    byBlockElement.set(key, (byBlockElement.get(key) ?? 0) + count);
  };
  for (const day of days) {
    const slot = day.slots.evening;
    if (slot.status === 'today' || slot.status === 'upcoming') {
      const planned = slot.planned;
      if (!planned || planned.optional) continue;
      const practiced = practicedTemplate(planned, at, blocks, settings);
      for (const item of practiced.items) if (!item.optional) add(item.blockTypeId, item.elementId, item.setsMin);
    } else if (slot.status === 'in_progress') {
      const session = slot.sessions.find((s) => s.status === 'in_progress');
      const snapshot = session?.templateSnapshot;
      if (!session || !snapshot || snapshot.optional) continue;
      for (const item of snapshot.items) {
        if (item.optional) continue;
        const done = sets.filter((s) => s.sessionId === session.id && s.itemId === item.id && countsInVolume(s)).length;
        add(item.blockTypeId, item.elementId, item.setsMin - done);
      }
    }
  }
  return { byElement, byBlockElement };
}
