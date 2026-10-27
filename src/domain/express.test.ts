import { describe, expect, it } from 'vitest';
import { block, element, item, sessionLog, setLog, settings, template, weekPlan } from '../test/builders';
import { estimateDuration } from './duration';
import { blockRoles, buildExpress, componentNeeds, expressToStart, setExpressSets, type ComponentNeed } from './express';
import type { PrescriptionItem, SessionTemplate } from './types';
import type { PlanContext } from './volume';
import { weekProgress } from './week';

const planche = element('Planche', 'skill', 0);
const fl = element('Touch FL', 'skill', 1);
const dentele = element('Grand dentelé', 'component', 2);
const rhomboide = element('Rhomboïde', 'component', 3);
const connexion = element('Connexion', 'other', 4);
const elements = [planche, fl, dentele, rhomboide, connexion];

// Rôles reconnus aux réglages des blocs, pas à leur nom.
const warmUp = block('Mise en route', 0, { reducedInDeload: false });
const skill = block('Skill', 1, { alternateSkills: true });
const assisted = block('Skill assisté', 2, { alternateSkills: true });
const specific = block('Renfo spé skill', 3);
const renfo = block('Renfo composantes', 4);
const blocks = new Map([warmUp, skill, assisted, specific, renfo].map((b) => [b.id, b]));

// Travail 30 s par série, repos « Libre » compté 30 s.
const s = settings({ volumeMin: 4, volumeMax: 6, deloadReductionPct: 40, avgWorkSecPerSet: 30, freeRestSec: 30 });
const free = { restMinSec: null, restMaxSec: null, restText: 'Libre' };
const skillRest = { restMinSec: 90, restMaxSec: 120 };

const line = (blockTypeId: string, elementId: string, setsMin: number, setsMax: number, extra: Partial<PrescriptionItem> = {}) =>
  item({ blockTypeId, elementId, setsMin, setsMax, ...extra });

// Max du J1 : échauffement 5 min, paire des holds 4 × 3 min, paire P/N · FL PU 3 × 3 min, assisté, renfo spé 10 min.
const hold = line(skill.id, planche.id, 4, 5, skillRest);
const pn = line(skill.id, planche.id, 3, 5, skillRest);
const flHold = line(skill.id, fl.id, 4, 5, skillRest);
const flPu = line(skill.id, fl.id, 3, 3, skillRest);
const max = template('Max', 'evening', [
  line(warmUp.id, connexion.id, 2, 2, free),
  line(warmUp.id, connexion.id, 2, 2, free),
  line(warmUp.id, connexion.id, 1, 2, free),
  hold,
  pn,
  flHold,
  flPu,
  line(assisted.id, planche.id, 2, 3),
  line(assisted.id, fl.id, 2, 3),
  line(specific.id, planche.id, 2, 3, { restMinSec: 120, restMaxSec: 120 }),
  line(specific.id, fl.id, 2, 3, { restMinSec: 120, restMaxSec: 120 }),
  line(renfo.id, rhomboide.id, 2, 2, { restText: '90 s' }),
]);
const combo = template('Combo', 'evening', [
  line(warmUp.id, connexion.id, 2, 2, free),
  line(skill.id, planche.id, 4, 5, skillRest),
  line(skill.id, fl.id, 4, 5, skillRest),
  line(assisted.id, planche.id, 2, 3),
  line(assisted.id, fl.id, 2, 3),
  line(renfo.id, dentele.id, 2, 2, { restText: '90 s (Combo)' }),
]);
const morningA = template(
  'Matin A',
  'morning',
  [
    line(warmUp.id, connexion.id, 1, 2, { ...free, optional: true }),
    line(specific.id, planche.id, 2, 3, { restMinSec: 120, restMaxSec: 120 }),
    line(specific.id, fl.id, 2, 3, { restMinSec: 120, restMaxSec: 120 }),
    line(renfo.id, dentele.id, 2, 2, { restMinSec: 60, restMaxSec: 90, superset: true, optional: true, restText: 'Superset (matin)' }),
  ],
  { optional: true },
);
const plan = weekPlan({ 1: { evening: max.id }, 2: { evening: combo.id }, 4: { morning: morningA.id }, 6: { evening: combo.id } });
const withPlan = { ...s, weekPlan: plan };
const program: PlanContext = { weekPlan: plan, templates: new Map([max, combo, morningA].map((t) => [t.id, t])), elements, blocks, exercises: new Map() };

