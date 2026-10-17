// Tableau de la séance : pour chaque ligne de prescription, les séries faites puis les séries à faire,
// pré-remplies (on corrige plutôt que de saisir), avec en regard la série de même rang la dernière fois.
import { prefillDraft, rowTarget, type LastPerformance } from './session';
import type { Exercise, PrescriptionItem, SetDraft, SetKind, SetLog } from './types';

interface RowBase {
  /** « 1 », « 2 »… ; « E » pour l'échauffement (il n'a pas de numéro : il ne compte pas). */
  label: string;
  /** Série de même rang la dernière fois (colonne « Précédent ») ; `null` sans historique. */
  previous: SetLog | null;
}

export interface DoneRow extends RowBase {
  status: 'done';
  set: SetLog;
}

export interface PendingRow extends RowBase {
  status: 'pending';
  /** Rang parmi les séries à faire de la ligne (0 : la prochaine). */
  index: number;
  draft: SetDraft;
  /** Valeurs modifiées à la main (sinon pré-remplies). */
  edited: boolean;
}

export type TableRow = DoneRow | PendingRow;

/** Série suivante pré-remplie en recopiant la précédente (la qualité et le type repartent par défaut). */
function copyRow(from: SetDraft, isSkill: boolean): SetDraft {
  return { value: from.value, bandId: from.bandId, rpe: from.rpe, quality: isSkill ? 'clean' : null, kind: 'normal', note: '' };
}

/**
 * Lignes d'un exercice : séries faites, puis autant de séries à faire qu'il en manque pour atteindre les séries
 * prévues (`rowTarget`). Une série à faire marquée échauffement s'ajoute sans prendre la place d'une série prévue.
 * La première série à faire est pré-remplie par `prefillDraft`, les suivantes recopient la dernière série normale
 * au-dessus d'elles. Ligne terminée, ou sans exercice : pas de série à faire.
 */
export function lineRows(args: {
  item: PrescriptionItem;
  exercise: Exercise | null;
  isSkill: boolean;
  /** Séries faites sur la ligne aujourd'hui, dans l'ordre. */
  sets: readonly SetLog[];
  last: LastPerformance | null;
  pendingDrafts: readonly (SetDraft | null)[];
  extraRows: number;
  closed: boolean;
}): TableRow[] {
  const { item, exercise, isSkill, sets, last } = args;
  const rows: TableRow[] = [];
  let number = 0;
  const labelOf = (kind: SetKind) => (kind === 'warmup' ? 'E' : String(++number));
  for (const set of sets) rows.push({ status: 'done', set, label: labelOf(set.kind), previous: last?.sets[rows.length] ?? null });
  if (args.closed || !exercise) return rows;

  let workLeft = Math.max(0, rowTarget(item, args.extraRows) - sets.filter((s) => s.kind !== 'warmup').length);
  let lastWork: SetDraft | null = null;
  for (let index = 0; workLeft > 0; index++) {
    const stored = args.pendingDrafts[index] ?? null;
    const draft: SetDraft = stored ?? (lastWork ? copyRow(lastWork, isSkill) : prefillDraft({ item, exercise, isSkill, itemSets: sets, last }));
    rows.push({ status: 'pending', index, draft, edited: stored !== null, label: labelOf(draft.kind), previous: last?.sets[rows.length] ?? null });
    if (draft.kind !== 'warmup') {
      workLeft--;
      lastWork = draft;
    }
  }
  return rows;
}

/** Première série à faire d'une ligne, `undefined` s'il n'y en a plus. */
export function firstPending(rows: readonly TableRow[]): PendingRow | undefined {
  return rows.find((row): row is PendingRow => row.status === 'pending');
}
