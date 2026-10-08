// Mode séance : enchaînement des lignes (alternance planche / FL, superset), série proposée,
// exercice par défaut, dernière performance et pré-remplissage de la saisie.
import type { DayInfo } from './cycle';
import { deloadTemplate } from './deload';
import type {
  BlockType,
  Element,
  Exercise,
  ID,
  Measure,
  Moment,
  PrescriptionItem,
  SessionLog,
  SessionResume,
  SessionTemplate,
  SessionType,
  SetDraft,
  SetLog,
  Settings,
  Target,
} from './types';

/** `alternate` : skills appariés par ordre ; `superset` : lignes consécutives marquées superset. */
export type UnitMode = 'single' | 'alternate' | 'superset';

/** Lignes qui s'enchaînent série par série. */
export interface PlanUnit {
  mode: UnitMode;
  itemIds: ID[];
}

export interface PlanBlock {
  blockTypeId: ID;
  items: PrescriptionItem[];
  units: PlanUnit[];
}

export interface SessionPlan {
  blocks: PlanBlock[];
  /** Lignes dans l'ordre de la séance. */
  items: PrescriptionItem[];
  itemsById: Map<ID, PrescriptionItem>;
  units: PlanUnit[];
  unitOf: Map<ID, PlanUnit>;
}

/** Lignes triées par ordre des blocs (paramétrable), l'ordre du modèle étant gardé dans un bloc. */
export function sortItemsByBlock(items: readonly PrescriptionItem[], blocksById: ReadonlyMap<ID, BlockType>): PrescriptionItem[] {
  const order = (item: PrescriptionItem) => blocksById.get(item.blockTypeId)?.order ?? Number.MAX_SAFE_INTEGER;
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => order(a.item) - order(b.item) || a.index - b.index)
    .map(({ item }) => item);
}

function blockUnits(items: readonly PrescriptionItem[], block: BlockType | undefined, elementsById: ReadonlyMap<ID, Element>): PlanUnit[] {
  const units: PlanUnit[] = [];
  // k-ième ligne de chaque skill → k-ième paire (1re planche avec 1re FL, 2e avec 2e…).
  const pairs: PlanUnit[] = [];
  const lineCount = new Map<ID, number>();
  let superset: PlanUnit | null = null;
  for (const item of items) {
    const isSkill = elementsById.get(item.elementId)?.kind === 'skill';
    if (block?.alternateSkills && isSkill) {
      superset = null;
      const k = lineCount.get(item.elementId) ?? 0;
      lineCount.set(item.elementId, k + 1);
      if (!pairs[k]) {
        pairs[k] = { mode: 'alternate', itemIds: [] };
        units.push(pairs[k]);
      }
      pairs[k].itemIds.push(item.id);
    } else if (item.superset) {
      if (!superset) {
        superset = { mode: 'superset', itemIds: [] };
        units.push(superset);
      }
      superset.itemIds.push(item.id);
    } else {
      superset = null;
      units.push({ mode: 'single', itemIds: [item.id] });
    }
  }
  for (const unit of units) if (unit.itemIds.length === 1) unit.mode = 'single';
  return units;
}

export function buildPlan(
  template: Pick<SessionTemplate, 'items'>,
  blocksById: ReadonlyMap<ID, BlockType>,
  elementsById: ReadonlyMap<ID, Element>,
): SessionPlan {
  const items = sortItemsByBlock(template.items, blocksById);
  const blocks: PlanBlock[] = [];
  for (const item of items) {
    const last = blocks.at(-1);
    if (last && last.blockTypeId === item.blockTypeId) last.items.push(item);
    else blocks.push({ blockTypeId: item.blockTypeId, items: [item], units: [] });
  }
  for (const group of blocks) group.units = blockUnits(group.items, blocksById.get(group.blockTypeId), elementsById);
  const units = blocks.flatMap((b) => b.units);
  const unitOf = new Map<ID, PlanUnit>();
  for (const unit of units) for (const id of unit.itemIds) unitOf.set(id, unit);
  return { blocks, items, itemsById: new Map(items.map((i) => [i.id, i])), units, unitOf };
}

export interface ItemProgress {
  /** Séries faites sur la ligne. */
  done: number;
  /** Ligne terminée (ou passée) avant ses séries max. */
  closed: boolean;
}

export function progressOf(sets: readonly SetLog[], closedItems: readonly ID[]): Map<ID, ItemProgress> {
  const progress = new Map<ID, ItemProgress>();
  for (const id of closedItems) progress.set(id, { done: 0, closed: true });
  for (const set of sets) {
    if (!set.itemId) continue;
    const p = progress.get(set.itemId) ?? { done: 0, closed: false };
    progress.set(set.itemId, { ...p, done: p.done + 1 });
  }
  return progress;
}

export function isItemComplete(item: PrescriptionItem, p: ItemProgress | undefined): boolean {
  return (p?.closed ?? false) || (p?.done ?? 0) >= item.setsMax;
}

