// Séance en tableau (interface V2) : toute la séance se lit en défilant ; le bas de l'écran (zone du pouce)
// porte le repos, sinon le bouton qui valide la série proposée.
import { useEffect, useRef, useState } from 'react';
import { db } from '../../db/db';
import type { AppData } from '../../db/hooks';
import { useLookups, type Lookups } from '../../db/lookups';
import { abandonSession, finishSession } from '../../db/sessionStore';
import { formatClock, formatSetValue } from '../../domain/labels';
import type { TableRow } from '../../domain/sessionTable';
import type { ID, SessionLog } from '../../domain/types';
import { setSoundPref, useNow, useSoundPref } from '../../lib/device';
import { goBack, navigate } from '../../lib/router';
import { Button } from '../../ui/Button';
import { CheckIcon, ChevronDownIcon, DotsIcon } from '../../ui/icons';
import { Screen } from '../../ui/Screen';
import { ConfirmSheet } from '../../ui/Sheet';
import { showToast } from '../../ui/toastStore';
import { LineSheet } from './LineSheet';
import { FinishSheet, MenuSheet } from './SessionSheets';
import { SessionTable, type TableHandlers } from './SessionTable';
import { SetSheet } from './SetSheet';
import { RestBar } from './Timers';
import { useSessionController, type ProposedRow } from './useSessionController';

type SheetName = 'menu' | 'finish' | 'abandon' | null;

const rowKeyOf = (row: TableRow) => (row.status === 'done' ? row.set.id : `p${row.index}`);

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

function SessionClock({ startedAt }: { startedAt: number | null }) {
  const now = useNow(1000);
  return <>{formatClock(startedAt ? (now - startedAt) / 1000 : 0)}</>;
}

/** Bouton du bas : valide la série proposée, avec ce qui sera enregistré. */
function ValidateBar({ proposed, lookups, onValidate }: { proposed: ProposedRow; lookups: Lookups; onValidate: () => void }) {
  const { line, row } = proposed;
  const lower = row.draft.exerciseId && row.draft.exerciseId !== line.exercise?.id ? lookups.exercises.get(row.draft.exerciseId) : undefined;
  const measure = (lower ?? line.exercise)?.measure ?? 'reps';
  const band = row.draft.bandId && !lower ? lookups.bands.get(row.draft.bandId)?.name : undefined;
  const what = [lower?.name ?? lookups.elements.get(line.item.elementId)?.name, measure === 'none' ? null : formatSetValue(row.draft.value, measure), band ? `élastique ${band}` : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="border-t border-line bg-card px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <button type="button" onClick={onValidate} className="flex min-h-16 w-full items-center gap-3 rounded-2xl bg-action px-5 text-left text-action-ink active:scale-[0.98]">
        <CheckIcon className="size-8 shrink-0" />
        <span className="min-w-0">
          <span className="block text-xl font-bold">{row.draft.kind === 'warmup' ? 'Valider l’échauffement' : `Valider la série ${row.label}`}</span>
          <span className="block truncate text-sm font-semibold">{what}</span>
        </span>
      </button>
    </div>
  );
}

