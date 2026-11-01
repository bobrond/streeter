// Bilan d'un programme (phase G3) : calcul métier pur à partir des données de l'appli et de la date du jour.
// Couvre un programme terminé (toute sa période) ou en cours (arrêté à aujourd'hui), en séquence (tranches) ou en
// semaine type (semaines), avec composantes écrites ou réparties par l'appli (H2).
import { componentBounds } from './components';
import { addDays, dayInfo, diffDays } from './cycle';
import { morningsHidden, practicedTemplate } from './deload';
import { sessionDurationSec, sessionLines } from './journal';
import { bestTest, countsForRecord, objectiveState, type ObjectiveStatus } from './objectives';
import {
  effectiveSettings,
  programDateWindow,
  programObjectives,
  programPhase,
  weekOfDate,
  type ProgramPhase,
} from './programs';
import { sequenceIds, sequenceState, sessionsBetween } from './sequence';
import type {
  AppSettings,
  Band,
  BlockType,
  Element,
  Exercise,
  ID,
  Measure,
  Moment,
  Objective,
  PrescriptionItem,
  Program,
  ProgramSchedule,
  SeqDay,
  SessionLog,
  SessionTemplate,
  SessionType,
  SetLog,
  TargetUnit,
} from './types';
import {
  componentElements,
  plannedComponentVolume,
  programSlots,
  realizedComponentVolume,
  realizedSkillSets,
  weekSessionIds,
  type PlanContext,
} from './volume';
import { weekProgress, weekRange } from './week';

export interface ProgramReportInput {
  program: Program;
  app: AppSettings;
  programs: readonly Program[];
  templates: readonly SessionTemplate[];
  elements: readonly Element[];
  blockTypes: readonly BlockType[];
  sessionTypes: readonly SessionType[];
  exercises: readonly Exercise[];
  bands: readonly Band[];
  objectives: readonly Objective[];
  sessions: readonly SessionLog[];
  sets: readonly SetLog[];
  today: string;
}

export interface ReportPeriod {
  kind: 'tranche' | 'week';
  /** 1-indexé : T1, T2… en séquence ; S1, S2… (rang dans le programme) en semaine type. */
  index: number;
  /** Libellé court : « T1 », « S1 »… */
  label: string;
  /** Semaine absolue en semaine type ; `null` en séquence. */
  absoluteWeek: number | null;
  cycle: number;
  /** Rang dans le cycle (1…cycleLengthWeeks). */
  cycleWeek: number;
  isDeload: boolean;
  /** Période pas encore terminée (tranche incomplète ou semaine en cours). */
  partial: boolean;
  fromDate: string | null;
  toDate: string | null;
  eveningDone: number;
  eveningPlanned: number;
  morningDone: number;
}

export interface PeriodComponentCell {
  evening: number;
  morning: number;
  total: number;
  plannedMin: number;
  plannedMax: number;
  isDeload: boolean;
}

export interface ComponentVolumeRow {
  elementId: ID;
  name: string;
  work: string | null;
  targetMin: number;
  targetMax: number;
  scheduledEveningMin: number;
  scheduledTotalMax: number;
  deloadMin: number;
  deloadMax: number;
  periods: PeriodComponentCell[];
}

export interface PeriodSkillCell {
  done: number;
  plannedMin: number;
  plannedMax: number;
  isDeload: boolean;
}

export interface SkillVolumeRow {
  elementId: ID;
  skillName: string;
  blockTypeId: ID;
  blockName: string;
  periods: PeriodSkillCell[];
}

export interface ObjectiveTestEntry {
  date: string;
  value: number;
  note: string;
  /** Écart avec le meilleur test antérieur au programme (`null` sans test avant). */
  deltaFromBefore: number | null;
}

export interface ObjectiveReportRow {
  objectiveId: ID;
  name: string;
  criterion: string;
  target: number;
  unit: TargetUnit;
  exerciseName: string | null;
  status: ObjectiveStatus;
  bestBefore: { value: number; date: string } | null;
  tests: ObjectiveTestEntry[];
  /** Meilleure série propre sans élastique en séance sur la période, pour l'exercice lié. */
  bestSessionInPeriod: { value: number; date: string } | null;
}

export interface BeatenRecordRow {
  exerciseId: ID;
  exerciseName: string;
  elementId: ID | null;
  elementName: string;
  measure: TargetUnit;
  bandId: ID | null;
  bandName: string | null;
  value: number;
  date: string;
  previousValue: number;
  previousDate: string;
  /** `before_program` : bat un record d'avant le programme ; `first_session` : bat la 1re séance faite dans ce programme. */
  previousOrigin: 'before_program' | 'first_session';
}

export interface LowerProgressionSessionEntry {
  date: string;
  periodLabel: string;
  sessionName: string;
  values: (number | null)[];
}

export interface LowerProgressionRow {
  exerciseId: ID;
  exerciseName: string;
  measure: Measure;
  replacedLabel: string;
  totalSets: number;
  bestCleanValue: number | null;
  sessions: LowerProgressionSessionEntry[];
}

