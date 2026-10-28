// Séance express de 20, 30 ou 45 min : elle remplace une séance du jour, matin ou soir. Règles décidées avec
// l'utilisateur (CLAUDE.md, « Aujourd'hui et séance express ») ; la fatigue de la veille n'entre pas en compte.
import { practicedTemplate } from './deload';
import { estimateDuration, type PlanStructure } from './duration';
import { buildPlan, sortItemsByBlock } from './session';
import type { BlockType, ID, Moment, PrescriptionItem, SessionLog, SessionTemplate, SetLog, Settings } from './types';
import {
  componentBounds,
  componentElements,
  plannedComponentVolume,
  plannedSlots,
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
  /** Ligne de la séance ; `null` : pas de place, ou aucune ligne du programme pour cette composante. */
  itemId: ID | null;
}

/** Ligne planche / FL de la séance remplacée laissée de côté : Skill assisté (jamais repris) ou pas la place. */
export interface ExpressLeftOut {
  item: PrescriptionItem;
  why: 'assisted' | 'time';
}

export interface ExpressPlan {
  template: SessionTemplate;
  reasons: Record<ID, ExpressReason>;
  components: ExpressComponent[];
  leftOut: ExpressLeftOut[];
}

export type ExpressSettings = Pick<Settings, 'avgWorkSecPerSet' | 'freeRestSec' | 'deloadReductionPct'>;

const fixed = (item: PrescriptionItem, sets: number): PrescriptionItem => ({ ...item, setsMin: sets, setsMax: sets });

/** Séries reprises d'une ligne : son minimum ; pour une ligne sans minimum (plafond seul), 2 séries, sous le plafond. */
const baseSets = (item: PrescriptionItem): number => (item.setsMin > 0 ? item.setsMin : Math.min(2, item.setsMax));

/**
 * Ligne du programme qui sert de modèle à une composante (exercices, cible, intensité, repos) : celle de la séance
 * remplacée, sinon celle d'un soir de la semaine type, sinon celle d'un matin ; une ligne obligatoire d'abord.
 */
function componentSource(elementId: ID, replaced: SessionTemplate, program: PlanContext): PrescriptionItem | null {
  const pick = (template: SessionTemplate) =>
    template.items.find((i) => i.elementId === elementId && !i.optional) ?? template.items.find((i) => i.elementId === elementId);
  const slots = plannedSlots(program.weekPlan, program.templates);
  const ordered = [replaced, ...slots.filter((s) => s.moment === 'evening').map((s) => s.template), ...slots.filter((s) => s.moment === 'morning').map((s) => s.template)];
  for (const template of ordered) {
    const found = pick(template);
    if (found) return found;
  }
  return null;
}

/**
 * Séance express (règles décidées avec l'utilisateur) :
 * 1. l'échauffement de la séance remplacée, au minimum de séries ;
 * 2. son Travail prioritaire (bloc sans alternance avant le Skill), toujours, au minimum de séries ;
 * 3. ses paires du Skill dans l'ordre, au minimum de séries ; la dernière qui rentre peut perdre des séries
 *    (au moins 2), les suivantes sont retirées ; la première est toujours là (planche et FL à chaque séance) ;
 * 4. son Renfo spé (lignes planche / FL des autres blocs), en entier, si tout le Skill est là et qu'il rentre :
 *    il est retiré avant de raccourcir le Skill ;
 * 5. jamais le Skill assisté ;
 * 6. les composantes en retard, la plus en retard d'abord, série par série ; puis le bonus jusqu'au maximum
 *    (pas en semaine allégée).
 * Les lignes gardent la prescription de la séance remplacée (allégée en semaine allégée), avec un nombre de séries
 * fixe. La durée se remplit avec la borne haute de l'estimation : repos maximum, exercice le plus long.
 */
