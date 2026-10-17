import { describe, expect, it } from 'vitest';
import { element, exercise } from '../test/builders';
import { elementsOfKind, filterLibrary } from './library';

const fl = element('Touch FL', 'skill', 1);
const planche = element('Planche', 'skill', 0);
const dentele = element('Grand dentelé', 'component', 2);
const connexion = element('Connexion', 'other', 3);
const elements = [fl, planche, dentele, connexion];

const hold = exercise('Planche Hold', planche.id, { order: 0 });
const pn = exercise('P/N', planche.id, { order: 1, aliases: ['press to négative'] });
const flHold = exercise('Touch FL hold one leg', fl.id, { order: 2 });
const wallSlide = exercise('Wall slide', dentele.id, { order: 3 });
const scap = exercise('Scapula PU', connexion.id, { order: 4 });
const loose = exercise('Exercice importé', null, { order: 5 });
const old = exercise('Ancien hold', planche.id, { order: 6, active: false });
const exercises = [loose, wallSlide, flHold, pn, hold, scap, old];

const names = (list: { name: string }[]) => list.map((e) => e.name);

describe('filterLibrary', () => {
  it('regroupe par élément : skills, composantes, autres, puis sans élément ; désactivés à part', () => {
    const library = filterLibrary(exercises, elements, { kind: 'all', elementId: null, query: '' });
    expect(library.groups.map((g) => g.element?.name ?? null)).toEqual(['Planche', 'Touch FL', 'Grand dentelé', 'Connexion', null]);
    expect(names(library.groups[0].exercises)).toEqual(['Planche Hold', 'P/N']);
    expect(names(library.inactive)).toEqual(['Ancien hold']);
    expect(library.count).toBe(6);
  });

  it('filtre par nature, les exercices sans élément comptant parmi les autres', () => {
    expect(filterLibrary(exercises, elements, { kind: 'skill', elementId: null, query: '' }).groups.map((g) => g.element?.name)).toEqual(['Planche', 'Touch FL']);
    expect(names(filterLibrary(exercises, elements, { kind: 'component', elementId: null, query: '' }).groups.flatMap((g) => g.exercises))).toEqual(['Wall slide']);
    expect(names(filterLibrary(exercises, elements, { kind: 'other', elementId: null, query: '' }).groups.flatMap((g) => g.exercises))).toEqual(['Scapula PU', 'Exercice importé']);
  });

  it('filtre par élément et cherche dans le nom, les autres noms et l’élément, sans accents ni casse', () => {
    expect(names(filterLibrary(exercises, elements, { kind: 'skill', elementId: planche.id, query: '' }).groups.flatMap((g) => g.exercises))).toEqual(['Planche Hold', 'P/N']);
    expect(names(filterLibrary(exercises, elements, { kind: 'all', elementId: null, query: 'NEGATIVE' }).groups.flatMap((g) => g.exercises))).toEqual(['P/N']);
    expect(names(filterLibrary(exercises, elements, { kind: 'all', elementId: null, query: 'dentele' }).groups.flatMap((g) => g.exercises))).toEqual(['Wall slide']);
    const holds = filterLibrary(exercises, elements, { kind: 'all', elementId: null, query: 'hold' });
    expect(names(holds.groups.flatMap((g) => g.exercises))).toEqual(['Planche Hold', 'Touch FL hold one leg']);
    expect(names(holds.inactive)).toEqual(['Ancien hold']);
  });

  it('liste les éléments d’une nature dans leur ordre', () => {
    expect(names(elementsOfKind(elements, 'skill'))).toEqual(['Planche', 'Touch FL']);
  });
});
