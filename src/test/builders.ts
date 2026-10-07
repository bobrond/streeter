// Constructeurs de données pour les tests.
import { DEFAULT_SETTINGS, emptyWeekPlan } from '../domain/defaults';
import type {
  BlockType,
  Element,
  ElementKind,
  Moment,
  PrescriptionItem,
  SeqDay,
  SessionTemplate,
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
  return { id: testId('tpl'), name, sessionTypeId: 'type', moment, optional: false, notes: '', items, ...options };
}

export function weekPlan(slots: Partial<Record<SeqDay, Partial<WeekSlot>>>): WeekPlan {
  const plan = emptyWeekPlan();
  for (const [day, slot] of Object.entries(slots)) Object.assign(plan[Number(day) as SeqDay], slot);
  return plan;
}

export function settings(overrides: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, cycleStartDate: '2026-10-05', weekPlan: emptyWeekPlan(), ...overrides };
}
