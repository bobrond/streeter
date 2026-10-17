import { describe, expect, it } from 'vitest';
import { block, element, exercise, item, sessionLog, setLog, settings, template } from '../test/builders';
import { dayInfo } from './cycle';
import {
  buildPlan,
  defaultExerciseId,
  emptyResume,
  itemCandidates,
  itemStatus,
  lastPerformance,
  newSessionLog,
  prefillDraft,
  progressOf,
  proposeNext,
  readResume,
  restAfterSet,
  tableProgress,
  type ItemProgress,
  type SessionPlan,
} from './session';
import type { ID, PrescriptionItem } from './types';

const planche = element('Planche', 'skill', 0);
const fl = element('Touch FL', 'skill', 1);
const connexion = element('Connexion (pousser)', 'other', 2);
const rhomboide = element('Rhomboïde', 'component', 3);
const extension = element('Extension thoracique', 'component', 4);
const elementsById = new Map([planche, fl, connexion, rhomboide, extension].map((e) => [e.id, e]));

const warmUp = block('Échauffement', 0, { reducedInDeload: false });
const skill = block('Skill', 1, { alternateSkills: true });
const assisted = block('Skill assisté', 2, { alternateSkills: true });
const renfo = block('Renfo composantes', 3);
const blocksById = new Map([warmUp, skill, assisted, renfo].map((b) => [b.id, b]));

// Séance J1 (Max) du tableur, lignes dans l'ordre du Programme.
const cars = item({ blockTypeId: warmUp.id, elementId: connexion.id, setsMin: 2, setsMax: 2 });
const plancheHold = item({ blockTypeId: skill.id, elementId: planche.id, setsMin: 4, setsMax: 5 });
const pn = item({ blockTypeId: skill.id, elementId: planche.id, setsMin: 3, setsMax: 5 });
const flHold = item({ blockTypeId: skill.id, elementId: fl.id, setsMin: 4, setsMax: 5 });
const flPu = item({ blockTypeId: skill.id, elementId: fl.id, setsMin: 3, setsMax: 3 });
const plancheAssisted = item({ blockTypeId: assisted.id, elementId: planche.id, setsMin: 2, setsMax: 3 });
const flAssisted = item({ blockTypeId: assisted.id, elementId: fl.id, setsMin: 2, setsMax: 3 });
const rhombo = item({ blockTypeId: renfo.id, elementId: rhomboide.id });
const ext = item({ blockTypeId: renfo.id, elementId: extension.id });
const j1 = template('Max', 'evening', [cars, plancheHold, pn, flHold, flPu, plancheAssisted, flAssisted, rhombo, ext]);

const names = new Map<ID, string>([
  [cars.id, 'CARs'],
  [plancheHold.id, 'PH'],
  [pn.id, 'PN'],
  [flHold.id, 'FH'],
  [flPu.id, 'FPU'],
  [plancheAssisted.id, 'PA'],
  [flAssisted.id, 'FA'],
  [rhombo.id, 'R'],
  [ext.id, 'E'],
]);

/** Fait toujours la série proposée, jusqu'à la fin de la séance. */
function simulate(plan: SessionPlan, closed: ID[] = []): string[] {
  const progress = new Map<ID, ItemProgress>(closed.map((id) => [id, { done: 0, closed: true }]));
  const done: string[] = [];
  let current: ID | null = null;
  for (let guard = 0; guard < 100; guard++) {
    current = proposeNext(plan, progress, current);
    if (!current) break;
    const p = progress.get(current) ?? { done: 0, closed: false };
    progress.set(current, { ...p, done: p.done + 1 });
    done.push(names.get(current) ?? '?');
  }
  return done;
}