export function buildExpress(args: {
  minutes: number;
  /** Séance du jour remplacée, telle que dans la semaine type (avant allégement). */
  replaced: SessionTemplate;
  name: string;
  isDeload: boolean;
  /** Tranche (ou semaine) du cycle : valeurs de la tranche. */
  cycleWeek: number;
  program: PlanContext;
  settings: ExpressSettings;
  needs: readonly ComponentNeed[];
  newId: () => ID;
}): ExpressPlan {
  const { program, settings } = args;
  const budget = args.minutes * 60;
  const elements = new Map(program.elements.map((e) => [e.id, e]));
  const structure: PlanStructure = { blocks: program.blocks, elements, exercises: program.exercises };
  const cost = (items: PrescriptionItem[]) => estimateDuration({ items }, settings, structure).maxSec;
  const roles = blockRoles(program.blocks, new Set(args.replaced.items.map((i) => i.blockTypeId)));
  const roleOf = (item: PrescriptionItem) => roles.get(item.blockTypeId) ?? 'other';
  const isSkill = (item: PrescriptionItem) => elements.get(item.elementId)?.kind === 'skill';

  const practiced = practicedTemplate(args.replaced, { isDeload: args.isDeload, cycleWeek: args.cycleWeek }, program.blocks, settings);
  const plan = buildPlan(practiced, program.blocks, elements);
  const chosen: PrescriptionItem[] = [];
  const reasons: Record<ID, ExpressReason> = {};
  const leftOut: ExpressLeftOut[] = [];
  let used = 0;
  const take = (items: PrescriptionItem[], reason: ExpressReason) => {
    for (const item of items) {
      chosen.push(item);
      reasons[item.id] = reason;
    }
    used += cost(items);
  };

  // 1. Échauffement.
  take(
    plan.items.filter((i) => roleOf(i) === 'warmup' && baseSets(i) > 0).map((i) => fixed(i, baseSets(i))),
    'warmup',
  );

  // 2. Travail prioritaire : toujours repris, au minimum de séries, même si la séance dépasse la durée choisie
  // (décidé avec l'utilisateur le 28/10/2026 : lean-up et négatives se font à chaque séance, express comprise).
  take(
    plan.items.filter((i) => roleOf(i) === 'priority' && baseSets(i) > 0).map((i) => fixed(i, baseSets(i))),
    'priority',
  );

  // 3. Paires du Skill.
  let shortened = false;
  const skillUnits = plan.units
    .map((unit) => unit.itemIds.map((id) => plan.itemsById.get(id)!).filter((i) => roleOf(i) === 'skill' && isSkill(i) && baseSets(i) > 0))
    .filter((items) => items.length > 0);
  skillUnits.forEach((items, index) => {
    if (shortened) {
      leftOut.push(...items.map((item) => ({ item, why: 'time' as const })));
      return;
    }
    const full = items.map((i) => fixed(i, baseSets(i)));
    if (used + cost(full) <= budget) {
      take(full, 'skill');
      return;
    }
    shortened = true;
    const rounds = Math.max(...items.map(baseSets));
    const floor = Math.min(2, rounds);
    const cut = (r: number) => items.map((i) => fixed(i, Math.min(baseSets(i), r)));
    let fitted: PrescriptionItem[] | null = null;
    for (let r = rounds - 1; r >= floor && !fitted; r--) if (used + cost(cut(r)) <= budget) fitted = cut(r);
    if (!fitted && index === 0) fitted = cut(floor);
    if (fitted) take(fitted, 'skill');
    else leftOut.push(...items.map((item) => ({ item, why: 'time' as const })));
  });

  // 4. Renfo spé, 5. Skill assisté.
  const specific = plan.items.filter((i) => roleOf(i) === 'other' && isSkill(i) && baseSets(i) > 0).map((i) => fixed(i, baseSets(i)));
  if (specific.length > 0 && !shortened && used + cost(specific) <= budget) take(specific, 'specific');
  else leftOut.push(...specific.map((item) => ({ item, why: 'time' as const })));
  leftOut.push(...plan.items.filter((i) => roleOf(i) === 'assisted' && isSkill(i)).map((item) => ({ item, why: 'assisted' as const })));

  // 6. Composantes : retard, puis bonus.
  const sources = new Map<ID, PrescriptionItem>();
  for (const need of args.needs) {
    const source = componentSource(need.elementId, practiced, program);
    if (source) sources.set(need.elementId, source);
  }
  const setCost = (elementId: ID) => cost([fixed(sources.get(elementId)!, 1)]);
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
    const item: PrescriptionItem = { ...fixed(sources.get(elementId)!, deficit + bonus), id: args.newId(), optional: false, superset: false };
    itemIds.set(elementId, item.id);
    chosen.push(item);
    reasons[item.id] = 'component';
  }
  const components = args.needs.map((need) => ({
    ...need,
    deficitSets: got(need.elementId).deficit,
    bonusSets: got(need.elementId).bonus,
    itemId: itemIds.get(need.elementId) ?? null,
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
      programId: args.replaced.programId,
    },
    reasons,
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
