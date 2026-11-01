// Composantes réparties par l'appli (programmation par blocs, phase H2 ; règles décidées avec l'utilisateur le
// 01/11/2026, CLAUDE.md « Programmation par blocs »). Chaque composante du programme a ses bornes par tranche (ou par
// semaine), son type de travail et ses séries par séance ; chaque type de séance accepte toutes les composantes,
// l'endurance seulement, ou aucune. La répartition est fixe et se recalcule à partir du programme, rien n'est stocké :
// 1. les soirs obligatoires font le minimum de chaque composante, en séances complètes, sans dépasser le maximum ;
// 2. les matins et les soirs optionnels complètent jusqu'au maximum, en séances complètes, sans le dépasser ;
// 3. à chaque étape, les séances les plus équilibrées (séries de composantes le plus également réparties) ; à
//    équilibre égal, les composantes qui ont le moins de séances possibles d'abord (la force), chacune au plus tôt.
// Les créneaux sont ceux du `weekPlan` : jours J1-J7 en semaine type, positions de la séquence (soirs) et matins 1…m
// d'une tranche en séquence. Une séance faite à une place reçoit les composantes de cette place, quelle qu'elle soit.
import type {
  ComponentAcceptance,
  ID,
  Moment,
  PrescriptionItem,
  ProgramComponent,
  ProgramConfig,
  SeqDay,
  SessionTemplate,
} from './types';
import { MOMENTS, SEQ_DAYS } from './types';

/** Ce que la répartition lit du programme. */
export type ComponentPlan = Pick<ProgramConfig, 'weekPlan' | 'volumeMin' | 'volumeMax'> &
  Partial<Pick<ProgramConfig, 'components' | 'componentBlockTypeId' | 'componentAcceptance' | 'componentVolumes'>>;

export const ACCEPTANCES: readonly ComponentAcceptance[] = ['all', 'endurance', 'none'];

/** Bornes d'une composante : celles de son type de travail dans le programme, sinon les bornes par défaut. */
export function componentBounds(
  settings: Pick<ProgramConfig, 'volumeMin' | 'volumeMax'> & Partial<Pick<ProgramConfig, 'componentVolumes'>>,
  elementId: ID,
): { min: number; max: number; work: string | null } {
  const own = settings.componentVolumes?.find((v) => v.elementId === elementId);
  return own ? { min: own.min, max: own.max, work: own.work } : { min: settings.volumeMin, max: settings.volumeMax, work: null };
}

export function acceptanceOf(plan: Pick<ComponentPlan, 'componentAcceptance'>, sessionTypeId: ID): ComponentAcceptance {
  return plan.componentAcceptance?.[sessionTypeId] ?? 'all';
}

/** « Endurance seulement » n'accepte qu'une composante dont le travail est l'endurance. */
export function acceptsWork(acceptance: ComponentAcceptance, work: string | null): boolean {
  if (acceptance === 'all') return true;
  return acceptance === 'endurance' && work === 'endurance';
}

export const slotKey = (seqDay: SeqDay, moment: Moment): string => `${seqDay}:${moment}`;

export interface DistributionSlot {
  seqDay: SeqDay;
  moment: Moment;
  template: SessionTemplate;
  /** Complète jusqu'au maximum : un matin ou un soir optionnel ; les autres soirs font le minimum. */
  extra: boolean;
}

export interface ComponentTotals {
  /** Séries des soirs obligatoires. */
  evening: number;
  /** Séries des matins et des soirs optionnels. */
  extra: number;
}

export interface ComponentDistribution {
  /** Créneaux du programme, dans l'ordre J1 matin, J1 soir, J2 matin… */
  slots: DistributionSlot[];
  /** Composantes de chaque créneau (clé `slotKey`), dans l'ordre du programme. */
  bySlot: Map<string, ProgramComponent[]>;
  /** Par composante (identifiant de la composante). */
  totals: Map<ID, ComponentTotals>;
}

/** Une composante à placer dans un groupe de séances : `count` séances parmi `eligible` (rangs dans le groupe). */
export interface Demand {
  /** Rang de la composante dans le programme (départage à égalité). */
  index: number;
  sets: number;
  count: number;
  eligible: number[];
}

const NODE_LIMIT = 200_000;

const sumSquares = (loads: readonly number[]) => loads.reduce((sum, load) => sum + load * load, 0);

/**
 * Plus petite somme des carrés possible si `extra` séries de plus se répartissaient librement (sans tenir compte des
 * séances acceptées ni des séries entières) : borne basse pour élaguer la recherche.
 */
