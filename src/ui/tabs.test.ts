import { describe, expect, it } from 'vitest';
import { progressViewOf, tabOf } from './tabs';

describe('tabOf', () => {
  it('range chaque chemin sous l’un des quatre onglets', () => {
    expect(tabOf('/')).toBe('today');
    expect(tabOf('/session')).toBe('session');
    expect(tabOf('/session/abc')).toBe('session');
    expect(tabOf('/programs')).toBe('programs');
    expect(tabOf('/settings/templates/x/items/new?block=y')).toBe('programs');
    expect(tabOf('/journal/exercise/x')).toBe('progress');
    expect(tabOf('/journal?vue=exercices')).toBe('progress');
    expect(tabOf('/objectives/x')).toBe('progress');
    expect(tabOf('/week')).toBe('progress');
    expect(tabOf('/inconnu')).toBe('today');
  });

  it('retrouve la vue de Progression d’un chemin', () => {
    expect(progressViewOf('/objectives')).toBe('skills');
    expect(progressViewOf('/week')).toBe('volume');
    expect(progressViewOf('/journal/session/x?mois=2026-10')).toBe('history');
    expect(progressViewOf('/settings')).toBeNull();
  });
});
