import { describe, expect, it } from 'vitest';
import { tabOf } from './tabs';

describe('tabOf', () => {
  it('trouve l’onglet d’un chemin, paramètres compris', () => {
    expect(tabOf('/')).toBe('/');
    expect(tabOf('/journal/exercise/x')).toBe('/journal');
    expect(tabOf('/journal?vue=exercices')).toBe('/journal');
    expect(tabOf('/settings/templates/x/items/new?block=y')).toBe('/settings');
  });
});