describe('buildPlan', () => {
  it('apparie les skills par ordre : 1re ligne planche avec 1re ligne FL, 2e avec 2e', () => {
    const plan = buildPlan(j1, blocksById, elementsById);
    expect(plan.blocks.map((b) => b.blockTypeId)).toEqual([warmUp.id, skill.id, assisted.id, renfo.id]);
    expect(plan.blocks[1].units).toEqual([
      { mode: 'alternate', itemIds: [plancheHold.id, flHold.id] },
      { mode: 'alternate', itemIds: [pn.id, flPu.id] },
    ]);
    expect(plan.blocks[2].units).toEqual([{ mode: 'alternate', itemIds: [plancheAssisted.id, flAssisted.id] }]);
    expect(plan.blocks[3].units.map((u) => u.mode)).toEqual(['single', 'single']);
  });

  it('suit l’ordre des blocs même si le modèle les mélange', () => {
    const plan = buildPlan(template('x', 'evening', [rhombo, flHold, cars, plancheHold]), blocksById, elementsById);
    expect(plan.items.map((i) => names.get(i.id))).toEqual(['CARs', 'FH', 'PH', 'R']);
    expect(plan.blocks[1].units).toEqual([{ mode: 'alternate', itemIds: [flHold.id, plancheHold.id] }]);
  });

  it('n’alterne pas dans un bloc sans alternance', () => {
    const noAlt = block('Renfo spé skill', 4);
    const blocks = new Map([...blocksById, [noAlt.id, noAlt]]);
    const a = item({ blockTypeId: noAlt.id, elementId: planche.id });
    const b = item({ blockTypeId: noAlt.id, elementId: fl.id });
    expect(buildPlan(template('x', 'morning', [a, b]), blocks, elementsById).units.map((u) => u.mode)).toEqual(['single', 'single']);
  });

  it('groupe les lignes consécutives en superset', () => {
    const a = item({ blockTypeId: renfo.id, elementId: rhomboide.id, superset: true });
    const b = item({ blockTypeId: renfo.id, elementId: extension.id, superset: true });
    const c = item({ blockTypeId: renfo.id, elementId: extension.id });
    const plan = buildPlan(template('Matin B', 'morning', [a, b, c]), blocksById, elementsById);
    expect(plan.units).toEqual([
      { mode: 'superset', itemIds: [a.id, b.id] },
      { mode: 'single', itemIds: [c.id] },
    ]);
  });
});

describe('proposeNext', () => {
  const plan = buildPlan(j1, blocksById, elementsById);

  it('enchaîne la séance J1 en alternant planche et FL ; une ligne finie, l’autre continue seule', () => {
    expect(simulate(plan)).toEqual([
      'CARs', 'CARs',
      'PH', 'FH', 'PH', 'FH', 'PH', 'FH', 'PH', 'FH', 'PH', 'FH',
      'PN', 'FPU', 'PN', 'FPU', 'PN', 'FPU', 'PN', 'PN',
      'PA', 'FA', 'PA', 'FA', 'PA', 'FA',
      'R', 'R', 'E', 'E',
    ]);
  });

  it('saute une ligne terminée avant ses séries max', () => {
    const sequence = simulate(plan, [plancheHold.id]);
    expect(sequence.slice(2, 8)).toEqual(['FH', 'FH', 'FH', 'FH', 'FH', 'PN']);
  });

  it('reste sur la ligne en cours quand l’utilisateur a dévié, puis revient à la première ligne inachevée', () => {
    const progress = new Map<ID, ItemProgress>([[rhombo.id, { done: 1, closed: false }]]);
    expect(proposeNext(plan, progress, rhombo.id)).toBe(rhombo.id);
    progress.set(rhombo.id, { done: 2, closed: false });
    expect(proposeNext(plan, progress, rhombo.id)).toBe(cars.id);
  });

  it('propose la ligne en retard dans une paire (déviation : deux séries de FL de suite)', () => {
    const progress = new Map<ID, ItemProgress>([
      [cars.id, { done: 2, closed: false }],
      [flHold.id, { done: 2, closed: false }],
    ]);
    expect(proposeNext(plan, progress, flHold.id)).toBe(plancheHold.id);
  });

  it('renvoie null quand tout est fait', () => {
    const progress = new Map(plan.items.map((i) => [i.id, { done: i.setsMax, closed: false }]));
    expect(proposeNext(plan, progress)).toBeNull();
  });
});