export interface TrainingGap {
  /** Premier jour sans séance (YYYY-MM-DD). */
  fromDate: string;
  /** Dernier jour sans séance (YYYY-MM-DD). */
  toDate: string;
  /** Jours consécutifs complets sans séance faite (> 2). */
  daysWithoutSession: number;
  previousSessionDate: string | null;
  nextSessionDate: string | null;
}

export interface TrancheRhythm {
  label: string;
  isDeload: boolean;
  partial: boolean;
  eveningDone: number;
  eveningPlanned: number;
  morningDone: number;
  fromDate: string | null;
  toDate: string | null;
  /** Durée calendaire de la première à la dernière séance de la tranche, bornes incluses. */
  spanDays: number | null;
}

export interface MissedSlotRow {
  date: string;
  periodLabel: string;
  seqDay: SeqDay;
  moment: Moment;
  templateName: string;
  optional: boolean;
}

export interface ReplacedSlotRow {
  date: string;
  periodLabel: string;
  slotLabel: string;
  plannedName: string;
  doneName: string;
}

export interface AbandonedSessionRow {
  sessionId: ID;
  date: string;
  periodLabel: string;
  moment: Moment;
  name: string;
  setsDone: number;
  durationSec: number | null;
  note: string;
}

export interface ExpressSessionRow {
  sessionId: ID;
  date: string;
  periodLabel: string;
  moment: Moment;
  expressMinutes: number;
  name: string;
  replacedName: string | null;
  setsDone: number;
  durationSec: number | null;
  abandoned: boolean;
}

export interface MarkedSetDetail {
  /** Numéro de série dans la ligne (« 1 », « 2 »… ou « E »). */
  label: string;
  value: number | null;
  bandName: string | null;
  rpe: number | null;
  note: string;
}

export interface MarkedLineRow {
  date: string;
  periodLabel: string;
  sessionName: string;
  blockName: string;
  exerciseName: string;
  measure: Measure;
  workSetCount: number;
  markedSets: MarkedSetDetail[];
}

export interface NoteEntry {
  kind: 'session' | 'set';
  date: string;
  periodLabel: string;
  sessionName: string;
  exerciseName: string | null;
  setLabel: string | null;
  value: number | null;
  measure: Measure | null;
  bandName: string | null;
  text: string;
}

export interface ProgramReport {
  programId: ID;
  programName: string;
  phase: ProgramPhase;
  schedule: ProgramSchedule;
  startDate: string;
  /** Dernier jour calendaire couvert par le bilan (inclus). */
  endDate: string;
  today: string;
  cycleLength: number;
  deloadWeek: number;
  deloadReductionPct: number;
  hideMorningsInDeload: boolean;
  sequenceLength: number;
  morningPlannedCount: number;
  notes: string;
  counts: {
    eveningDone: number;
    morningDone: number;
    expressDone: number;
    abandoned: number;
    inProgress: number;
  };
  periods: ReportPeriod[];
  componentVolume: ComponentVolumeRow[];
  skillVolume: SkillVolumeRow[];
  objectives: ObjectiveReportRow[];
  formerObjectivesTested: ObjectiveReportRow[];
  beatenRecords: BeatenRecordRow[];
  lowerProgressions: LowerProgressionRow[];
  /** Séquence : pauses de plus de 2 jours sans séance faite. */
  trainingGaps: TrainingGap[];
  /** Séquence : rythme réel de chaque tranche entamée. */
  trancheRhythms: TrancheRhythm[];
  /** Semaine type : créneaux passés non faits (obligatoires et optionnels). */
  missedSlots: MissedSlotRow[];
  /** Autre séance faite à la place de la séance prévue (hors séance express). */
  replacedSlots: ReplacedSlotRow[];
  abandonedSessions: AbandonedSessionRow[];
  expressSessions: ExpressSessionRow[];
  degradedLines: MarkedLineRow[];
  failureLines: MarkedLineRow[];
  sessionNotes: NoteEntry[];
}

const chronological = (a: SessionLog, b: SessionLog) =>
  a.date.localeCompare(b.date) || (a.startedAt ?? 0) - (b.startedAt ?? 0);

function sessionDisplayName(session: SessionLog, templatesById: ReadonlyMap<ID, SessionTemplate>): string {
  return (
    session.templateSnapshot?.name ||
    (session.templateId ? templatesById.get(session.templateId)?.name : undefined) ||
    session.sessionTypeName ||
    'Séance'
  );
}

/** Volume prévu des composantes en semaine / tranche allégée (`cycleWeek`), lignes réparties et `byTranche` compris. */
function deloadComponentPlan(
  plan: PlanContext,
  settings: ReturnType<typeof effectiveSettings>,
  cycleWeek: number,
): Map<ID, { min: number; max: number }> {
  const result = new Map<ID, { min: number; max: number }>();
  for (const el of componentElements(plan.elements)) result.set(el.id, { min: 0, max: 0 });
  if (settings.deloadWeek <= 0) return result;
  for (const slot of programSlots(plan)) {
    if (slot.moment === 'morning' && morningsHidden(true, settings)) continue;
    const practiced = practicedTemplate(slot.template, { cycleWeek, isDeload: true }, plan.blocks, settings);
    for (const item of practiced.items) {
      const entry = result.get(item.elementId);
      if (!entry) continue;
      if (slot.moment === 'evening' && !item.optional && !slot.template.optional) entry.min += item.setsMin;
      entry.max += item.setsMax;
    }
  }
  return result;
}

