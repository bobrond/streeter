// Séance express de 20, 30 ou 45 min : elle remplace une séance du jour, matin ou soir. Règles décidées avec
// l'utilisateur (CLAUDE.md, « Aujourd'hui et séance express ») ; la fatigue de la veille n'entre pas en compte.
import { practicedTemplate } from './deload';
import { estimateDuration, type PlanStructure } from './duration';
import { FLOOR_VICTORIAN_TARGETS, isExerciseCompatible, isFloorVictorian } from './equipment';
import { formatTarget } from './labels';
import { buildPlan, sortItemsByBlock } from './session';
import type {
  BlockType,
  Equipment,
  Exercise,
  ID,
  Moment,
  PrescriptionItem,
  SessionLog,
  SessionTemplate,
  SetLog,
  Settings,
  Target,
  TargetUnit,
} from './types';
import { EQUIPMENTS } from './types';
import {
  componentBounds,
  componentElements,
  plannedComponentVolume,
  programSlots,
  realizedComponentVolume,
  remainingEveningSets,
  type PlanContext,
  type VolumeSettings,
} from './volume';
import type { PeriodView } from './period';
import type { DayProgress } from './week';

export const EXPRESS_MINUTES = [20, 30, 45] as const;

/**
 * Rôle d'un bloc dans la séance express, d'après ses réglages et non d'après son nom (modifiable) :
 * l'échauffement n'est pas réduit en semaine allégée ; le Skill est le premier bloc à alternance planche / FL,
 * les suivants (Skill assisté) ne sont jamais repris ; un bloc sans alternance placé avant le Skill est prioritaire
 * (Travail prioritaire : lean-up, négatives) ; les autres blocs portent le Renfo spé et les composantes. `used` : blocs
 * de la séance, pour trouver son Skill parmi eux (un ancien bloc à alternance absent de la séance ne compte pas).
 */
export type BlockRole = 'warmup' | 'priority' | 'skill' | 'assisted' | 'other';

export function blockRoles(blocks: ReadonlyMap<ID, BlockType>, used?: ReadonlySet<ID>): Map<ID, BlockRole> {
  const sorted = [...blocks.values()].sort((a, b) => a.order - b.order);
  const skill = sorted.find((b) => b.alternateSkills && b.reducedInDeload && (!used || used.has(b.id)));
  const role = (b: BlockType): BlockRole => {
    if (!b.reducedInDeload) return 'warmup';
    if (b.id === skill?.id) return 'skill';
    if (b.alternateSkills) return 'assisted';
    return skill && b.order < skill.order ? 'priority' : 'other';
  };
  return new Map(sorted.map((b): [ID, BlockRole] => [b.id, role(b)]));
}

/** Où en est une composante cette semaine, pour la séance express. */
export interface ComponentNeed {
  elementId: ID;
  name: string;
  /** Séries faites cette semaine, hors échauffement, soir et matin. */
  done: number;
  /** Séries du soir encore prévues cette semaine, hors séance remplacée. */
  remaining: number;
  /** Minimum visé : la borne basse ; en semaine allégée, les séries min allégées des soirs de la semaine type. */
  min: number;
  /** Maximum du bonus ; `null` en semaine allégée (pas de bonus). */
  max: number | null;
  /** Retard : minimum − séries faites − séries du soir encore prévues, jamais négatif. */
  deficit: number;
}

/**
 * Retard et marge de chaque composante. La séance remplacée ne compte plus dans les séries encore prévues :
 * c'est la séance express qui prend sa place.
 */