describe('restAfterSet', () => {
  const plan = buildPlan(j1, blocksById, elementsById);

  /** Fait toujours la série proposée ; « · » : repos lancé après la série. */
  function simulateRests(p: SessionPlan): string {
    const progress = new Map<ID, ItemProgress>();
    const out: string[] = [];
    let current: ID | null = null;
    for (let guard = 0; guard < 100; guard++) {
      current = proposeNext(p, progress, current);
      if (!current) break;
      const before = progress.get(current) ?? { done: 0, closed: false };
      progress.set(current, { ...before, done: before.done + 1 });
      out.push(`${names.get(current)}${restAfterSet(p, progress, current) ? '·' : ''}`);
    }
    return out.join(' ');
  }

  it('enchaîne planche et FL sans repos, repose après la paire ; ailleurs, après chaque série', () => {
    expect(simulateRests(plan)).toBe(
      [
        'CARs· CARs·',
        'PH FH· PH FH· PH FH· PH FH· PH FH·',
        'PN FPU· PN FPU· PN FPU· PN· PN·',
        'PA FA· PA FA· PA FA·',
        'R· R· E· E·',
      ].join(' '),
    );
  });

  it('repose après chaque série d’un superset du matin', () => {
    const a = item({ blockTypeId: renfo.id, elementId: rhomboide.id, superset: true, restMinSec: 60, restMaxSec: 90 });
    const b = item({ blockTypeId: renfo.id, elementId: extension.id, superset: true, restMinSec: 60, restMaxSec: 90 });
    const morning = buildPlan(template('Matin B', 'morning', [a, b]), blocksById, elementsById);
    const progress = new Map<ID, ItemProgress>([[a.id, { done: 1, closed: false }]]);
    expect(restAfterSet(morning, progress, a.id)).toEqual({ minSec: 60, maxSec: 90 });
  });

  it('prend le plus long repos des lignes du tour ; un repos libre seulement si aucune n’a de décompte', () => {
    const p = item({ blockTypeId: skill.id, elementId: planche.id, restMinSec: 90, restMaxSec: 120 });
    const f = item({ blockTypeId: skill.id, elementId: fl.id, restMinSec: 120, restMaxSec: 180 });
    const pair = buildPlan(template('x', 'evening', [p, f]), blocksById, elementsById);
    const round = new Map<ID, ItemProgress>([
      [p.id, { done: 1, closed: false }],
      [f.id, { done: 1, closed: false }],
    ]);
    expect(restAfterSet(pair, round, f.id)).toEqual({ minSec: 120, maxSec: 180 });
    const free = item({ blockTypeId: skill.id, elementId: fl.id, restMinSec: null, restMaxSec: null });
    const mixed = buildPlan(template('x', 'evening', [p, free]), blocksById, elementsById);
    const mixedRound = new Map<ID, ItemProgress>([
      [p.id, { done: 1, closed: false }],
      [free.id, { done: 1, closed: false }],
    ]);
    expect(restAfterSet(mixed, mixedRound, free.id)).toEqual({ minSec: 90, maxSec: 120 });
  });

  it('repose quand on refait la même ligne avant l’autre (écart)', () => {
    const progress = new Map<ID, ItemProgress>([[plancheHold.id, { done: 1, closed: false }]]);
    expect(restAfterSet(plan, progress, plancheHold.id)).toBeNull();
    progress.set(plancheHold.id, { done: 2, closed: false });
    expect(restAfterSet(plan, progress, plancheHold.id)).toEqual({ minSec: 90, maxSec: 90 });
  });

  it('repose après chaque série quand l’autre ligne de la paire est terminée avant ses séries max', () => {
    const progress = new Map<ID, ItemProgress>([
      [flHold.id, { done: 1, closed: true }],
      [plancheHold.id, { done: 2, closed: false }],
    ]);
    expect(restAfterSet(plan, progress, plancheHold.id)).toEqual({ minSec: 90, maxSec: 90 });
  });
});

