import { describe, expect, it } from 'vitest';
import { block, element, exercise, item, setLog, template, weekPlan } from '../test/builders';
import {
  blockUsage,
  duplicateTemplate,
  elementUsage,
  emptyItemForm,
  exerciseUsage,
  formErrors,
  formToItem,
  insertItem,
  itemsByBlock,
  isUnused,
  itemToForm,
  moveInOrder,
  moveItem,
  nameError,
  removeFromWeekPlan,
  templateDays,
  uniqueName,
  withoutExercise,
} from './editing';
import type { Objective } from './types';

const planche = element('Planche', 'skill', 0);
const dentele = element('Grand dentelé', 'component', 1);
const warmUp = block('Échauffement', 0);
const skill = block('Skill', 1);
const renfo = block('Renfo composantes', 2);
const blocksById = new Map([warmUp, skill, renfo].map((b) => [b.id, b]));
const hold = exercise('Planche Hold', planche.id, { measure: 'seconds' });
const wallSlide = exercise('Wall slide', dentele.id);
const exercisesById = new Map([hold, wallSlide].map((e) => [e.id, e]));

describe('utilisation avant suppression', () => {
  const line = item({ blockTypeId: skill.id, elementId: planche.id, candidateExerciseIds: [hold.id] });
  const tpl = template('Max', 'evening', [line]);
  const sets = [setLog({ sessionId: 's', exerciseId: hold.id, elementId: planche.id, blockTypeId: skill.id })];
  const objective = { id: 'o', exerciseId: hold.id } as Objective;

  it('compte lignes, modèles, séries et objectifs d’un exercice', () => {
    expect(exerciseUsage(hold.id, [tpl], sets, [objective])).toMatchObject({ items: 1, templates: 1, sets: 1, objectives: 1 });
    expect(isUnused(exerciseUsage(wallSlide.id, [tpl], sets, [objective]))).toBe(true);
  });

  it('compte les utilisations d’un élément et d’un bloc', () => {
    expect(elementUsage(planche.id, [tpl], sets, [hold, wallSlide])).toMatchObject({ items: 1, sets: 1, exercises: 1 });
    expect(blockUsage(skill.id, [tpl], sets)).toMatchObject({ items: 1, sets: 1 });
    expect(isUnused(blockUsage(renfo.id, [tpl], sets))).toBe(true);
  });
});

describe('semaine type', () => {
  it('liste les jours d’un modèle et l’en retire', () => {
    const plan = weekPlan({ 2: { evening: 'combo' }, 6: { evening: 'combo', morning: 'b' } });
    expect(templateDays('combo', plan)).toEqual(['J2 soir', 'J6 soir']);
    const cleared = removeFromWeekPlan(plan, 'combo');
    expect(templateDays('combo', cleared)).toEqual([]);
    expect(cleared[6].morning).toBe('b');
    expect(plan[2].evening).toBe('combo');
  });
});

describe('moveInOrder', () => {
  const list = [
    { id: 'a', order: 0 },
    { id: 'b', order: 1 },
    { id: 'c', order: 5 },
  ];

  it('déplace et renumérote', () => {
    expect(moveInOrder(list, 'c', -1)).toEqual([
      { id: 'a', order: 0 },
      { id: 'c', order: 1 },
      { id: 'b', order: 2 },
    ]);
  });

  it('ne fait rien au bord de la liste', () => {
    expect(moveInOrder(list, 'a', -1)).toEqual([]);
    expect(moveInOrder(list, 'c', 1)).toEqual([]);
  });
});

describe('nameError', () => {
  it('refuse un nom vide ou déjà pris, sans tenir compte des accents ni de la casse', () => {
    const others = [{ id: '1', name: 'Rétraction élastique' }];
    expect(nameError('  ', 'x', others)).toBe('Le nom est obligatoire.');
    expect(nameError('retraction ELASTIQUE', 'x', others)).toBe('Ce nom existe déjà.');
    expect(nameError('Rétraction élastique', '1', others)).toBeNull();
  });
});