export function componentNeeds(args: {
  program: PlanContext;
  settings: VolumeSettings;
  /** Semaine, ou tranche en séquence. */
  period: Pick<PeriodView, 'kind' | 'sessionIds' | 'isDeload' | 'days'>;
  cycleWeek: number;
  sets: readonly SetLog[];
  sessions: ReadonlyMap<ID, SessionLog>;
  replaced: { date: string; moment: Moment };
}): ComponentNeed[] {
  const { program, settings, replaced } = args;
  const { isDeload } = args.period;
  const realized = realizedComponentVolume(args.sets, args.sessions, program.elements, settings, args.period);
  const doneOf = new Map(realized.map((r) => [r.elementId, r.total]));
  // En séquence, la séance remplacée est la prochaine à faire, quelle que soit sa date indicative.
  const isReplaced = (day: DayProgress) =>
    args.period.kind === 'tranche' ? replaced.moment === 'evening' && day.slots.evening.status === 'today' : day.date === replaced.date;
  const days = args.period.days.map((day) =>
    isReplaced(day) ? { ...day, slots: { ...day.slots, [replaced.moment]: { ...day.slots[replaced.moment], status: 'none' as const } } } : day,
  );
  const remaining = remainingEveningSets(days, args.sets, program.blocks, settings, { isDeload, cycleWeek: args.cycleWeek }).byElement;
  const planned = new Map(plannedComponentVolume(program, settings).map((p) => [p.elementId, p]));
  return componentElements(program.elements).map((element) => {
    const done = doneOf.get(element.id) ?? 0;
    const left = remaining.get(element.id) ?? 0;
    const bounds = componentBounds(settings, element.id);
    const min = isDeload ? (planned.get(element.id)?.deloadEveningGuaranteed ?? 0) : bounds.min;
    return {
      elementId: element.id,
      name: element.name,
      done,
      remaining: left,
      min,
      max: isDeload ? null : bounds.max,
      deficit: Math.max(0, min - done - left),
    };
  });
}

/** Pourquoi une ligne est dans la séance express. */
export type ExpressReason = 'warmup' | 'priority' | 'skill' | 'specific' | 'component';

export interface ExpressComponent extends ComponentNeed {
  /** Séries de la séance qui comblent le retard. */
  deficitSets: number;
  /** Séries en plus, jusqu'au maximum. */
  bonusSets: number;
  /** Ligne de la séance ; `null` : pas de place, matériel absent ou aucune ligne du programme pour cette composante. */
  itemId: ID | null;
  /** `true` si la composante avait une ligne ou des exercices au programme, mais aucun faisable avec le matériel coché. */
  noEquipment?: boolean;
}

/** Ligne de la séance remplacée laissée de côté : Skill assisté (jamais repris), faute de place ou faute de matériel. */
export interface ExpressLeftOut {
  item: PrescriptionItem;
  why: 'assisted' | 'time' | 'equipment';
}

export interface ExpressPlan {
  template: SessionTemplate;
  reasons: Record<ID, ExpressReason>;
  /** Lignes dont les exercices ont été adaptés en repli faute du matériel de la ligne d'origine. */
  adapted: Record<ID, boolean>;
  components: ExpressComponent[];
  leftOut: ExpressLeftOut[];
}

export type ExpressSettings = Pick<Settings, 'avgWorkSecPerSet' | 'freeRestSec' | 'deloadReductionPct'>;

const fixed = (item: PrescriptionItem, sets: number): PrescriptionItem => ({ ...item, setsMin: sets, setsMax: sets });

/** Séries reprises d'une ligne : son minimum ; pour une ligne sans minimum (plafond seul), 2 séries, sous le plafond. */
const baseSets = (item: PrescriptionItem): number => (item.setsMin > 0 ? item.setsMin : Math.min(2, item.setsMax));

/** Exercices actifs directement proposés par une ligne (ses candidats, sinon ceux de son élément). */
function directCandidates(item: PrescriptionItem, exercises: ReadonlyMap<ID, Exercise>): Exercise[] {
  const explicit = item.candidateExerciseIds
    .map((id) => exercises.get(id))
    .filter((e): e is Exercise => Boolean(e && e.active));
  if (explicit.length > 0) return explicit;
  return [...exercises.values()].filter((e) => e.active && e.elementId === item.elementId).sort((a, b) => a.order - b.order);
}