describe('progressOf et itemStatus', () => {
  it('compte les séries par ligne et garde les lignes fermées', () => {
    const sets = [setLog({ sessionId: 's', exerciseId: 'e', itemId: 'a' }), setLog({ sessionId: 's', exerciseId: 'e', itemId: 'a' })];
    const progress = progressOf(sets, ['b']);
    expect(progress.get('a')).toEqual({ done: 2, closed: false });
    expect(progress.get('b')).toEqual({ done: 0, closed: true });
  });

  it('distingue à faire, commencée, minimum atteint, faite et passée', () => {
    const line = { setsMin: 4, setsMax: 5 } as PrescriptionItem;
    expect(itemStatus(line, undefined)).toBe('todo');
    expect(itemStatus(line, { done: 2, closed: false })).toBe('started');
    expect(itemStatus(line, { done: 4, closed: false })).toBe('min_reached');
    expect(itemStatus(line, { done: 5, closed: false })).toBe('done');
    expect(itemStatus(line, { done: 3, closed: true })).toBe('done');
    expect(itemStatus(line, { done: 0, closed: true })).toBe('skipped');
  });
});

describe('itemCandidates', () => {
  const a = exercise('Wall slide', rhomboide.id, { quick: true });
  const b = exercise('Lean planche scapula PU', rhomboide.id);
  const c = exercise('Uppercut', rhomboide.id, { quick: true, active: false });
  const line = item({ blockTypeId: renfo.id, elementId: rhomboide.id, candidateExerciseIds: [b.id, a.id, c.id] });

  it('garde l’ordre de la ligne le soir et met les exercices rapides en tête le matin', () => {
    expect(itemCandidates(line, [a, b, c], 'evening').map((e) => e.name)).toEqual(['Lean planche scapula PU', 'Wall slide']);
    expect(itemCandidates(line, [a, b, c], 'morning').map((e) => e.name)).toEqual(['Wall slide', 'Lean planche scapula PU']);
  });

  it('garde un exercice désactivé déjà utilisé dans la séance', () => {
    expect(itemCandidates(line, [a, b, c], 'evening', [c.id]).map((e) => e.name)).toContain('Uppercut');
  });

  it('se rabat sur les exercices de l’élément quand la ligne n’a aucun candidat', () => {
    const empty = item({ blockTypeId: renfo.id, elementId: rhomboide.id });
    expect(itemCandidates(empty, [a, b, c], 'evening').map((e) => e.name)).toEqual(['Wall slide', 'Lean planche scapula PU']);
  });
});

