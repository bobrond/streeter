import { describe, expect, it } from 'vitest';
import { block, element, item, settings, template, weekPlan } from '../test/builders';
import type { SessionLog, SessionTemplate, SetLog } from './types';
import {
  plannedComponentVolume,
  realizedSkillSets,
  programIssues,
  realizedComponentVolume,
  skillTotals,
  volumeStatus,
  type Program,
} from './volume';

const planche = element('Planche', 'skill', 0);
const fl = element('Touch FL', 'skill', 1);
const dentele = element('Grand dentelé', 'component', 2);
const rhomboide = element('Rhomboïde', 'component', 3);
const elements = [planche, fl, dentele, rhomboide];

const warmUp = block('Échauffement', 0, { reducedInDeload: false });
const skill = block('Skill', 1, { alternateSkills: true });
const renfo = block('Renfo composantes', 2);
const blocks = new Map([warmUp, skill, renfo].map((b) => [b.id, b]));

const s = settings({ volumeMin: 4, volumeMax: 6, deloadReductionPct: 40 });

function program(templates: SessionTemplate[], plan: Program['weekPlan']): Program {
  return { weekPlan: plan, templates: new Map(templates.map((t) => [t.id, t])), elements, blocks };
}

const skills = (min = 4, max = 5) => [
  item({ blockTypeId: skill.id, elementId: planche.id, setsMin: min, setsMax: max }),
  item({ blockTypeId: skill.id, elementId: fl.id, setsMin: min, setsMax: max }),
];

describe('volumeStatus (formule du tableur)', () => {
  it('teste d’abord le minimum garanti par le soir, puis le maximum', () => {
    expect(volumeStatus(4, 6, 4, 6)).toBe('ok');
    expect(volumeStatus(3, 6, 4, 6)).toBe('under_min');
    expect(volumeStatus(4, 7, 4, 6)).toBe('over_max');
    expect(volumeStatus(3, 7, 4, 6)).toBe('under_min');
  });
});

describe('plannedComponentVolume', () => {
  // Schéma du programme réel : 2 soirs × 2 séries + 1 matin × 2 séries.
  const eveningA = template('Combo', 'evening', [...skills(), item({ blockTypeId: renfo.id, elementId: dentele.id })]);
  const eveningB = template('Max', 'evening', [...skills(), item({ blockTypeId: renfo.id, elementId: rhomboide.id })]);
  const morning = template('Matin A', 'morning', [item({ blockTypeId: renfo.id, elementId: dentele.id, optional: true, superset: true })], {
    optional: true,
  });
  const base = program([eveningA, eveningB, morning], weekPlan({ 1: { evening: eveningB.id }, 2: { evening: eveningA.id }, 4: { morning: morning.id }, 6: { evening: eveningA.id } }));

  it('compte soir, matin et total par composante', () => {
    const [d, r] = plannedComponentVolume(base, s);
    expect(d).toMatchObject({ name: 'Grand dentelé', eveningGuaranteed: 4, eveningMax: 4, morningMax: 2, totalMax: 6, status: 'ok' });
    expect(r).toMatchObject({ name: 'Rhomboïde', eveningGuaranteed: 2, eveningMax: 2, morningMax: 0, totalMax: 2, status: 'under_min' });
  });

  it('compte un modèle utilisé deux fois dans la semaine (J2 et J6)', () => {
    expect(plannedComponentVolume(base, s)[0].eveningMax).toBe(4);
  });

  it('calcule le minimum garanti sur les séries min', () => {
    const range = template('Combo', 'evening', [...skills(), item({ blockTypeId: renfo.id, elementId: dentele.id, setsMin: 1, setsMax: 2 })]);
    const p = program([range], weekPlan({ 2: { evening: range.id }, 6: { evening: range.id } }));
    expect(plannedComponentVolume(p, s)[0]).toMatchObject({ eveningGuaranteed: 2, eveningMax: 4, status: 'under_min' });
  });

  it('ne compte pas une ligne ni une séance du soir optionnelles dans le minimum garanti', () => {
    const optionalLine = template('Combo', 'evening', [...skills(), item({ blockTypeId: renfo.id, elementId: dentele.id, optional: true })]);
    const optionalSession = template('Technique léger', 'evening', [...skills(), item({ blockTypeId: renfo.id, elementId: dentele.id })], {
      optional: true,
    });
    const p = program([eveningA, optionalLine, optionalSession], weekPlan({ 2: { evening: eveningA.id }, 3: { evening: optionalLine.id }, 7: { evening: optionalSession.id } }));
    expect(plannedComponentVolume(p, s)[0]).toMatchObject({ eveningGuaranteed: 2, eveningMax: 6, totalMax: 6, status: 'under_min' });
  });

  it('signale un dépassement du maximum, matins compris', () => {
    const bigMorning = template('Matin A', 'morning', [item({ blockTypeId: renfo.id, elementId: dentele.id, setsMin: 3, setsMax: 3 })]);
    const p = program([eveningA, bigMorning], weekPlan({ 2: { evening: eveningA.id }, 6: { evening: eveningA.id }, 4: { morning: bigMorning.id } }));
    expect(plannedComponentVolume(p, s)[0]).toMatchObject({ totalMax: 7, status: 'over_max' });
  });

  it('passe « Sous le min (soir) » quand on retire une série du soir', () => {
    const fewer = template('Combo', 'evening', [...skills(), item({ blockTypeId: renfo.id, elementId: dentele.id, setsMin: 1, setsMax: 1 })]);
    const p = program([eveningA, fewer, morning], weekPlan({ 2: { evening: eveningA.id }, 6: { evening: fewer.id }, 4: { morning: morning.id } }));
    expect(plannedComponentVolume(p, s)[0]).toMatchObject({ eveningGuaranteed: 3, totalMax: 5, status: 'under_min' });
  });

  it('calcule le soir allégé ligne par ligne', () => {
    expect(plannedComponentVolume(base, s)[0].deloadEvening).toBe(2);
  });

  it('liste une composante jamais programmée, sous le minimum', () => {
    const p = program([eveningA], weekPlan({ 2: { evening: eveningA.id } }));
    expect(plannedComponentVolume(p, s)[1]).toMatchObject({ name: 'Rhomboïde', eveningMax: 0, status: 'under_min' });
  });
});