function lowerBound(loads: readonly number[], extra: number): number {
  if (extra <= 0 || loads.length === 0) return sumSquares(loads);
  const sorted = [...loads].sort((a, b) => a - b);
  let remaining = extra;
  let level = sorted[0];
  let raised = 1;
  while (raised < sorted.length && (sorted[raised] - level) * raised <= remaining) {
    remaining -= (sorted[raised] - level) * raised;
    level = sorted[raised];
    raised++;
  }
  level += remaining / raised;
  return sorted.reduce((sum, load, i) => sum + (i < raised ? level * level : load * load), 0);
}

/** Combinaisons de `count` éléments de `list`, dans l'ordre lexicographique (les plus tôt d'abord). */
function* combinations(list: readonly number[], count: number, from = 0): Generator<number[]> {
  if (count === 0) {
    yield [];
    return;
  }
  for (let i = from; i <= list.length - count; i++) {
    for (const rest of combinations(list, count - 1, i + 1)) yield [list[i], ...rest];
  }
}

/**
 * Séances choisies pour chaque demande (rangs dans le groupe), dans l'ordre des demandes : la répartition la plus
 * équilibrée (plus petite somme des carrés des séries par séance) ; à égalité, les demandes qui ont le moins de séances
 * possibles d'abord, puis l'ordre du programme, chacune au plus tôt. Recherche exhaustive élaguée (les programmes ont
 * au plus 7 séances et quelques composantes), bornée par sûreté : au-delà, la meilleure trouvée.
 */
export function placeDemands(slotCount: number, demands: readonly Demand[]): number[][] {
  const order = demands
    .map((_, i) => i)
    .sort((a, b) => demands[a].eligible.length - demands[b].eligible.length || demands[a].index - demands[b].index);
  const counts = demands.map((d) => Math.max(0, Math.min(d.count, d.eligible.length)));
  const remainingFrom = order.map((_, k) => order.slice(k).reduce((sum, i) => sum + demands[i].sets * counts[i], 0));
  const loads = new Array<number>(slotCount).fill(0);
  const chosen: number[][] = demands.map(() => []);
  let best: number[][] | null = null;
  let bestCost = Number.POSITIVE_INFINITY;
  let nodes = 0;
  const visit = (k: number) => {
    nodes++;
    if (nodes > NODE_LIMIT && best) return;
    if (k === order.length) {
      const cost = sumSquares(loads);
      if (cost < bestCost) {
        bestCost = cost;
        best = chosen.map((positions) => [...positions]);
      }
      return;
    }
    if (lowerBound(loads, remainingFrom[k]) >= bestCost) return;
    const i = order[k];
    const { sets, eligible } = demands[i];
    for (const combo of combinations([...eligible].sort((a, b) => a - b), counts[i])) {
      for (const p of combo) loads[p] += sets;
      chosen[i] = combo;
      visit(k + 1);
      for (const p of combo) loads[p] -= sets;
    }
    chosen[i] = [];
  };
  visit(0);
  return best ?? demands.map(() => []);
}

/** Créneaux du programme : J1 matin, J1 soir, J2 matin… (les créneaux vides sont ignorés). */
function distributionSlots(plan: ComponentPlan, templates: ReadonlyMap<ID, SessionTemplate>): DistributionSlot[] {
  const slots: DistributionSlot[] = [];
  for (const seqDay of SEQ_DAYS) {
    for (const moment of MOMENTS) {
      const template = templates.get(plan.weekPlan[seqDay][moment] ?? '');
      if (template) slots.push({ seqDay, moment, template, extra: moment === 'morning' || template.optional });
    }
  }
  return slots;
}

/** Répartition des composantes du programme sur ses créneaux (sans cache : voir `componentDistribution`). */
export function distributeComponents(plan: ComponentPlan, templates: ReadonlyMap<ID, SessionTemplate>): ComponentDistribution {
  const slots = distributionSlots(plan, templates);
  const components = plan.components ?? [];
  const bySlot = new Map<string, ProgramComponent[]>();
  const totals = new Map<ID, ComponentTotals>(components.map((c) => [c.id, { evening: 0, extra: 0 }]));
  if (components.length === 0) return { slots, bySlot, totals };
  const setsOf = (c: ProgramComponent) => Math.max(1, Math.floor(c.setsPerSession) || 1);
  const accepts = (slot: DistributionSlot, c: ProgramComponent) =>
    acceptsWork(acceptanceOf(plan, slot.template.sessionTypeId), componentBounds(plan, c.elementId).work);

  const place = (group: DistributionSlot[], count: (c: ProgramComponent) => number, field: keyof ComponentTotals) => {
    const demands: Demand[] = components.map((c, index) => ({
      index,
      sets: setsOf(c),
      count: count(c),
      eligible: group.flatMap((slot, i) => (accepts(slot, c) ? [i] : [])),
    }));
    placeDemands(group.length, demands).forEach((positions, i) => {
      const component = components[i];
      totals.get(component.id)![field] += positions.length * setsOf(component);
      for (const p of positions) {
        const key = slotKey(group[p].seqDay, group[p].moment);
        bySlot.set(key, [...(bySlot.get(key) ?? []), component]);
      }
    });
  };

  // 1. Le soir fait le minimum, en séances complètes, jamais au-delà du maximum.
  place(
    slots.filter((s) => !s.extra),
    (c) => {
      const { min, max } = componentBounds(plan, c.elementId);
      const sets = setsOf(c);
      const sessions = Math.ceil(Math.max(0, min) / sets);
      return sessions * sets > max ? Math.max(0, Math.floor(max / sets)) : sessions;
    },
    'evening',
  );
  // 2. Les matins (et les soirs optionnels) complètent jusqu'au maximum.
  place(
    slots.filter((s) => s.extra),
    (c) => Math.max(0, Math.floor((componentBounds(plan, c.elementId).max - totals.get(c.id)!.evening) / setsOf(c))),
    'extra',
  );
  // Chaque créneau dans l'ordre des composantes du programme.
  const rank = new Map(components.map((c, i) => [c.id, i]));
  for (const [key, list] of bySlot) bySlot.set(key, [...list].sort((a, b) => rank.get(a.id)! - rank.get(b.id)!));
  return { slots, bySlot, totals };
}

