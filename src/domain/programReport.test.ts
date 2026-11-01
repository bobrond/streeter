import { describe, expect, it } from 'vitest';
import {
  appSettings,
  block,
  element,
  exercise,
  item,
  program,
  sessionLog,
  setLog,
  template,
  weekPlan,
} from '../test/builders';
import type { Band, Objective, ProgramComponent } from './types';
import { buildProgramReport, computeTrainingGaps } from './programReport';
import { sequenceWeekPlan } from './sequence';

const planche = element('Planche', 'skill', 0);
const fl = element('Touch FL', 'skill', 1);
const dentele = element('Grand dentelé', 'component', 2);
const deltoide = element('Deltoïde ant', 'component', 3);
const elements = [planche, fl, dentele, deltoide];

const warmUp = block('Échauffement', 0, { reducedInDeload: false });
const prio = block('Travail prioritaire', 1);
const main = block('Travail principal', 2, { alternateSkills: true });
const assist = block('Assisté / progression', 3, { alternateSkills: true });
const compBlock = block('Renfo composante', 4);
const blockTypes = [warmUp, prio, main, assist, compBlock];

const blueBand: Band = { id: 'b-blue', name: 'Bleue', color: '#2babe8', order: 3, active: true };
const greenBand: Band = { id: 'b-green', name: 'Verte', color: '#22c55e', order: 2, active: true };
const bands = [greenBand, blueBand];

const exLeanUp = exercise('Planche lean-up', planche.id, { measure: 'seconds', order: 0 });
const exPlancheHold = exercise('Planche Hold', planche.id, { measure: 'seconds', order: 1 });
const exFlFull = exercise('Touch FL hold full', fl.id, { measure: 'seconds', order: 2 });
const exFlAdvTuck = exercise('Touch FL hold adv tuck', fl.id, { measure: 'seconds', order: 3 });
const exScapPush = exercise('Pompes scapulaires', dentele.id, { measure: 'reps', order: 4 });
const exPike = exercise('Pike push-ups', deltoide.id, { measure: 'reps', order: 5 });
const exActivation = exercise('Activation élastique', null, { measure: 'none', order: 6 });
const exercises = [exLeanUp, exPlancheHold, exFlFull, exFlAdvTuck, exScapPush, exPike, exActivation];

describe('computeTrainingGaps', () => {
  it('ignore les pauses de 2 jours ou moins et relève celles de 3 jours ou plus (début, milieu, fin)', () => {
    // 01/11 → 04/11 : 3 jours sans séance avant la 1re séance le 04/11 (01, 02, 03).
    // 04/11 → 07/11 : 2 jours sans séance (05, 06) → OK.
    // 07/11 → 12/11 : 4 jours sans séance (08, 09, 10, 11).
    // 12/11 → 16/11 (fin) : 4 jours sans séance (13, 14, 15, 16).
    const gaps = computeTrainingGaps(['2026-11-04', '2026-11-07', '2026-11-12'], '2026-11-01', '2026-11-16');
    expect(gaps).toEqual([
      {
        fromDate: '2026-11-01',
        toDate: '2026-11-03',
        daysWithoutSession: 3,
        previousSessionDate: null,
        nextSessionDate: '2026-11-04',
      },
      {
        fromDate: '2026-11-08',
        toDate: '2026-11-11',
        daysWithoutSession: 4,
        previousSessionDate: '2026-11-07',
        nextSessionDate: '2026-11-12',
      },
      {
        fromDate: '2026-11-13',
        toDate: '2026-11-16',
        daysWithoutSession: 4,
        previousSessionDate: '2026-11-12',
        nextSessionDate: null,
      },
    ]);
  });

  it('ne signale rien si l’utilisateur ne dépasse jamais 2 jours sans séance', () => {
    expect(computeTrainingGaps(['2026-11-01', '2026-11-04', '2026-11-07'], '2026-11-01', '2026-11-09')).toEqual([]);
  });
});