function SessionView({ session, data, lookups }: { session: SessionLog; data: AppData; lookups: Lookups }) {
  const { resume, plan, sessionSets, lines, progress, proposed, completeCount, actions } = useSessionController(session, data, lookups);
  const [sheet, setSheet] = useState<SheetName>(null);
  const [editing, setEditing] = useState<{ itemId: ID; rowKey: string } | null>(null);
  const [lineMenu, setLineMenu] = useState<ID | null>(null);
  const sound = useSoundPref();
  const now = useNow(15_000);
  const mainRef = useRef<HTMLElement>(null);

  const editLine = editing ? lines.get(editing.itemId) : undefined;
  const editRow = editLine?.rows.find((row) => rowKeyOf(row) === editing?.rowKey);
  const editTarget = editLine && editRow ? { line: editLine, row: editRow } : null;
  const menuLine = lineMenu ? (lines.get(lineMenu) ?? null) : null;
  const bands = data.bands.filter((b) => b.active || (editRow && (editRow.status === 'done' ? editRow.set.bandId : editRow.draft.bandId) === b.id));
  const restLine = resume.rest ? lines.get(resume.rest.itemId) : undefined;
  const unfinished = plan.items
    .filter((item) => !resume.closedItems.includes(item.id) && (progress.get(item.id)?.done ?? 0) < item.setsMin)
    .map((item) => `${lookups.elements.get(item.elementId)?.name ?? '?'} (${progress.get(item.id)?.done ?? 0}/${item.setsMin})`);

  // La série proposée reste visible : après chaque validation, elle revient au milieu de l'écran si besoin.
  const proposedKey = proposed ? `${proposed.line.item.id}:p${proposed.row.index}` : null;
  const scrolled = useRef<string | null>(null);
  useEffect(() => {
    if (!proposedKey || editing || lineMenu) return;
    const key = `${proposedKey}|${sessionSets.length}`;
    if (scrolled.current === key) return;
    const first = scrolled.current === null;
    scrolled.current = key;
    const main = mainRef.current;
    const element = main?.querySelector(`[data-row="${proposedKey}"]`);
    if (!main || !element) return;
    const box = element.getBoundingClientRect();
    const view = main.getBoundingClientRect();
    if (box.top < view.top + 96 || box.bottom > view.bottom - 16) element.scrollIntoView({ block: 'center', behavior: first ? 'auto' : 'smooth' });
  }, [proposedKey, sessionSets.length, editing, lineMenu]);

  const handlers: TableHandlers = {
    openRow: (line, row) => setEditing({ itemId: line.item.id, rowKey: rowKeyOf(row) }),
    checkRow: (line, row) => (row.status === 'done' ? actions.uncheck(row.set) : actions.validate(line.item.id, row.index)),
    cycleKind: (line, row, next) => actions.editPending(line.item.id, row.index, { kind: next }),
    copyPrevious: (line, row) => {
      if (row.previous) actions.editPending(line.item.id, row.index, { value: row.previous.value, bandId: row.previous.bandId });
    },
    removeRow: (line, row) => (row.status === 'done' ? actions.removeDone(row.set) : actions.removePending(line.item.id, row.index)),
    addRow: (line) => actions.addRow(line.item.id),
    openLine: (line) => setLineMenu(line.item.id),
    reopenLine: (line) => actions.reopenItem(line.item.id),
  };

  const finish = (note: string) => {
    setSheet(null);
    navigate('/', { replace: true });
    finishSession(db, session.id, { note, now: Date.now() })
      .then(() => showToast(`Séance enregistrée : ${sessionSets.length} série${sessionSets.length > 1 ? 's' : ''}.`))
      .catch((e: unknown) => showToast(`Enregistrement impossible : ${String(e)}`, { tone: 'error' }));
  };

  const abandon = () => {
    navigate('/', { replace: true });
    abandonSession(db, session.id, Date.now())
      .then((result) => showToast(result === 'deleted' ? 'Séance supprimée.' : 'Séance abandonnée, ses séries restent dans le journal.'))
      .catch((e: unknown) => showToast(`Erreur : ${String(e)}`, { tone: 'error' }));
  };

  return (
    <div className="mx-auto flex h-dvh max-w-xl flex-col bg-page">
      <header className="flex items-center gap-1 border-b border-line px-2 pt-[env(safe-area-inset-top)] pb-1">
        <button type="button" aria-label="Réduire la séance" onClick={() => goBack('/')} className="flex size-12 shrink-0 items-center justify-center rounded-xl text-ink-2 active:bg-card-2">
          <ChevronDownIcon className="size-8" />
        </button>
        <div className="min-w-0 flex-1 px-1">
          <div className="truncate font-display text-2xl leading-tight tracking-wide">
            {session.templateSnapshot?.name ?? session.sessionTypeName}
            {session.deload && <span className="text-accent"> · allégée</span>}
          </div>
          <div className="text-sm text-ink-2 tabular-nums">
            <SessionClock startedAt={session.startedAt} /> · {completeCount}/{plan.items.length} exercices
          </div>
        </div>
        <button type="button" onClick={() => setSheet('finish')} className="min-h-11 shrink-0 rounded-xl border border-line px-3 font-semibold active:bg-card-2">
          Terminer
        </button>
        <button type="button" aria-label="Menu de la séance" onClick={() => setSheet('menu')} className="flex size-12 shrink-0 items-center justify-center rounded-xl active:bg-card-2">
          <DotsIcon className="size-7" />
        </button>
      </header>

      <main ref={mainRef} className="flex-1 overflow-y-auto overscroll-contain px-3 pt-3 pb-6">
        <SessionTable plan={plan} lines={lines} lookups={lookups} proposed={proposed} moment={session.moment} handlers={handlers} />
        {!proposed && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <CheckIcon className="size-14 text-ok" />
            <h2 className="font-display text-3xl tracking-wide">Séance faite</h2>
            <p className="text-ink-2">Toutes les séries prévues sont faites. « + Ajouter une série » pour en faire plus.</p>
          </div>
        )}
      </main>

      {resume.rest ? (
        <RestBar rest={resume.rest} label={restLine ? (lookups.elements.get(restLine.item.elementId)?.name ?? '') : ''} onAdjust={actions.changeRest} onSkip={actions.skipRest} />
      ) : proposed ? (
        <ValidateBar proposed={proposed} lookups={lookups} onValidate={() => actions.validate(proposed.line.item.id, proposed.row.index)} />
      ) : (
        <div className="border-t border-line bg-card px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button onClick={() => setSheet('finish')}>Terminer la séance</Button>
        </div>
      )}

      {editTarget && (
        <SetSheet
          key={`${editTarget.line.item.id}:${rowKeyOf(editTarget.row)}`}
          target={editTarget}
          bands={bands}
          lookups={lookups}
          onClose={() => setEditing(null)}
          onKeep={(draft) => editTarget.row.status === 'pending' && actions.editPending(editTarget.line.item.id, editTarget.row.index, draft)}
          onValidate={(draft) => editTarget.row.status === 'pending' && actions.validate(editTarget.line.item.id, editTarget.row.index, draft)}
          onSaveDone={(draft, exerciseId) => {
            if (editTarget.row.status !== 'done') return;
            const measure = lookups.exercises.get(exerciseId)?.measure;
            actions.editDone(editTarget.row.set, {
              exerciseId,
              value: measure === 'none' ? null : draft.value,
              bandId: draft.bandId,
              rpe: draft.rpe,
              quality: draft.quality,
              kind: draft.kind,
              note: draft.note.trim(),
            });
          }}
          onDeleteDone={() => editTarget.row.status === 'done' && actions.removeDone(editTarget.row.set)}
        />
      )}
      <LineSheet
        line={menuLine}
        lookups={lookups}
        moment={session.moment}
        onClose={() => setLineMenu(null)}
        onChoose={(exerciseId) => menuLine && actions.chooseExercise(menuLine.item.id, exerciseId)}
        onAddRow={() => menuLine && actions.addRow(menuLine.item.id)}
        onCloseLine={() => menuLine && actions.closeItem(menuLine.item.id)}
        onReopen={() => menuLine && actions.reopenItem(menuLine.item.id)}
      />
      <MenuSheet
        open={sheet === 'menu'}
        onClose={() => setSheet(null)}
        sound={sound}
        onToggleSound={() => setSoundPref(!sound)}
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
        durationSec={session.startedAt ? Math.max(0, (now - session.startedAt) / 1000) : 0}
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
    </div>
  );
}
