import { describe, expect, it } from 'vitest';
import { appSettings, item, program, template, weekPlan } from '../test/builders';
import { dayInfo, isObjectiveTestWeek } from './cycle';
import {
  duplicateProgram,
  effectiveSettings,
  nextProgramStartWeek,
  nextTestDate,
  programAtWeek,
  programFromLegacySettings,
  programNameFor,
  programObjectives,
  programPhase,
  programStartDate,
  programWeeks,
  settingsAtDate,
  splitSettingsPatch,
  startWeekError,
} from './programs';
import type { Objective, SessionType } from './types';

// Séquence réelle : semaine 1 = lundi 05/10/2026 ; novembre commence en semaine 5, le lundi 02/11/2026.
const app = appSettings({ cycleStartDate: '2026-10-05' });
const october = program({ id: 'oct', name: 'Octobre 2026', startWeek: 1 });
const november = program({ id: 'nov', name: 'Novembre 2026', startWeek: 5, cycleLengthWeeks: 5, deloadWeek: 5, volumeMax: 10 });
const programs = [november, october];

describe('programme en vigueur', () => {
  it('suit les semaines de début ; avant le premier, le premier', () => {
    expect(programAtWeek(programs, 0)?.id).toBe('oct');
    expect(programAtWeek(programs, 1)?.id).toBe('oct');
    expect(programAtWeek(programs, 4)?.id).toBe('oct');
    expect(programAtWeek(programs, 5)?.id).toBe('nov');
    expect(programAtWeek(programs, 40)?.id).toBe('nov');
    expect(programAtWeek([], 3)).toBeUndefined();
  });

  it('donne ses semaines, sa date de début et sa phase', () => {
    expect(programWeeks(programs, october)).toEqual({ startWeek: 1, endWeek: 4 });
    expect(programWeeks(programs, november)).toEqual({ startWeek: 5, endWeek: null });
    expect(programStartDate(app, november)).toBe('2026-11-02');
    expect(programPhase(programs, october, 4)).toBe('current');
    expect(programPhase(programs, november, 4)).toBe('upcoming');
    expect(programPhase(programs, october, 5)).toBe('past');
  });

  it('donne les réglages effectifs d’une date', () => {
    expect(settingsAtDate(app, programs, '2026-11-01')).toMatchObject({ programId: 'oct', volumeMax: 6, programStartWeek: 1 });
    expect(settingsAtDate(app, programs, '2026-11-02')).toMatchObject({ programId: 'nov', volumeMax: 10, programStartWeek: 5, cycleStartDate: '2026-10-05' });
  });

  it('sépare une écriture entre réglages de l’appli et du programme', () => {
    expect(splitSettingsPatch({ cycleStartDate: '2026-10-06', volumeMin: 3, weekPlan: weekPlan({}), programId: 'x' })).toEqual({
      app: { cycleStartDate: '2026-10-06' },
      program: { volumeMin: 3, weekPlan: weekPlan({}) },
    });
  });
});

describe('cycle d’un programme', () => {
  it('commence en S1 à la semaine de début du programme', () => {
    const s = effectiveSettings(app, november);
    expect(dayInfo('2026-11-02', s)).toMatchObject({ week: 5, cycle: 1, cycleWeek: 1, isDeload: false, seqDay: 1 });
    expect(dayInfo('2026-11-30', s)).toMatchObject({ week: 9, cycle: 1, cycleWeek: 5, isDeload: true });
    expect(dayInfo('2026-12-07', s)).toMatchObject({ week: 10, cycle: 2, cycleWeek: 1 });
  });

  it('teste les objectifs au début de chaque programme et de chaque cycle, jamais en semaine 1', () => {
    expect(isObjectiveTestWeek(dayInfo('2026-10-05', effectiveSettings(app, october)))).toBe(false);
    expect(isObjectiveTestWeek(dayInfo('2026-11-02', effectiveSettings(app, november)))).toBe(true);
    expect(isObjectiveTestWeek(dayInfo('2026-11-09', effectiveSettings(app, november)))).toBe(false);
    expect(isObjectiveTestWeek(dayInfo('2026-12-07', effectiveSettings(app, november)))).toBe(true);
  });
});