const need = (elementId: string, overrides: Partial<ComponentNeed> = {}): ComponentNeed => ({
  elementId,
  name: elementId,
  done: 0,
  remaining: 0,
  min: 4,
  max: 6,
  deficit: 4,
  ...overrides,
});
// Pas de place pour les composantes tant qu'elles ne sont pas en retard ni sous le maximum.
const satisfied = [need(dentele.id, { done: 6, deficit: 0 }), need(rhomboide.id, { done: 6, deficit: 0 })];

let n = 0;
function express(minutes: number, replaced: SessionTemplate = max, needs: ComponentNeed[] = satisfied, isDeload = false) {
  return buildExpress({ minutes, replaced, name: `Express ${minutes} min`, isDeload, program, settings: s, needs, newId: () => `new-${++n}` });
}
const structure = { blocks, elements: new Map(elements.map((e) => [e.id, e])), exercises: new Map() };
const sets = (t: SessionTemplate, id: string) => t.items.find((i) => i.id === id)?.setsMin;

describe('blockRoles', () => {
  it('reconnaît les blocs à leurs réglages : non réduit = échauffement, 1er à alternance = Skill, les suivants = assisté', () => {
    const roles = blockRoles(blocks);
    expect(roles.get(warmUp.id)).toBe('warmup');
    expect(roles.get(skill.id)).toBe('skill');
    expect(roles.get(assisted.id)).toBe('assisted');
    expect(roles.get(specific.id)).toBe('other');
    expect(roles.get(renfo.id)).toBe('other');
  });
});

describe('buildExpress : lignes planche / FL de la séance remplacée', () => {
  it('20 min sur un Max : échauffement au minimum puis la paire des holds au minimum', () => {
    const plan = express(20).template;
    expect(plan.items.map((i) => i.blockTypeId)).toEqual([warmUp.id, warmUp.id, warmUp.id, skill.id, skill.id]);
    expect(plan.items.map((i) => i.setsMin)).toEqual([2, 2, 1, 4, 4]);
    expect(plan.items.every((i) => i.setsMin === i.setsMax)).toBe(true);
    // Les lignes reprises gardent leur prescription.
    expect(plan.items[3]).toMatchObject({ id: hold.id, restMinSec: 90, restMaxSec: 120 });
    expect(estimateDuration(plan, s, structure).maxSec).toBe(300 + 720);
  });

  it('30 min : tout le Skill ; le Renfo spé ne rentre pas, le Skill assisté n’est jamais repris', () => {
    const result = express(30);
    expect(result.template.items.filter((i) => i.blockTypeId === skill.id).map((i) => [i.id, i.setsMin])).toEqual([
      [hold.id, 4],
      [pn.id, 3],
      [flHold.id, 4],
      [flPu.id, 3],
    ]);
    expect(result.leftOut.map((l) => [l.item.blockTypeId, l.why])).toEqual([
      [specific.id, 'time'],
      [specific.id, 'time'],
      [assisted.id, 'assisted'],
      [assisted.id, 'assisted'],
    ]);
  });

  it('45 min : Skill puis Renfo spé ; le Skill assisté reste absent même s’il reste du temps', () => {
    const result = express(45);
    const byBlock = (id: string) => result.template.items.filter((i) => i.blockTypeId === id).length;
    expect([byBlock(warmUp.id), byBlock(skill.id), byBlock(assisted.id), byBlock(specific.id)]).toEqual([3, 4, 0, 2]);
    expect(express(120).template.items.some((i) => i.blockTypeId === assisted.id)).toBe(false);
  });

  it('raccourcit la dernière paire qui rentre (au moins 2 séries) et retire le Renfo spé', () => {
    // 25 min : 5 + 12 min, il reste 8 min : 2 tours de P/N · FL PU (6 min), pas 3 (9 min).
    const result = express(25);
    expect(sets(result.template, pn.id)).toBe(2);
    expect(sets(result.template, flPu.id)).toBe(2);
    expect(result.template.items.some((i) => i.blockTypeId === specific.id)).toBe(false);
  });

  it('retire une paire qui ne rentre pas même à 2 séries', () => {
    const result = express(20);
    expect(result.template.items.some((i) => i.id === pn.id)).toBe(false);
    expect(result.leftOut.filter((l) => l.why === 'time').map((l) => l.item.id)).toEqual(expect.arrayContaining([pn.id, flPu.id]));
  });

  it('garde toujours la première paire (planche et FL à chaque séance), à 2 séries s’il le faut', () => {
    const result = express(5);
    expect(sets(result.template, hold.id)).toBe(2);
    expect(sets(result.template, flHold.id)).toBe(2);
  });

  it('en semaine allégée, reprend les lignes allégées ; l’échauffement ne l’est pas', () => {
    const result = express(30, max, satisfied, true);
    expect(sets(result.template, hold.id)).toBe(2); // 4 séries → 2
    expect(sets(result.template, pn.id)).toBe(2); // 3 → 2
    expect(result.template.items.filter((i) => i.blockTypeId === warmUp.id).map((i) => i.setsMin)).toEqual([2, 2, 1]);
  });

  it('remplace une séance du matin : Renfo spé de la séance, puis les composantes', () => {
    const result = express(20, morningA, [need(dentele.id, { done: 2, remaining: 2, deficit: 0 }), need(rhomboide.id, { done: 4, deficit: 0 })]);
    const items = result.template.items;
    expect(items.map((i) => i.blockTypeId)).toEqual([warmUp.id, specific.id, specific.id, renfo.id, renfo.id]);
    expect(result.template).toMatchObject({ moment: 'morning', optional: false, sessionTypeId: morningA.sessionTypeId, name: 'Express 20 min' });
    // Bonus : 2 séries de chaque composante jusqu'au maximum, dans 20 − 1 − 10 = 9 min.
    expect(result.components.map((c) => [c.elementId, c.deficitSets, c.bonusSets])).toEqual([
      [dentele.id, 0, 2],
      [rhomboide.id, 0, 2],
    ]);
  });
});