/** Restreint les candidats directs et progressions inférieures d'une ligne au matériel disponible ; `null` si plus rien ne passe. */
function filterItemDirect(
  item: PrescriptionItem,
  exercises: ReadonlyMap<ID, Exercise>,
  available: ReadonlySet<Equipment>,
): PrescriptionItem | null {
  const direct = directCandidates(item, exercises);
  if (direct.length === 0) return available.size > 0 ? item : null;
  const compat = direct.filter((e) => isExerciseCompatible(e, available));
  if (compat.length === 0) return null;
  const compatIds = new Set(compat.map((e) => e.id));
  const lower = item.lowerProgressionIds?.filter((id) => {
    if (compatIds.has(id)) return false;
    const ex = exercises.get(id);
    return Boolean(ex && ex.active && isExerciseCompatible(ex, available));
  });
  if (compat.length === direct.length && item.candidateExerciseIds.length > 0) {
    return lower && lower.length !== item.lowerProgressionIds?.length ? { ...item, lowerProgressionIds: lower } : item;
  }
  const units = new Set(compat.map((e) => e.measure).filter((m): m is TargetUnit => m !== 'none'));
  const keptTargets = item.targets.length > 1 ? item.targets.filter((t) => units.has(t.unit)) : item.targets;
  const nextTargets = keptTargets.length > 0 ? keptTargets : item.targets;
  const nextTargetText = nextTargets.length !== item.targets.length ? nextTargets.map(formatTarget).join(' ou ') : item.targetText;
  return {
    ...item,
    candidateExerciseIds: compat.map((e) => e.id),
    candidatesText: compat.length < direct.length ? compat.map((e) => e.name).join(' / ') : item.candidatesText,
    targets: nextTargets,
    targetText: nextTargetText,
    ...(lower !== undefined ? { lowerProgressionIds: lower } : {}),
  };
}

/** Cibles adaptées aux unités des exercices retenus en repli (Victorienne au sol : 8-15 s ou 8-10 reps). */
function fallbackTargets(
  picked: readonly { exercise: Exercise; donor: PrescriptionItem | null }[],
  item: PrescriptionItem,
  donorLines: readonly PrescriptionItem[],
): { targets: Target[]; targetText: string } {
  const fallback = picked.map((p) => p.exercise);
  const units = new Set(fallback.map((e) => e.measure).filter((m): m is TargetUnit => m !== 'none'));
  if (units.size === 0) return { targets: [], targetText: item.targetText || 'Au choix' };
  if (fallback.some(isFloorVictorian)) {
    const targets = FLOOR_VICTORIAN_TARGETS.filter((t) => units.has(t.unit));
    if (targets.length > 0) return { targets, targetText: targets.map(formatTarget).join(' ou ') };
  }
  const byUnit = new Map<TargetUnit, Target>();
  // Priorité à la cible de la ligne d'où provient chaque exercice retenu (ex. 5-8 reps du Renfo spé pour un PU surélevé).
  for (const { exercise, donor } of picked) {
    if (!donor || exercise.measure === 'none' || byUnit.has(exercise.measure)) continue;
    const match = donor.targets.find((t) => t.unit === exercise.measure);
    if (match) byUnit.set(exercise.measure, match);
  }
  for (const source of [item, ...donorLines]) {
    for (const t of source.targets) {
      if (units.has(t.unit) && !byUnit.has(t.unit)) byUnit.set(t.unit, t);
    }
  }
  const targets = [...byUnit.values()];
  if (targets.length === 0) return { targets: [], targetText: 'Au choix' };
  return { targets, targetText: targets.map(formatTarget).join(' ou ') };
}

/**
 * Repli d'une ligne Skill quand aucun de ses exercices directs n'est faisable avec le matériel coché :
 * progressions inférieures compatibles de la ligne, autres lignes non prioritaires du même élément dans la séance
 * (Renfo spé), puis exercices actifs compatibles de l'élément dans le catalogue (ex. Victorienne au sol pour Touch FL).
 */
