import { useEffect, useState } from 'react';
import { db } from '../../db/db';
import type { AppData } from '../../db/hooks';
import { useLookups, type Lookups } from '../../db/lookups';
import { abandonSession, deleteSet, finishSession, updateSet } from '../../db/sessionStore';
import { formatDuration, seqDayLabel } from '../../domain/labels';
import type { SessionLog, SetLog } from '../../domain/types';
import { unlockAudio } from '../../lib/audio';
import { readSoundPref, useNow, useWakeLock, writeSoundPref } from '../../lib/device';
import { navigate } from '../../lib/router';
import { Button } from '../../ui/Button';
import { BackIcon, CheckIcon, DotsIcon, ListIcon } from '../../ui/icons';
import { Screen } from '../../ui/Screen';
import { ConfirmSheet } from '../../ui/Sheet';
import { showToast } from '../../ui/toastStore';
import { EntryPanel } from './EntryPanel';
import { ItemCard } from './ItemCard';
import { FinishSheet, MenuSheet, NoteSheet, PlanSheet, SetEditSheet } from './SessionSheets';
import { HoldOverlay, RestBanner } from './Timers';
import { useSessionController } from './useSessionController';

type SheetName = 'plan' | 'menu' | 'finish' | 'abandon' | 'note' | null;

export function SessionScreen({ sessionId, data }: { sessionId: string; data: AppData }) {
  const lookups = useLookups(data);
  const session = lookups.sessions.get(sessionId);
  if (!session || session.status !== 'in_progress' || !session.templateSnapshot) {
    return (
      <Screen title="Séance" actions={<Button onClick={() => navigate('/', { replace: true })}>Retour à l’accueil</Button>}>
        <p className="text-lg text-ink-2">{session ? 'Cette séance est terminée.' : 'Séance introuvable.'}</p>
      </Screen>
    );
  }
  return <SessionView key={session.id} session={session} data={data} lookups={lookups} />;
}