describe('buildProgramReport — programme en séquence (composantes réparties, records, progressions inférieures)', () => {
  const app = appSettings({ cycleStartDate: '2026-10-05' });

  const leanItem = item({
    id: 'it-lean',
    blockTypeId: prio.id,
    elementId: planche.id,
    candidateExerciseIds: [exLeanUp.id],
    setsMin: 4,
    setsMax: 4,
    byTranche: { 2: { setsMin: 2, setsMax: 2 } },
  });
  const holdItem = item({
    id: 'it-hold',
    blockTypeId: main.id,
    elementId: planche.id,
    candidateExerciseIds: [exPlancheHold.id],
    setsMin: 3,
    setsMax: 4,
  });
  const flAssistItem = item({
    id: 'it-fl-assist',
    blockTypeId: assist.id,
    elementId: fl.id,
    candidateExerciseIds: [exFlFull.id],
    lowerProgressionIds: [exFlAdvTuck.id],
    setsMin: 3,
    setsMax: 3,
  });

  const compDentele: ProgramComponent = {
    id: 'comp-dent',
    elementId: dentele.id,
    setsPerSession: 2,
    candidateExerciseIds: [exScapPush.id],
    candidatesText: exScapPush.name,
    targetText: '12 reps',
    targets: [{ unit: 'reps', min: 12, max: 12 }],
    intensityText: 'RPE 8',
    intensity: null,
    restText: '60 s',
    restMinSec: 60,
    restMaxSec: 60,
    notes: '',
  };
  const compDelto: ProgramComponent = {
    id: 'comp-delto',
    elementId: deltoide.id,
    setsPerSession: 2,
    candidateExerciseIds: [exPike.id],
    candidatesText: exPike.name,
    targetText: '6 reps',
    targets: [{ unit: 'reps', min: 6, max: 6 }],
    intensityText: 'RPE 8',
    intensity: null,
    restText: '90 s',
    restMinSec: 90,
    restMaxSec: 90,
    notes: '',
  };

  const seanceType = template('Séance type', 'evening', [leanItem, holdItem, flAssistItem], {
    id: 'tpl-seance',
    programId: 'nov',
  });
  const autreSoir = template('Technique léger', 'evening', [holdItem], {
    id: 'tpl-autre',
    programId: 'nov',
    optional: true,
  });
  const matin = template('Matin', 'morning', [], {
    id: 'tpl-matin',
    programId: 'nov',
    optional: true,
  });

  // Tranche de 2 soirs + 1 matin, cycle de 2 tranches dont la 2e allégée (−40 %, matins masqués).
  const november = program({
    id: 'nov',
    name: 'Novembre 2026',
    startWeek: 5,
    schedule: 'sequence',
    startDate: '2026-11-02',
    cycleLengthWeeks: 2,
    deloadWeek: 2,
    deloadReductionPct: 40,
    hideMorningsInDeload: true,
    notes: 'Priorité à la protraction.',
    objectiveIds: ['obj-planche'],
    componentVolumes: [
      { elementId: dentele.id, work: 'endurance', min: 4, max: 6 },
      { elementId: deltoide.id, work: 'force', min: 4, max: 6 },
    ],
    components: [compDentele, compDelto],
    componentBlockTypeId: compBlock.id,
    componentAcceptance: {},
    weekPlan: sequenceWeekPlan([seanceType.id, seanceType.id], [matin.id]),
  });

  const october = program({
    id: 'oct',
    name: 'Octobre 2026',
    startWeek: 1,
    schedule: 'week',
  });

  const objPlanche: Objective = {
    id: 'obj-planche',
    name: 'Planche hold',
    criterion: 'Protraction complète',
    target: 10,
    unit: 'seconds',
    exerciseId: exPlancheHold.id,
    order: 0,
    tests: [
      { id: 't-oct', date: '2026-10-15', value: 6, note: ' Départ ' },
      { id: 't-nov', date: '2026-11-03', value: 8, note: 'Plus solide' },
      // Test futur hors programme : doit être ignoré !
      { id: 't-dec', date: '2026-12-05', value: 11, note: 'Cycle suivant' },
    ],
  };
  const objFormer: Objective = {
    id: 'obj-former',
    name: 'Ancien objectif FL',
    criterion: '',
    target: 15,
    unit: 'seconds',
    exerciseId: exFlFull.id,
    order: 1,
    tests: [{ id: 't-former', date: '2026-11-10', value: 12, note: '' }],
  };

  it('calcule le volume par tranche (allégé compris), les records all-time, les progressions inférieures, les écarts et les notes', () => {
    // Séance d'octobre avant le programme : Planche Hold à 7 s sans élastique, Pompes scapulaires à 15 reps, Pike à 8 reps.
    const sesOct = sessionLog('2026-10-20', { id: 's-oct', week: 3 });
    const priorSets = [
      setLog({ sessionId: sesOct.id, exerciseId: exPlancheHold.id, elementId: planche.id, value: 7 }),
      setLog({ sessionId: sesOct.id, exerciseId: exScapPush.id, elementId: dentele.id, value: 15 }),
      setLog({ sessionId: sesOct.id, exerciseId: exPike.id, elementId: deltoide.id, value: 8 }),
    ];

    // Novembre T1 :
    // - 02/11 soir 1 (Séance type) : Planche Hold 8 s (bat les 7 s d'octobre !), Lean-up 3 s (1re fois : ne bat rien),
    //   FL assisté : 2 séries élastique bleue (10 s) + 1 série en progression inférieure Adv tuck (12 s),
    //   1 série dégradée sur Planche Hold (9 s dégradée : ne compte pas comme record !),
    //   1 série d'échauffement (hors volume et hors record),
    //   Grand dentelé 2 séries (16 reps : bat les 15 reps d'octobre !), Pike 2 séries (7 reps <= 8 reps d'octobre : pas de record !).
    const s1 = sessionLog('2026-11-02', {
      id: 's-1',
      week: 5,
      templateId: seanceType.id,
      templateSnapshot: seanceType,
      note: 'Bonne énergie',
    });
    // - 04/11 matin (2s Grand dentelé)
    const sMatin = sessionLog('2026-11-04', {
      id: 's-m1',
      week: 5,
      moment: 'morning',
      templateId: matin.id,
      templateSnapshot: matin,
    });
    // - 05/11 séance abandonnée (ne fait pas avancer la séquence, mais sa série faite compte dans le volume de T1)
    const sAband = sessionLog('2026-11-05', {
      id: 's-ab',
      week: 5,
      status: 'abandoned',
      templateId: seanceType.id,
      templateSnapshot: seanceType,
      startedAt: 1_000,
      endedAt: 601_000,
      note: 'Pluie soudaine',
    });
    // Pause du 06/11 au 09/11 : 4 jours sans séance faite (sAband n'est pas `done`, donc entre le 04/11 et le 10/11 = 5 jours !).
    // - 10/11 soir 2 de T1 : séance express 30 min remplaçant Séance type ; Lean-up passe à 4 s (bat la 1re séance à 3 s !).
    const s2Express = sessionLog('2026-11-10', {
      id: 's-2',
      week: 6,
      templateId: seanceType.id,
      templateSnapshot: { ...seanceType, name: 'Express 30 min · Séance type' },
      expressMinutes: 30,
      startedAt: 10_000,
      endedAt: 1_810_000,
    });
    // Novembre T2 (allégée) :
    // - 12/11 soir 1 de T2 : autre séance (« Technique léger » à la place de « Séance type »)
    const s3Replaced = sessionLog('2026-11-12', {
      id: 's-3',
      week: 6,
      deload: true,
      templateId: autreSoir.id,
      templateSnapshot: autreSoir,
    });
    // Séance en cours le 13/11 : ignorée des calculs.
    const sInProgress = sessionLog('2026-11-13', {
      id: 's-ip',
      week: 6,
      status: 'in_progress',
      templateId: seanceType.id,
      templateSnapshot: seanceType,
    });

    const novSets = [
      // s1
      setLog({ sessionId: s1.id, itemId: holdItem.id, blockTypeId: main.id, elementId: planche.id, exerciseId: exPlancheHold.id, value: 4, kind: 'warmup' }),
      setLog({ sessionId: s1.id, itemId: holdItem.id, blockTypeId: main.id, elementId: planche.id, exerciseId: exPlancheHold.id, value: 8, quality: 'clean', note: 'Bras bien tendus' }),
      setLog({ sessionId: s1.id, itemId: holdItem.id, blockTypeId: main.id, elementId: planche.id, exerciseId: exPlancheHold.id, value: 9, quality: 'degraded', rpe: 9.5, note: 'Coude fléchi' }),
      setLog({ sessionId: s1.id, itemId: leanItem.id, blockTypeId: prio.id, elementId: planche.id, exerciseId: exLeanUp.id, value: 3, quality: 'clean' }),
      setLog({ sessionId: s1.id, itemId: flAssistItem.id, blockTypeId: assist.id, elementId: fl.id, exerciseId: exFlFull.id, value: 10, bandId: blueBand.id, quality: 'clean' }),
      setLog({ sessionId: s1.id, itemId: flAssistItem.id, blockTypeId: assist.id, elementId: fl.id, exerciseId: exFlAdvTuck.id, value: 12, bandId: null, quality: 'clean' }),
      setLog({ sessionId: s1.id, itemId: compDentele.id, blockTypeId: compBlock.id, elementId: dentele.id, exerciseId: exScapPush.id, value: 16, kind: 'failure' }),
      setLog({ sessionId: s1.id, itemId: compDentele.id, blockTypeId: compBlock.id, elementId: dentele.id, exerciseId: exScapPush.id, value: 14 }),
      setLog({ sessionId: s1.id, itemId: compDelto.id, blockTypeId: compBlock.id, elementId: deltoide.id, exerciseId: exPike.id, value: 7 }),
      setLog({ sessionId: s1.id, itemId: compDelto.id, blockTypeId: compBlock.id, elementId: deltoide.id, exerciseId: exPike.id, value: 7 }),
      // sMatin
      setLog({ sessionId: sMatin.id, itemId: compDentele.id, blockTypeId: compBlock.id, elementId: dentele.id, exerciseId: exScapPush.id, value: 15 }),
      setLog({ sessionId: sMatin.id, itemId: compDentele.id, blockTypeId: compBlock.id, elementId: dentele.id, exerciseId: exScapPush.id, value: 15 }),
      // sAband : 1 série de Deltoïde avant l'abandon
      setLog({ sessionId: sAband.id, itemId: compDelto.id, blockTypeId: compBlock.id, elementId: deltoide.id, exerciseId: exPike.id, value: 6 }),
      // s2Express : Lean-up à 4 s (bat les 3 s de s1 !), FL assisté bleue à 12 s (bat les 10 s de s1 !)
      setLog({ sessionId: s2Express.id, itemId: leanItem.id, blockTypeId: prio.id, elementId: planche.id, exerciseId: exLeanUp.id, value: 4, quality: 'clean' }),
      setLog({ sessionId: s2Express.id, itemId: flAssistItem.id, blockTypeId: assist.id, elementId: fl.id, exerciseId: exFlFull.id, value: 12, bandId: blueBand.id, quality: 'clean' }),
      setLog({ sessionId: s2Express.id, itemId: compDentele.id, blockTypeId: compBlock.id, elementId: dentele.id, exerciseId: exScapPush.id, value: 15 }),
      setLog({ sessionId: s2Express.id, itemId: compDentele.id, blockTypeId: compBlock.id, elementId: dentele.id, exerciseId: exScapPush.id, value: 15 }),
      // s3Replaced (T2 allégée) : 1 série Grand dentelé
      setLog({ sessionId: s3Replaced.id, itemId: compDentele.id, blockTypeId: compBlock.id, elementId: dentele.id, exerciseId: exScapPush.id, value: 14 }),
      // sInProgress : ne doit compter nulle part
      setLog({ sessionId: sInProgress.id, itemId: holdItem.id, blockTypeId: main.id, elementId: planche.id, exerciseId: exPlancheHold.id, value: 25, quality: 'clean' }),
    ];

    const report = buildProgramReport({
      program: november,
      app,
      programs: [october, november],
      templates: [seanceType, autreSoir, matin],
      elements,
      blockTypes,
      sessionTypes: [],
      exercises,
      bands,
      objectives: [objPlanche, objFormer],
      sessions: [sesOct, s1, sMatin, sAband, s2Express, s3Replaced, sInProgress],
      sets: [...priorSets, ...novSets],
      today: '2026-11-13',
    });

    expect(report.phase).toBe('current');
    expect(report.counts).toEqual({
      eveningDone: 3,
      morningDone: 1,
      expressDone: 1,
      abandoned: 1,
      inProgress: 1,
    });

    // 2 tranches entamées : T1 complète (2/2 soirs), T2 allégée en cours (1/2 soirs).
    expect(report.periods.map((p) => ({ label: p.label, isDeload: p.isDeload, partial: p.partial, eveningDone: p.eveningDone }))).toEqual([
      { label: 'T1', isDeload: false, partial: false, eveningDone: 2 },
      { label: 'T2', isDeload: true, partial: true, eveningDone: 1 },
    ]);

    // Volume des composantes : T1 comparé à 4-6, T2 allégée comparée au prévu allégé (2 soirs × 1 série = 2).
    const dentRow = report.componentVolume.find((r) => r.elementId === dentele.id)!;
    expect(dentRow.work).toBe('endurance');
    expect(dentRow.periods).toEqual([
      { evening: 4, morning: 2, total: 6, plannedMin: 4, plannedMax: 6, isDeload: false },
      { evening: 1, morning: 0, total: 1, plannedMin: 2, plannedMax: 2, isDeload: true },
    ]);
    const deltoRow = report.componentVolume.find((r) => r.elementId === deltoide.id)!;
    // La série de la séance abandonnée compte bien dans le volume réalisé (2 + 1 = 3).
    expect(deltoRow.periods[0]).toMatchObject({ evening: 3, morning: 0, total: 3, plannedMin: 4, plannedMax: 6 });

    // Volume des skills : Lean-up passe de 8 prévues en T1 (2 × 4) à 4 prévues en T2 (byTranche[2] = 2 × 2, non re-réduit).
    const prioSkill = report.skillVolume.find((r) => r.blockTypeId === prio.id && r.elementId === planche.id)!;
    expect(prioSkill.periods).toEqual([
      { done: 2, plannedMin: 8, plannedMax: 8, isDeload: false },
      { done: 0, plannedMin: 4, plannedMax: 4, isDeload: true },
    ]);
    // Planche Hold (3-4 × 2 = 6-8 en T1 ; en T2 allégée −40 % : 3→2 et 4→2, × 2 = 4-4) ; l'échauffement de s1 est exclu (done = 2).
    const mainSkill = report.skillVolume.find((r) => r.blockTypeId === main.id && r.elementId === planche.id)!;
    expect(mainSkill.periods).toEqual([
      { done: 2, plannedMin: 6, plannedMax: 8, isDeload: false },
      { done: 0, plannedMin: 4, plannedMax: 4, isDeload: true },
    ]);

    // Objectifs : seul le test du 03/11 est retenu (celui du 05/12 est hors dates), comparé aux 6 s d'octobre (+2 s).
    expect(report.objectives).toHaveLength(1);
    expect(report.objectives[0]).toMatchObject({
      name: 'Planche hold',
      status: 'in_progress',
      bestBefore: { value: 6, date: '2026-10-15' },
      tests: [{ date: '2026-11-03', value: 8, deltaFromBefore: 2, note: 'Plus solide' }],
      bestSessionInPeriod: { value: 8, date: '2026-11-02' },
    });
    expect(report.formerObjectivesTested.map((o) => o.name)).toEqual(['Ancien objectif FL']);

    // Records battus all-time :
    // - Planche lean-up : 3 s (1re séance) → 4 s
    // - Planche Hold : 7 s (octobre) → 8 s (les 9 s dégradées et les 25 s en cours sont ignorées !)
    // - Touch FL hold full (élastique Bleue) : 10 s (1re séance) → 12 s
    // - Pompes scapulaires : 15 reps (octobre, série à l'échec compte !) → 16 reps
    // - Touch FL hold adv tuck (1 seule séance à 12 s) et Pike (7 <= 8) : PAS dans les records battus !
    expect(report.beatenRecords.map((r) => [r.exerciseName, r.bandName, r.previousValue, r.value, r.previousOrigin])).toEqual([
      ['Planche lean-up', null, 3, 4, 'first_session'],
      ['Planche Hold', null, 7, 8, 'before_program'],
      ['Touch FL hold full', 'Bleue', 10, 12, 'first_session'],
      ['Pompes scapulaires', null, 15, 16, 'before_program'],
    ]);

    // Progression inférieure relevée à part, rattachée à Touch FL hold full.
    expect(report.lowerProgressions).toEqual([
      {
        exerciseId: exFlAdvTuck.id,
        exerciseName: 'Touch FL hold adv tuck',
        measure: 'seconds',
        replacedLabel: 'Touch FL hold full',
        totalSets: 1,
        bestCleanValue: 12,
        sessions: [{ date: '2026-11-02', periodLabel: 'T1', sessionName: 'Séance type', values: [12] }],
      },
    ]);

    // Écart de rythme entre le 04/11 et le 10/11 (5 jours sans séance validée : du 05/11 au 09/11).
    expect(report.trainingGaps).toEqual([
      {
        fromDate: '2026-11-05',
        toDate: '2026-11-09',
        daysWithoutSession: 5,
        previousSessionDate: '2026-11-04',
        nextSessionDate: '2026-11-10',
      },
    ]);

    // Séance remplacée le 12/11 (hors express).
    expect(report.replacedSlots).toEqual([
      {
        date: '2026-11-12',
        periodLabel: 'T2',
        slotLabel: 'séance 1/2',
        plannedName: 'Séance type',
        doneName: 'Technique léger',
      },
    ]);

    // Abandonnée, express, série dégradée, série à l'échec et notes.
    expect(report.abandonedSessions).toMatchObject([{ date: '2026-11-05', setsDone: 1, durationSec: 600, note: 'Pluie soudaine' }]);
    expect(report.expressSessions).toMatchObject([{ date: '2026-11-10', expressMinutes: 30, replacedName: 'Séance type', setsDone: 4 }]);
    expect(report.degradedLines).toMatchObject([
      {
        date: '2026-11-02',
        exerciseName: 'Planche Hold',
        workSetCount: 2,
        markedSets: [{ label: '2', value: 9, rpe: 9.5, note: 'Coude fléchi' }],
      },
    ]);
    expect(report.failureLines).toMatchObject([{ exerciseName: 'Pompes scapulaires', markedSets: [{ label: '1', value: 16 }] }]);
    expect(report.sessionNotes.map((n) => [n.kind, n.text])).toEqual([
      ['session', 'Bonne énergie'],
      ['set', 'Bras bien tendus'],
      ['set', 'Coude fléchi'],
      ['session', 'Pluie soudaine'],
    ]);
  });
});

