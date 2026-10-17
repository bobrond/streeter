// État et actions de la séance en tableau. L'état de reprise est gardé en mémoire pour un affichage immédiat
// et écrit dans IndexedDB à chaque action (reprise exacte après un appel, une fermeture ou la caméra).
import { useCallback, useMemo, useRef, useState } from 'react';
import { db } from '../../db/db';
import type { AppData } from '../../db/hooks';
import type { Lookups } from '../../db/lookups';
import { deleteSet, logSet, saveResume, updateSet } from '../../db/sessionStore';
import {
  buildPlan,
  defaultExerciseId,
  itemCandidates,
  itemStatus,
  lastPerformance,
  progressOf,
  proposeNext,
  readResume,
  restAfterSet,
  tableProgress,
  type ItemProgress,
  type ItemStatus,
  type LastPerformance,
  type SessionPlan,
} from '../../domain/session';
import { firstPending, lineRows, type PendingRow, type TableRow } from '../../domain/sessionTable';
import { adjustRest } from '../../domain/timers';
import type { Exercise, ID, PrescriptionItem, SessionLog, SessionResume, SetDraft, SetLog } from '../../domain/types';
import { unlockAudio } from '../../lib/audio';
import { vibrate } from '../../lib/device';
import { newId } from '../../lib/id';
import { showToast } from '../../ui/toastStore';

/** Une ligne de prescription telle qu'elle s'affiche dans le tableau. */
export interface LineView {
  item: PrescriptionItem;
  candidates: Exercise[];
  exercise: Exercise | null;
  /** Séries faites aujourd'hui sur la ligne, dans l'ordre. */
  sets: SetLog[];
  last: LastPerformance | null;
  rows: TableRow[];
  /** Séries faites (hors échauffement) et ligne terminée à la main. */
  progress: ItemProgress | undefined;
  status: ItemStatus;
  closed: boolean;
}

export interface ProposedRow {
  line: LineView;
  row: PendingRow;
}

function reportError(error: unknown): void {
  showToast(`Enregistrement impossible : ${error instanceof Error ? error.message : String(error)}`, { tone: 'error' });
}

function draftOf(set: SetLog): SetDraft {
  return { value: set.value, bandId: set.bandId, rpe: set.rpe, quality: set.quality, kind: set.kind, note: set.note };
}