function skillFallback(
  item: PrescriptionItem,
  sessionItems: readonly PrescriptionItem[],
  program: PlanContext,
  available: ReadonlySet<Equipment>,
): PrescriptionItem | null {
  const { exercises } = program;
  const picked: { exercise: Exercise; donor: PrescriptionItem | null }[] = [];
  const seen = new Set<ID>();
  const add = (ex: Exercise | undefined, donor: PrescriptionItem | null) => {
    if (!ex || !ex.active || seen.has(ex.id) || !isExerciseCompatible(ex, available)) return;
    seen.add(ex.id);
    picked.push({ exercise: ex, donor });
  };
  for (const id of item.lowerProgressionIds ?? []) add(exercises.get(id), item);
  const sameElementSessionLines = sessionItems.filter((other) => other.id !== item.id && other.elementId === item.elementId);
  for (const other of sameElementSessionLines) {
    for (const ex of directCandidates(other, exercises)) add(ex, other);
    for (const id of other.lowerProgressionIds ?? []) add(exercises.get(id), other);
  }
  const catalog = [...exercises.values()]
    .filter((e) => e.active && e.elementId === item.elementId)
    .sort((a, b) => a.order - b.order);
  for (const ex of catalog) add(ex, null);
  if (picked.length === 0) return null;
  const programLines = programSlots(program).flatMap((s) => {
    const slotRoles = blockRoles(program.blocks, new Set(s.template.items.map((i) => i.blockTypeId)));
    return s.template.items.filter((i) => {
      const r = slotRoles.get(i.blockTypeId) ?? 'other';
      return i.elementId === item.elementId && r !== 'priority' && r !== 'assisted';
    });
  });
  const { targets, targetText } = fallbackTargets(picked, item, [...sameElementSessionLines, ...programLines]);
  return {
    ...item,
    candidateExerciseIds: picked.map((p) => p.exercise.id),
    candidatesText: picked.map((p) => p.exercise.name).join(' / '),
    targets,
    targetText,
    lowerProgressionIds: [],
  };
}

/**
 * Ligne du programme qui sert de modèle à une composante (exercices, cible, intensité, repos) : celle de la séance
 * remplacée, sinon celle d'un soir de la semaine type, sinon celle d'un matin ; une ligne obligatoire d'abord.
 * Restreinte au matériel disponible ; en dernier recours, exercices actifs compatibles de la composante au catalogue.
 */
function componentSource(
  elementId: ID,
  replaced: SessionTemplate,
  program: PlanContext,
  available: ReadonlySet<Equipment>,
): { item: PrescriptionItem; adapted: boolean } | null {
  const slots = programSlots(program);
  const ordered = [
    replaced,
    ...slots.filter((s) => s.moment === 'evening').map((s) => s.template),
    ...slots.filter((s) => s.moment === 'morning').map((s) => s.template),
  ];
  const allLines: PrescriptionItem[] = [];
  for (const template of ordered) {
    const mandatory = template.items.filter((i) => i.elementId === elementId && !i.optional);
    const optional = template.items.filter((i) => i.elementId === elementId && i.optional);
    for (const line of [...mandatory, ...optional]) {
      allLines.push(line);
      const filtered = filterItemDirect(line, program.exercises, available);
      if (filtered) return { item: filtered, adapted: false };
    }
  }
  const baseLine = allLines[0];
  if (!baseLine) return null;
  const compatCatalog = [...program.exercises.values()]
    .filter((e) => e.active && e.elementId === elementId && isExerciseCompatible(e, available))
    .sort((a, b) => a.order - b.order);
  if (compatCatalog.length === 0) return null;
  const { targets, targetText } = fallbackTargets(
    compatCatalog.map((exercise) => ({ exercise, donor: null })),
    baseLine,
    allLines,
  );
  return {
    item: {
      ...baseLine,
      candidateExerciseIds: compatCatalog.map((e) => e.id),
      candidatesText: compatCatalog.map((e) => e.name).join(' / '),
      targets,
      targetText,
      lowerProgressionIds: [],
    },
    adapted: true,
  };
}

