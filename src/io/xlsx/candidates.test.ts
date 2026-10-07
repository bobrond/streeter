import { describe, expect, it } from 'vitest';
import { nameKey } from '../../domain/text';
import type { Exercise } from '../../domain/types';
import { ExerciseMatcher, inferMeasure, matchExerciseName } from './catalogue';
import { resolveCandidates } from './candidates';

// Catalogue de l'onglet Exercices (catégorie, nom), dans l'ordre du tableur.
const CATALOGUE: [string, string][] = [
  ['Planche skill', 'Planche Hold to press'],
  ['Planche skill', 'Planche Hold'],
  ['Planche skill', 'Lean to press'],
  ['Planche skill', 'P/N'],
  ['Planche skill', 'Planche PU to press'],
  ['Planche renfo spé', 'Planche lean surélevé press'],
  ['Planche renfo spé', 'Planche lean surélevé hold to press'],
  ['Planche renfo spé', 'Adv tuck planche hold sol'],
  ['Touch FL skill', 'Touch FL hold full'],
  ['Touch FL skill', 'Touch FL hold one leg'],
  ['Touch FL skill', 'FL PU full'],
  ['Touch FL skill', 'FL PU one leg'],
  ['Touch FL skill', 'PU to touch full'],
  ['Touch FL skill', 'PU to touch one leg'],
  ['Touch FL skill', 'FL press'],
  ['Touch FL renfo spé', 'Pseudo touch FL hold wall'],
  ['Touch FL renfo spé', 'Pseudo FL PU to touch wall'],
  ['Touch FL renfo spé', 'Pseudo FL PU wall'],
  ['Grand dentelé', 'Uppercut'],
  ['Grand dentelé', 'Pike handstand surélevé scapula PU'],
  ['Grand dentelé', 'Wall slide'],
  ['Grand dentelé', 'Lean planche scapula PU to press'],
  ['Rhomboïde', 'Rétraction élastique'],
  ['Rhomboïde', 'Adv tuck FL scapula PU'],
  ['Rhomboïde', 'Reverse planche PU'],
  ['Extension thoracique', 'Extension thoracique contre mur'],
  ['Extension thoracique', 'Extension thoracique contre banc'],
  ['Deltoïde ant', 'Dumbbell raise'],
  ['Deltoïde ant', 'Zanetti fly elastic'],
  ['Deltoïde ant', 'Lean planche PU surélevé'],
  ['Connexion', 'CARs scapulaire handstand élastique'],
  ['Connexion', 'CARs scapulaire 90 élastique'],
  ['Connexion', 'Scapula PU'],
  ['Connexion', 'CARs scapulaire tiré (sous barre)'],
  ['Connexion', 'Rétraction élastique (léger)'],
];

function exercise(category: string, name: string, order = 0): Exercise {
  return { id: nameKey(name), name, category, elementId: null, measure: 'reps', quick: false, active: true, notes: '', aliases: [], order };
}

const exercises = CATALOGUE.map(([category, name], i) => exercise(category, name, i));
const byCategory = new Map<string, Exercise[]>();
for (const e of exercises) byCategory.set(e.category, [...(byCategory.get(e.category) ?? []), e]);
const generic = exercise('Activation élastique', 'Activation élastique');

function resolve(text: string, elementName: string, skillLine: string[] | null = null) {
  const result = resolveCandidates(text, {
    matcher: new ExerciseMatcher(exercises),
    elementName,
    exercisesByCategory: byCategory,
    genericExercise: () => generic,
    skillLineCandidates: () => (skillLine ? exercises.filter((e) => skillLine.includes(e.name)) : null),
  });
  return { names: result.exercises.map((e) => e.name), unresolved: result.unresolved, approximations: result.approximations, rest: result.rest };
}