describe('buildProgramReport — programme en semaine type (terminé vs en cours)', () => {
  const app = appSettings({ cycleStartDate: '2026-10-05' });
  const soir = template('Max', 'evening', [item({ blockTypeId: main.id, elementId: planche.id, candidateExerciseIds: [exPlancheHold.id], setsMin: 4, setsMax: 4 })], {
    id: 'tpl-max',
    programId: 'oct',
  });
  const matinOpt = template('Matin A', 'morning', [item({ blockTypeId: compBlock.id, elementId: dentele.id, candidateExerciseIds: [exScapPush.id], setsMin: 2, setsMax: 2, optional: true })], {
    id: 'tpl-ma',
    programId: 'oct',
    optional: true,
  });
  const oct = program({
    id: 'oct',
    name: 'Octobre 2026',
    startWeek: 1,
    cycleLengthWeeks: 2,
    deloadWeek: 2,
    weekPlan: weekPlan({
      1: { evening: soir.id },
      3: { morning: matinOpt.id, evening: soir.id },
    }),
  });
  const nov = program({ id: 'nov', name: 'Novembre 2026', startWeek: 3 });

  it('ne compte pas les créneaux futurs comme manqués quand le programme est en cours', () => {
    // Mercredi 07/10 (J3) : J1 (05/10) n'a pas été fait → manqué ; J3 aujourd'hui n'est pas encore passé → pas manqué !
    const report = buildProgramReport({
      program: oct,
      app,
      programs: [oct, nov],
      templates: [soir, matinOpt],
      elements,
      blockTypes,
      sessionTypes: [],
      exercises,
      bands,
      objectives: [],
      sessions: [],
      sets: [],
      today: '2026-10-07',
    });

    expect(report.phase).toBe('current');
    expect(report.periods).toHaveLength(1);
    expect(report.periods[0]).toMatchObject({ label: 'S1', partial: true });
    expect(report.missedSlots).toEqual([
      {
        date: '2026-10-05',
        periodLabel: 'S1',
        seqDay: 1,
        moment: 'evening',
        templateName: 'Max',
        optional: false,
      },
    ]);
  });

  it('couvre toutes les semaines du programme terminé et fige ses records face aux séances ultérieures', () => {
    const sOct1 = sessionLog('2026-10-05', { id: 'so1', week: 1, seqDay: 1, templateId: soir.id, templateSnapshot: soir });
    const sOct2 = sessionLog('2026-10-07', { id: 'so2', week: 1, seqDay: 3, templateId: soir.id, templateSnapshot: soir });
    // En novembre, l'utilisateur fait 12 s : le bilan d'octobre doit quand même garder le record battu en octobre (6 → 8 s).
    const sNov = sessionLog('2026-10-20', { id: 'sn1', week: 3, seqDay: 2 });
    const sets = [
      setLog({ sessionId: sOct1.id, exerciseId: exPlancheHold.id, elementId: planche.id, value: 6, quality: 'clean' }),
      setLog({ sessionId: sOct2.id, exerciseId: exPlancheHold.id, elementId: planche.id, value: 8, quality: 'clean' }),
      setLog({ sessionId: sNov.id, exerciseId: exPlancheHold.id, elementId: planche.id, value: 12, quality: 'clean' }),
    ];

    const report = buildProgramReport({
      program: oct,
      app,
      programs: [oct, nov],
      templates: [soir, matinOpt],
      elements,
      blockTypes,
      sessionTypes: [],
      exercises,
      bands,
      objectives: [],
      sessions: [sOct1, sOct2, sNov],
      sets,
      today: '2026-10-22',
    });

    expect(report.phase).toBe('past');
    expect(report.endDate).toBe('2026-10-18');
    expect(report.periods.map((p) => [p.label, p.isDeload])).toEqual([
      ['S1', false],
      ['S2', true],
    ]);
    expect(report.beatenRecords).toMatchObject([{ exerciseName: 'Planche Hold', previousValue: 6, value: 8 }]);
    // S1 : J3 matin optionnel sauté ; S2 (allégée, matins masqués) : J1 soir et J3 soir manqués.
    expect(report.missedSlots.map((m) => [m.periodLabel, m.seqDay, m.moment, m.optional])).toEqual([
      ['S1', 3, 'morning', true],
      ['S2', 1, 'evening', false],
      ['S2', 3, 'evening', false],
    ]);
  });

  it('tronque proprement la dernière semaine quand le programme suivant en séquence démarre en milieu de semaine', () => {
    // S3 commence le lundi 19/10 ; le programme en séquence suivant démarre le mercredi 21/10 (J3).
    const novMid = program({ id: 'nov-mid', name: 'Novembre', schedule: 'sequence', startWeek: 3, startDate: '2026-10-21' });
    const report = buildProgramReport({
      program: oct,
      app,
      programs: [oct, novMid],
      templates: [soir, matinOpt],
      elements,
      blockTypes,
      sessionTypes: [],
      exercises,
      bands,
      objectives: [],
      sessions: [],
      sets: [],
      today: '2026-10-25',
    });

    expect(report.endDate).toBe('2026-10-20');
    expect(report.periods.map((p) => [p.label, p.partial, p.fromDate, p.toDate])).toEqual([
      ['S1', false, '2026-10-05', '2026-10-11'],
      ['S2', false, '2026-10-12', '2026-10-18'],
      ['S3', true, '2026-10-19', '2026-10-20'],
    ]);
    // En S3 (19-20/10), seul J1 soir (19/10) est dans la fenêtre d'Octobre ; J3 (21/10) appartient déjà à Novembre.
    expect(report.missedSlots.filter((m) => m.periodLabel === 'S3').map((m) => m.seqDay)).toEqual([1]);
  });
});
