// État et actions du mode séance. L'état de reprise est gardé en mémoire pour un affichage immédiat
// et écrit dans IndexedDB à chaque action (reprise exacte après un appel ou une fermeture).
import { useCallback, useMemo, useRef, useState } from 'react';
import { db } from '../../db/db';
import type { AppData } from '../../db/hooks';
import type { Lookups } from '../../db/lookups';
import { deleteSet, logSet, saveResume } from '../../db/sessionStore';
import {
  buildPlan,
  defaultExerciseId,
  itemCandidates,
  itemStatus,
  lastPerformance,
  prefillDraft,
  progressOf,
  proposeNext,
  readResume,
  targetFor,
  type ItemProgress,
  type ItemStatus,
  type LastPerformance,
  type SessionPlan,
} from '../../domain/session';
import { holdResult } from '../../domain/timers';
import type { Exercise, ID, PrescriptionItem, SessionLog, SessionResume, SetDraft, SetLog } from '../../domain/types';
import { unlockAudio } from '../../lib/audio';
import { vibrate } from '../../lib/device';
import { newId } from '../../lib/id';
import { showToast } from '../../ui/toastStore';

export interface ItemView {
  item: PrescriptionItem;
  candidates: Exercise[];
  exercise: Exercise | null;
  /** Séries de la ligne dans cette séance. */
  sets: SetLog[];
  last: LastPerformance | null;
  draft: SetDraft;
  progress: ItemProgress | undefined;
  status: ItemStatus;
}

const EMPTY_DRAFT: SetDraft = { value: null, bandId: null, rpe: null, quality: null, note: '' };

function without<T>(record: Record<ID, T>, key: ID): Record<ID, T> {
  if (!(key in record)) return record;
  const copy = { ...record };
  delete copy[key];
  return copy;
}