function SessionView({ session, data, lookups }: { session: SessionLog; data: AppData; lookups: Lookups }) {
  const { resume, plan, sessionSets, progress, proposedId, activeId, activeView, viewOf, actions } = useSessionController(session, data, lookups);
  const [sheet, setSheet] = useState<SheetName>(null);
  const [editedSet, setEditedSet] = useState<SetLog | null>(null);
  const [sound, setSound] = useState(readSoundPref);
  const now = useNow(15_000);
  useWakeLock(true);

  // Le son n'est autorisé qu'après un geste : chaque toucher le (ré)active.
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerup', unlock);
    return () => window.removeEventListener('pointerup', unlock);
  }, []);

  const bands = data.bands.filter((b) => b.active || b.id === activeView?.draft.bandId);
  const elapsedSec = session.startedAt ? Math.max(0, (now - session.startedAt) / 1000) : 0;
  const plannedMax = plan.items.reduce((sum, item) => sum + item.setsMax, 0);
  const holdItem = resume.hold ? plan.itemsById.get(resume.hold.itemId) : undefined;
  const holdTitle = holdItem ? (viewOf(holdItem, resume).exercise?.name ?? '') : '';
  const exerciseNameOf = (item: (typeof plan.items)[number]) => viewOf(item, resume).exercise?.name ?? item.candidatesText;
  const unfinished = plan.items
    .filter((item) => {
      const p = progress.get(item.id);
      return !p?.closed && (p?.done ?? 0) < item.setsMin;
    })
    .map((item) => `${lookups.elements.get(item.elementId)?.name ?? '?'} (${progress.get(item.id)?.done ?? 0}/${item.setsMin})`);

  const finish = (note: string) => {
    setSheet(null);
    navigate('/', { replace: true });
    finishSession(db, session.id, { note, now: Date.now() })
      .then(() => showToast(`Séance enregistrée : ${sessionSets.length} séries.`))
      .catch((e: unknown) => showToast(`Enregistrement impossible : ${String(e)}`, { tone: 'error' }));
  };

  const abandon = () => {
    navigate('/', { replace: true });
    abandonSession(db, session.id, Date.now())
      .then((result) => showToast(result === 'deleted' ? 'Séance supprimée.' : 'Séance abandonnée, ses séries restent dans le journal.'))
      .catch((e: unknown) => showToast(`Erreur : ${String(e)}`, { tone: 'error' }));
  };

  const editedItem = editedSet?.itemId ? plan.itemsById.get(editedSet.itemId) : undefined;

  return (
    <div className="mx-auto flex h-dvh max-w-xl flex-col bg-page">
      <header className="flex items-center gap-1 px-2 pt-[env(safe-area-inset-top)]">
        <button type="button" aria-label="Accueil" onClick={() => navigate('/')} className="flex size-14 items-center justify-center rounded-2xl text-ink-2 active:bg-card-2">
          <BackIcon />
        </button>
        <div className="min-w-0 flex-1 px-1">
          <div className="truncate text-lg leading-tight font-bold">
            {session.templateSnapshot?.name ?? session.sessionTypeName}
            {session.deload && <span className="font-normal text-accent"> · allégée</span>}
          </div>
          <div className="text-sm text-ink-2 tabular-nums">
            {seqDayLabel(session.seqDay)} · {sessionSets.length}/{plannedMax} séries · {formatDuration(elapsedSec)}
          </div>
        </div>
        <button type="button" aria-label="Plan de la séance" onClick={() => setSheet('plan')} className="flex size-14 items-center justify-center rounded-2xl active:bg-card-2">
          <ListIcon className="size-7" />
        </button>
        <button type="button" aria-label="Menu de la séance" onClick={() => setSheet('menu')} className="flex size-14 items-center justify-center rounded-2xl active:bg-card-2">
          <DotsIcon className="size-7" />
        </button>
      </header>

      {resume.rest && (
        <RestBanner
          rest={resume.rest}
          sound={sound}
          onAdd={() => actions.addRest(30)}
          onSkip={actions.skipRest}
          onUndo={actions.undoLastSet}
        />
      )}

      <main className="flex-1 overflow-y-auto overscroll-contain px-4 pt-2">
        {activeView ? (
          <ItemCard
            view={activeView}
            plan={plan}
            progress={progress}
            lookups={lookups}
            moment={session.moment}
            onChooseExercise={(exerciseId) => actions.chooseExercise(activeView.item.id, exerciseId)}
            onEditSet={setEditedSet}
            onClose={() => actions.closeItem(activeView.item.id)}
            onReopen={() => actions.reopenItem(activeView.item.id)}
            onGoTo={actions.goTo}
          />
        ) : (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <CheckIcon className="size-16 text-ok" />
            <h2 className="text-3xl font-bold">Séance faite</h2>
            <p className="text-lg text-ink-2">
              {sessionSets.length} séries en {formatDuration(elapsedSec)}. Toutes les séries prévues sont faites.
            </p>
          </div>
        )}
      </main>

      {activeView ? (
        <EntryPanel
          view={activeView}
          bands={bands}
          onDraft={(patch) => actions.editDraft(activeView, patch)}
          onValidate={() => actions.validate(activeView)}
          onStartHold={() => actions.startHold(activeView)}
          onNote={() => setSheet('note')}
        />
      ) : (
        <div className="flex flex-col gap-2 border-t border-line bg-card px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button onClick={() => setSheet('finish')}>Terminer la séance</Button>
          <Button variant="secondary" onClick={() => setSheet('plan')}>
            Voir le plan
          </Button>
        </div>
      )}

      {resume.hold && (
        <HoldOverlay key={resume.hold.startedAt} hold={resume.hold} sound={sound} title={holdTitle} onStop={actions.stopHold} onCancel={actions.cancelHold} />
      )}

      <PlanSheet
        open={sheet === 'plan'}
        onClose={() => setSheet(null)}
        plan={plan}
        progress={progress}
        activeId={activeId}
        proposedId={proposedId}
        lookups={lookups}
        exerciseNameOf={exerciseNameOf}
        onGoTo={actions.goTo}
      />
      <MenuSheet
        open={sheet === 'menu'}
        onClose={() => setSheet(null)}
        sound={sound}
        onToggleSound={() => {
          writeSoundPref(!sound);
          setSound(!sound);
        }}
        onLeave={() => {
          setSheet(null);
          navigate('/');
        }}
        onFinish={() => setSheet('finish')}
        onAbandon={() => setSheet('abandon')}
      />
      <FinishSheet
        open={sheet === 'finish'}
        onClose={() => setSheet(null)}
        setCount={sessionSets.length}
        durationSec={elapsedSec}
        unfinished={unfinished}
        onFinish={finish}
      />
      <ConfirmSheet
        open={sheet === 'abandon'}
        onClose={() => setSheet(null)}
        title="Abandonner la séance ?"
        message={
          sessionSets.length === 0
            ? 'Aucune série n’a été faite : la séance sera supprimée.'
            : `Les ${sessionSets.length} séries faites restent dans le journal ; la séance sera marquée abandonnée.`
        }
        confirmLabel="Abandonner"
        danger
        onConfirm={abandon}
      />
      <NoteSheet
        open={sheet === 'note' && activeView !== null}
        initial={activeView?.draft.note ?? ''}
        onClose={() => setSheet(null)}
        onSave={(note) => activeView && actions.editDraft(activeView, { note })}
      />
      <SetEditSheet
        set={editedSet}
        candidates={editedItem ? viewOf(editedItem, resume).candidates : []}
        bands={data.bands}
        lookups={lookups}
        onClose={() => setEditedSet(null)}
        onSave={(changes) => {
          if (editedSet) void updateSet(db, editedSet.id, changes);
        }}
        onDelete={() => {
          if (editedSet) void deleteSet(db, editedSet.id);
        }}
      />
    </div>
  );
}
