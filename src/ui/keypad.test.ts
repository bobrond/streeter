import { describe, expect, it } from 'vitest';
import { applyKey } from './keypad';

describe('pavé numérique', () => {
  it('remplace la valeur pré-remplie au premier chiffre, puis ajoute les chiffres', () => {
    expect(applyKey(12, '8', true)).toBe(8);
    expect(applyKey(8, '5', false)).toBe(85);
    expect(applyKey(null, '3', false)).toBe(3);
  });

  it('efface un chiffre, puis la valeur', () => {
    expect(applyKey(85, 'back', false)).toBe(8);
    expect(applyKey(8, 'back', false)).toBeNull();
    expect(applyKey(12, 'back', true)).toBeNull();
  });

  it('ignore les zéros en tête et garde 4 chiffres au plus', () => {
    expect(applyKey(0, '7', false)).toBe(7);
    expect(applyKey(1234, '5', false)).toBe(1234);
  });
});
