import { describe, expect, it } from 'vitest';
import { block, element, item, sessionLog, settings, template, weekPlan } from '../test/builders';
import { componentFromLine, distributeComponents, placeDemands, slotComponentLines, slotKey, withComponents } from './components';
import { practicedTemplate } from './deload';
import { buildExpress, componentNeeds } from './express';
import { tranchePeriod } from './period';
import type { ComponentVolume, ProgramComponent, SessionTemplate } from './types';
import { plannedComponentVolume, programIssues, remainingEveningSets } from './volume';

const renfo = block('Renfo composante', 5);
const gd = element('Grand dentelé', 'component', 1);
const rh = element('Rhomboïde', 'component', 2);
const da = element('Deltoïde ant', 'component', 3);
const et = element('Extension thoracique', 'component', 4);
const planche = element('Planche', 'skill', 0);

const component = (elementId: string, setsPerSession = 2): ProgramComponent => ({
  ...componentFromLine(`c-${elementId}`, item({ blockTypeId: renfo.id, elementId, setsMin: setsPerSession, setsMax: setsPerSession, targetText: '30-60 s', restText: '60 s' })),
});
const volume = (elementId: string, work: string, min: number, max: number): ComponentVolume => ({ elementId, work, min, max });
const session = (name: string, sessionTypeId: string, moment: 'evening' | 'morning' = 'evening', options: Partial<SessionTemplate> = {}) =>
  template(name, moment, [item({ blockTypeId: 'skill', elementId: planche.id })], { sessionTypeId, ...options });

/** Novembre : séquence Séance type, Combo libre, Séance type, Combo libre, Séance type ; deux matins. */
function november() {
  const st = session('Séance type', 'st');
  const cl = session('Combo libre', 'cl');
  const matin = session('Matin', 'matin', 'morning', { optional: true });
  const templates = new Map([st, cl, matin].map((t) => [t.id, t]));
  const plan = settings({
    schedule: 'sequence',
    weekPlan: weekPlan({
      1: { evening: st.id, morning: matin.id },
      2: { evening: cl.id, morning: matin.id },
      3: { evening: st.id },
      4: { evening: cl.id },
      5: { evening: st.id },
    }),
    componentVolumes: [volume(gd.id, 'endurance', 8, 10), volume(rh.id, 'endurance', 8, 10), volume(da.id, 'force', 4, 6), volume(et.id, 'force', 4, 6)],
    components: [component(gd.id), component(rh.id), component(da.id), component(et.id)],
    componentBlockTypeId: renfo.id,
    componentAcceptance: { cl: 'endurance', matin: 'endurance' },
  });
  return { plan, templates, st, cl, matin };
}

const names = (list: readonly ProgramComponent[] | undefined) => (list ?? []).map((c) => [gd, rh, da, et].find((e) => e.id === c.elementId)!.name);

describe('placeDemands', () => {
  it('équilibre les séances, puis place au plus tôt les demandes qui ont le moins de séances possibles', () => {
    // Deux demandes d'une séance chacune parmi trois : chacune dans sa séance, la plus contrainte d'abord.
    expect(placeDemands(3, [{ index: 0, sets: 2, count: 1, eligible: [0, 1, 2] }, { index: 1, sets: 2, count: 1, eligible: [1, 2] }])).toEqual([[0], [1]]);
    // À équilibre égal, les deux au plus tôt, ensemble.
    expect(placeDemands(4, [{ index: 0, sets: 2, count: 1, eligible: [0, 1] }, { index: 1, sets: 2, count: 1, eligible: [0, 1] }, { index: 2, sets: 2, count: 2, eligible: [0, 1, 2, 3] }])).toEqual([[0], [1], [2, 3]]);
  });

  it('ne demande jamais plus de séances qu’il n’y en a d’acceptées', () => {
    expect(placeDemands(2, [{ index: 0, sets: 2, count: 3, eligible: [1] }])).toEqual([[1]]);
    expect(placeDemands(2, [{ index: 0, sets: 2, count: 0, eligible: [0, 1] }])).toEqual([[]]);
  });
});