/** Volume prévu des skills par `(blockTypeId|elementId)` pour une période donnée (`cycleWeek`, `isDeload`). */
function plannedSkillsAtPeriod(
  plan: PlanContext,
  settings: ReturnType<typeof effectiveSettings>,
  at: { cycleWeek: number; isDeload: boolean },
  skillIds: ReadonlySet<ID>,
): Map<string, { min: number; max: number }> {
  const totals = new Map<string, { min: number; max: number }>();
  for (const slot of programSlots(plan)) {
    if (slot.moment === 'morning' && morningsHidden(at.isDeload, settings)) continue;
    const practiced = practicedTemplate(slot.template, at, plan.blocks, settings);
    for (const item of practiced.items) {
      if (!skillIds.has(item.elementId)) continue;
      const key = `${item.blockTypeId}|${item.elementId}`;
      const prev = totals.get(key) ?? { min: 0, max: 0 };
      prev.min += item.setsMin;
      prev.max += item.setsMax;
      totals.set(key, prev);
    }
  }
  return totals;
}

/** Pauses de plus de 2 jours complets sans séance faite (`status === 'done'`) sur `[startDate, endDate]`. */
export function computeTrainingGaps(
  doneDates: readonly string[],
  startDate: string,
  endDate: string,
): TrainingGap[] {
  if (endDate < startDate) return [];
  const unique = [...new Set(doneDates.filter((d) => d >= startDate && d <= endDate))].sort();
  if (unique.length === 0) {
    const days = diffDays(startDate, endDate) + 1;
    return days > 2
      ? [{ fromDate: startDate, toDate: endDate, daysWithoutSession: days, previousSessionDate: null, nextSessionDate: null }]
      : [];
  }
  const gaps: TrainingGap[] = [];
  const beforeFirst = diffDays(startDate, unique[0]);
  if (beforeFirst > 2) {
    gaps.push({
      fromDate: startDate,
      toDate: addDays(unique[0], -1),
      daysWithoutSession: beforeFirst,
      previousSessionDate: null,
      nextSessionDate: unique[0],
    });
  }
  for (let i = 0; i + 1 < unique.length; i++) {
    const days = diffDays(unique[i], unique[i + 1]) - 1;
    if (days > 2) {
      gaps.push({
        fromDate: addDays(unique[i], 1),
        toDate: addDays(unique[i + 1], -1),
        daysWithoutSession: days,
        previousSessionDate: unique[i],
        nextSessionDate: unique[i + 1],
      });
    }
  }
  const afterLast = diffDays(unique[unique.length - 1], endDate);
  if (afterLast > 2) {
    gaps.push({
      fromDate: addDays(unique[unique.length - 1], 1),
      toDate: endDate,
      daysWithoutSession: afterLast,
      previousSessionDate: unique[unique.length - 1],
      nextSessionDate: null,
    });
  }
  return gaps;
}