/**
 * Séance express (règles décidées avec l'utilisateur) :
 * 1. l'échauffement de la séance remplacée, au minimum de séries (exercices faisables avec le matériel disponible) ;
 * 2. son Travail prioritaire (bloc sans alternance avant le Skill), au minimum de séries, uniquement si son matériel
 *    est disponible (parallèles : pas de repli, retiré sinon) ;
 * 3. ses paires du Skill dans l'ordre, au minimum de séries, avec repli vers d'autres exercices compatibles de
 *    l'élément si besoin (au sol : adv tuck / straddle / surélevés en planche, Victorienne au sol en Touch FL) ;
 *    la dernière paire qui rentre peut perdre des séries (au moins 2), les suivantes sont retirées ; la première est
 *    toujours là tant que le matériel le permet ;
 * 4. son Renfo spé (lignes planche / FL des autres blocs, non absorbées en repli Skill), en entier, si tout le Skill
 *    compatible est là et qu'il rentre : il est retiré avant de raccourcir le Skill ;
 * 5. jamais le Skill assisté ;
 * 6. les composantes en retard compatibles avec le matériel, la plus en retard d'abord, série par série ; puis le
 *    bonus jusqu'au maximum (pas en semaine allégée).
 * Les lignes gardent la prescription de la séance remplacée (allégée en semaine allégée), avec un nombre de séries
 * fixe. La durée se remplit avec la borne haute de l'estimation : repos maximum, exercice le plus long.
 */
