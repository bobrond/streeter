import { describe, expect, it } from 'vitest';
import { element, exercise } from '../test/builders';
import {
  FLOOR_VICTORIAN_TARGETS,
  ensureFloorVictorianExercises,
  inferExerciseEquipment,
  isExerciseCompatible,
  isFloorVictorian,
  normalizeEquipment,
} from './equipment';
import { formatEquipment } from './labels';

describe('matériel des exercices', () => {
  it('ordonne et dédoublonne le matériel', () => {
    expect(normalizeEquipment(['band', 'floor', 'parallettes', 'floor'])).toEqual(['floor', 'parallettes', 'band']);
    expect(formatEquipment(['parallettes', 'floor'])).toBe('Sol, parallèles');
    expect(formatEquipment([])).toBe('');
  });

  it('classe les exercices de planche selon le niveau actuel : full et dynamiques sur parallèles uniquement, straddle / adv tuck / surélevés au sol et parallèles', () => {
    for (const paralletteOnly of [
      'Planche Hold',
      'Planche Hold to press',
      'Lean to press',
      'P/N',
      'Planche PU to press',
      'Planche lean-up',
      'Planche négative',
      'Lean-up to play to press',
    ]) {
      expect(inferExerciseEquipment(paralletteOnly, 'Planche skill'), paralletteOnly).toEqual(['parallettes']);
    }
    for (const both of [
      'Straddle planche hold',
      'Adv tuck planche hold sol',
      'Planche lean surélevé press',
      'Planche lean surélevé hold to press',
      'Lean planche PU surélevé',
    ]) {
      expect(inferExerciseEquipment(both, 'Planche renfo spé'), both).toEqual(['floor', 'parallettes']);
    }
  });

  it('classe tout le front lever suspendu (pseudo FL mur compris) sur barre, et la Victorienne au sol sur sol', () => {
    for (const barOnly of [
      'Touch FL hold full',
      'Touch FL hold one leg',
      'Touch FL hold adv tuck extrême',
      'FL PU full',
      'PU to touch one leg',
      'FL press',
      'Pseudo touch FL hold wall',
      'Pseudo FL PU to touch wall',
      'Pseudo FL PU wall',
    ]) {
      expect(inferExerciseEquipment(barOnly, 'Touch FL'), barOnly).toEqual(['bar']);
    }
    expect(inferExerciseEquipment('Victorienne au sol hold', 'Touch FL renfo spé')).toEqual(['floor']);
    expect(inferExerciseEquipment('Victorienne au sol PU', 'Touch FL renfo spé')).toEqual(['floor']);
    expect(isFloorVictorian({ name: 'Victorienne au sol hold', aliases: [] })).toBe(true);
    expect(FLOOR_VICTORIAN_TARGETS).toEqual([
      { unit: 'seconds', min: 8, max: 15 },
      { unit: 'reps', min: 8, max: 10 },
    ]);
  });

  it('déduit le matériel des composantes, de l’échauffement et d’exercices personnalisés', () => {
    expect(inferExerciseEquipment('Reverse planche PU', 'Rhomboïde')).toEqual(['floor']);
    expect(inferExerciseEquipment('Adv tuck FL scapula PU', 'Rhomboïde')).toEqual(['bar']);
    expect(inferExerciseEquipment('Rétraction élastique', 'Rhomboïde')).toEqual(['band']);
    expect(inferExerciseEquipment('Handstand push-up', 'Deltoïde ant')).toEqual(['floor', 'parallettes']);
    expect(inferExerciseEquipment('Dumbbell raise', 'Deltoïde ant')).toEqual(['dumbbell']);
    expect(inferExerciseEquipment('Zanetti fly elastic', 'Deltoïde ant')).toEqual(['band']);
    expect(inferExerciseEquipment('Scapula PU', 'Connexion')).toEqual(['floor', 'parallettes']);
    expect(inferExerciseEquipment('CARs scapulaire tiré (sous barre)', 'Connexion')).toEqual(['bar']);
    expect(inferExerciseEquipment('Rotateurs externes élastique', 'Échauffement')).toEqual(['band']);
    expect(inferExerciseEquipment('Rotateurs externes haltère', 'Échauffement')).toEqual(['dumbbell']);
  });

  it('vérifie la compatibilité en OU logique et refuse tout quand aucun matériel n’est coché', () => {
    const both = exercise('Straddle planche hold', 'pl', { equipment: ['floor', 'parallettes'] });
    const unrestricted = exercise('Libre', 'pl', { equipment: [] });
    expect(isExerciseCompatible(both, new Set(['floor']))).toBe(true);
    expect(isExerciseCompatible(both, new Set(['parallettes']))).toBe(true);
    expect(isExerciseCompatible(both, new Set(['bar']))).toBe(false);
    expect(isExerciseCompatible(both, new Set())).toBe(false);
    expect(isExerciseCompatible(unrestricted, new Set(['band']))).toBe(true);
    expect(isExerciseCompatible(unrestricted, new Set())).toBe(false);
  });

  it('ajoute les deux variantes de Victorienne au sol sans doublon si et seulement si Touch FL existe', () => {
    const pl = element('Planche', 'skill', 0);
    const fl = element('Touch FL', 'skill', 1);
    const hold = exercise('Planche Hold', pl.id, { equipment: ['parallettes'] });
    expect(ensureFloorVictorianExercises([hold], [pl], () => 'v')).toEqual([hold]);

    let n = 0;
    const added = ensureFloorVictorianExercises([hold], [pl, fl], () => `v-${++n}`);
    expect(added).toHaveLength(3);
    expect(added.slice(1)).toMatchObject([
      { id: 'v-1', name: 'Victorienne au sol hold', elementId: fl.id, measure: 'seconds', quick: true, equipment: ['floor'] },
      { id: 'v-2', name: 'Victorienne au sol PU', elementId: fl.id, measure: 'reps', quick: true, equipment: ['floor'] },
    ]);
    // Idempotent lors d'un second appel.
    expect(ensureFloorVictorianExercises(added, [pl, fl], () => 'dup')).toHaveLength(3);
  });
});
