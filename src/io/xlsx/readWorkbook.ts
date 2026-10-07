// Lecture brute du tableur : une liste de lignes typées par onglet, repérées par le nom des colonnes.
import type * as XLSXTypes from 'xlsx';
import { addDays, localISODate } from '../../domain/cycle';
import { parseSeqDay, parseYes } from '../../domain/parse';
import { cleanSpaces, fold } from '../../domain/text';
import type { Moment, SeqDay } from '../../domain/types';

export type SheetJS = typeof XLSXTypes;

export interface ProgrammeRow {
  /** Numéro de ligne dans Excel. */
  line: number;
  day: SeqDay | null;
  moment: Moment | null;
  order: number;
  sessionType: string;
  block: string;
  element: string;
  candidates: string;
  setsMin: number;
  setsMax: number;
  target: string;
  intensity: string;
  rest: string;
  optional: boolean;
  notes: string;
}

export interface CatalogueRow {
  line: number;
  category: string;
  name: string;
  quick: boolean;
}

export interface ObjectiveRow {
  line: number;
  name: string;
  criterion: string;
  target: number | null;
  unit: string;
  lastTest: number | null;
  lastTestDate: string | null;
}

export interface JournalRow {
  line: number;
  date: string | null;
  week: number | null;
  day: SeqDay | null;
  dayText: string;
  moment: Moment | null;
  sessionType: string;
  block: string;
  exercise: string;
  setsDone: number | null;
  values: string;
  band: string;
  rpe: number | null;
  notes: string;
}

export interface VolumeSheetComponent {
  line: number;
  block: string;
  element: string;
  evening: number | null;
  morning: number | null;
  total: number | null;
  status: string;
  deload: number | null;
}

export interface VolumeSheetSkill {
  line: number;
  block: string;
  element: string;
  setsMin: number | null;
  setsMax: number | null;
  sessions: number | null;
  deloadMax: number | null;
}

export interface VolumeSheet {
  min: number | null;
  max: number | null;
  /** Pourcentage entier (0,4 dans Excel → 40). */
  deloadPct: number | null;
  components: VolumeSheetComponent[];
  skills: VolumeSheetSkill[];
}

export interface WorkbookData {
  programme: ProgrammeRow[] | null;
  catalogue: CatalogueRow[] | null;
  objectives: ObjectiveRow[] | null;
  journal: JournalRow[] | null;
  volume: VolumeSheet | null;
  errors: string[];
}

type Cell = string | number | boolean | Date | null;
type Row = Cell[];

function text(v: Cell | undefined): string {
  if (v === null || v === undefined) return '';
  return cleanSpaces(String(v));
}

function numberOrNull(v: Cell | undefined): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const m = text(v).match(/^-?\d+(?:[.,]\d+)?$/);
  return m ? Number(m[0].replace(',', '.')) : null;
}

/** Date Excel (numéro de série, texte « 07/10/2026 » ou « 2026-10-07 ») → YYYY-MM-DD. */
export function excelDate(v: Cell | undefined, date1904 = false): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) {
    return addDays(date1904 ? '1904-01-01' : '1899-12-30', Math.floor(v));
  }
  if (v instanceof Date) return localISODate(v);
  const t = text(v);
  let m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

function parseMoment(v: Cell | undefined): Moment | null {
  const t = fold(text(v));
  if (t.startsWith('matin')) return 'morning';
  if (t.startsWith('soir')) return 'evening';
  return null;
}

function findSheet(XLSX: SheetJS, wb: XLSXTypes.WorkBook, name: string): Row[] | null {
  const sheetName = wb.SheetNames.find((n) => fold(n) === name);
  if (!sheetName) return null;
  return XLSX.utils.sheet_to_json<Row>(wb.Sheets[sheetName], { header: 1, raw: true, defval: null, blankrows: true });
}

