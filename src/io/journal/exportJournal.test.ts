import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { block, exercise, sessionLog, setLog } from '../../test/builders';
import { readWorkbook } from '../xlsx/readWorkbook';
import { JOURNAL_COLUMNS, excelSerial, journalCsv, journalExportRows, journalXlsx, type JournalExportData } from './exportJournal';

const skill = block('Skill', 1);
const assisted = block('Skill assisté', 2);
const hold = exercise('Planche Hold', null, { measure: 'seconds' });
const activation = exercise('Activation élastique', null, { measure: 'none' });
const jaune = { id: 'jaune', name: 'jaune', color: '#facc15', order: 1, active: true };

const technique = sessionLog('2026-10-07', { week: 1, seqDay: 3, sessionTypeName: 'Technique', note: 'bonne séance', startedAt: 1 });
const matin = sessionLog('2026-10-08', { week: 1, seqDay: 4, moment: 'morning', sessionTypeName: 'Matin A', status: 'abandoned' });
const running = sessionLog('2026-10-09', { status: 'in_progress' });

function data(): JournalExportData {
  return {
    sessions: [matin, technique, running],
    sets: [
      setLog({ sessionId: technique.id, exerciseId: hold.id, blockTypeId: skill.id, value: 3, rpe: 7 }),
      setLog({ sessionId: technique.id, exerciseId: hold.id, blockTypeId: skill.id, value: 3, rpe: 7, quality: 'degraded', note: 'coude' }),
      setLog({ sessionId: technique.id, exerciseId: hold.id, blockTypeId: assisted.id, value: 14, bandId: 'jaune', rpe: 6 }),
      setLog({ sessionId: technique.id, exerciseId: hold.id, blockTypeId: assisted.id, value: 11, bandId: 'jaune', rpe: 8 }),
      setLog({ sessionId: matin.id, exerciseId: activation.id, blockTypeId: null, value: null, rpe: null }),
      setLog({ sessionId: running.id, exerciseId: hold.id, blockTypeId: skill.id, value: 5 }),
    ],
    exercises: new Map([hold, activation].map((e) => [e.id, e])),
    blocks: new Map([skill, assisted].map((b) => [b.id, b])),
    bands: new Map([[jaune.id, jaune]]),
  };
}

describe('journalExportRows', () => {
  it('fait une ligne par (séance, bloc, exercice), séances en cours exclues', () => {
    const rows = journalExportRows(data());
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      date: '2026-10-07',
      week: 1,
      day: 'J3',
      moment: 'Soir',
      sessionType: 'Technique',
      block: 'Skill',
      exercise: 'Planche Hold',
      setsDone: 2,
      values: '3 ; 3',
      band: '',
      rpe: 7,
      notes: 'Séance : bonne séance · coude · Série dégradée : 2',
    });
    expect(rows[1]).toMatchObject({ block: 'Skill assisté', values: '14 ; 11', band: 'jaune', rpe: '6 ; 8', notes: '' });
    expect(rows[2]).toMatchObject({ day: 'J4', moment: 'Matin', sessionType: 'Matin A', block: '', values: '-', rpe: '', notes: 'Séance abandonnée' });
  });
});

describe('journalCsv', () => {
  it('écrit un CSV pour Excel en français', () => {
    const csv = journalCsv(journalExportRows(data()));
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe(JOURNAL_COLUMNS.join(';'));
    expect(lines[1]).toBe('07/10/2026;1;J3;Soir;Technique;Skill;Planche Hold;2;"3 ; 3";;7;Séance : bonne séance · coude · Série dégradée : 2');
    expect(lines[2]).toContain(';"6 ; 8";');
  });
});

describe('journalXlsx', () => {
  it('se relit comme l’onglet Journal du tableur', () => {
    const buffer = journalXlsx(XLSX, journalExportRows(data()));
    const read = readWorkbook(XLSX, buffer);
    expect(read.journal).toHaveLength(3);
    expect(read.journal![0]).toMatchObject({
      date: '2026-10-07',
      week: 1,
      day: 3,
      moment: 'evening',
      sessionType: 'Technique',
      block: 'Skill',
      exercise: 'Planche Hold',
      setsDone: 2,
      values: '3 ; 3',
      rpe: 7,
    });
    expect(read.journal![1]).toMatchObject({ band: 'jaune', values: '14 ; 11' });
    const book = XLSX.read(buffer);
    const sheet = book.Sheets.Journal;
    expect(XLSX.utils.sheet_to_json(sheet, { header: 1 })[0]).toEqual([...JOURNAL_COLUMNS]);
    expect(sheet.A2).toMatchObject({ t: 'n', v: excelSerial('2026-10-07') });
  });

  it('calcule le numéro de série Excel d’une date', () => {
    expect(excelSerial('2026-10-07')).toBe(46302);
  });
});