describe('programme suivant', () => {
  it('propose la fin du cycle en cours du dernier programme, jamais avant la semaine prochaine', () => {
    expect(nextProgramStartWeek([october], 4)).toBe(5);
    expect(nextProgramStartWeek([october], 5)).toBe(9);
    expect(nextProgramStartWeek(programs, 4)).toBe(10);
    expect(nextProgramStartWeek([], 3)).toBe(3);
  });

  it('refuse une semaine prise, passée ou en cours', () => {
    expect(startWeekError(programs, null, 5, 4)).toBe('Un autre programme commence déjà cette semaine-là.');
    expect(startWeekError(programs, null, 4, 4)).toBe('Un nouveau programme commence au plus tôt la semaine prochaine.');
    expect(startWeekError(programs, 'nov', 6, 4)).toBeNull();
    expect(startWeekError([october], 'oct', 1, 4)).toBeNull();
    expect(startWeekError(programs, null, 0, 0)).toBe('Semaine de début invalide.');
  });

  it('nomme un programme d’après le mois de son début', () => {
    expect(programNameFor('2026-11-02')).toBe('Novembre 2026');
    expect(programNameFor('')).toBe('Programme');
  });

  it('duplique semaine type, modèles (archivés compris), objectifs et réglages, sans toucher à la source', () => {
    const line = item({ blockTypeId: 'skill', elementId: 'planche' });
    const max = template('Max', 'evening', [line], { programId: 'oct' });
    const old = template('Ancien', 'evening', [], { programId: 'oct', archived: true });
    const other = template('Autre programme', 'evening', [], { programId: 'ailleurs' });
    const source = { ...october, weekPlan: weekPlan({ 1: { evening: max.id }, 5: { evening: max.id } }), objectiveIds: ['o1'] };
    let n = 0;
    const { program: copy, templates } = duplicateProgram(source, [max, old, other], { newId: () => `n${++n}`, name: 'Novembre 2026', startWeek: 5, now: 42 });
    expect(templates.map((t) => t.name)).toEqual(['Max', 'Ancien']);
    expect(templates.every((t) => t.programId === copy.id)).toBe(true);
    const copiedMax = templates[0];
    expect(copiedMax.id).not.toBe(max.id);
    expect(copiedMax.items[0].id).not.toBe(line.id);
    expect(copiedMax.items[0]).toMatchObject({ blockTypeId: 'skill', elementId: 'planche' });
    expect(templates[1].archived).toBe(true);
    expect(copy).toMatchObject({ name: 'Novembre 2026', startWeek: 5, createdAt: 42, objectiveIds: ['o1'], volumeMin: october.volumeMin });
    expect(copy.weekPlan[1].evening).toBe(copiedMax.id);
    expect(copy.weekPlan[5].evening).toBe(copiedMax.id);
    expect(source.weekPlan[1].evening).toBe(max.id);
    expect(max.programId).toBe('oct');
  });
});

describe('objectifs et tests', () => {
  const objective = (id: string): Objective => ({ id, name: id, criterion: '', target: 1, unit: 'reps', exerciseId: null, order: 0, tests: [] });

  it('sépare les objectifs du programme des anciens objectifs', () => {
    const { current, former } = programObjectives([objective('a'), objective('b'), objective('c')], { objectiveIds: ['c', 'a'] });
    expect(current.map((o) => o.id)).toEqual(['a', 'c']);
    expect(former.map((o) => o.id)).toEqual(['b']);
  });

  it('donne le prochain jour de test en suivant les programmes à venir', () => {
    const maxType: SessionType = { id: 'max', name: 'Max', moment: 'evening', description: '', color: '', isTestDay: true };
    const types = new Map([[maxType.id, maxType]]);
    const octMax = template('Max', 'evening', [], { sessionTypeId: 'max', programId: 'oct' });
    const novMax = template('A — Planche', 'evening', [], { sessionTypeId: 'max', programId: 'nov' });
    const templates = new Map([octMax, novMax].map((t) => [t.id, t]));
    const oct = { ...october, weekPlan: weekPlan({ 1: { evening: octMax.id } }) };
    const nov = { ...november, weekPlan: weekPlan({ 2: { evening: novMax.id } }) };
    expect(nextTestDate('2026-10-27', app, [oct, nov], templates, types)).toEqual({ date: '2026-11-03', week: 5, programId: 'nov' });
    // Seul, octobre aurait testé le J1 de la semaine 5.
    expect(nextTestDate('2026-10-27', app, [oct], templates, types)).toEqual({ date: '2026-11-02', week: 5, programId: 'oct' });
    // Novembre sans jour de test : aucun test, octobre s'arrête avant sa semaine 5.
    expect(nextTestDate('2026-10-27', app, [oct, { ...nov, weekPlan: weekPlan({}) }], templates, types)).toBeNull();
    // Le jour même, puis le cycle suivant de novembre (5 semaines).
    expect(nextTestDate('2026-11-03', app, [oct, nov], templates, types)).toMatchObject({ date: '2026-11-03', week: 5 });
    expect(nextTestDate('2026-11-04', app, [oct, nov], templates, types)).toMatchObject({ date: '2026-12-08', week: 10 });
  });
});

describe('premier programme tiré des anciens réglages', () => {
  it('reprend cycle, volume, matins et semaine type ; garde le reste dans les réglages', () => {
    const plan = weekPlan({ 1: { evening: 'tpl' } });
    const legacy = {
      id: 'settings',
      cycleStartDate: '2026-10-05',
      cycleLengthWeeks: 4,
      deloadWeek: 4,
      deloadReductionPct: 40,
      hideMorningsInDeload: true,
      volumeMin: 4,
      volumeMax: 6,
      morningMaxMinutes: 30,
      avgWorkSecPerSet: 30,
      freeRestSec: 30,
      lastBackupAt: null,
      weekPlan: plan,
    };
    const { program: first, app: rest } = programFromLegacySettings(legacy, { id: 'p', objectiveIds: ['o'], now: 1 });
    expect(first).toMatchObject({ id: 'p', name: 'Octobre 2026', startWeek: 1, objectiveIds: ['o'], weekPlan: plan, volumeMax: 6 });
    expect(rest).toEqual({ id: 'settings', cycleStartDate: '2026-10-05', avgWorkSecPerSet: 30, freeRestSec: 30, lastBackupAt: null });
  });
});