describe('ligne de prescription saisie', () => {
  it('lit les textes comme à l’import', () => {
    const form = {
      ...emptyItemForm(renfo.id, dentele.id),
      candidateExerciseIds: [wallSlide.id],
      targetText: '8-15 reps ou 15-30 s',
      intensityText: '2 reps en réserve',
      restText: 'Superset, 60-90 s',
    };
    const line = formToItem('id', form, exercisesById);
    expect(line).toMatchObject({
      candidatesText: 'Wall slide',
      targets: [
        { unit: 'reps', min: 8, max: 15 },
        { unit: 'seconds', min: 15, max: 30 },
      ],
      intensity: { kind: 'rir', min: 2, max: 2 },
      restMinSec: 60,
      restMaxSec: 90,
      superset: true,
    });
    expect(itemToForm(line)).toMatchObject({ targetText: '8-15 reps ou 15-30 s', superset: true });
  });

  it('repère les saisies incomplètes', () => {
    expect(formErrors({ ...emptyItemForm(renfo.id, dentele.id), setsMin: 3, setsMax: 2 })).toEqual([
      'Séries min supérieures aux séries max.',
      'Ajoute au moins un exercice candidat.',
    ]);
  });
});

describe('ordre des lignes', () => {
  const a = item({ blockTypeId: warmUp.id, elementId: dentele.id });
  const b = item({ blockTypeId: skill.id, elementId: planche.id });
  const c = item({ blockTypeId: skill.id, elementId: planche.id });
  const d = item({ blockTypeId: renfo.id, elementId: dentele.id });

  it('insère une nouvelle ligne à la fin de son bloc', () => {
    const added = item({ blockTypeId: skill.id, elementId: planche.id });
    expect(insertItem([a, b, c, d], added, blocksById).map((i) => i.id)).toEqual([a.id, b.id, c.id, added.id, d.id]);
    const first = item({ blockTypeId: warmUp.id, elementId: dentele.id });
    expect(insertItem([b, d], first, blocksById).map((i) => i.id)).toEqual([first.id, b.id, d.id]);
  });

  it('déplace une ligne dans son bloc seulement', () => {
    expect(moveItem([a, b, c, d], c.id, -1).map((i) => i.id)).toEqual([a.id, c.id, b.id, d.id]);
    expect(moveItem([a, b, c, d], b.id, -1).map((i) => i.id)).toEqual([a.id, b.id, c.id, d.id]);
  });
});

describe('modèles', () => {
  it('duplique avec de nouveaux identifiants', () => {
    const tpl = template('Max', 'evening', [item({ blockTypeId: skill.id, elementId: planche.id })]);
    let n = 0;
    const copy = duplicateTemplate(tpl, () => `new-${++n}`, 'Max (copie)');
    expect(copy.id).toBe('new-1');
    expect(copy.items[0].id).toBe('new-2');
    expect(copy.name).toBe('Max (copie)');
    expect(tpl.items[0].id).not.toBe('new-2');
  });

  it('retire un exercice supprimé des candidats', () => {
    const line = item({ blockTypeId: renfo.id, elementId: dentele.id, candidateExerciseIds: [wallSlide.id, hold.id] });
    const other = template('Combo', 'evening', [item({ blockTypeId: skill.id, elementId: planche.id })]);
    const changed = withoutExercise([template('Max', 'evening', [line]), other], hold.id, exercisesById);
    expect(changed).toHaveLength(1);
    expect(changed[0].items[0]).toMatchObject({ candidateExerciseIds: [wallSlide.id], candidatesText: 'Wall slide' });
  });
});

describe('uniqueName et itemsByBlock', () => {
  it('trouve le premier nom libre', () => {
    expect(uniqueName('Nouveau modèle', [])).toBe('Nouveau modèle');
    expect(uniqueName('Nouveau modèle', [{ name: 'nouveau modele' }, { name: 'Nouveau modèle 2' }])).toBe('Nouveau modèle 3');
  });

  it('groupe les lignes par bloc dans l’ordre des blocs', () => {
    const a = item({ blockTypeId: renfo.id, elementId: dentele.id });
    const b = item({ blockTypeId: warmUp.id, elementId: dentele.id });
    const c = item({ blockTypeId: renfo.id, elementId: dentele.id });
    expect(itemsByBlock([a, b, c], blocksById).map((g) => [g.blockTypeId, g.items.map((i) => i.id)])).toEqual([
      [warmUp.id, [b.id]],
      [renfo.id, [a.id, c.id]],
    ]);
  });
});