const cache: { key: unknown[]; value: ComponentDistribution }[] = [];

/** Répartition des composantes, gardée tant que le programme et ses modèles ne changent pas. */
export function componentDistribution(plan: ComponentPlan, templates: ReadonlyMap<ID, SessionTemplate>): ComponentDistribution {
  const key = [plan.weekPlan, plan.components, plan.componentAcceptance, plan.componentVolumes, plan.volumeMin, plan.volumeMax, templates];
  const hit = cache.find((entry) => entry.key.every((part, i) => part === key[i]));
  if (hit) return hit.value;
  const value = distributeComponents(plan, templates);
  cache.unshift({ key, value });
  cache.length = Math.min(cache.length, 8);
  return value;
}

/** Ligne de séance d'une composante répartie : sa prescription, `setsPerSession` séries, dans le bloc des composantes. */
export function componentLine(component: ProgramComponent, blockTypeId: ID, optional: boolean): PrescriptionItem {
  const sets = Math.max(1, Math.floor(component.setsPerSession) || 1);
  return {
    id: component.id,
    blockTypeId,
    elementId: component.elementId,
    candidateExerciseIds: [...component.candidateExerciseIds],
    candidatesText: component.candidatesText,
    setsMin: sets,
    setsMax: sets,
    targetText: component.targetText,
    targets: component.targets.map((t) => ({ ...t })),
    intensityText: component.intensityText,
    intensity: component.intensity ? { ...component.intensity } : null,
    restText: component.restText,
    restMinSec: component.restMinSec,
    restMaxSec: component.restMaxSec,
    superset: false,
    optional,
    notes: component.notes,
  };
}

/**
 * Lignes des composantes reçues par un créneau. Dans un matin ou un soir optionnel, elles sont optionnelles (le
 * complément) ; ailleurs, obligatoires. Aucune sans composante répartie, ou pour un créneau vide.
 */
export function slotComponentLines(plan: ComponentPlan, templates: ReadonlyMap<ID, SessionTemplate>, seqDay: SeqDay | null, moment: Moment): PrescriptionItem[] {
  if (!plan.components?.length || seqDay === null) return [];
  const distribution = componentDistribution(plan, templates);
  const slot = distribution.slots.find((s) => s.seqDay === seqDay && s.moment === moment);
  if (!slot) return [];
  return (distribution.bySlot.get(slotKey(seqDay, moment)) ?? []).map((c) => componentLine(c, plan.componentBlockTypeId ?? '', slot.extra));
}

/** Séance avec les lignes des composantes de son créneau, après les siennes (une ligne déjà là n'est pas doublée). */
export function withComponents(template: SessionTemplate, lines: readonly PrescriptionItem[]): SessionTemplate {
  const own = new Set(template.items.map((item) => item.id));
  const added = lines.filter((line) => !own.has(line.id));
  return added.length === 0 ? template : { ...template, items: [...template.items, ...added] };
}

/** Une composante répartie de plus : la prescription d'une ligne (exercices au choix, cible, intensité, repos). */
export function componentFromLine(id: ID, line: PrescriptionItem): ProgramComponent {
  return {
    id,
    elementId: line.elementId,
    setsPerSession: Math.max(1, line.setsMin > 0 ? line.setsMin : line.setsMax),
    candidateExerciseIds: [...line.candidateExerciseIds],
    candidatesText: line.candidatesText,
    targetText: line.targetText,
    targets: line.targets.map((t) => ({ ...t })),
    intensityText: line.intensityText,
    intensity: line.intensity ? { ...line.intensity } : null,
    restText: line.restText,
    restMinSec: line.restMinSec,
    restMaxSec: line.restMaxSec,
    notes: line.notes,
  };
}