describe('skillTotals', () => {
  it('somme min et max, compte les jours distincts et le max allégé', () => {
    const max = template('Max', 'evening', [
      item({ blockTypeId: warmUp.id, elementId: 'connexion' }),
      item({ blockTypeId: skill.id, elementId: planche.id, setsMin: 4, setsMax: 5 }),
      item({ blockTypeId: skill.id, elementId: planche.id, setsMin: 3, setsMax: 5 }),
      item({ blockTypeId: skill.id, elementId: fl.id, setsMin: 4, setsMax: 5 }),
    ]);
    const morning = template('Matin A', 'morning', [item({ blockTypeId: renfo.id, elementId: planche.id, setsMin: 2, setsMax: 3 })]);
    const p = program([max, morning], weekPlan({ 1: { evening: max.id }, 4: { morning: morning.id }, 5: { evening: max.id } }));
    const totals = skillTotals(p, s);
    expect(totals.map((t) => [t.blockTypeId, t.elementId, t.setsMin, t.setsMax, t.sessions, t.deloadMax])).toEqual([
      [skill.id, planche.id, 14, 20, 2, 12],
      [skill.id, fl.id, 8, 10, 2, 6],
      [renfo.id, planche.id, 2, 3, 1, 0],
    ]);
  });
});

describe('realizedComponentVolume', () => {
  const session = (id: string, week: number, moment: SessionLog['moment']) => ({ id, week, moment, date: '2026-10-07' }) as SessionLog;
  const set = (sessionId: string, elementId: string) => ({ id: `${sessionId}-${elementId}-${Math.random()}`, sessionId, elementId }) as SetLog;
  const sessions = new Map(
    [session('s1', 1, 'evening'), session('s2', 1, 'morning'), session('s3', 2, 'evening')].map((x) => [x.id, x]),
  );

  it('compte les séries de la semaine, soir et matin séparés', () => {
    const sets = [set('s1', dentele.id), set('s1', dentele.id), set('s1', dentele.id), set('s1', dentele.id), set('s2', dentele.id), set('s3', dentele.id), set('s1', planche.id)];
    const [d, r] = realizedComponentVolume(sets, sessions, elements, s, { week: 1, isDeload: false });
    expect(d).toMatchObject({ evening: 4, morning: 1, total: 5, status: 'ok' });
    expect(r).toMatchObject({ evening: 0, total: 0, status: 'under_min' });
  });

  it('affiche « Semaine allégée » en semaine allégée', () => {
    const [d] = realizedComponentVolume([set('s1', dentele.id)], sessions, elements, s, { week: 1, isDeload: true });
    expect(d.status).toBe('deload');
  });
});

describe('programIssues', () => {
  it('signale un soir sans touch FL, une composante hors bornes et un matin trop long', () => {
    const onlyPlanche = template('Max', 'evening', [item({ blockTypeId: skill.id, elementId: planche.id })]);
    const longMorning = template('Matin A', 'morning', [item({ blockTypeId: renfo.id, elementId: planche.id, setsMin: 10, setsMax: 10, restMinSec: 180, restMaxSec: 180 })]);
    const p = program([onlyPlanche, longMorning], weekPlan({ 1: { evening: onlyPlanche.id }, 4: { morning: longMorning.id } }));
    const issues = programIssues(p, s);
    expect(issues).toContainEqual({ kind: 'evening_missing_skill', templateId: onlyPlanche.id, elementId: fl.id });
    expect(issues).toContainEqual({ kind: 'component_volume', elementId: dentele.id, status: 'under_min' });
    expect(issues).toContainEqual({ kind: 'morning_too_long', templateId: longMorning.id, maxSec: 2100 });
  });
});

describe('realizedSkillSets', () => {
  it('compte les séries de skill de la semaine par bloc', () => {
    const w1 = { id: 'w1', week: 1 } as SessionLog;
    const w2 = { id: 'w2', week: 2 } as SessionLog;
    const sessions = new Map([w1, w2].map((x) => [x.id, x]));
    const sets = [
      { sessionId: 'w1', blockTypeId: skill.id, elementId: planche.id },
      { sessionId: 'w1', blockTypeId: skill.id, elementId: planche.id },
      { sessionId: 'w1', blockTypeId: renfo.id, elementId: dentele.id },
      { sessionId: 'w2', blockTypeId: skill.id, elementId: fl.id },
    ] as SetLog[];
    const counts = realizedSkillSets(sets, sessions, elements, 1);
    expect([...counts]).toEqual([[`${skill.id}|${planche.id}`, 2]]);
  });
});