describe('defaultExerciseId', () => {
  const holdToPress = exercise('Planche Hold to press', planche.id, { measure: 'combos' });
  const puToPress = exercise('Planche PU to press', planche.id, { measure: 'combos' });
  const combos = [holdToPress.id, puToPress.id];
  const skillLine = item({ blockTypeId: skill.id, elementId: planche.id, candidateExerciseIds: combos });
  const assistedLine = item({ blockTypeId: assisted.id, elementId: planche.id, candidateExerciseIds: combos });

  it('prend le premier candidat sans historique', () => {
    expect(defaultExerciseId(skillLine, combos, [], [])).toBe(holdToPress.id);
  });

  it('prend l’exercice fait la dernière fois sur cette ligne (même bloc)', () => {
    const history = [
      setLog({ sessionId: 'old', exerciseId: puToPress.id, blockTypeId: skill.id }),
      setLog({ sessionId: 'old', exerciseId: holdToPress.id, blockTypeId: assisted.id }),
    ];
    expect(defaultExerciseId(skillLine, combos, [], history)).toBe(puToPress.id);
    expect(defaultExerciseId(assistedLine, combos, [], history)).toBe(holdToPress.id);
  });

  it('prend le même combo qu’au bloc skill quand il a été fait plus tôt dans la séance', () => {
    const history = [setLog({ sessionId: 'old', exerciseId: holdToPress.id, blockTypeId: assisted.id })];
    const today = [setLog({ sessionId: 'now', exerciseId: puToPress.id, blockTypeId: skill.id, itemId: skillLine.id })];
    expect(defaultExerciseId(assistedLine, combos, today, history)).toBe(puToPress.id);
  });

  it('départage plusieurs candidats faits dans la séance avec la dernière fois sur la ligne', () => {
    const history = [setLog({ sessionId: 'old', exerciseId: holdToPress.id, blockTypeId: assisted.id })];
    const today = [
      setLog({ sessionId: 'now', exerciseId: holdToPress.id, blockTypeId: skill.id }),
      setLog({ sessionId: 'now', exerciseId: puToPress.id, blockTypeId: skill.id }),
    ];
    expect(defaultExerciseId(assistedLine, combos, today, history)).toBe(holdToPress.id);
    expect(defaultExerciseId(assistedLine, combos, today, [])).toBe(puToPress.id);
  });

  it('garde l’exercice de la dernière série de la ligne une fois commencée', () => {
    const today = [setLog({ sessionId: 'now', exerciseId: puToPress.id, blockTypeId: skill.id, itemId: skillLine.id })];
    const history = [setLog({ sessionId: 'old', exerciseId: holdToPress.id, blockTypeId: skill.id })];
    expect(defaultExerciseId(skillLine, combos, today, history)).toBe(puToPress.id);
  });
});

describe('lastPerformance', () => {
  const hold = exercise('Planche Hold', planche.id, { measure: 'seconds' });
  const sessions = new Map([
    ['s1', sessionLog('2026-10-05')],
    ['s2', sessionLog('2026-10-07')],
  ]);

  it('prend la dernière séance où l’exercice a été fait dans le même bloc', () => {
    const history = [
      setLog({ sessionId: 's1', exerciseId: hold.id, blockTypeId: skill.id, value: 3 }),
      setLog({ sessionId: 's1', exerciseId: hold.id, blockTypeId: skill.id, value: 2 }),
      setLog({ sessionId: 's2', exerciseId: hold.id, blockTypeId: assisted.id, value: 14, bandId: 'jaune' }),
    ];
    const last = lastPerformance(hold.id, skill.id, history, sessions);
    expect(last).toMatchObject({ sessionId: 's1', date: '2026-10-05', sameBlock: true });
    expect(last?.sets.map((s) => s.value)).toEqual([3, 2]);
  });

  it('se rabat sur un autre bloc', () => {
    const history = [setLog({ sessionId: 's2', exerciseId: hold.id, blockTypeId: assisted.id, value: 14 })];
    expect(lastPerformance(hold.id, skill.id, history, sessions)).toMatchObject({ sameBlock: false, blockTypeId: assisted.id });
  });

  it('renvoie null sans historique', () => {
    expect(lastPerformance(hold.id, skill.id, [], sessions)).toBeNull();
  });
});