export function useSessionController(session: SessionLog, data: AppData, lookups: Lookups) {
  const [resume, setResume] = useState<SessionResume>(() => readResume(session.resume));
  const resumeRef = useRef(resume);

  const commit = useCallback(
    (next: SessionResume, write?: (r: SessionResume) => Promise<void>) => {
      resumeRef.current = next;
      setResume(next);
      (write ?? ((r: SessionResume) => saveResume(db, session.id, r)))(next).catch(reportError);
    },
    [session.id],
  );
  const update = useCallback((fn: (r: SessionResume) => SessionResume) => commit(fn(resumeRef.current)), [commit]);

  const plan: SessionPlan = useMemo(
    () => buildPlan(session.templateSnapshot ?? { items: [] }, lookups.blocks, lookups.elements),
    [session.templateSnapshot, lookups.blocks, lookups.elements],
  );
  const sessionSets = useMemo(() => data.sets.filter((s) => s.sessionId === session.id), [data.sets, session.id]);
  const history = useMemo(() => data.sets.filter((s) => s.sessionId !== session.id), [data.sets, session.id]);
  const progress = useMemo(() => progressOf(sessionSets, resume.closedItems), [sessionSets, resume.closedItems]);
  const planProgress = useMemo(() => tableProgress(plan, sessionSets, resume.closedItems, resume.extraRows), [plan, sessionSets, resume.closedItems, resume.extraRows]);

  const lines = useMemo(() => {
    const map = new Map<ID, LineView>();
    for (const item of plan.items) {
      const chosen = resume.chosenExercise[item.id];
      const keep = sessionSets.map((s) => s.exerciseId);
      if (chosen) keep.push(chosen);
      const candidates = itemCandidates(item, data.exercises, session.moment, keep);
      const exerciseId = chosen && lookups.exercises.has(chosen) ? chosen : defaultExerciseId(item, candidates.map((c) => c.id), sessionSets, history);
      const exercise = exerciseId ? (lookups.exercises.get(exerciseId) ?? null) : null;
      const sets = sessionSets.filter((s) => s.itemId === item.id);
      const last = exercise ? lastPerformance(exercise.id, item.blockTypeId, history, lookups.sessions) : null;
      const closed = resume.closedItems.includes(item.id);
      const rows = lineRows({
        item,
        exercise,
        isSkill: lookups.elements.get(item.elementId)?.kind === 'skill',
        sets,
        last,
        pendingDrafts: resume.pendingDrafts[item.id] ?? [],
        extraRows: resume.extraRows[item.id] ?? 0,
        closed,
      });
      const p = progress.get(item.id);
      map.set(item.id, { item, candidates, exercise, sets, last, rows, progress: p, status: itemStatus(item, p), closed });
    }
    return map;
  }, [plan, resume, sessionSets, history, data.exercises, session.moment, lookups, progress]);

  const proposedId = proposeNext(plan, planProgress, resume.activeItemId);
  const proposedLine = proposedId ? lines.get(proposedId) : undefined;
  const proposedRow = proposedLine ? firstPending(proposedLine.rows) : undefined;
  const proposed: ProposedRow | null = proposedLine && proposedRow ? { line: proposedLine, row: proposedRow } : null;
  const completeCount = plan.items.filter((item) => planProgress.get(item.id)?.closed).length;

  const actions = useMemo(() => {
    const setDrafts = (r: SessionResume, itemId: ID, drafts: (SetDraft | null)[]): SessionResume => ({ ...r, pendingDrafts: { ...r.pendingDrafts, [itemId]: drafts } });

    /** Remet une série dans les séries à faire (en tête), ses valeurs gardées ; son repos s'arrête. */
    const uncheck = (set: SetLog) => {
      const r = resumeRef.current;
      const itemId = set.itemId;
      const next: SessionResume = {
        ...(itemId ? setDrafts(r, itemId, [draftOf(set), ...(r.pendingDrafts[itemId] ?? [])]) : r),
        activeItemId: itemId ?? r.activeItemId,
        rest: r.rest?.startedAt === set.createdAt ? null : r.rest,
      };
      commit(next, async (n) => {
        await deleteSet(db, set.id);
        await saveResume(db, session.id, n);
      });
    };

    return {
      /**
       * Valide une série à faire avec ses valeurs (ou celles du pavé, `values`). Repos prescrit, sauf au milieu
       * d'une paire planche / FL : on enchaîne sur l'autre skill (règle 3).
       */
      validate(itemId: ID, index: number, values?: SetDraft) {
        const line = lines.get(itemId);
        const row = line?.rows.find((x): x is PendingRow => x.status === 'pending' && x.index === index);
        if (!line?.exercise || !row) return;
        unlockAudio();
        vibrate(40);
        const now = Date.now();
        const { item, exercise } = line;
        const draft = values ?? row.draft;
        const set: SetLog = {
          id: newId(),
          sessionId: session.id,
          itemId: item.id,
          blockTypeId: item.blockTypeId,
          elementId: item.elementId,
          exerciseId: exercise.id,
          setIndex: 0,
          value: exercise.measure === 'none' ? null : draft.value,
          bandId: draft.bandId,
          rpe: draft.rpe,
          quality: draft.quality,
          kind: draft.kind,
          note: draft.note.trim(),
          createdAt: now,
        };
        const r = resumeRef.current;
        const nextProgress = tableProgress(plan, [...sessionSets, set], r.closedItems, r.extraRows);
        const rest = restAfterSet(plan, nextProgress, item.id);
        const drafts = [...(r.pendingDrafts[item.id] ?? [])];
        drafts.splice(index, 1);
        commit(
          {
            ...setDrafts(r, item.id, drafts),
            activeItemId: item.id,
            chosenExercise: { ...r.chosenExercise, [item.id]: exercise.id },
            rest: rest ? { itemId: item.id, startedAt: now, minSec: rest.minSec, maxSec: rest.maxSec, extraSec: 0 } : null,
          },
          (next) => logSet(db, set, next),
        );
      },

      uncheck,

      /** Modifie une série à faire avant de la valider. */
      editPending(itemId: ID, index: number, patch: Partial<SetDraft>) {
        const row = lines.get(itemId)?.rows.find((x): x is PendingRow => x.status === 'pending' && x.index === index);
        if (!row) return;
        update((r) => {
          const drafts = [...(r.pendingDrafts[itemId] ?? [])];
          while (drafts.length <= index) drafts.push(null);
          drafts[index] = { ...row.draft, ...patch };
          return setDrafts(r, itemId, drafts);
        });
      },

      /** « + Ajouter une série » : une ligne de plus, pré-remplie comme la précédente (rouvre la ligne terminée). */
      addRow(itemId: ID) {
        update((r) => ({
          ...r,
          closedItems: r.closedItems.filter((id) => id !== itemId),
          extraRows: { ...r.extraRows, [itemId]: (r.extraRows[itemId] ?? 0) + 1 },
          activeItemId: itemId,
        }));
      },

      /** Retire une série à faire (glisser à gauche). Un échauffement à faire disparaît sans changer les séries prévues. */
      removePending(itemId: ID, index: number) {
        const row = lines.get(itemId)?.rows.find((x): x is PendingRow => x.status === 'pending' && x.index === index);
        if (!row) return;
        update((r) => {
          const drafts = [...(r.pendingDrafts[itemId] ?? [])];
          if (index < drafts.length) drafts.splice(index, 1);
          const next = setDrafts(r, itemId, drafts);
          if (row.draft.kind === 'warmup') return next;
          return { ...next, extraRows: { ...r.extraRows, [itemId]: (r.extraRows[itemId] ?? 0) - 1 } };
        });
      },

      chooseExercise(itemId: ID, exerciseId: ID) {
        update((r) => ({ ...setDrafts(r, itemId, []), chosenExercise: { ...r.chosenExercise, [itemId]: exerciseId } }));
      },

      /** Termine une ligne avant ses séries prévues (ou la passe). */
      closeItem(itemId: ID) {
        update((r) => ({ ...r, closedItems: [...new Set([...r.closedItems, itemId])] }));
      },

      reopenItem(itemId: ID) {
        update((r) => ({ ...r, closedItems: r.closedItems.filter((id) => id !== itemId), activeItemId: itemId }));
      },

      /** Corrige une série faite (après avoir regardé la vidéo, par exemple). */
      editDone(set: SetLog, changes: Partial<Omit<SetLog, 'id' | 'sessionId'>>) {
        updateSet(db, set.id, changes).catch(reportError);
      },

      /** Supprime une série faite ; « Annuler » la remet telle quelle. */
      removeDone(set: SetLog) {
        deleteSet(db, set.id)
          .then(() =>
            showToast('Série supprimée.', {
              action: { label: 'Annuler', run: () => void logSet(db, set, resumeRef.current).catch(reportError) },
            }),
          )
          .catch(reportError);
      },

      /** « +15 s » / « −15 s ». */
      changeRest(deltaSec: number) {
        update((r) => (r.rest ? { ...r, rest: adjustRest(r.rest, deltaSec) } : r));
      },

      skipRest() {
        update((r) => ({ ...r, rest: null }));
      },
    };
  }, [commit, lines, plan, session.id, sessionSets, update]);

  return { resume, plan, sessionSets, lines, progress, proposed, completeCount, actions };
}

export type SessionController = ReturnType<typeof useSessionController>;
