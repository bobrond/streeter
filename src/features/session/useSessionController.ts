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
  restAfterSet,
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
import { dismissToast, showToast } from '../../ui/toastStore';

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
  /** Message « Série enregistrée · Annuler » d'une série sans repos : fermé à la série suivante. */
  const savedToast = useRef<number | null>(null);
  const closeSavedToast = useCallback(() => {
    if (savedToast.current !== null) dismissToast(savedToast.current);
    savedToast.current = null;
  }, []);

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

  /** Annule une série validée et revient sur sa ligne, valeurs remises dans la saisie ; son repos s'arrête. */
  const undoSet = useCallback(
    (set: SetLog) => {
      closeSavedToast();
      const r = resumeRef.current;
      const itemId = set.itemId;
      commit(
        {
          ...r,
          activeItemId: itemId,
          rest: r.rest?.startedAt === set.createdAt ? null : r.rest,
          drafts: itemId
            ? { ...r.drafts, [itemId]: { value: set.value, bandId: set.bandId, rpe: set.rpe, quality: set.quality, note: set.note } }
            : r.drafts,
        },
        async (next) => {
          await deleteSet(db, set.id);
          await saveResume(db, session.id, next);
        },
      );
    },
    [closeSavedToast, commit, session.id],
  );

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

      /**
       * Valide la série et passe à la série proposée. Repos prescrit, sauf au milieu d'une paire planche / FL :
       * on enchaîne, et un message propose d'annuler la série (pas de bandeau de repos pour le faire).
       */
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
          kind: 'normal',
          note: draft.note.trim(),
          createdAt: now,
        };
        const nextProgress = new Map(progress);
        const p = progress.get(item.id);
        nextProgress.set(item.id, { done: (p?.done ?? 0) + 1, closed: p?.closed ?? false });
        const rest = restAfterSet(plan, nextProgress, item.id);
        const nextId = proposeNext(plan, nextProgress, item.id);
        const r = resumeRef.current;
        commit(
          {
            ...r,
            activeItemId: nextId,
            chosenExercise: { ...r.chosenExercise, [item.id]: exercise.id },
            drafts: without(r.drafts, item.id),
            hold: null,
            rest: rest ? { itemId: item.id, startedAt: now, minSec: rest.minSec, maxSec: rest.maxSec, extraSec: 0 } : null,
          },
          (next) => logSet(db, set, next),
        );
        closeSavedToast();
        if (!rest) {
          const nextItem = nextId ? plan.itemsById.get(nextId) : undefined;
          const nextName = nextItem ? lookups.elements.get(nextItem.elementId)?.name : undefined;
          savedToast.current = showToast(nextName ? `Série enregistrée : enchaîne avec ${nextName}.` : 'Série enregistrée.', {
            action: { label: 'Annuler', run: () => undoSet(set) },
          });
        }
      },

      /** Annule la dernière série validée (« Annuler la série » du bandeau de repos). */
      undoLastSet() {
        const last = sessionSets.at(-1);
        if (last) undoSet(last);
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
    [closeSavedToast, commit, lookups.elements, plan, progress, proposedId, session.id, sessionSets, undoSet, update, viewOf],
  );

  return { resume, plan, sessionSets, progress, proposedId, activeId, activeView, viewOf, actions };
}

export type SessionController = ReturnType<typeof useSessionController>;