describe('répartition des composantes', () => {
  it('novembre : la répartition décidée avec l’utilisateur, 10 / 10 / 4 / 4 par tranche', () => {
    const { plan, templates } = november();
    const d = distributeComponents(plan, templates);
    expect(names(d.bySlot.get(slotKey(1, 'evening')))).toEqual(['Grand dentelé', 'Deltoïde ant', 'Extension thoracique']);
    expect(names(d.bySlot.get(slotKey(2, 'evening')))).toEqual(['Grand dentelé', 'Rhomboïde']);
    expect(names(d.bySlot.get(slotKey(3, 'evening')))).toEqual(['Rhomboïde', 'Deltoïde ant', 'Extension thoracique']);
    expect(names(d.bySlot.get(slotKey(4, 'evening')))).toEqual(['Grand dentelé', 'Rhomboïde']);
    expect(names(d.bySlot.get(slotKey(5, 'evening')))).toEqual(['Grand dentelé', 'Rhomboïde']);
    expect(names(d.bySlot.get(slotKey(1, 'morning')))).toEqual(['Grand dentelé']);
    expect(names(d.bySlot.get(slotKey(2, 'morning')))).toEqual(['Rhomboïde']);
    expect([...d.totals.values()]).toEqual([
      { evening: 8, extra: 2 },
      { evening: 8, extra: 2 },
      { evening: 4, extra: 0 },
      { evening: 4, extra: 0 },
    ]);
  });

  it('lignes d’un créneau : obligatoires le soir, optionnelles le matin ; tranche allégée : 1 série au lieu de 2', () => {
    const { plan, templates, st, matin } = november();
    const evening = slotComponentLines(plan, templates, 1, 'evening');
    expect(evening.map((l) => [l.id, l.blockTypeId, l.setsMin, l.setsMax, l.optional])).toEqual([
      [`c-${gd.id}`, renfo.id, 2, 2, false],
      [`c-${da.id}`, renfo.id, 2, 2, false],
      [`c-${et.id}`, renfo.id, 2, 2, false],
    ]);
    expect(slotComponentLines(plan, templates, 2, 'morning').map((l) => l.optional)).toEqual([true]);
    expect(slotComponentLines(plan, templates, 6, 'evening')).toEqual([]);
    expect(slotComponentLines(plan, templates, null, 'morning')).toEqual([]);
    const deload = practicedTemplate(withComponents(st, evening), { cycleWeek: 4, isDeload: true }, new Map([[renfo.id, renfo]]), plan);
    expect(deload.items.filter((i) => i.blockTypeId === renfo.id).map((i) => i.setsMin)).toEqual([1, 1, 1]);
    expect(withComponents(matin, [])).toBe(matin);
  });

  it('volume prévu et contrôles : chaque composante atteint son minimum le soir, sans dépasser le maximum', () => {
    const { plan, templates } = november();
    const context = { weekPlan: plan.weekPlan, templates, elements: [planche, gd, rh, da, et], blocks: new Map([[renfo.id, renfo]]), exercises: new Map(), componentPlan: plan };
    expect(plannedComponentVolume(context, plan).map((r) => [r.name, r.eveningGuaranteed, r.morningMax, r.totalMax, r.status])).toEqual([
      ['Grand dentelé', 8, 2, 10, 'ok'],
      ['Rhomboïde', 8, 2, 10, 'ok'],
      ['Deltoïde ant', 4, 0, 4, 'ok'],
      ['Extension thoracique', 4, 0, 4, 'ok'],
    ]);
    expect(programIssues(context, plan).filter((i) => i.kind === 'component_volume')).toEqual([]);
    // Combo libre n'accepte plus rien : le grand dentelé et le rhomboïde n'ont plus que 3 soirs, 6 séries.
    const strict = { ...plan, componentAcceptance: { cl: 'none' as const, matin: 'endurance' as const } };
    expect(programIssues({ ...context, componentPlan: strict }, strict).filter((i) => i.kind === 'component_volume')).toEqual([
      { kind: 'component_volume', elementId: gd.id, status: 'under_min' },
      { kind: 'component_volume', elementId: rh.id, status: 'under_min' },
    ]);
  });

  it('séances complètes : un minimum de 5 fait 6 séries ; jamais au-delà du maximum', () => {
    const { plan, templates } = november();
    const five = { ...plan, components: [component(gd.id)], componentVolumes: [volume(gd.id, 'endurance', 5, 6)] };
    expect(distributeComponents(five, templates).totals.get(`c-${gd.id}`)).toEqual({ evening: 6, extra: 0 });
    const capped = { ...five, componentVolumes: [volume(gd.id, 'endurance', 5, 5)] };
    expect(distributeComponents(capped, templates).totals.get(`c-${gd.id}`)).toEqual({ evening: 4, extra: 0 });
  });

  it('semaine type : une séance du soir optionnelle complète jusqu’au maximum, comme un matin', () => {
    const max = session('Max', 'max');
    const leger = session('Technique léger', 'leger', 'evening', { optional: true });
    const templates = new Map([max, leger].map((t) => [t.id, t]));
    const plan = settings({
      weekPlan: weekPlan({ 1: { evening: max.id }, 3: { evening: max.id }, 7: { evening: leger.id } }),
      componentVolumes: [volume(gd.id, 'endurance', 4, 6)],
      components: [component(gd.id)],
      componentBlockTypeId: renfo.id,
    });
    const d = distributeComponents(plan, templates);
    expect([...d.bySlot.keys()]).toEqual(['1:evening', '3:evening', '7:evening']);
    expect(slotComponentLines(plan, templates, 7, 'evening').map((l) => l.optional)).toEqual([true]);
    expect(d.totals.get(`c-${gd.id}`)).toEqual({ evening: 4, extra: 2 });
  });

  it('sans composante répartie : rien ne change', () => {
    const { plan, templates } = november();
    const written = { ...plan, components: [] };
    expect(distributeComponents(written, templates).bySlot.size).toBe(0);
    expect(slotComponentLines(written, templates, 1, 'evening')).toEqual([]);
  });

  it('une ligne déjà dans la séance n’est pas doublée', () => {
    const { plan, templates, st } = november();
    const lines = slotComponentLines(plan, templates, 1, 'evening');
    const once = withComponents(st, lines);
    expect(withComponents(once, lines).items).toHaveLength(st.items.length + 3);
  });
});