/** Indices des colonnes, repérées par leur en-tête (sans accents ni casse). */
function columns<K extends string>(
  header: Row,
  wanted: Record<K, string>,
  sheet: string,
  errors: string[],
): Record<K, number> | null {
  const folded = header.map((h) => fold(text(h)));
  const result = {} as Record<K, number>;
  const missing: string[] = [];
  for (const [key, label] of Object.entries(wanted) as [K, string][]) {
    const index = folded.indexOf(fold(label));
    if (index < 0) missing.push(label);
    result[key] = index;
  }
  if (missing.length > 0) {
    errors.push(`Onglet ${sheet} : colonne${missing.length > 1 ? 's' : ''} introuvable${missing.length > 1 ? 's' : ''} : ${missing.map((m) => `« ${m} »`).join(', ')}.`);
    return null;
  }
  return result;
}

function readProgramme(rows: Row[], errors: string[]): ProgrammeRow[] | null {
  const col = columns(
    rows[0] ?? [],
    {
      day: 'Jour',
      moment: 'Moment',
      order: 'Ordre',
      sessionType: 'Type séance',
      block: 'Bloc',
      element: 'Élément',
      candidates: 'Exercices au choix',
      setsMin: 'Séries min',
      setsMax: 'Séries max',
      target: 'Reps / durée',
      intensity: 'RPE / marge',
      rest: 'Repos',
      optional: 'Optionnel',
      notes: 'Notes',
    },
    'Programme',
    errors,
  );
  if (!col) return null;
  const result: ProgrammeRow[] = [];
  rows.slice(1).forEach((r, i) => {
    if (!text(r[col.day]) && !text(r[col.element])) return;
    result.push({
      line: i + 2,
      day: parseSeqDay(r[col.day]),
      moment: parseMoment(r[col.moment]),
      order: numberOrNull(r[col.order]) ?? i,
      sessionType: text(r[col.sessionType]),
      block: text(r[col.block]),
      element: text(r[col.element]),
      candidates: text(r[col.candidates]),
      setsMin: numberOrNull(r[col.setsMin]) ?? 0,
      setsMax: numberOrNull(r[col.setsMax]) ?? numberOrNull(r[col.setsMin]) ?? 0,
      target: text(r[col.target]),
      intensity: text(r[col.intensity]),
      rest: text(r[col.rest]),
      optional: parseYes(r[col.optional]),
      notes: text(r[col.notes]),
    });
  });
  return result;
}

function readCatalogue(rows: Row[], errors: string[]): CatalogueRow[] | null {
  const col = columns(rows[0] ?? [], { category: 'Catégorie', name: 'Exercice', quick: 'Rapide (matin)' }, 'Exercices', errors);
  if (!col) return null;
  const result: CatalogueRow[] = [];
  rows.slice(1).forEach((r, i) => {
    const name = text(r[col.name]);
    if (!name) return;
    result.push({ line: i + 2, category: text(r[col.category]), name, quick: parseYes(r[col.quick]) });
  });
  return result;
}

function readObjectives(rows: Row[], errors: string[], date1904: boolean): ObjectiveRow[] | null {
  const col = columns(
    rows[0] ?? [],
    {
      name: 'Objectif',
      criterion: 'Critère de qualité',
      target: 'Cible',
      unit: 'Unité',
      lastTest: 'Dernier test',
      lastTestDate: 'Date du test',
    },
    'Objectifs',
    errors,
  );
  if (!col) return null;
  const result: ObjectiveRow[] = [];
  rows.slice(1).forEach((r, i) => {
    const name = text(r[col.name]);
    if (!name) return;
    result.push({
      line: i + 2,
      name,
      criterion: text(r[col.criterion]),
      target: numberOrNull(r[col.target]),
      unit: text(r[col.unit]),
      lastTest: numberOrNull(r[col.lastTest]),
      lastTestDate: excelDate(r[col.lastTestDate], date1904),
    });
  });
  return result;
}