describe('buildExpress : composantes', () => {
  it('comble le retard d’abord, la composante la plus en retard en premier, série par série', () => {
    // 30 min sur un Max : il reste 4 min, soit 2 séries de composante (30 s + 90 s).
    const result = express(30, max, [need(dentele.id, { deficit: 4, done: 0 }), need(rhomboide.id, { deficit: 2, done: 2 })]);
    expect(result.components.map((c) => [c.deficitSets, c.bonusSets])).toEqual([
      [2, 0],
      [0, 0],
    ]);
    const added = result.template.items.filter((i) => result.reasons[i.id] === 'component');
    expect(added.map((i) => [i.elementId, i.setsMin, i.setsMax])).toEqual([[dentele.id, 2, 2]]);
  });

  it('à égalité de retard, suit l’ordre des composantes', () => {
    const result = express(45, max, [need(dentele.id, { deficit: 2, done: 2 }), need(rhomboide.id, { deficit: 2, done: 2 })]);
    // 45 min : 5 + 21 + 10 = 36 min, il reste 9 min = 4 séries.
    expect(result.components.map((c) => c.deficitSets)).toEqual([2, 2]);
    expect(result.template.items.filter((i) => i.blockTypeId === renfo.id).map((i) => i.elementId)).toEqual([dentele.id, rhomboide.id]);
  });

  it('ajoute le bonus jusqu’au maximum après le retard', () => {
    const result = express(45, max, [need(dentele.id, { deficit: 1, done: 3 }), need(rhomboide.id, { deficit: 0, done: 5 })]);
    // 4 séries possibles : 1 de retard, puis bonus : dentelé 6 − 3 − 1 = 2, rhomboïde 1.
    expect(result.components.map((c) => [c.deficitSets, c.bonusSets])).toEqual([
      [1, 2],
      [0, 1],
    ]);
  });

  it('pas de bonus en semaine allégée (maximum absent)', () => {
    const result = express(45, max, [need(dentele.id, { min: 2, max: null, deficit: 1, done: 1 }), need(rhomboide.id, { min: 2, max: null, deficit: 0, done: 2 })], true);
    expect(result.components.map((c) => [c.deficitSets, c.bonusSets])).toEqual([
      [1, 0],
      [0, 0],
    ]);
  });

  it('reprend la ligne de la séance remplacée, sinon celle d’un soir, sinon celle d’un matin', () => {
    const fromCombo = express(45, combo, [need(dentele.id, { deficit: 1, done: 3 })]);
    expect(fromCombo.template.items.find((i) => i.elementId === dentele.id)).toMatchObject({ restText: '90 s (Combo)', optional: false, superset: false });
    const fromEvening = express(45, max, [need(dentele.id, { deficit: 1, done: 3 })]);
    expect(fromEvening.template.items.find((i) => i.elementId === dentele.id)?.restText).toBe('90 s (Combo)');
    const morningOnly: PlanContext = { ...program, weekPlan: weekPlan({ 1: { evening: max.id }, 4: { morning: morningA.id } }) };
    const fromMorning = buildExpress({ minutes: 45, replaced: max, name: 'x', isDeload: false, program: morningOnly, settings: s, needs: [need(dentele.id, { deficit: 1, done: 3 })], newId: () => `m-${++n}` });
    expect(fromMorning.template.items.find((i) => i.elementId === dentele.id)).toMatchObject({ restText: 'Superset (matin)', optional: false, superset: false });
  });

  it('ne met pas une composante sans ligne dans le programme', () => {
    const lonely = element('Extension thoracique', 'component', 5);
    const result = express(45, max, [need(lonely.id, { deficit: 4 })]);
    expect(result.components[0]).toMatchObject({ deficitSets: 0, itemId: null });
  });
});