describe('séries encore prévues et séance express, d’après la répartition', () => {
  it('la tranche porte les composantes de chaque place ; la séance express comble le retard de la séance remplacée', () => {
    const { plan, templates, st } = november();
    const blocks = new Map([[renfo.id, renfo]]);
    const byName = (map: Map<string, number>) => Object.fromEntries([gd, rh, da, et].map((e) => [e.name, map.get(e.id) ?? 0]));
    const empty = tranchePeriod(0, '2026-11-02', plan, templates, []);
    expect(names(empty.days[0].slots.evening.components.map((l) => plan.components.find((c) => c.id === l.id)!))).toEqual(['Grand dentelé', 'Deltoïde ant', 'Extension thoracique']);
    expect(empty.days[1].slots.morning.components.map((l) => l.optional)).toEqual([true]);
    expect(byName(remainingEveningSets(empty.days, [], blocks, plan, { isDeload: false, cycleWeek: 1 }).byElement)).toEqual({
      'Grand dentelé': 8,
      Rhomboïde: 8,
      'Deltoïde ant': 4,
      'Extension thoracique': 4,
    });
    // Une séance faite à la place 1 : il reste les places 2 à 5.
    const done = sessionLog('2026-11-02', { moment: 'evening', templateId: st.id, status: 'done' });
    const period = tranchePeriod(0, '2026-11-03', plan, templates, [done]);
    expect(byName(remainingEveningSets(period.days, [], blocks, plan, { isDeload: false, cycleWeek: 1 }).byElement)).toEqual({
      'Grand dentelé': 6,
      Rhomboïde: 8,
      'Deltoïde ant': 2,
      'Extension thoracique': 2,
    });

    // Séance express à la place de la séance 1, rien de fait : la force (places 1 et 3) et le grand dentelé sont en retard.
    const context = { weekPlan: plan.weekPlan, templates, elements: [planche, gd, rh, da, et], blocks, exercises: new Map(), sequence: true, componentPlan: plan };
    const needs = componentNeeds({ program: context, settings: plan, period: empty, cycleWeek: 1, sets: [], sessions: new Map(), replaced: { date: '2026-11-02', moment: 'evening' } });
    expect(Object.fromEntries(needs.map((n) => [n.name, n.deficit]))).toEqual({ 'Grand dentelé': 2, Rhomboïde: 0, 'Deltoïde ant': 2, 'Extension thoracique': 2 });
    const replaced = withComponents(st, slotComponentLines(plan, templates, 1, 'evening'));
    let n = 0;
    const express = buildExpress({ minutes: 45, replaced, name: 'Express', isDeload: false, cycleWeek: 1, program: context, settings: plan, needs, newId: () => `x${++n}` });
    expect(express.components.filter((c) => c.deficitSets > 0).map((c) => [c.name, c.deficitSets])).toEqual([
      ['Grand dentelé', 2],
      ['Deltoïde ant', 2],
      ['Extension thoracique', 2],
    ]);
    const line = express.template.items.find((i) => i.elementId === da.id)!;
    expect(line).toMatchObject({ blockTypeId: renfo.id, restText: '60 s', setsMin: line.setsMax });
  });
});
