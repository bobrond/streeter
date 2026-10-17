import { describe, expect, it } from 'vitest';
import { containingIndex, insertionIndex } from './gestures';

// Trois cartes de 100 px séparées de 10 px : milieux à 50, 160, 270.
const rects = [
  { top: 0, bottom: 100 },
  { top: 110, bottom: 210 },
  { top: 220, bottom: 320 },
];

describe('glisser-déposer', () => {
  it('donne le rang d’insertion dans la liste sans l’élément déplacé', () => {
    // La 1re carte descend : elle passe après la 2e une fois le doigt sous le milieu de la 2e.
    expect(insertionIndex(60, rects, 0)).toBe(0);
    expect(insertionIndex(170, rects, 0)).toBe(1);
    expect(insertionIndex(400, rects, 0)).toBe(2);
    // La dernière carte monte en tête.
    expect(insertionIndex(-20, rects, 2)).toBe(0);
    expect(insertionIndex(100, rects, 2)).toBe(1);
  });

  it('donne la cible qui contient le doigt, sinon la plus proche', () => {
    expect(containingIndex(150, rects)).toBe(1);
    expect(containingIndex(-50, rects)).toBe(0);
    expect(containingIndex(900, rects)).toBe(2);
    expect(containingIndex(105, rects)).toBe(0);
    expect(containingIndex(0, [])).toBeNull();
  });
});
