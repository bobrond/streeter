// Classeur construit en mémoire : couvre la normalisation sans dépendre du tableur personnel.
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { EXERCICES, JOURNAL, OBJECTIFS, PROGRAMME, SAMPLE_SHEETS, serial, workbook } from '../../test/sampleWorkbook';
import { buildImport, emptyExisting } from './importWorkbook';
import { excelDate, readWorkbook } from './readWorkbook';

function importOf(sheets: Record<string, unknown[][]>) {
  let n = 0;
  const data = readWorkbook(XLSX, workbook(sheets));
  return { data, result: buildImport(data, emptyExisting(), { newId: () => `id-${++n}`, today: '2026-10-14' }) };
}

describe('excelDate', () => {
  it('convertit numéros de série et textes', () => {
    expect(excelDate(serial('2026-10-07'))).toBe('2026-10-07');
    expect(excelDate('07/10/2026')).toBe('2026-10-07');
    expect(excelDate('2026-10-07')).toBe('2026-10-07');
    expect(excelDate('n’importe quoi')).toBeNull();
    expect(excelDate(0, true)).toBe('1904-01-01');
  });
});

describe('import d’un classeur minimal', () => {
  const { data, result } = importOf(SAMPLE_SHEETS);

  it('lit les paramètres de Volume hebdo', () => {
    expect(data.volume).toMatchObject({ min: 3, max: 5, deloadPct: 50 });
    expect(result.settings).toMatchObject({ volumeMin: 3, volumeMax: 5, deloadReductionPct: 50 });
  });

  it('déduit la date de début des semaines et jours notés', () => {
    expect(result.settings.cycleStartDate).toBe('2026-10-05');
  });

  it('traite la ligne « Repos » comme un soir sans séance', () => {
    expect(result.settings.weekPlan[2]).toEqual({ morning: expect.any(String), evening: null });
    expect(result.templates.map((t) => t.name)).toEqual(['Max', 'Matin A']);
  });

  it('importe le test de l’objectif avec sa date', () => {
    expect(result.objectives[0].tests).toMatchObject([{ date: '2026-11-02', value: 6 }]);
  });

  it('normalise jour, moment et type de séance du Journal', () => {
    expect(result.sessions.map((s) => [s.date, s.seqDay, s.moment, s.sessionTypeName, s.week])).toEqual([
      ['2026-10-12', 1, 'evening', 'Max', 2],
      ['2026-10-13', 2, 'morning', 'Matin A', 2],
    ]);
  });

  it('déduit le nombre de séries des valeurs, jamais de la colonne « Séries faites »', () => {
    const name = new Map(result.exercises.map((e) => [e.id, e.name]));
    const values = (exercise: string) => result.sets.filter((s) => name.get(s.exerciseId) === exercise).map((s) => s.value);
    expect(values('Planche Hold')).toEqual([3, 3, 2, 2]);
    expect(values('Wall slide')).toEqual([12, 10]);
    expect(values('Muscle-up')).toEqual([null, null]);
  });

  it('ajoute au catalogue un exercice inconnu et crée un élastique inconnu, avec avertissement', () => {
    expect(result.exercises.find((e) => e.name === 'Muscle-up')).toMatchObject({ category: 'Importé (journal)' });
    expect([...result.bands].sort((a, b) => a.order - b.order).map((b) => b.name)).toEqual(['orange', 'jaune', 'vert', 'bleue', 'rouge']);
    const messages = result.report.issues.map((i) => i.message);
    expect(messages).toContain('Exercice « Muscle-up » absent du catalogue : ajouté au catalogue.');
    expect(messages).toContain('Élastique « rouge » inconnu : ajouté en fin de liste (le moins assistant).');
    expect(messages).toContain('Planche Hold : « Séries faites » = 3 mais 4 valeurs notées → 4 séries importées.');
  });
});

describe('fichier incomplet', () => {
  it('signale un onglet manquant', () => {
    const { result } = importOf({ Programme: PROGRAMME, Exercices: EXERCICES });
    const errors = result.report.issues.filter((i) => i.level === 'error').map((i) => i.message);
    expect(errors).toEqual(['Onglet « Objectifs » introuvable.', 'Onglet « Journal » introuvable.']);
    expect(result.templates).toHaveLength(2);
  });

  it('signale une colonne manquante', () => {
    const programme = PROGRAMME.map((row) => row.filter((_, i) => i !== 7));
    const { result } = importOf({ Programme: programme, Exercices: EXERCICES, Objectifs: OBJECTIFS, Journal: JOURNAL });
    expect(result.report.issues.filter((i) => i.level === 'error').map((i) => i.message)).toEqual([
      'Onglet Programme : colonne introuvable : « Séries min ».',
    ]);
  });
});