describe('resolveCandidates — toutes les formulations de l’onglet Programme', () => {
  it.each<[string, string, string[]]>([
    ['CARs scapulaire handstand élastique, CARs scapulaire 90 élastique, scapula PU', 'Connexion (pousser)', ['CARs scapulaire handstand élastique', 'CARs scapulaire 90 élastique', 'Scapula PU']],
    ['CARs scapulaire tiré sous barre, rétraction élastique légère', 'Connexion (tirer)', ['CARs scapulaire tiré (sous barre)', 'Rétraction élastique (léger)']],
    ['Au choix', 'Activation élastique', ['Activation élastique']],
    ['Planche hold', 'Planche', ['Planche Hold']],
    ['P/N', 'Planche', ['P/N']],
    ['Touch FL hold (full / one leg)', 'Touch FL', ['Touch FL hold full', 'Touch FL hold one leg']],
    ['FL PU (full / one leg)', 'Touch FL', ['FL PU full', 'FL PU one leg']],
    ["Hold ou P/N à l'élastique", 'Planche', ['Planche Hold', 'P/N']],
    ["Hold ou FL PU à l'élastique", 'Touch FL', ['Touch FL hold full', 'Touch FL hold one leg', 'FL PU full', 'FL PU one leg']],
    [
      'Planche lean surélevé press / hold to press (5-8) ou adv tuck planche sol (8-15 s)',
      'Planche',
      ['Planche lean surélevé press', 'Planche lean surélevé hold to press', 'Adv tuck planche hold sol'],
    ],
    [
      'Pseudo touch FL hold mur (10-20 s) ou pseudo FL PU (to touch) mur (5-8)',
      'Touch FL',
      ['Pseudo touch FL hold wall', 'Pseudo FL PU to touch wall', 'Pseudo FL PU wall'],
    ],
    ['Rétraction élastique, adv tuck FL scapula PU, reverse planche PU', 'Rhomboïde', ['Rétraction élastique', 'Adv tuck FL scapula PU', 'Reverse planche PU']],
    ['Extension thoracique contre mur, extension thoracique contre banc', 'Extension thoracique', ['Extension thoracique contre mur', 'Extension thoracique contre banc']],
    ['Hold to press ou PU to press', 'Planche', ['Planche Hold to press', 'Planche PU to press']],
    ['PU to touch ou FL press', 'Touch FL', ['PU to touch full', 'PU to touch one leg', 'FL press']],
    [
      'Uppercut, pike handstand surélevé scapula PU, wall slide, lean planche scapula PU to press',
      'Grand dentelé',
      ['Uppercut', 'Pike handstand surélevé scapula PU', 'Wall slide', 'Lean planche scapula PU to press'],
    ],
    ['Dumbbell raise, Zanetti fly élastique, lean planche PU surélevé', 'Deltoïde ant', ['Dumbbell raise', 'Zanetti fly elastic', 'Lean planche PU surélevé']],
    ['Lean to press', 'Planche', ['Lean to press']],
    ['Planche hold court', 'Planche', ['Planche Hold']],
    ['Touch FL hold one leg', 'Touch FL', ['Touch FL hold one leg']],
    ['FL PU one leg', 'Touch FL', ['FL PU one leg']],
    [
      '2 exercices de connexion au choix',
      'Connexion',
      ['CARs scapulaire handstand élastique', 'CARs scapulaire 90 élastique', 'Scapula PU', 'CARs scapulaire tiré (sous barre)', 'Rétraction élastique (léger)'],
    ],
    ['Wall slide, uppercut élastique, pike handstand surélevé scapula PU', 'Grand dentelé', ['Wall slide', 'Uppercut', 'Pike handstand surélevé scapula PU']],
    ['Dumbbell raise, Zanetti fly élastique', 'Deltoïde ant', ['Dumbbell raise', 'Zanetti fly elastic']],
    ['Rétraction élastique, reverse planche PU', 'Rhomboïde', ['Rétraction élastique', 'Reverse planche PU']],
    ['Au choix (skill planche)', 'Planche', ['Planche Hold to press', 'Planche Hold', 'Lean to press', 'P/N', 'Planche PU to press']],
    [
      'Au choix (skill FL)',
      'Touch FL',
      ['Touch FL hold full', 'Touch FL hold one leg', 'FL PU full', 'FL PU one leg', 'PU to touch full', 'PU to touch one leg', 'FL press'],
    ],
  ])('« %s » (%s)', (text, elementName, expected) => {
    const result = resolve(text, elementName);
    expect(result.names).toEqual(expected);
    expect(result.unresolved).toEqual([]);
  });

  it('reprend les candidats de la ligne Skill pour « Même combo qu’au bloc skill »', () => {
    const skillLine = ['Planche Hold to press', 'Planche PU to press'];
    expect(resolve("Même combo qu'au bloc skill, à l'élastique", 'Planche', skillLine).names).toEqual(skillLine);
  });

  it('reconnaît la ligne de repos', () => {
    expect(resolve('Aucun entraînement le soir', '—').rest).toBe(true);
  });

  it('signale les rapprochements approximatifs', () => {
    expect(resolve('Planche hold court', 'Planche').approximations).toEqual([{ text: 'planche hold court', exercises: ['Planche Hold'] }]);
    expect(resolve('Wall slide, uppercut élastique', 'Grand dentelé').approximations).toEqual([
      { text: 'uppercut elastique', exercises: ['Uppercut'] },
    ]);
  });

  it('signale un texte non reconnu', () => {
    expect(resolve('Muscle-up, wall slide', 'Grand dentelé')).toMatchObject({ names: ['Wall slide'], unresolved: ['muscle-up'] });
  });
});

