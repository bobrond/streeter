import { describe, expect, it } from 'vitest';
import { block, item, template } from '../test/builders';
import { deloadSets, deloadTemplate, excelRound, morningsHidden } from './deload';

describe('excelRound', () => {
  it('arrondit le demi vers le haut, comme ROUND d’Excel', () => {
    expect(excelRound(2.4)).toBe(2);
    expect(excelRound(2.5)).toBe(3);
    expect(excelRound(22.8)).toBe(23);
  });
});

describe('deloadSets (−40 %)', () => {
  it.each([
    [5, 3],
    [4, 2],
    [3, 2],
    [2, 1],
    [1, 1],
    [0, 0],
  ])('%i séries → %i', (sets, expected) => {
    expect(deloadSets(sets, 40)).toBe(expected);
  });

  it('ne descend jamais sous 1 série', () => {
    expect(deloadSets(1, 60)).toBe(1);
    expect(deloadSets(2, 90)).toBe(1);
  });

  it('suit le pourcentage paramétré', () => {
    expect(deloadSets(5, 50)).toBe(3);
    expect(deloadSets(10, 25)).toBe(8);
  });
});

describe('deloadTemplate', () => {
  const warmUp = block('Échauffement', 0, { reducedInDeload: false });
  const skill = block('Skill', 1);
  const blocks = new Map([warmUp, skill].map((b) => [b.id, b]));

  it('réduit le min et le max des lignes du soir, sauf l’échauffement', () => {
    const evening = template('Max', 'evening', [
      item({ blockTypeId: warmUp.id, elementId: 'conn', setsMin: 2, setsMax: 2 }),
      item({ blockTypeId: skill.id, elementId: 'planche', setsMin: 4, setsMax: 5 }),
      item({ blockTypeId: skill.id, elementId: 'fl', setsMin: 3, setsMax: 5 }),
    ]);
    const reduced = deloadTemplate(evening, blocks, { deloadReductionPct: 40 });
    expect(reduced.items.map((i) => [i.setsMin, i.setsMax])).toEqual([
      [2, 2],
      [2, 3],
      [2, 3],
    ]);
  });

  it('laisse l’intensité et le repos inchangés', () => {
    const evening = template('Max', 'evening', [
      item({ blockTypeId: skill.id, elementId: 'planche', setsMin: 4, setsMax: 5, intensityText: 'RPE 8-9', restMinSec: 90, restMaxSec: 120 }),
    ]);
    const [reduced] = deloadTemplate(evening, blocks, { deloadReductionPct: 40 }).items;
    expect(reduced).toMatchObject({ intensityText: 'RPE 8-9', restMinSec: 90, restMaxSec: 120 });
  });

  it('ne réduit pas les séances du matin (elles sont masquées)', () => {
    const morning = template('Matin A', 'morning', [item({ blockTypeId: skill.id, elementId: 'planche', setsMin: 2, setsMax: 3 })]);
    expect(deloadTemplate(morning, blocks, { deloadReductionPct: 40 })).toBe(morning);
    expect(morningsHidden(true, { hideMorningsInDeload: true })).toBe(true);
    expect(morningsHidden(true, { hideMorningsInDeload: false })).toBe(false);
    expect(morningsHidden(false, { hideMorningsInDeload: true })).toBe(false);
  });
});