export function buildProgramReport(input: ProgramReportInput): ProgramReport {
  const { program, app, programs, today } = input;
  const phase = programPhase(programs, program, { app, today });
  const window = programDateWindow(programs, app, program);
  const startDate = window.start;
  const endDate =
    phase === 'upcoming'
      ? startDate
      : phase === 'past' && window.end !== null
        ? addDays(window.end, -1)
        : window.end !== null && window.end <= today
          ? addDays(window.end, -1)
          : today;

  const settings = effectiveSettings(app, program);
  const templatesById = new Map(input.templates.map((t) => [t.id, t]));
  const elementsById = new Map(input.elements.map((e) => [e.id, e]));
  const blocksById = new Map(input.blockTypes.map((b) => [b.id, b]));
  const exercisesById = new Map(input.exercises.map((e) => [e.id, e]));
  const bandsById = new Map(input.bands.map((b) => [b.id, b]));
  const sessionsById = new Map(input.sessions.map((s) => [s.id, s]));

  const plan: PlanContext = {
    weekPlan: program.weekPlan,
    templates: templatesById,
    elements: input.elements,
    blocks: blocksById,
    exercises: exercisesById,
    sequence: program.schedule === 'sequence',
    componentPlan: program,
  };

  const evenings = sequenceIds(program.weekPlan, 'evening');
  const mornings = sequenceIds(program.weekPlan, 'morning');
  const isSequence = program.schedule === 'sequence';

  // Séances de la fenêtre du programme (arrêtées à `endDate`).
  const rawWindowSessions =
    phase === 'upcoming'
      ? []
      : sessionsBetween(input.sessions, startDate, window.end).filter((s) => s.date <= endDate).sort(chronological);
  const inProgressCount = rawWindowSessions.filter((s) => s.status === 'in_progress').length;
  const periodSessions = rawWindowSessions.filter((s) => s.status !== 'in_progress');
  const doneSessions = periodSessions.filter((s) => s.status === 'done');

  const setsBySession = new Map<ID, SetLog[]>();
  for (const set of input.sets) {
    const list = setsBySession.get(set.sessionId);
    if (list) list.push(set);
    else setsBySession.set(set.sessionId, [set]);
  }

  // --- Périodes (tranches ou semaines) ---
  const seqState = sequenceState(program.weekPlan, periodSessions);
  interface InternalPeriod extends ReportPeriod {
    sessionIds: Set<ID>;
  }
  const internalPeriods: InternalPeriod[] = [];
  const periodLabelBySession = new Map<ID, string>();

  if (phase !== 'upcoming') {
    if (isSequence) {
      let maxTranche = -1;
      for (const s of periodSessions) {
        const t = seqState.trancheOf.get(s.id) ?? 0;
        if (t > maxTranche) maxTranche = t;
      }
      const trancheCount = Math.max(1, maxTranche + 1);
      const cycleLen = Math.max(1, program.cycleLengthWeeks);
      for (let t = 0; t < trancheCount; t++) {
        const inTranche = periodSessions.filter((s) => seqState.trancheOf.get(s.id) === t);
        const doneInTranche = inTranche.filter((s) => s.status === 'done');
        const eveningDone = doneInTranche.filter((s) => s.moment === 'evening').length;
        const morningDone = doneInTranche.filter((s) => s.moment === 'morning').length;
        const dates = doneInTranche.length > 0 ? doneInTranche.map((s) => s.date) : inTranche.map((s) => s.date);
        const cycle = Math.floor(t / cycleLen) + 1;
        const cycleWeek = (t % cycleLen) + 1;
        const label = `T${t + 1}`;
        for (const s of inTranche) periodLabelBySession.set(s.id, label);
        internalPeriods.push({
          kind: 'tranche',
          index: t + 1,
          label,
          absoluteWeek: null,
          cycle,
          cycleWeek,
          isDeload: cycleWeek === program.deloadWeek,
          partial: eveningDone < seqState.length,
          fromDate: dates[0] ?? null,
          toDate: dates.at(-1) ?? null,
          eveningDone,
          eveningPlanned: seqState.length,
          morningDone,
          sessionIds: new Set(inTranche.map((s) => s.id)),
        });
      }
    } else {
      const lastWeek = Math.max(program.startWeek, weekOfDate(app, endDate));
      const eveningPlanned = evenings.length;
      for (let week = program.startWeek; week <= lastWeek; week++) {
        const range = weekRange(week, settings);
        const info = dayInfo(range.from, settings);
        const ids = weekSessionIds(periodSessions, week);
        const inWeek = periodSessions.filter((s) => ids.has(s.id));
        const eveningDone = inWeek.filter((s) => s.status === 'done' && s.moment === 'evening').length;
        const morningDone = inWeek.filter((s) => s.status === 'done' && s.moment === 'morning').length;
        const index = week - program.startWeek + 1;
        const label = `S${index}`;
        for (const s of inWeek) periodLabelBySession.set(s.id, label);
        internalPeriods.push({
          kind: 'week',
          index,
          label,
          absoluteWeek: week,
          cycle: info.cycle,
          cycleWeek: info.cycleWeek,
          isDeload: info.isDeload,
          partial: endDate < range.to,
          fromDate: range.from < startDate ? startDate : range.from,
          toDate: range.to > endDate ? endDate : range.to,
          eveningDone,
          eveningPlanned,
          morningDone,
          sessionIds: ids,
        });
      }
    }
  }

  for (const s of periodSessions) {
    if (!periodLabelBySession.has(s.id)) {
      periodLabelBySession.set(s.id, isSequence ? `T${(seqState.trancheOf.get(s.id) ?? 0) + 1}` : `S${Math.max(1, s.week - program.startWeek + 1)}`);
    }
  }

  // --- Volume des composantes ---
  const scheduledComponents = new Map(plannedComponentVolume(plan, settings).map((r) => [r.elementId, r]));
  const defaultDeloadPlan = deloadComponentPlan(plan, settings, program.deloadWeek || program.cycleLengthWeeks);
  const realizedByPeriod = internalPeriods.map((p) => {
    const realized = realizedComponentVolume(input.sets, sessionsById, input.elements, settings, {
      sessionIds: p.sessionIds,
      isDeload: p.isDeload,
    });
    const deloadAtPeriod = p.isDeload ? deloadComponentPlan(plan, settings, p.cycleWeek) : null;
    return { period: p, realized: new Map(realized.map((r) => [r.elementId, r])), deloadAtPeriod };
  });

  const componentVolume: ComponentVolumeRow[] = componentElements(input.elements).map((el) => {
    const bounds = componentBounds(settings, el.id);
    const scheduled = scheduledComponents.get(el.id);
    const deload = defaultDeloadPlan.get(el.id) ?? { min: 0, max: 0 };
    return {
      elementId: el.id,
      name: el.name,
      work: bounds.work,
      targetMin: bounds.min,
      targetMax: bounds.max,
      scheduledEveningMin: scheduled?.eveningGuaranteed ?? 0,
      scheduledTotalMax: scheduled?.totalMax ?? 0,
      deloadMin: deload.min,
      deloadMax: deload.max,
      periods: realizedByPeriod.map(({ period, realized, deloadAtPeriod }) => {
        const r = realized.get(el.id) ?? { evening: 0, morning: 0, total: 0 };
        const pBounds = period.isDeload ? (deloadAtPeriod?.get(el.id) ?? deload) : { min: bounds.min, max: bounds.max };
        return {
          evening: r.evening,
          morning: r.morning,
          total: r.total,
          plannedMin: pBounds.min,
          plannedMax: pBounds.max,
          isDeload: period.isDeload,
        };
      }),
    };
  });

  // --- Volume des skills par bloc ---
  const skills = [...input.elements].filter((e) => e.kind === 'skill').sort((a, b) => a.order - b.order);
  const skillIds = new Set(skills.map((s) => s.id));
  const skillRealizedByPeriod = internalPeriods.map((p) => ({
    period: p,
    realized: realizedSkillSets(input.sets, p.sessionIds, input.elements),
    planned: plannedSkillsAtPeriod(plan, settings, { cycleWeek: p.cycleWeek, isDeload: p.isDeload }, skillIds),
  }));
  const baseSkillPlanned = plannedSkillsAtPeriod(plan, settings, { cycleWeek: 1, isDeload: false }, skillIds);
  const skillKeys = new Set<string>(baseSkillPlanned.keys());
  for (const entry of skillRealizedByPeriod) {
    for (const key of entry.planned.keys()) skillKeys.add(key);
    for (const [key, count] of entry.realized) if (count > 0) skillKeys.add(key);
  }
  const blockOrder = (id: ID) => blocksById.get(id)?.order ?? Number.MAX_SAFE_INTEGER;
  const skillOrder = (id: ID) => elementsById.get(id)?.order ?? Number.MAX_SAFE_INTEGER;
  const skillVolume: SkillVolumeRow[] = [...skillKeys]
    .map((key) => {
      const sep = key.indexOf('|');
      const blockTypeId = key.slice(0, sep);
      const elementId = key.slice(sep + 1);
      return {
        elementId,
        skillName: elementsById.get(elementId)?.name ?? '?',
        blockTypeId,
        blockName: blocksById.get(blockTypeId)?.name ?? 'Autre bloc',
        periods: skillRealizedByPeriod.map(({ period, realized, planned }) => {
          const p = planned.get(key) ?? { min: 0, max: 0 };
          return {
            done: realized.get(key) ?? 0,
            plannedMin: p.min,
            plannedMax: p.max,
            isDeload: period.isDeload,
          };
        }),
      };
    })
    .filter((row) => row.periods.length === 0 || row.periods.some((p) => p.done > 0 || p.plannedMax > 0))
    .sort((a, b) => skillOrder(a.elementId) - skillOrder(b.elementId) || blockOrder(a.blockTypeId) - blockOrder(b.blockTypeId));

  // --- Objectifs et tests (strictement datés dans les dates du programme, comparés au meilleur d'avant) ---
  const periodSessionIds = new Set(periodSessions.map((s) => s.id));
  const bestUnbandedInPeriod = (exerciseId: ID | null): { value: number; date: string } | null => {
    if (!exerciseId || phase === 'upcoming') return null;
    let best: { value: number; date: string } | null = null;
    for (const set of input.sets) {
      if (set.exerciseId !== exerciseId || set.bandId !== null || !periodSessionIds.has(set.sessionId) || !countsForRecord(set)) continue;
      const date = sessionsById.get(set.sessionId)?.date;
      if (!date) continue;
      const value = set.value as number;
      if (!best || value > best.value || (value === best.value && date < best.date)) best = { value, date };
    }
    return best;
  };

  const buildObjectiveRow = (objective: Objective): ObjectiveReportRow => {
    const beforeTests = objective.tests.filter((t) => t.date < startDate);
    const bestBefore = bestTest(beforeTests);
    const inPeriod =
      phase === 'upcoming'
        ? []
        : objective.tests
            .filter((t) => t.date >= startDate && t.date <= endDate && (window.end === null || t.date < window.end))
            .sort((a, b) => a.date.localeCompare(b.date));
    const state = objectiveState({ target: objective.target, tests: [...beforeTests, ...inPeriod] });
    return {
      objectiveId: objective.id,
      name: objective.name,
      criterion: objective.criterion,
      target: objective.target,
      unit: objective.unit,
      exerciseName: objective.exerciseId ? (exercisesById.get(objective.exerciseId)?.name ?? null) : null,
      status: state.status,
      bestBefore: bestBefore ? { value: bestBefore.value, date: bestBefore.date } : null,
      tests: inPeriod.map((t) => ({
        date: t.date,
        value: t.value,
        note: t.note.trim(),
        deltaFromBefore: bestBefore ? t.value - bestBefore.value : null,
      })),
      bestSessionInPeriod: bestUnbandedInPeriod(objective.exerciseId),
    };
  };

  const { current: currentObjectives, former: formerObjectives } = programObjectives(input.objectives, program);
  const objectives = currentObjectives.map(buildObjectiveRow);
  const formerObjectivesTested = formerObjectives.map(buildObjectiveRow).filter((o) => o.tests.length > 0);

  // --- Records all-time battus sur tout exercice mesuré (sans élastique et par élastique) ---
  const priorSessions = input.sessions
    .filter((s) => s.status !== 'in_progress' && s.date < startDate)
    .sort(chronological);

  const priorBestByKey = new Map<string, { value: number; date: string }>();
  for (const session of priorSessions) {
    for (const set of setsBySession.get(session.id) ?? []) {
      const ex = exercisesById.get(set.exerciseId);
      if (!ex || ex.measure === 'none' || !countsForRecord(set)) continue;
      const key = `${ex.id}|${set.bandId ?? ''}`;
      const value = set.value as number;
      const cur = priorBestByKey.get(key);
      if (!cur || value > cur.value || (value === cur.value && session.date < cur.date)) {
        priorBestByKey.set(key, { value, date: session.date });
      }
    }
  }

  interface PeriodAttempt {
    sessionId: ID;
    date: string;
    bestValue: number;
  }
  const attemptsByKey = new Map<string, PeriodAttempt[]>();
  for (const session of periodSessions) {
    const sessionMax = new Map<string, number>();
    for (const set of setsBySession.get(session.id) ?? []) {
      const ex = exercisesById.get(set.exerciseId);
      if (!ex || ex.measure === 'none' || !countsForRecord(set)) continue;
      const key = `${ex.id}|${set.bandId ?? ''}`;
      const value = set.value as number;
      sessionMax.set(key, Math.max(sessionMax.get(key) ?? Number.NEGATIVE_INFINITY, value));
    }
    for (const [key, bestValue] of sessionMax) {
      const list = attemptsByKey.get(key);
      if (list) list.push({ sessionId: session.id, date: session.date, bestValue });
      else attemptsByKey.set(key, [{ sessionId: session.id, date: session.date, bestValue }]);
    }
  }

  const beatenRecords: BeatenRecordRow[] = [];
  for (const [key, attempts] of attemptsByKey) {
    const sep = key.indexOf('|');
    const exerciseId = key.slice(0, sep);
    const bandId: ID | null = key.slice(sep + 1) || null;
    const ex = exercisesById.get(exerciseId);
    if (!ex || ex.measure === 'none') continue;
    const prior = priorBestByKey.get(key) ?? null;
    const baseline = prior
      ? { value: prior.value, date: prior.date, origin: 'before_program' as const, fromIndex: 0 }
      : { value: attempts[0].bestValue, date: attempts[0].date, origin: 'first_session' as const, fromIndex: 1 };
    let best: { value: number; date: string } | null = null;
    for (let i = baseline.fromIndex; i < attempts.length; i++) {
      const a = attempts[i];
      if (a.bestValue > baseline.value && (!best || a.bestValue > best.value)) {
        best = { value: a.bestValue, date: a.date };
      }
    }
    if (!best) continue;
    const el = ex.elementId ? elementsById.get(ex.elementId) : undefined;
    beatenRecords.push({
      exerciseId: ex.id,
      exerciseName: ex.name,
      elementId: ex.elementId,
      elementName: el?.name ?? 'Autres',
      measure: ex.measure,
      bandId,
      bandName: bandId ? (bandsById.get(bandId)?.name ?? 'Élastique') : null,
      value: best.value,
      date: best.date,
      previousValue: baseline.value,
      previousDate: baseline.date,
      previousOrigin: baseline.origin,
    });
  }

  const elementSortOrder = (id: ID | null) => (id ? (elementsById.get(id)?.order ?? 999) : 1000);
  const bandSortOrder = (id: ID | null) => {
    if (id === null) return -1;
    // Du moins assistant au plus assistant (ordre décroissant de `band.order`).
    return 1000 - (bandsById.get(id)?.order ?? 0);
  };
  beatenRecords.sort(
    (a, b) =>
      elementSortOrder(a.elementId) - elementSortOrder(b.elementId) ||
      (exercisesById.get(a.exerciseId)?.order ?? 0) - (exercisesById.get(b.exerciseId)?.order ?? 0) ||
      a.exerciseName.localeCompare(b.exerciseName) ||
      bandSortOrder(a.bandId) - bandSortOrder(b.bandId),
  );

  // --- Séries en progression inférieure ---
  const lowerMap = new Map<string, LowerProgressionRow>();
  for (const session of periodSessions) {
    const itemsById = new Map<ID, PrescriptionItem>((session.templateSnapshot?.items ?? []).map((i) => [i.id, i]));
    if (itemsById.size === 0) continue;
    const sessionGroups = new Map<string, (number | null)[]>();
    for (const set of setsBySession.get(session.id) ?? []) {
      if (set.kind === 'warmup' || !set.itemId) continue;
      const item = itemsById.get(set.itemId);
      if (!item?.lowerProgressionIds?.includes(set.exerciseId)) continue;
      const ex = exercisesById.get(set.exerciseId);
      if (!ex) continue;
      const replacedNames = item.candidateExerciseIds
        .map((id) => exercisesById.get(id)?.name)
        .filter((n): n is string => Boolean(n));
      const replacedLabel =
        replacedNames.join(' / ') || item.candidatesText || elementsById.get(item.elementId)?.name || 'Figure';
      const key = `${ex.id}|${replacedLabel}`;
      let row = lowerMap.get(key);
      if (!row) {
        row = {
          exerciseId: ex.id,
          exerciseName: ex.name,
          measure: ex.measure,
          replacedLabel,
          totalSets: 0,
          bestCleanValue: null,
          sessions: [],
        };
        lowerMap.set(key, row);
      }
      row.totalSets += 1;
      if (countsForRecord(set) && ex.measure !== 'none') {
        const v = set.value as number;
        row.bestCleanValue = row.bestCleanValue === null ? v : Math.max(row.bestCleanValue, v);
      }
      const vals = sessionGroups.get(key);
      if (vals) vals.push(set.value);
      else sessionGroups.set(key, [set.value]);
    }
    const pLabel = periodLabelBySession.get(session.id) ?? '';
    const sName = sessionDisplayName(session, templatesById);
    for (const [key, values] of sessionGroups) {
      lowerMap.get(key)?.sessions.push({ date: session.date, periodLabel: pLabel, sessionName: sName, values });
    }
  }
  const lowerProgressions = [...lowerMap.values()];

  // --- Écarts de rythme / séances sautées / séances remplacées ---
  const trainingGaps =
    phase !== 'upcoming' && isSequence
      ? computeTrainingGaps(
          doneSessions.map((s) => s.date),
          startDate,
          endDate,
        )
      : [];

  const trancheRhythms: TrancheRhythm[] = isSequence
    ? internalPeriods.map((p) => ({
        label: p.label,
        isDeload: p.isDeload,
        partial: p.partial,
        eveningDone: p.eveningDone,
        eveningPlanned: p.eveningPlanned,
        morningDone: p.morningDone,
        fromDate: p.fromDate,
        toDate: p.toDate,
        spanDays: p.fromDate && p.toDate ? diffDays(p.fromDate, p.toDate) + 1 : null,
      }))
    : [];

  const missedSlots: MissedSlotRow[] = [];
  const replacedSlots: ReplacedSlotRow[] = [];

  if (phase !== 'upcoming') {
    if (isSequence) {
      for (const session of doneSessions) {
        if (session.moment !== 'evening' || session.expressMinutes !== null) continue;
        const idx = seqState.indexOf.get(session.id);
        if (idx === undefined || evenings.length === 0) continue;
        const plannedId = evenings[idx % evenings.length];
        const planned = templatesById.get(plannedId);
        if (planned && session.templateId !== planned.id) {
          const posInTranche = (idx % evenings.length) + 1;
          replacedSlots.push({
            date: session.date,
            periodLabel: periodLabelBySession.get(session.id) ?? '',
            slotLabel: `séance ${posInTranche}/${evenings.length}`,
            plannedName: planned.name,
            doneName: sessionDisplayName(session, templatesById),
          });
        }
      }
    } else {
      const cutoffDate = phase === 'past' && window.end !== null ? window.end : today;
      for (const p of internalPeriods) {
        if (p.absoluteWeek === null) continue;
        const days = weekProgress(p.absoluteWeek, cutoffDate, settings, templatesById, periodSessions);
        for (const day of days) {
          if (day.date < startDate || day.date > endDate) continue;
          for (const moment of ['morning', 'evening'] as const) {
            const slot = day.slots[moment];
            if ((slot.status === 'missed' || slot.status === 'skipped') && slot.planned) {
              missedSlots.push({
                date: day.date,
                periodLabel: p.label,
                seqDay: day.seqDay,
                moment,
                templateName: slot.planned.name,
                optional: slot.status === 'skipped',
              });
            }
            if (slot.status === 'done' && slot.planned) {
              for (const s of slot.sessions) {
                if (s.status === 'done' && s.expressMinutes === null && s.templateId !== slot.planned.id) {
                  replacedSlots.push({
                    date: s.date,
                    periodLabel: p.label,
                    slotLabel: `J${day.seqDay} ${moment === 'morning' ? 'matin' : 'soir'}`,
                    plannedName: slot.planned.name,
                    doneName: sessionDisplayName(s, templatesById),
                  });
                }
              }
            }
          }
        }
      }
    }
  }

  // --- Séances abandonnées et séances express ---
  const abandonedSessions: AbandonedSessionRow[] = periodSessions
    .filter((s) => s.status === 'abandoned')
    .map((s) => ({
      sessionId: s.id,
      date: s.date,
      periodLabel: periodLabelBySession.get(s.id) ?? '',
      moment: s.moment,
      name: sessionDisplayName(s, templatesById),
      setsDone: (setsBySession.get(s.id) ?? []).length,
      durationSec: sessionDurationSec(s),
      note: s.note.trim(),
    }));

  const expressSessions: ExpressSessionRow[] = periodSessions
    .filter((s) => s.expressMinutes !== null)
    .map((s) => {
      const name = sessionDisplayName(s, templatesById);
      const replaced = s.templateId ? (templatesById.get(s.templateId)?.name ?? null) : null;
      return {
        sessionId: s.id,
        date: s.date,
        periodLabel: periodLabelBySession.get(s.id) ?? '',
        moment: s.moment,
        expressMinutes: s.expressMinutes as number,
        name,
        replacedName: replaced,
        setsDone: (setsBySession.get(s.id) ?? []).filter((x) => x.kind !== 'warmup').length,
        durationSec: sessionDurationSec(s),
        abandoned: s.status === 'abandoned',
      };
    });

  // --- Séries dégradées, séries à l'échec et notes ---
  const degradedLines: MarkedLineRow[] = [];
  const failureLines: MarkedLineRow[] = [];
  const sessionNotes: NoteEntry[] = [];

  for (const session of periodSessions) {
    const pLabel = periodLabelBySession.get(session.id) ?? '';
    const sName = sessionDisplayName(session, templatesById);
    if (session.note.trim()) {
      sessionNotes.push({
        kind: 'session',
        date: session.date,
        periodLabel: pLabel,
        sessionName: sName,
        exerciseName: null,
        setLabel: null,
        value: null,
        measure: null,
        bandName: null,
        text: session.note.trim(),
      });
    }
    const lines = sessionLines(setsBySession.get(session.id) ?? []);
    for (const line of lines) {
      const ex = exercisesById.get(line.exerciseId);
      const measure: Measure = ex?.measure ?? 'reps';
      const exName = ex?.name ?? 'Exercice inconnu';
      const blockName = line.blockTypeId ? (blocksById.get(line.blockTypeId)?.name ?? '') : '';
      let workIdx = 0;
      const degraded: MarkedSetDetail[] = [];
      const failures: MarkedSetDetail[] = [];
      for (const set of line.sets) {
        const label = set.kind === 'warmup' ? 'E' : String(++workIdx);
        const bandName = set.bandId ? (bandsById.get(set.bandId)?.name ?? null) : null;
        const detail: MarkedSetDetail = {
          label,
          value: set.value,
          bandName,
          rpe: set.rpe,
          note: set.note.trim(),
        };
        if (set.quality === 'degraded') degraded.push(detail);
        if (set.kind === 'failure') failures.push(detail);
        if (set.note.trim()) {
          sessionNotes.push({
            kind: 'set',
            date: session.date,
            periodLabel: pLabel,
            sessionName: sName,
            exerciseName: exName,
            setLabel: label,
            value: set.value,
            measure,
            bandName,
            text: set.note.trim(),
          });
        }
      }
      if (degraded.length > 0) {
        degradedLines.push({
          date: session.date,
          periodLabel: pLabel,
          sessionName: sName,
          blockName,
          exerciseName: exName,
          measure,
          workSetCount: workIdx,
          markedSets: degraded,
        });
      }
      if (failures.length > 0) {
        failureLines.push({
          date: session.date,
          periodLabel: pLabel,
          sessionName: sName,
          blockName,
          exerciseName: exName,
          measure,
          workSetCount: workIdx,
          markedSets: failures,
        });
      }
    }
  }

  return {
    programId: program.id,
    programName: program.name,
    phase,
    schedule: program.schedule,
    startDate,
    endDate,
    today,
    cycleLength: program.cycleLengthWeeks,
    deloadWeek: program.deloadWeek,
    deloadReductionPct: program.deloadReductionPct,
    hideMorningsInDeload: program.hideMorningsInDeload,
    sequenceLength: evenings.length,
    morningPlannedCount: mornings.length,
    notes: program.notes.trim(),
    counts: {
      eveningDone: doneSessions.filter((s) => s.moment === 'evening').length,
      morningDone: doneSessions.filter((s) => s.moment === 'morning').length,
      expressDone: doneSessions.filter((s) => s.expressMinutes !== null).length,
      abandoned: abandonedSessions.length,
      inProgress: inProgressCount,
    },
    periods: internalPeriods.map(({ sessionIds: _ids, ...rest }) => {
      void _ids;
      return rest;
    }),
    componentVolume,
    skillVolume,
    objectives,
    formerObjectivesTested,
    beatenRecords,
    lowerProgressions,
    trainingGaps,
    trancheRhythms,
    missedSlots,
    replacedSlots,
    abandonedSessions,
    expressSessions,
    degradedLines,
    failureLines,
    sessionNotes,
  };
}
