// Constructeurs de données pour les tests.
import { DEFAULT_SETTINGS, emptyWeekPlan } from '../domain/defaults';
import type {
  AppSettings,
  BlockType,
  Element,
  ElementKind,
  Exercise,
  Moment,
  PrescriptionItem,
  Program,
  SeqDay,
  SessionLog,
  SessionTemplate,
  SetLog,
  Settings,
  WeekPlan,
  WeekSlot,
} from '../domain/types';

let counter = 0;
export function testId(prefix = 'id'): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

export function element(name: string, kind: ElementKind, order = 0): Element {
  return { id: testId('el'), name, kind, order };
}

export function block(name: string, order: number, options: Partial<BlockType> = {}): BlockType {
  return { id: testId('bl'), name, order, alternateSkills: false, reducedInDeload: true, ...options };
}

export function item(base: Pick<PrescriptionItem, 'blockTypeId' | 'elementId'> & Partial<PrescriptionItem>): PrescriptionItem {
  return {
    id: testId('it'),
    candidateExerciseIds: [],
    candidatesText: '',
    setsMin: 2,
    setsMax: 2,
    targetText: '',
    targets: [],
    intensityText: '',
    intensity: null,
    restText: '90 s',
    restMinSec: 90,
    restMaxSec: 90,
    superset: false,
    optional: false,
    notes: '',
    ...base,
  };
}

export function template(name: string, moment: Moment, items: PrescriptionItem[], options: Partial<SessionTemplate> = {}): SessionTemplate {
  return { id: testId('tpl'), name, sessionTypeId: 'type', moment, optional: false, notes: '', items, archived: false, programId: 'prog', ...options };
}

export function weekPlan(slots: Partial<Record<SeqDay, Partial<WeekSlot>>>): WeekPlan {
  const plan = emptyWeekPlan();
  for (const [day, slot] of Object.entries(slots)) Object.assign(plan[Number(day) as SeqDay], slot);
  return plan;
}

export function settings(overrides: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, cycleStartDate: '2026-10-05', weekPlan: emptyWeekPlan(), programId: 'prog', programStartWeek: 1, ...overrides };
}

export function appSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return { id: 'settings', cycleStartDate: '2026-10-05', avgWorkSecPerSet: 30, freeRestSec: 30, lastBackupAt: null, ...overrides };
}

/** Programme : réglages par défaut, semaine 1, identifiant `prog` (celui des modèles de `template`) par défaut. */
export function program(overrides: Partial<Program> = {}): Program {
  return {
    id: 'prog',
    name: 'Octobre 2026',
    startWeek: 1,
    notes: '',
    objectiveIds: [],
    createdAt: 0,
    cycleLengthWeeks: DEFAULT_SETTINGS.cycleLengthWeeks,
    deloadWeek: DEFAULT_SETTINGS.deloadWeek,
    deloadReductionPct: DEFAULT_SETTINGS.deloadReductionPct,
    hideMorningsInDeload: DEFAULT_SETTINGS.hideMorningsInDeload,
    volumeMin: DEFAULT_SETTINGS.volumeMin,
    volumeMax: DEFAULT_SETTINGS.volumeMax,
    morningMaxMinutes: DEFAULT_SETTINGS.morningMaxMinutes,
    weekPlan: emptyWeekPlan(),
    ...overrides,
  };
}

export function exercise(name: string, elementId: string | null, options: Partial<Exercise> = {}): Exercise {
  return {
    id: testId('ex'),
    name,
    category: '',
    elementId,
    measure: 'reps',
    quick: false,
    active: true,
    notes: '',
    aliases: [],
    order: 0,
    workSecPerSet: null,
    ...options,
  };
}

let clock = Date.UTC(2026, 9, 7, 18);
export function setLog(base: Pick<SetLog, 'sessionId' | 'exerciseId'> & Partial<SetLog>): SetLog {
  clock += 1000;
  return {
    id: testId('set'),
    itemId: null,
    blockTypeId: null,
    elementId: null,
    setIndex: 1,
    value: null,
    bandId: null,
    rpe: null,
    quality: null,
    kind: 'normal',
    note: '',
    createdAt: clock,
    ...base,
  };
}

export function sessionLog(date: string, overrides: Partial<SessionLog> = {}): SessionLog {
  return {
    id: testId('ses'),
    date,
    week: 1,
    cycleWeek: 1,
    seqDay: 1,
    moment: 'evening',
    templateId: null,
    templateSnapshot: null,
    sessionTypeId: null,
    sessionTypeName: '',
    deload: false,
    status: 'done',
    startedAt: null,
    endedAt: null,
    note: '',
    source: 'app',
    resume: null,
    expressMinutes: null,
    ...overrides,
  };
}
