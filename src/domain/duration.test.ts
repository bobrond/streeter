import { describe, expect, it } from 'vitest';
import { block, element, item, template } from '../test/builders';
import { estimateDuration, type PlanStructure } from './duration';

const planche = element('Planche', 'skill', 0);
const fl = element('Touch FL', 'skill', 1);
const skill = block('Skill', 1, { alternateSkills: true });
const structure: PlanStructure = { blocks: new Map([[skill.id, skill]]), elements: new Map([planche, fl].map((e) => [e.id, e])) };
const settings = { avgWorkSecPerSet: 30, freeRestSec: 30 };

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
    expect(estimateDuration(matinA, settings, structure)).toEqual({ minSec: 17 * 60, maxSec: 25 * 60 });
  });

  it('ignore les lignes sans séries', () => {
    const rest = template('Repos', 'evening', [item({ blockTypeId: 'repos', elementId: '—', setsMin: 0, setsMax: 0 })]);
    expect(estimateDuration(rest, settings, structure)).toEqual({ minSec: 0, maxSec: 0 });
  });

  it('compte un seul repos par tour dans une alternance planche / FL', () => {
    // P/N 3-5 ↔ FL PU 3 (J1), repos 90 s-2 min : 3 tours à deux séries, puis P/N seul.
    const pair = template('Max', 'evening', [
      item({ blockTypeId: skill.id, elementId: planche.id, setsMin: 3, setsMax: 5, restMinSec: 90, restMaxSec: 120 }),
      item({ blockTypeId: skill.id, elementId: fl.id, setsMin: 3, setsMax: 3, restMinSec: 90, restMaxSec: 120 }),
    ]);
    expect(estimateDuration(pair, settings, structure)).toEqual({
      minSec: 3 * (2 * 30 + 90),
      maxSec: 3 * (2 * 30 + 120) + 2 * (30 + 120),
    });
  });
});