describe('prefillDraft', () => {
  const hold = exercise('Planche Hold', planche.id, { measure: 'seconds' });
  const line = item({ blockTypeId: skill.id, elementId: planche.id, targets: [{ unit: 'seconds', min: 3, max: 6 }] });

  it('part du bas de la cible sans historique, qualité propre sur un skill', () => {
    expect(prefillDraft({ item: line, exercise: hold, isSkill: true, itemSets: [], last: null })).toEqual({
      value: 3,
      bandId: null,
      rpe: null,
      quality: 'clean',
      kind: 'normal',
      note: '',
    });
  });

  it('choisit la cible dans l’unité de l’exercice', () => {
    const mixed = item({
      blockTypeId: assisted.id,
      elementId: planche.id,
      targets: [
        { unit: 'seconds', min: 8, max: 12 },
        { unit: 'reps', min: 3, max: 5 },
      ],
    });
    const reps = exercise('P/N', planche.id);
    expect(prefillDraft({ item: mixed, exercise: reps, isSkill: true, itemSets: [], last: null }).value).toBe(3);
    expect(prefillDraft({ item: mixed, exercise: hold, isSkill: true, itemSets: [], last: null }).value).toBe(8);
  });

  it('reprend la 1re série de la dernière performance (valeur, élastique)', () => {
    const last = {
      sessionId: 's1',
      date: '2026-10-05',
      sameBlock: true,
      blockTypeId: skill.id,
      sets: [setLog({ sessionId: 's1', exerciseId: hold.id, value: 4, bandId: 'jaune', rpe: 8 })],
    };
    expect(prefillDraft({ item: line, exercise: hold, isSkill: false, itemSets: [], last })).toEqual({
      value: 4,
      bandId: 'jaune',
      rpe: null,
      quality: null,
      kind: 'normal',
      note: '',
    });
  });

  it('ne reprend pas une série d’échauffement', () => {
    const warmUp = setLog({ sessionId: 'now', exerciseId: hold.id, itemId: line.id, value: 2, kind: 'warmup' });
    expect(prefillDraft({ item: line, exercise: hold, isSkill: true, itemSets: [warmUp], last: null })).toMatchObject({ value: 3, kind: 'normal' });
    const last = {
      sessionId: 's1',
      date: '2026-10-05',
      sameBlock: true,
      blockTypeId: skill.id,
      sets: [setLog({ sessionId: 's1', exerciseId: hold.id, value: 2, kind: 'warmup' }), setLog({ sessionId: 's1', exerciseId: hold.id, value: 6 })],
    };
    expect(prefillDraft({ item: line, exercise: hold, isSkill: true, itemSets: [], last }).value).toBe(6);
  });

  it('reprend la série précédente de la ligne dans la séance, sans recopier la qualité', () => {
    const previous = setLog({ sessionId: 'now', exerciseId: hold.id, itemId: line.id, value: 5, rpe: 8, quality: 'degraded' });
    expect(prefillDraft({ item: line, exercise: hold, isSkill: true, itemSets: [previous], last: null })).toMatchObject({
      value: 5,
      rpe: 8,
      quality: 'clean',
    });
  });

  it('ne propose pas de valeur pour un exercice sans mesure', () => {
    const activation = exercise('Activation élastique', connexion.id, { measure: 'none' });
    expect(prefillDraft({ item: cars, exercise: activation, isSkill: false, itemSets: [], last: null }).value).toBeNull();
  });
});

describe('newSessionLog', () => {
  const s = settings({ cycleStartDate: '2026-10-05', deloadReductionPct: 40 });

  it('fige une copie du modèle, lignes dans l’ordre des blocs', () => {
    const tpl = template('Max', 'evening', [rhombo, plancheHold, cars]);
    const log = newSessionLog({ id: 'x', template: tpl, sessionType: undefined, info: dayInfo('2026-10-07', s), blocksById, settings: s, now: 1 });
    expect(log).toMatchObject({ date: '2026-10-07', week: 1, cycleWeek: 1, seqDay: 3, moment: 'evening', status: 'in_progress', source: 'app' });
    expect(log.templateSnapshot?.items.map((i) => i.id)).toEqual([cars.id, plancheHold.id, rhombo.id]);
    tpl.items[0].setsMax = 99;
    expect(log.templateSnapshot?.items.find((i) => i.id === rhombo.id)?.setsMax).toBe(2);
  });

  it('réduit les séries du soir en semaine allégée, sauf l’échauffement', () => {
    const log = newSessionLog({ id: 'x', template: j1, sessionType: undefined, info: dayInfo('2026-10-26', s), blocksById, settings: s, now: 1 });
    expect(log.deload).toBe(true);
    const sets = (id: ID) => log.templateSnapshot?.items.find((i) => i.id === id);
    expect(sets(plancheHold.id)).toMatchObject({ setsMin: 2, setsMax: 3 });
    expect(sets(cars.id)).toMatchObject({ setsMin: 2, setsMax: 2 });
  });
});