function readJournal(rows: Row[], errors: string[], date1904: boolean): JournalRow[] | null {
  const col = columns(
    rows[0] ?? [],
    {
      date: 'Date',
      week: 'Semaine',
      day: 'Jour',
      moment: 'Moment',
      sessionType: 'Type séance',
      block: 'Bloc',
      exercise: 'Exercice',
      setsDone: 'Séries faites',
      values: 'Reps / durée',
      band: 'Élastique',
      rpe: 'RPE',
      notes: 'Ressenti / notes',
    },
    'Journal',
    errors,
  );
  if (!col) return null;
  const result: JournalRow[] = [];
  rows.slice(1).forEach((r, i) => {
    if (!text(r[col.date]) && !text(r[col.exercise])) return;
    result.push({
      line: i + 2,
      date: excelDate(r[col.date], date1904),
      week: numberOrNull(r[col.week]),
      day: parseSeqDay(r[col.day]),
      dayText: text(r[col.day]),
      moment: parseMoment(r[col.moment]),
      sessionType: text(r[col.sessionType]),
      block: text(r[col.block]),
      exercise: text(r[col.exercise]),
      setsDone: numberOrNull(r[col.setsDone]),
      values: text(r[col.values]),
      band: text(r[col.band]),
      rpe: numberOrNull(r[col.rpe]),
      notes: text(r[col.notes]),
    });
  });
  return result;
}

/** Paramètres et tableaux de l'onglet Volume hebdo (valeurs calculées par Excel). */
function readVolume(rows: Row[]): VolumeSheet {
  const label = (r: Row) => fold(text(r[0]));
  const param = (prefix: string) => numberOrNull(rows.find((r) => label(r).startsWith(prefix))?.[1]);
  const pct = param('reduction semaine allegee');
  const volume: VolumeSheet = {
    min: param('minimum series'),
    max: param('maximum series'),
    deloadPct: pct === null ? null : Math.round(pct <= 1 ? pct * 100 : pct),
    components: [],
    skills: [],
  };
  const tableAfter = (secondHeader: string) => {
    const start = rows.findIndex((r) => label(r) === 'bloc' && fold(text(r[1])) === secondHeader);
    if (start < 0) return [];
    const body: { line: number; row: Row }[] = [];
    for (let i = start + 1; i < rows.length && text(rows[i][0]) && text(rows[i][1]); i++) {
      body.push({ line: i + 1, row: rows[i] });
    }
    return body;
  };
  volume.components = tableAfter('composante').map(({ line, row }) => ({
    line,
    block: text(row[0]),
    element: text(row[1]),
    evening: numberOrNull(row[2]),
    morning: numberOrNull(row[3]),
    total: numberOrNull(row[4]),
    status: text(row[5]),
    deload: numberOrNull(row[6]),
  }));
  volume.skills = tableAfter('element').map(({ line, row }) => ({
    line,
    block: text(row[0]),
    element: text(row[1]),
    setsMin: numberOrNull(row[2]),
    setsMax: numberOrNull(row[3]),
    sessions: numberOrNull(row[4]),
    deloadMax: numberOrNull(row[5]),
  }));
  return volume;
}

export function readWorkbook(XLSX: SheetJS, data: ArrayBuffer | Uint8Array): WorkbookData {
  const wb = XLSX.read(data, { type: 'array' });
  const date1904 = Boolean(wb.Workbook?.WBProps?.date1904);
  const errors: string[] = [];
  const sheet = (name: string, label: string) => {
    const rows = findSheet(XLSX, wb, name);
    if (!rows) errors.push(`Onglet « ${label} » introuvable.`);
    return rows;
  };
  const programme = sheet('programme', 'Programme');
  const catalogue = sheet('exercices', 'Exercices');
  const objectives = sheet('objectifs', 'Objectifs');
  const journal = sheet('journal', 'Journal');
  const volume = findSheet(XLSX, wb, 'volume hebdo');
  return {
    programme: programme && readProgramme(programme, errors),
    catalogue: catalogue && readCatalogue(catalogue, errors),
    objectives: objectives && readObjectives(objectives, errors, date1904),
    journal: journal && readJournal(journal, errors, date1904),
    volume: volume && readVolume(volume),
    errors,
  };
}