function reportError(error: unknown): void {
  showToast(`Enregistrement impossible : ${error instanceof Error ? error.message : String(error)}`, { tone: 'error' });
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

  const plan: SessionPlan = useMemo(
    () => buildPlan(session.templateSnapshot ?? { items: [] }, lookups.blocks, lookups.elements),
    [session.templateSnapshot, lookups.blocks, lookups.elements],
  );
  const sessionSets = useMemo(() => data.sets.filter((s) => s.sessionId === session.id), [data.sets, session.id]);
  const history = useMemo(() => data.sets.filter((s) => s.sessionId !== session.id), [data.sets, session.id]);
  const progress = useMemo(() => progressOf(sessionSets, resume.closedItems), [sessionSets, resume.closedItems]);
  const proposedId = useMemo(() => proposeNext(plan, progress, null), [plan, progress]);
  const activeId = resume.activeItemId && plan.itemsById.has(resume.activeItemId) ? resume.activeItemId : proposedId;

  const viewOf = useCallback(
    (item: PrescriptionItem, r: SessionResume): ItemView => {
      const chosen = r.chosenExercise[item.id];
      const keep = sessionSets.map((s) => s.exerciseId);
      if (chosen) keep.push(chosen);
      const candidates = itemCandidates(item, data.exercises, session.moment, keep);
      const exerciseId =
        chosen && lookups.exercises.has(chosen)
          ? chosen
          : defaultExerciseId(
              item,
              candidates.map((c) => c.id),
              sessionSets,
              history,
            );
      const exercise = exerciseId ? (lookups.exercises.get(exerciseId) ?? null) : null;
      const sets = sessionSets.filter((s) => s.itemId === item.id);
      const last = exercise ? lastPerformance(exercise.id, item.blockTypeId, history, lookups.sessions) : null;
      const isSkill = lookups.elements.get(item.elementId)?.kind === 'skill';
      const draft = r.drafts[item.id] ?? (exercise ? prefillDraft({ item, exercise, isSkill, itemSets: sets, last }) : EMPTY_DRAFT);
      const p = progress.get(item.id);
      return { item, candidates, exercise, sets, last, draft, progress: p, status: itemStatus(item, p) };
    },
    [data.exercises, history, lookups.elements, lookups.exercises, lookups.sessions, progress, session.moment, sessionSets],
  );

  const activeView = useMemo(() => {
    const item = activeId ? plan.itemsById.get(activeId) : undefined;
    return item ? viewOf(item, resume) : null;
  }, [activeId, plan, resume, viewOf]);

  const update = useCallback((fn: (r: SessionResume) => SessionResume) => commit(fn(resumeRef.current)), [commit]);

  const actions = useMemo(
    () => ({
      goTo(itemId: ID) {
        update((r) => ({ ...r, activeItemId: itemId }));
      },

      chooseExercise(itemId: ID, exerciseId: ID) {
        update((r) => ({ ...r, chosenExercise: { ...r.chosenExercise, [itemId]: exerciseId }, drafts: without(r.drafts, itemId) }));
      },

      editDraft(view: ItemView, patch: Partial<SetDraft>) {
        update((r) => ({ ...r, drafts: { ...r.drafts, [view.item.id]: { ...(r.drafts[view.item.id] ?? view.draft), ...patch } } }));
      },

      /** Valide la série, lance le repos prescrit et passe à la série proposée. */
      validate(view: ItemView) {
        const { item, exercise, draft } = view;
        if (!exercise) return;
        unlockAudio();
        vibrate(40);
        const now = Date.now();
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
          note: draft.note.trim(),
          createdAt: now,
        };
        const nextProgress = new Map(progress);
        const p = progress.get(item.id);
        nextProgress.set(item.id, { done: (p?.done ?? 0) + 1, closed: p?.closed ?? false });
        const r = resumeRef.current;
        commit(
          {
            ...r,
            activeItemId: proposeNext(plan, nextProgress, item.id),
            chosenExercise: { ...r.chosenExercise, [item.id]: exercise.id },
            drafts: without(r.drafts, item.id),
            hold: null,
            rest: { itemId: item.id, startedAt: now, minSec: item.restMinSec, maxSec: item.restMaxSec, extraSec: 0 },
          },
          (next) => logSet(db, set, next),
        );
      },

      /** Annule la dernière série validée et revient sur sa ligne, valeurs remises dans la saisie. */
      undoLastSet() {
        const last = sessionSets.at(-1);
        if (!last) return;
        const r = resumeRef.current;
        const itemId = last.itemId;
        commit(
          {
            ...r,
            activeItemId: itemId,
            rest: null,
            drafts: itemId
              ? { ...r.drafts, [itemId]: { value: last.value, bandId: last.bandId, rpe: last.rpe, quality: last.quality, note: last.note } }
              : r.drafts,
          },
          async (next) => {
            await deleteSet(db, last.id);
            await saveResume(db, session.id, next);
          },
        );
      },

      /** Termine une ligne avant ses séries max (ou la passe). */
      closeItem(itemId: ID) {
        const r = resumeRef.current;
        const closedItems = [...new Set([...r.closedItems, itemId])];
        const wasActive = (r.activeItemId ?? proposedId) === itemId;
        const activeItemId = wasActive ? proposeNext(plan, progressOf(sessionSets, closedItems), itemId) : r.activeItemId;
        commit({ ...r, closedItems, activeItemId });
      },

      reopenItem(itemId: ID) {
        update((r) => ({ ...r, closedItems: r.closedItems.filter((id) => id !== itemId), activeItemId: itemId }));
      },

      startHold(view: ItemView) {
        unlockAudio();
        const value = view.draft.value;
        const targetSec = value !== null && value > 0 ? value : (targetFor(view.item, 'seconds')?.min ?? null);
        update((r) => ({ ...r, rest: null, hold: { itemId: view.item.id, startedAt: Date.now(), countdownSec: 3, targetSec } }));
      },

      /** Arrêt du hold : les secondes tenues vont dans la saisie de la série (0 = arrêt pendant le décompte : annulé). */
      stopHold(stoppedAt: number) {
        const r = resumeRef.current;
        const hold = r.hold;
        if (!hold) return;
        const seconds = holdResult(hold, stoppedAt);
        const item = plan.itemsById.get(hold.itemId);
        if (seconds <= 0 || !item) {
          commit({ ...r, hold: null });
          return;
        }
        const base = r.drafts[item.id] ?? viewOf(item, r).draft;
        commit({ ...r, hold: null, activeItemId: item.id, drafts: { ...r.drafts, [item.id]: { ...base, value: seconds } } });
      },

      cancelHold() {
        update((r) => ({ ...r, hold: null }));
      },

      addRest(seconds: number) {
        update((r) => (r.rest ? { ...r, rest: { ...r.rest, extraSec: r.rest.extraSec + seconds } } : r));
      },

      skipRest() {
        update((r) => ({ ...r, rest: null }));
      },
    }),
    [commit, plan, progress, proposedId, session.id, sessionSets, update, viewOf],
  );

  return { resume, plan, sessionSets, progress, proposedId, activeId, activeView, viewOf, actions };
}

export type SessionController = ReturnType<typeof useSessionController>;
