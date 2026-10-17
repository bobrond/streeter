import { describe, expect, it } from 'vitest';
import { element, exercise, sessionLog, setLog } from '../test/builders';
import { objectivesBySkill, skillRecords } from './skills';
import type { Objective } from './types';

const planche = element('Planche', 'skill', 0);
const fl = element('Touch FL', 'skill', 1);
const dentele = element('Grand dentelé', 'component', 2);

const hold = exercise('Planche Hold', planche.id, { measure: 'seconds', order: 1 });
const pn = exercise('P/N', planche.id, { order: 2 });
const press = exercise('Planche Hold to press', planche.id, { measure: 'combos', order: 0 });
const activation = exercise('Activation', planche.id, { measure: 'none', order: 3 });
const flHold = exercise('Touch FL hold full', fl.id, { measure: 'seconds' });
const uppercut = exercise('Uppercut', dentele.id);
const exercises = [hold, pn, press, activation, flHold, uppercut];
const byId = new Map(exercises.map((e) => [e.id, e]));

const objective = (name: string, exerciseId: string | null, order: number): Objective => ({
  id: `obj-${name}`,
  name,
  criterion: '',
  target: 10,
  unit: 'seconds',
  exerciseId,
  order,
  tests: [],
});

describe('objectivesBySkill', () => {
  it('range les objectifs par skill d’après leur exercice lié, les autres à part', () => {
    const objectives = [objective('P/N', pn.id, 1), objective('Planche hold', hold.id, 0), objective('FL', flHold.id, 2), objective('Libre', null, 3), objective('Dentelé', uppercut.id, 4)];
    const { bySkill, others } = objectivesBySkill(objectives, byId, [planche, fl]);
    expect(bySkill.get(planche.id)?.map((o) => o.name)).toEqual(['Planche hold', 'P/N']);
    expect(bySkill.get(fl.id)?.map((o) => o.name)).toEqual(['FL']);
    expect(others.map((o) => o.name)).toEqual(['Libre', 'Dentelé']);
  });
});

describe('skillRecords', () => {
  const a = sessionLog('2026-10-07');
  const b = sessionLog('2026-10-12');
  const sessions = new Map([a, b].map((s) => [s.id, s]));

  it('liste les exercices du skill qui ont un record : objectifs d’abord, puis les plus récents', () => {
    const sets = [
      setLog({ sessionId: a.id, exerciseId: press.id, value: 2 }),
      setLog({ sessionId: b.id, exerciseId: pn.id, value: 1 }),
      setLog({ sessionId: a.id, exerciseId: hold.id, value: 12, bandId: 'vert' }),
      setLog({ sessionId: b.id, exerciseId: flHold.id, value: 4 }),
      setLog({ sessionId: b.id, exerciseId: activation.id, value: null }),
    ];
    const rows = skillRecords(planche.id, exercises, sets, sessions, [objective('Planche hold', hold.id, 0)]);
    expect(rows.map((r) => r.exercise.name)).toEqual(['Planche Hold', 'P/N', 'Planche Hold to press']);
    expect(rows[0].records.get('vert')?.value).toBe(12);
    expect(rows[0].records.has(null)).toBe(false);
    expect(rows[1].lastDate).toBe('2026-10-12');
  });

  it('ignore un exercice dont toutes les séries sont dégradées ou d’échauffement', () => {
    const sets = [setLog({ sessionId: a.id, exerciseId: hold.id, value: 8, quality: 'degraded' }), setLog({ sessionId: a.id, exerciseId: pn.id, value: 1, kind: 'warmup' })];
    expect(skillRecords(planche.id, exercises, sets, sessions, [])).toEqual([]);
  });
});