export type ItemStatus = 'todo' | 'started' | 'min_reached' | 'done' | 'skipped';

export function itemStatus(item: PrescriptionItem, p: ItemProgress | undefined): ItemStatus {
  const done = p?.done ?? 0;
  if (done >= item.setsMax && item.setsMax > 0) return 'done';
  if (p?.closed || item.setsMax <= 0) return done > 0 ? 'done' : 'skipped';
  if (done === 0) return 'todo';
  return done >= item.setsMin ? 'min_reached' : 'started';
}

/** Dans une unité, la ligne inachevée qui a le moins de séries ; à égalité, la première. */
function pickInUnit(unit: PlanUnit, plan: SessionPlan, progress: ReadonlyMap<ID, ItemProgress>): ID | null {
  let best: ID | null = null;
  let bestDone = Number.POSITIVE_INFINITY;
  for (const id of unit.itemIds) {
    const item = plan.itemsById.get(id);
    const p = progress.get(id);
    if (!item || isItemComplete(item, p)) continue;
    const done = p?.done ?? 0;
    if (done < bestDone) {
      best = id;
      bestDone = done;
    }
  }
  return best;
}

/**
 * Série proposée : on reste dans l'unité de la ligne en cours tant qu'elle n'est pas finie
 * (planche puis FL puis planche…), sinon la première unité inachevée de la séance.
 * `null` : toutes les séries prévues sont faites.
 */
export function proposeNext(plan: SessionPlan, progress: ReadonlyMap<ID, ItemProgress>, currentItemId: ID | null = null): ID | null {
  const current = currentItemId ? plan.unitOf.get(currentItemId) : undefined;
  if (current) {
    const id = pickInUnit(current, plan, progress);
    if (id) return id;
  }
  for (const unit of plan.units) {
    const id = pickInUnit(unit, plan, progress);
    if (id) return id;
  }
  return null;
}

/** Exercices proposés pour une ligne ; le matin, les exercices rapides en tête. */
export function itemCandidates(
  item: PrescriptionItem,
  exercises: readonly Exercise[],
  moment: Moment,
  keepIds: readonly ID[] = [],
): Exercise[] {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  let list = item.candidateExerciseIds
    .map((id) => byId.get(id))
    .filter((e): e is Exercise => e !== undefined && (e.active || keepIds.includes(e.id)));
  if (list.length === 0) list = exercises.filter((e) => e.active && e.elementId === item.elementId);
  if (moment === 'morning') list = [...list.filter((e) => e.quick), ...list.filter((e) => !e.quick)];
  return list;
}

/**
 * Exercice proposé par défaut pour une ligne :
 * 1. ligne déjà commencée : l'exercice de sa dernière série ;
 * 2. un candidat fait plus tôt dans la séance (« même combo qu'au bloc skill ») ; s'il y en a plusieurs,
 *    celui de la dernière fois sur la ligne, sinon le plus récent ;
 * 3. l'exercice fait la dernière fois sur cette ligne (même bloc, parmi les candidats) ;
 * 4. le premier candidat.
 */
export function defaultExerciseId(
  item: PrescriptionItem,
  candidateIds: readonly ID[],
  sessionSets: readonly SetLog[],
  history: readonly SetLog[],
): ID | null {
  if (candidateIds.length === 0) return null;
  const candidates = new Set(candidateIds);
  for (let i = sessionSets.length - 1; i >= 0; i--) {
    if (sessionSets[i].itemId === item.id && candidates.has(sessionSets[i].exerciseId)) return sessionSets[i].exerciseId;
  }
  let lastOnLine: ID | null = null;
  let lastAnywhere: ID | null = null;
  for (let i = history.length - 1; i >= 0 && lastOnLine === null; i--) {
    const set = history[i];
    if (!candidates.has(set.exerciseId)) continue;
    if (set.blockTypeId === item.blockTypeId) lastOnLine = set.exerciseId;
    else lastAnywhere ??= set.exerciseId;
  }
  const doneHere: ID[] = [];
  for (let i = sessionSets.length - 1; i >= 0; i--) {
    const id = sessionSets[i].exerciseId;
    if (candidates.has(id) && !doneHere.includes(id)) doneHere.push(id);
  }
  if (doneHere.length === 1) return doneHere[0];
  if (doneHere.length > 1) return lastOnLine && doneHere.includes(lastOnLine) ? lastOnLine : doneHere[0];
  return lastOnLine ?? lastAnywhere ?? candidateIds[0];
}

export interface LastPerformance {
  sessionId: ID;
  date: string;
  /** Séries faites dans le même bloc ; sinon, dans un autre bloc (`blockTypeId`). */
  sameBlock: boolean;
  blockTypeId: ID | null;
  sets: SetLog[];
}

/**
 * Dernière performance sur un exercice, hors séance en cours : la dernière séance où il a été fait
 * dans le même bloc (le skill sans élastique ne se compare pas au skill assisté), sinon dans un autre bloc.
 * `history` : séries des autres séances, dans l'ordre chronologique.
 */
