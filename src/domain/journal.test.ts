import { describe, expect, it } from 'vitest';
import { sessionLog, setLog } from '../test/builders';
import { isFilterActive, journalEntries, loggedExerciseIds, progressPoints, sessionDurationSec, sessionLines } from './journal';

const s1 = sessionLog('2026-10-07', { sessionTypeId: 'technique' });
const s2 = sessionLog('2026-10-09', { sessionTypeId: 'max' });
const running = sessionLog('2026-10-10', { status: 'in_progress' });
const sessions = [s1, s2, running];
const sessionsById = new Map(sessions.map((s) => [s.id, s]));
const sets = [
  setLog({ sessionId: s1.id, exerciseId: 'hold', blockTypeId: 'skill', elementId: 'planche', value: 3 }),
  setLog({ sessionId: s1.id, exerciseId: 'hold', blockTypeId: 'skill', elementId: 'planche', value: 4, quality: 'degraded' }),
  setLog({ sessionId: s1.id, exerciseId: 'hold', blockTypeId: 'assisted', elementId: 'planche', value: 14, bandId: 'jaune' }),
  setLog({ sessionId: s1.id, exerciseId: 'wall', blockTypeId: 'renfo', elementId: 'dentele', value: 12 }),
  setLog({ sessionId: s2.id, exerciseId: 'hold', blockTypeId: 'skill', elementId: 'planche', value: 5 }),
  setLog({ sessionId: running.id, exerciseId: 'hold', blockTypeId: 'skill', elementId: 'planche', value: 6 }),
];

describe('journal', () => {
  it('regroupe les séries par (bloc, exercice) dans l’ordre de saisie', () => {
    const lines = sessionLines(sets.filter((x) => x.sessionId === s1.id));
    expect(lines.map((l) => [l.blockTypeId, l.exerciseId, l.sets.length])).toEqual([
      ['skill', 'hold', 2],
      ['assisted', 'hold', 1],
      ['renfo', 'wall', 1],
    ]);
  });

  it('liste les séances terminées, les plus récentes d’abord', () => {
    const entries = journalEntries(sessions, sets);
    expect(entries.map((e) => e.session.id)).toEqual([s2.id, s1.id]);
    expect(entries[1]).toMatchObject({ setCount: 4 });
  });

  it('filtre par exercice, élément, bloc ou type de séance', () => {
    expect(journalEntries(sessions, sets, { exerciseId: 'wall' }).map((e) => e.session.id)).toEqual([s1.id]);
    const byBlock = journalEntries(sessions, sets, { blockTypeId: 'assisted' });
    expect(byBlock.map((e) => e.lines.length)).toEqual([1]);
    expect(journalEntries(sessions, sets, { elementId: 'planche' })).toHaveLength(2);
    expect(journalEntries(sessions, sets, { sessionTypeId: 'max' }).map((e) => e.session.id)).toEqual([s2.id]);
    expect(isFilterActive({})).toBe(false);
    expect(isFilterActive({ blockTypeId: 'x' })).toBe(true);
  });

  it('trace la meilleure valeur par séance et par élastique, sans les séries dégradées', () => {
    expect(progressPoints('hold', sets, sessionsById)).toEqual([
      { sessionId: s1.id, date: '2026-10-07', bandId: null, best: 3 },
      { sessionId: s1.id, date: '2026-10-07', bandId: 'jaune', best: 14 },
      { sessionId: s2.id, date: '2026-10-09', bandId: null, best: 5 },
      { sessionId: running.id, date: '2026-10-10', bandId: null, best: 6 },
    ]);
  });

  it('liste les exercices du journal, du plus récent au plus ancien, et la durée d’une séance', () => {
    expect(loggedExerciseIds(sets)).toEqual(['hold', 'wall']);
    expect(sessionDurationSec({ startedAt: 1000, endedAt: 61_000 })).toBe(60);
    expect(sessionDurationSec({ startedAt: null, endedAt: null })).toBeNull();
  });
});
