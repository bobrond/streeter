// Export du journal au format de l'onglet Journal du tableur : une ligne par (séance, bloc, exercice).
import { toDayNumber } from '../../domain/cycle';
import { MOMENT_LABEL, formatDateShort, seqDayLabel } from '../../domain/labels';
import { sessionLines } from '../../domain/journal';
import type { Band, BlockType, Exercise, ID, SessionLog, SetLog } from '../../domain/types';
import type { SheetJS } from '../xlsx/readWorkbook';

export const JOURNAL_COLUMNS = [
  'Date',
  'Semaine',
  'Jour',
  'Moment',
  'Type séance',
  'Bloc',
  'Exercice',
  'Séries faites',
  'Reps / durée',
  'Élastique',
  'RPE',
  'Ressenti / notes',
] as const;

export interface JournalExportRow {
  /** YYYY-MM-DD */
  date: string;
  week: number;
  /** « J3 » */
  day: string;
  moment: string;
  sessionType: string;
  block: string;
  exercise: string;
  setsDone: number;
  /** « 3 ; 3 ; 2 ; 2 » */
  values: string;
  band: string;
  /** Une valeur si toutes les séries ont la même, sinon « 6 ; 7 ; 8 » ; vide sans RPE. */
  rpe: number | string;
  notes: string;
}

export interface JournalExportData {
  sessions: readonly SessionLog[];
  sets: readonly SetLog[];
  exercises: ReadonlyMap<ID, Exercise>;
  blocks: ReadonlyMap<ID, BlockType>;
  bands: ReadonlyMap<ID, Band>;
}

function joinValues(values: readonly (number | null)[]): string {
  if (values.every((v) => v === null)) return '-';
  return values.map((v) => (v === null ? '-' : String(v).replace('.', ','))).join(' ; ');
}

function rpeCell(rpes: readonly (number | null)[]): number | string {
  const known = rpes.filter((r): r is number => r !== null);
  if (known.length === 0) return '';
  if (known.length === rpes.length && known.every((r) => r === known[0])) return known[0];
  return rpes.map((r) => (r === null ? '-' : String(r))).join(' ; ');
}

/** Lignes du journal, des séances les plus anciennes aux plus récentes (séances en cours exclues). */
export function journalExportRows(data: JournalExportData): JournalExportRow[] {
  const bySession = new Map<ID, SetLog[]>();
  for (const set of data.sets) {
    const list = bySession.get(set.sessionId);
    if (list) list.push(set);
    else bySession.set(set.sessionId, [set]);
  }
  const sessions = data.sessions
    .filter((s) => s.status !== 'in_progress')
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startedAt ?? 0) - (b.startedAt ?? 0));
  const rows: JournalExportRow[] = [];
  for (const session of sessions) {
    const lines = sessionLines(bySession.get(session.id) ?? []);
    lines.forEach((line, index) => {
      const notes: string[] = [];
      if (index === 0) {
        if (session.status === 'abandoned') notes.push('Séance abandonnée');
        if (session.note) notes.push(`Séance : ${session.note}`);
      }
      notes.push(...line.sets.map((s) => s.note).filter(Boolean));
      const degraded = line.sets.map((s, i) => (s.quality === 'degraded' ? i + 1 : 0)).filter(Boolean);
      if (degraded.length > 0) notes.push(`Série${degraded.length > 1 ? 's' : ''} dégradée${degraded.length > 1 ? 's' : ''} : ${degraded.join(', ')}`);
      const bands = [...new Set(line.sets.map((s) => (s.bandId ? (data.bands.get(s.bandId)?.name ?? '') : '')))].filter(Boolean);
      rows.push({
        date: session.date,
        week: session.week,
        day: seqDayLabel(session.seqDay),
        moment: MOMENT_LABEL[session.moment],
        sessionType: session.sessionTypeName,
        block: line.blockTypeId ? (data.blocks.get(line.blockTypeId)?.name ?? '') : '',
        exercise: data.exercises.get(line.exerciseId)?.name ?? '',
        setsDone: line.sets.length,
        values: joinValues(line.sets.map((s) => s.value)),
        band: bands.join(' ; '),
        rpe: rpeCell(line.sets.map((s) => s.rpe)),
        notes: notes.join(' · '),
      });
    });
  }
  return rows;
}

function rowCells(row: JournalExportRow): (string | number)[] {
  return [row.date, row.week, row.day, row.moment, row.sessionType, row.block, row.exercise, row.setsDone, row.values, row.band, row.rpe, row.notes];
}

/** Marque d'ordre des octets UTF-8 : Excel lit alors les accents correctement. */
const BOM = String.fromCharCode(0xfeff);
const CRLF = String.fromCharCode(13, 10);

function csvCell(value: string | number): string {
  const text = String(value);
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * CSV pour Excel en français : séparateur « ; », fin de ligne CRLF, marque UTF-8 (accents),
 * date au format JJ/MM/AAAA.
 */
export function journalCsv(rows: readonly JournalExportRow[]): string {
  const lines = [JOURNAL_COLUMNS.join(';')];
  for (const row of rows) {
    const cells = rowCells(row);
    cells[0] = formatDateShort(row.date);
    lines.push(cells.map(csvCell).join(';'));
  }
  return BOM + lines.join(CRLF) + CRLF;
}

/** Numéro de série Excel d'une date (jours depuis le 30/12/1899). */
export function excelSerial(date: string): number {
  return toDayNumber(date) - toDayNumber('1899-12-30');
}

/** Classeur .xlsx avec un onglet « Journal » aux colonnes du tableur ; dates en vraies dates Excel. */
export function journalXlsx(XLSX: SheetJS, rows: readonly JournalExportRow[]): ArrayBuffer {
  const sheet = XLSX.utils.aoa_to_sheet([[...JOURNAL_COLUMNS], ...rows.map(rowCells)]);
  rows.forEach((row, i) => {
    const ref = XLSX.utils.encode_cell({ r: i + 1, c: 0 });
    sheet[ref] = { t: 'n', v: excelSerial(row.date), z: 'dd/mm/yyyy' };
  });
  sheet['!cols'] = [12, 9, 6, 8, 16, 18, 34, 13, 18, 12, 9, 50].map((wch) => ({ wch }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Journal');
  return XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}
