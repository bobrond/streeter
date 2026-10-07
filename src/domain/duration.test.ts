import { describe, expect, it } from 'vitest';
import { item, template } from '../test/builders';
import { estimateDuration } from './duration';

describe('estimateDuration', () => {
  // Structure du Matin A du tableur.
  const matinA = template('Matin A', 'morning', [
    item({ blockTypeId: 'echauffement', elementId: 'connexion', setsMin: 1, setsMax: 2, restMinSec: null, restMaxSec: null }),
    item({ blockTypeId: 'renfo-spe', elementId: 'planche', setsMin: 2, setsMax: 3, restMinSec: 120, restMaxSec: 120 }),
    item({ blockTypeId: 'renfo-spe', elementId: 'fl', setsMin: 2, setsMax: 3, restMinSec: 120, restMaxSec: 120 }),
    item({ blockTypeId: 'renfo', elementId: 'dentele', setsMin: 2, setsMax: 2, restMinSec: 60, restMaxSec: 90, superset: true }),
    item({ blockTypeId: 'renfo', elementId: 'deltoide', setsMin: 2, setsMax: 2, restMinSec: 60, restMaxSec: 90, superset: true }),
  ]);

  it('estime le Matin A entre 17 et 25 min (30 s de travail par série, repos libre = 30 s)', () => {
    expect(estimateDuration(matinA, { avgWorkSecPerSet: 30, freeRestSec: 30 })).toEqual({ minSec: 17 * 60, maxSec: 25 * 60 });
  });

  it('ignore les lignes sans séries', () => {
    const rest = template('Repos', 'evening', [item({ blockTypeId: 'repos', elementId: '—', setsMin: 0, setsMax: 0 })]);
    expect(estimateDuration(rest, { avgWorkSecPerSet: 30, freeRestSec: 30 })).toEqual({ minSec: 0, maxSec: 0 });
  });
});