describe('componentNeeds', () => {
  // Semaine 1 : J1 Max (rhomboïde 2), J2 et J6 Combo (dentelé 2), J4 Matin A (dentelé 2, bonus).
  const sessions = (list: ReturnType<typeof sessionLog>[]) => new Map(list.map((x) => [x.id, x]));

  it('retard = minimum − faites − séries du soir encore prévues, sans compter la séance remplacée', () => {
    // Le J2 (Combo) au soir : rien de fait ; le Combo du J6 reste prévu, celui du jour est remplacé.
    const days = weekProgress(1, '2026-10-06', withPlan, program.templates, []);
    const needs = componentNeeds({ program, settings: s, week: 1, isDeload: false, days, sets: [], sessions: new Map(), replaced: { date: '2026-10-06', moment: 'evening' } });
    expect(needs.find((x) => x.elementId === dentele.id)).toMatchObject({ done: 0, remaining: 2, min: 4, max: 6, deficit: 2 });
    // Le rhomboïde du J1 est passé (manqué) : tout le minimum manque.
    expect(needs.find((x) => x.elementId === rhomboide.id)).toMatchObject({ done: 0, remaining: 0, deficit: 4 });
  });

  it('compte les séries faites de la semaine, hors échauffement', () => {
    const j1 = sessionLog('2026-10-05', { week: 1, moment: 'evening' });
    const done = [
      setLog({ sessionId: j1.id, exerciseId: 'x', elementId: rhomboide.id }),
      setLog({ sessionId: j1.id, exerciseId: 'x', elementId: rhomboide.id }),
      setLog({ sessionId: j1.id, exerciseId: 'x', elementId: rhomboide.id, kind: 'warmup' }),
    ];
    const days = weekProgress(1, '2026-10-08', withPlan, program.templates, [j1]);
    const needs = componentNeeds({ program, settings: s, week: 1, isDeload: false, days, sets: done, sessions: sessions([j1]), replaced: { date: '2026-10-08', moment: 'morning' } });
    expect(needs.find((x) => x.elementId === rhomboide.id)).toMatchObject({ done: 2, deficit: 2 });
  });

  it('en semaine allégée, le minimum est celui des soirs allégés et il n’y a pas de bonus', () => {
    const days = weekProgress(4, '2026-10-26', withPlan, program.templates, []);
    const needs = componentNeeds({ program, settings: s, week: 4, isDeload: true, days, sets: [], sessions: new Map(), replaced: { date: '2026-10-26', moment: 'evening' } });
    // Dentelé : 2 Combo × (2 séries → 1) = 2, tous deux encore prévus ; rhomboïde : le Max du jour est remplacé.
    expect(needs.find((x) => x.elementId === dentele.id)).toMatchObject({ min: 2, max: null, remaining: 2, deficit: 0 });
    expect(needs.find((x) => x.elementId === rhomboide.id)).toMatchObject({ min: 1, remaining: 0, deficit: 1 });
  });
});

describe('modifier avant de démarrer', () => {
  it('change le nombre de séries d’une ligne ; 0 la retire au démarrage', () => {
    const plan = express(20).template;
    const changed = setExpressSets(plan, hold.id, 5);
    expect(changed.items.find((i) => i.id === hold.id)).toMatchObject({ setsMin: 5, setsMax: 5 });
    const removed = expressToStart(setExpressSets(changed, flHold.id, 0));
    expect(removed.items.some((i) => i.id === flHold.id)).toBe(false);
    expect(removed.items).toHaveLength(plan.items.length - 1);
  });
});