describe('matchExerciseName — noms du Journal et des Objectifs', () => {
  const matcher = new ExerciseMatcher([...exercises, generic]);
  it.each([
    ['CARs scapulaire 90 élastique', 'CARs scapulaire 90 élastique', false],
    ['CARs scapulaire tiré (sous barre)', 'CARs scapulaire tiré (sous barre)', false],
    ['activation elastic', 'Activation élastique', false],
    ['Touch FL hold / one leg', 'Touch FL hold one leg', false],
    ['Touch FL one leg', 'Touch FL hold one leg', true],
    ['Planche Hold', 'Planche Hold', false],
    ['Planche hold', 'Planche Hold', false],
    ['Planche press to négative (P/N)', 'P/N', true],
    ['Touch front lever hold one leg', 'Touch FL hold one leg', false],
    ['Touch front lever hold full', 'Touch FL hold full', false],
  ])('« %s » → %s', (name, expected, approximate) => {
    const match = matchExerciseName(name, matcher);
    expect(match.exercise?.name).toBe(expected);
    expect(match.approximate).toBe(approximate);
  });

  it('ne devine pas un nom inconnu', () => {
    expect(matchExerciseName('Muscle-up', matcher).exercise).toBeNull();
  });
});

describe('inferMeasure', () => {
  it('déduit secondes, combos et reps', () => {
    const measures = Object.fromEntries(CATALOGUE.map(([category, name]) => [name, inferMeasure(name, category)]));
    expect(Object.entries(measures).filter(([, m]) => m === 'seconds').map(([n]) => n)).toEqual([
      'Planche Hold',
      'Adv tuck planche hold sol',
      'Touch FL hold full',
      'Touch FL hold one leg',
      'Pseudo touch FL hold wall',
    ]);
    expect(Object.entries(measures).filter(([, m]) => m === 'combos').map(([n]) => n)).toEqual([
      'Planche Hold to press',
      'Planche PU to press',
      'PU to touch full',
      'PU to touch one leg',
      'FL press',
    ]);
    expect(measures['Lean to press']).toBe('reps');
    expect(measures['Planche lean surélevé hold to press']).toBe('reps');
    expect(measures['Pseudo FL PU to touch wall']).toBe('reps');
  });
});