describe('readResume', () => {
  it('complète un état incomplet ou illisible', () => {
    expect(readResume(null)).toEqual(emptyResume());
    expect(readResume({ activeItemId: 'a', closedItems: ['b', 3] })).toEqual({ ...emptyResume(), activeItemId: 'a', closedItems: ['b'] });
  });

  it('reprend une séance commencée avant le tableau : le brouillon devient la première série à faire', () => {
    const old = {
      activeItemId: 'a',
      chosenExercise: { a: 'x' },
      closedItems: [],
      drafts: { a: { value: 7, bandId: null, rpe: 8, quality: 'clean', note: 'ok' } },
      rest: null,
      hold: { itemId: 'a', startedAt: 1, countdownSec: 3, targetSec: 5 },
    };
    const resume = readResume(old);
    expect(resume.pendingDrafts).toEqual({ a: [{ value: 7, bandId: null, rpe: 8, quality: 'clean', kind: 'normal', note: 'ok' }] });
    expect(resume.extraRows).toEqual({});
    expect('hold' in resume).toBe(false);
  });

  it('relit les séries à faire et les lignes ajoutées', () => {
    const resume = readResume({ pendingDrafts: { a: [null, { value: 3, kind: 'warmup' }] }, extraRows: { a: 1, b: 'x' } });
    expect(resume.pendingDrafts.a).toEqual([null, { value: 3, kind: 'warmup', note: '' }]);
    expect(resume.extraRows).toEqual({ a: 1 });
  });
});

describe('tableProgress', () => {
  const plan = buildPlan(j1, blocksById, elementsById);

  /** Fait toujours la série proposée, avec les séries prévues du tableau (le minimum de chaque ligne). */
  function simulateTable(extraRows: Record<ID, number> = {}): string[] {
    const sets: ReturnType<typeof setLog>[] = [];
    const done: string[] = [];
    let current: ID | null = null;
    for (let guard = 0; guard < 100; guard++) {
      current = proposeNext(plan, tableProgress(plan, sets, [], extraRows), current);
      if (!current) break;
      sets.push(setLog({ sessionId: 'now', exerciseId: 'x', itemId: current }));
      done.push(names.get(current) ?? '?');
    }
    return done;
  }

  it('propose les séries prévues, le minimum de chaque ligne, en gardant l’alternance', () => {
    expect(simulateTable()).toEqual([
      'CARs', 'CARs',
      'PH', 'FH', 'PH', 'FH', 'PH', 'FH', 'PH', 'FH',
      'PN', 'FPU', 'PN', 'FPU', 'PN', 'FPU',
      'PA', 'FA', 'PA', 'FA',
      'R', 'R', 'E', 'E',
    ]);
  });

  it('propose une série ajoutée ; l’autre ligne finie, celle-ci continue seule', () => {
    expect(simulateTable({ [plancheHold.id]: 1 }).slice(2, 11)).toEqual(['PH', 'FH', 'PH', 'FH', 'PH', 'FH', 'PH', 'FH', 'PH']);
  });

  it('ne compte pas l’échauffement dans les séries faites', () => {
    const sets = [setLog({ sessionId: 'now', exerciseId: 'x', itemId: cars.id, kind: 'warmup' }), setLog({ sessionId: 'now', exerciseId: 'x', itemId: cars.id })];
    expect(progressOf(sets, []).get(cars.id)).toEqual({ done: 1, closed: false });
    expect(tableProgress(plan, sets, [], {}).get(cars.id)).toEqual({ done: 1, closed: false });
    expect(tableProgress(plan, sets, [], { [cars.id]: -1 }).get(cars.id)).toEqual({ done: 1, closed: true });
  });
});