export function buildExpress(args: {
  minutes: number;
  /** Séance du jour remplacée, telle que dans la semaine type, avec les composantes de son créneau (avant allégement). */
  replaced: SessionTemplate;
  name: string;
  isDeload: boolean;
  /** Tranche (ou semaine) du cycle : valeurs de la tranche. */
  cycleWeek: number;
  program: PlanContext;
  settings: ExpressSettings;
  needs: readonly ComponentNeed[];
  /** Matériel disponible ; absent : tout le matériel (`EQUIPMENTS`). */
  equipment?: ReadonlySet<Equipment>;
  newId: () => ID;
}): ExpressPlan {
  const { program, settings } = args;
  const available = args.equipment ?? new Set(EQUIPMENTS);
  const allEquipment = new Set(EQUIPMENTS);
  const budget = args.minutes * 60;
  const elements = new Map(program.elements.map((e) => [e.id, e]));
  const structure: PlanStructure = { blocks: program.blocks, elements, exercises: program.exercises };
  const cost = (items: PrescriptionItem[]) => estimateDuration({ items }, settings, structure).maxSec;
  const roles = blockRoles(program.blocks, new Set(args.replaced.items.map((i) => i.blockTypeId)));
  const roleOf = (item: PrescriptionItem) => roles.get(item.blockTypeId) ?? 'other';
  const isSkill = (item: PrescriptionItem) => elements.get(item.elementId)?.kind === 'skill';

  const practiced = practicedTemplate(args.replaced, { isDeload: args.isDeload, cycleWeek: args.cycleWeek }, program.blocks, settings);
  const plan = buildPlan(practiced, program.blocks, elements);
  const skillDonorItems = plan.items.filter((i) => roleOf(i) !== 'assisted' && roleOf(i) !== 'priority');
  const chosen: PrescriptionItem[] = [];
  const reasons: Record<ID, ExpressReason> = {};
  const adapted: Record<ID, boolean> = {};
  const leftOut: ExpressLeftOut[] = [];
  let used = 0;
  const take = (items: PrescriptionItem[], reason: ExpressReason) => {
    if (items.length === 0) return;
    for (const item of items) {
      chosen.push(item);
      reasons[item.id] = reason;
    }
    used += cost(items);
  };

  // 1. Échauffement (filtré par matériel).
  const warmupItems: PrescriptionItem[] = [];
  for (const raw of plan.items.filter((i) => roleOf(i) === 'warmup' && baseSets(i) > 0)) {
    const filtered = filterItemDirect(raw, program.exercises, available);
    if (filtered) warmupItems.push(fixed(filtered, baseSets(filtered)));
    else leftOut.push({ item: raw, why: 'equipment' });
  }
  take(warmupItems, 'warmup');

  // 2. Travail prioritaire : toujours repris au minimum de séries si son matériel est disponible, retiré sans repli sinon.
  const priorityItems: PrescriptionItem[] = [];
  for (const raw of plan.items.filter((i) => roleOf(i) === 'priority' && baseSets(i) > 0)) {
    const filtered = filterItemDirect(raw, program.exercises, available);
    if (filtered) priorityItems.push(fixed(filtered, baseSets(filtered)));
    else leftOut.push({ item: raw, why: 'equipment' });
  }
  take(priorityItems, 'priority');

  // 3. Paires du Skill (avec repli par élément si le matériel direct manque, au plus une ligne de repli par élément).
  let shortened = false;
  let keptSkillUnits = 0;
  const absorbedElements = new Set<ID>();
  const rawSkillUnits = plan.units
    .map((unit) => unit.itemIds.map((id) => plan.itemsById.get(id)!).filter((i) => roleOf(i) === 'skill' && isSkill(i) && baseSets(i) > 0))
    .filter((items) => items.length > 0);
  for (const rawItems of rawSkillUnits) {
    const unitItems: PrescriptionItem[] = [];
    for (const raw of rawItems) {
      const direct = filterItemDirect(raw, program.exercises, available);
      if (direct) {
        unitItems.push(direct);
        continue;
      }
      if (absorbedElements.has(raw.elementId)) {
        leftOut.push({ item: raw, why: 'equipment' });
        continue;
      }
      const fb = skillFallback(raw, skillDonorItems, program, available);
      if (fb) {
        absorbedElements.add(raw.elementId);
        adapted[fb.id] = true;
        unitItems.push(fb);
      } else {
        leftOut.push({ item: raw, why: 'equipment' });
      }
    }
    if (unitItems.length === 0) continue;
    const isFirstCompatibleUnit = keptSkillUnits === 0;
    keptSkillUnits++;
    if (shortened) {
      leftOut.push(...unitItems.map((item) => ({ item, why: 'time' as const })));
      continue;
    }
    const full = unitItems.map((i) => fixed(i, baseSets(i)));
    if (used + cost(full) <= budget) {
      take(full, 'skill');
      continue;
    }
    shortened = true;
    const rounds = Math.max(...unitItems.map(baseSets));
    const floor = Math.min(2, rounds);
    const cut = (r: number) => unitItems.map((i) => fixed(i, Math.min(baseSets(i), r)));
    let fitted: PrescriptionItem[] | null = null;
    for (let r = rounds - 1; r >= floor && !fitted; r--) if (used + cost(cut(r)) <= budget) fitted = cut(r);
    if (!fitted && isFirstCompatibleUnit) fitted = cut(floor);
    if (fitted) take(fitted, 'skill');
    else leftOut.push(...unitItems.map((item) => ({ item, why: 'time' as const })));
  }

  // 4. Renfo spé (sans dupliquer un élément déjà absorbé en repli Skill), 5. Skill assisté.
  const specific: PrescriptionItem[] = [];
  for (const raw of plan.items.filter((i) => roleOf(i) === 'other' && isSkill(i) && baseSets(i) > 0)) {
    if (absorbedElements.has(raw.elementId)) continue;
    const filtered = filterItemDirect(raw, program.exercises, available);
    if (filtered) specific.push(fixed(filtered, baseSets(filtered)));
    else leftOut.push({ item: raw, why: 'equipment' });
  }
  if (specific.length > 0 && !shortened && used + cost(specific) <= budget) take(specific, 'specific');
  else leftOut.push(...specific.map((item) => ({ item, why: 'time' as const })));
  leftOut.push(...plan.items.filter((i) => roleOf(i) === 'assisted' && isSkill(i)).map((item) => ({ item, why: 'assisted' as const })));

  // 6. Composantes : retard, puis bonus.
  const sources = new Map<ID, { item: PrescriptionItem; adapted: boolean }>();
  const noEquipmentElements = new Set<ID>();
  for (const need of args.needs) {
    const source = componentSource(need.elementId, practiced, program, available);
    if (source) sources.set(need.elementId, source);
    else if (componentSource(need.elementId, practiced, program, allEquipment)) noEquipmentElements.add(need.elementId);
  }
  const setCost = (elementId: ID) => cost([fixed(sources.get(elementId)!.item, 1)]);
  const given = new Map<ID, { deficit: number; bonus: number }>();
  const order: ID[] = [];
  const got = (elementId: ID) => given.get(elementId) ?? { deficit: 0, bonus: 0 };
  const give = (kind: 'deficit' | 'bonus', room: (need: ComponentNeed) => number) => {
    for (;;) {
      // Tri stable : à égalité, l'ordre des composantes.
      const next = args.needs
        .filter((need) => sources.has(need.elementId) && room(need) > 0 && used + setCost(need.elementId) <= budget)
        .sort((a, b) => room(b) - room(a))[0];
      if (!next) return;
      const count = got(next.elementId);
      given.set(next.elementId, { ...count, [kind]: count[kind] + 1 });
      if (!order.includes(next.elementId)) order.push(next.elementId);
      used += setCost(next.elementId);
    }
  };
  give('deficit', (need) => need.deficit - got(need.elementId).deficit);
  give('bonus', (need) => (need.max === null ? 0 : need.max - need.done - need.remaining - got(need.elementId).deficit - got(need.elementId).bonus));
  const itemIds = new Map<ID, ID>();
  for (const elementId of order) {
    const { deficit, bonus } = got(elementId);
    const source = sources.get(elementId)!;
    const item: PrescriptionItem = { ...fixed(source.item, deficit + bonus), id: args.newId(), optional: false, superset: false };
    itemIds.set(elementId, item.id);
    chosen.push(item);
    reasons[item.id] = 'component';
    if (source.adapted) adapted[item.id] = true;
  }
  const components = args.needs.map((need) => ({
    ...need,
    deficitSets: got(need.elementId).deficit,
    bonusSets: got(need.elementId).bonus,
    itemId: itemIds.get(need.elementId) ?? null,
    ...(noEquipmentElements.has(need.elementId) ? { noEquipment: true } : {}),
  }));

  // Lignes reprises dans l'ordre de la séance remplacée, composantes ensuite ; puis l'ordre des blocs.
  const rank = new Map(plan.items.map((item, index) => [item.id, index]));
  const ordered = [...chosen].sort((a, b) => (rank.get(a.id) ?? plan.items.length) - (rank.get(b.id) ?? plan.items.length));
  return {
    template: {
      id: args.newId(),
      name: args.name,
      sessionTypeId: args.replaced.sessionTypeId,
      moment: args.replaced.moment,
      optional: false,
      notes: '',
      items: sortItemsByBlock(ordered, program.blocks),
      archived: false,
      sharedBlocks: {},
      programId: args.replaced.programId,
    },
    reasons,
    adapted,
    components,
    leftOut,
  };
}

/** Nombre de séries d'une ligne changé avant de démarrer ; 0 la retire. */
export function setExpressSets(template: SessionTemplate, itemId: ID, sets: number): SessionTemplate {
  return { ...template, items: template.items.map((item) => (item.id === itemId ? fixed(item, Math.max(0, sets)) : item)) };
}

/** Séance à démarrer : sans les lignes ramenées à 0 série. */
export function expressToStart(template: SessionTemplate): SessionTemplate {
  return { ...template, items: template.items.filter((item) => item.setsMin > 0) };
}