export function lastPerformance(
  exerciseId: ID,
  blockTypeId: ID | null,
  history: readonly SetLog[],
  sessionsById: ReadonlyMap<ID, Pick<SessionLog, 'date'>>,
): LastPerformance | null {
  let sameBlock: SetLog | null = null;
  let otherBlock: SetLog | null = null;
  for (let i = history.length - 1; i >= 0 && !sameBlock; i--) {
    const set = history[i];
    if (set.exerciseId !== exerciseId) continue;
    if (set.blockTypeId === blockTypeId) sameBlock = set;
    else otherBlock ??= set;
  }
  const ref = sameBlock ?? otherBlock;
  if (!ref) return null;
  return {
    sessionId: ref.sessionId,
    date: sessionsById.get(ref.sessionId)?.date ?? '',
    sameBlock: sameBlock !== null,
    blockTypeId: ref.blockTypeId,
    sets: history.filter((s) => s.sessionId === ref.sessionId && s.exerciseId === exerciseId && s.blockTypeId === ref.blockTypeId),
  };
}

/** Cible de la ligne dans l'unité de l'exercice (« 8-12 s ou 3-5 reps » : secondes pour un hold). */
export function targetFor(item: Pick<PrescriptionItem, 'targets'>, measure: Measure): Target | null {
  if (measure === 'none') return null;
  return item.targets.find((t) => t.unit === measure) ?? (item.targets.length === 1 ? item.targets[0] : null);
}

/**
 * Saisie pré-remplie : la série précédente de la ligne sur le même exercice ; sinon la 1re série
 * de la dernière performance ; sinon le bas de la cible. Qualité « propre » par défaut sur un skill.
 */
export function prefillDraft(args: {
  item: PrescriptionItem;
  exercise: Exercise;
  isSkill: boolean;
  /** Séries de la ligne dans cette séance. */
  itemSets: readonly SetLog[];
  last: LastPerformance | null;
}): SetDraft {
  const { item, exercise, itemSets, last } = args;
  const measured = exercise.measure !== 'none';
  const quality = args.isSkill ? 'clean' : null;
  const previous = itemSets.filter((s) => s.exerciseId === exercise.id).at(-1);
  if (previous) return { value: measured ? previous.value : null, bandId: previous.bandId, rpe: previous.rpe, quality, note: '' };
  const ref = last?.sets[0];
  if (ref) return { value: measured ? ref.value : null, bandId: ref.bandId, rpe: null, quality, note: '' };
  const target = targetFor(item, exercise.measure);
  return { value: measured ? (target?.min ?? target?.max ?? null) : null, bandId: null, rpe: null, quality, note: '' };
}

export function emptyResume(): SessionResume {
  return { activeItemId: null, chosenExercise: {}, closedItems: [], drafts: {}, rest: null, hold: null };
}

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** État de reprise relu de la base, complété si un champ manque. */
export function readResume(raw: unknown): SessionResume {
  const base = emptyResume();
  if (!isRecord(raw)) return base;
  return {
    activeItemId: typeof raw.activeItemId === 'string' ? raw.activeItemId : null,
    chosenExercise: isRecord(raw.chosenExercise) ? (raw.chosenExercise as Record<ID, ID>) : {},
    closedItems: Array.isArray(raw.closedItems) ? raw.closedItems.filter((x): x is ID => typeof x === 'string') : [],
    drafts: isRecord(raw.drafts) ? (raw.drafts as SessionResume['drafts']) : {},
    rest: isRecord(raw.rest) ? (raw.rest as unknown as SessionResume['rest']) : null,
    hold: isRecord(raw.hold) ? (raw.hold as unknown as SessionResume['hold']) : null,
  };
}

/**
 * Nouvelle séance à partir d'un modèle : copie figée du modèle tel qu'il se pratique ce jour-là
 * (séries réduites en semaine allégée, lignes dans l'ordre des blocs).
 */
export function newSessionLog(args: {
  id: ID;
  template: SessionTemplate;
  sessionType: SessionType | undefined;
  info: DayInfo;
  blocksById: ReadonlyMap<ID, BlockType>;
  settings: Pick<Settings, 'deloadReductionPct'>;
  now: number;
}): SessionLog {
  const { template, info } = args;
  const practiced = info.isDeload ? deloadTemplate(template, args.blocksById, args.settings) : template;
  const snapshot: SessionTemplate = structuredClone({ ...practiced, items: sortItemsByBlock(practiced.items, args.blocksById) });
  return {
    id: args.id,
    date: info.date,
    week: info.week,
    cycleWeek: info.cycleWeek,
    seqDay: info.seqDay,
    moment: template.moment,
    templateId: template.id,
    templateSnapshot: snapshot,
    sessionTypeId: template.sessionTypeId || null,
    sessionTypeName: args.sessionType?.name ?? template.name,
    deload: info.isDeload,
    status: 'in_progress',
    startedAt: args.now,
    endedAt: null,
    note: '',
    source: 'app',
    resume: emptyResume(),
  };
}
