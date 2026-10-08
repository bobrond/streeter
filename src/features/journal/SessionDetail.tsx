import { useState } from 'react';
import { db } from '../../db/db';
import type { AppData } from '../../db/hooks';
import { useLookups, type Lookups } from '../../db/lookups';
import { deleteSession, updateSessionNote } from '../../db/objectiveStore';
import { deleteSet, updateSet } from '../../db/sessionStore';
import { itemsByBlock } from '../../domain/editing';
import { sessionDurationSec, sessionLines, type JournalLine } from '../../domain/journal';
import { MOMENT_LABEL, formatDateLong, formatDuration, formatSetValue, seqDayLabel } from '../../domain/labels';
import type { Exercise, SessionLog, SetLog } from '../../domain/types';
import { goBack, navigate } from '../../lib/router';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { TextArea } from '../../ui/form';
import { WarningIcon } from '../../ui/icons';
import { BandSwatch } from '../../ui/inputs';
import { Screen } from '../../ui/Screen';
import { ConfirmSheet } from '../../ui/Sheet';
import { showToast } from '../../ui/toastStore';
import { SetEditSheet } from '../session/SessionSheets';

/** Lignes regroupées par bloc, dans l'ordre des blocs. */
function linesByBlock(lines: JournalLine[], lookups: Lookups): { blockTypeId: string | null; lines: JournalLine[] }[] {
  const groups: { blockTypeId: string | null; lines: JournalLine[] }[] = [];
  const order = (id: string | null) => (id ? (lookups.blocks.get(id)?.order ?? 999) : 1000);
  for (const line of [...lines].sort((a, b) => order(a.blockTypeId) - order(b.blockTypeId))) {
    const last = groups.at(-1);
    if (last && last.blockTypeId === line.blockTypeId) last.lines.push(line);
    else groups.push({ blockTypeId: line.blockTypeId, lines: [line] });
  }
  return groups;
}

/** Exercices proposés pour corriger une série : candidats de la ligne figée, sinon ceux de l'élément. */
function candidatesFor(set: SetLog, session: SessionLog, data: AppData, lookups: Lookups): Exercise[] {
  const item = session.templateSnapshot?.items.find((i) => i.id === set.itemId);
  const ids = item?.candidateExerciseIds ?? data.exercises.filter((e) => e.elementId && e.elementId === set.elementId).map((e) => e.id);
  return ids.map((id) => lookups.exercises.get(id)).filter((e) => e !== undefined);
}

export function SessionDetail({ data, sessionId }: { data: AppData; sessionId: string }) {
  const lookups = useLookups(data);
  const session = lookups.sessions.get(sessionId);
  if (!session) {
    return (
      <Screen title="Séance introuvable" onBack={() => goBack('/journal')}>
        <p className="text-ink-2">Cette séance n’existe plus.</p>
      </Screen>
    );
  }
  return <SessionView session={session} data={data} lookups={lookups} />;
}

function SessionView({ session, data, lookups }: { session: SessionLog; data: AppData; lookups: Lookups }) {
  const [note, setNote] = useState(session.note);
  const [edited, setEdited] = useState<SetLog | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const sets = data.sets.filter((s) => s.sessionId === session.id);
  const groups = linesByBlock(sessionLines(sets), lookups);
  const duration = sessionDurationSec(session);
  const rpes = sets.map((s) => s.rpe).filter((r): r is number => r !== null);
  const degraded = sets.filter((s) => s.quality === 'degraded').length;
  // Ordre des blocs du modèle figé, pour retrouver les lignes non faites.
  const planned = session.templateSnapshot ? itemsByBlock(session.templateSnapshot.items, lookups.blocks).flatMap((g) => g.items) : [];
  const notDone = planned.filter((item) => !sets.some((s) => s.itemId === item.id));

  return (
    <Screen
      title={<span className="first-letter:uppercase">{formatDateLong(session.date)}</span>}
      subtitle={`${seqDayLabel(session.seqDay)} · ${MOMENT_LABEL[session.moment]} · ${session.templateSnapshot?.name ?? session.sessionTypeName} · semaine ${session.week}`}
      onBack={() => goBack('/journal')}
    >
      <div className="flex flex-wrap gap-2">
        {session.source === 'xlsx' && <Badge>importée du tableur</Badge>}
        {session.status === 'abandoned' && <Badge tone="warn">abandonnée</Badge>}
        {session.status === 'in_progress' && <Badge tone="accent">en cours</Badge>}
        {session.deload && <Badge tone="accent">semaine allégée</Badge>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-card p-3">
          <div className="text-2xl font-bold">{sets.length}</div>
          <div className="text-sm text-ink-2">séries</div>
        </div>
        <div className="rounded-2xl bg-card p-3">
          <div className="text-2xl font-bold">{duration ? formatDuration(duration) : '—'}</div>
          <div className="text-sm text-ink-2">durée</div>
        </div>
        <div className="rounded-2xl bg-card p-3">
          <div className="text-2xl font-bold">{rpes.length > 0 ? (rpes.reduce((a, b) => a + b, 0) / rpes.length).toFixed(1).replace('.', ',') : '—'}</div>
          <div className="text-sm text-ink-2">RPE moyen</div>
        </div>
      </div>
      {degraded > 0 && (
        <p className="flex items-center gap-2 text-warn">
          <WarningIcon className="size-5" /> {degraded} série{degraded > 1 ? 's' : ''} dégradée{degraded > 1 ? 's' : ''}
        </p>
      )}

      {groups.map((group, g) => (
        <section key={`${group.blockTypeId}-${g}`} className="flex flex-col gap-1.5">
          <h2 className="px-1 text-sm font-bold tracking-wide text-ink-3 uppercase">{group.blockTypeId ? (lookups.blocks.get(group.blockTypeId)?.name ?? '?') : 'Sans bloc'}</h2>
          <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
            {group.lines.map((line) => {
              const exercise = lookups.exercises.get(line.exerciseId);
              const notes = line.sets.map((s) => s.note).filter(Boolean);
              return (
                <div key={line.exerciseId} className="p-3">
                  <button type="button" onClick={() => navigate(`/journal/exercise/${line.exerciseId}`)} className="min-h-11 text-left text-lg font-semibold underline-offset-4 active:underline">
                    {exercise?.name ?? '?'}
                  </button>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {line.sets.map((set, i) => {
                      const band = set.bandId ? lookups.bands.get(set.bandId) : null;
                      return (
                        <button
                          key={set.id}
                          type="button"
                          onClick={() => setEdited(set)}
                          className="flex min-h-12 items-center gap-2 rounded-xl border border-line bg-card-2 px-3 active:scale-[0.97]"
                        >
                          <span className="text-sm text-ink-3">{i + 1}</span>
                          <span className="font-semibold tabular-nums">{formatSetValue(set.value, exercise?.measure ?? 'reps')}</span>
                          {band && <BandSwatch band={band} />}
                          {set.rpe !== null && <span className="text-sm text-ink-2">@{set.rpe}</span>}
                          {set.quality === 'degraded' && <WarningIcon className="size-4 text-warn" />}
                        </button>
                      );
                    })}
                  </div>
                  {notes.map((n, i) => (
                    <p key={i} className="mt-1.5 text-ink-2 italic">
                      {n}
                    </p>
                  ))}
                </div>
              );
            })}
          </div>
        </section>
      ))}
      {sets.length === 0 && <p className="text-ink-2">Aucune série enregistrée.</p>}

      {session.status !== 'in_progress' && notDone.length > 0 && (
        <p className="text-ink-2">
          Lignes non faites : {notDone.map((item) => lookups.elements.get(item.elementId)?.name ?? '?').join(', ')}.
        </p>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="px-1 text-sm font-bold tracking-wide text-ink-3 uppercase">Ressenti de la séance</h2>
        <TextArea value={note} onChange={setNote} rows={3} placeholder="Aucune note" />
        {note !== session.note && (
          <Button variant="secondary" onClick={() => void updateSessionNote(db, session.id, note.trim()).then(() => showToast('Note enregistrée.'))}>
            Enregistrer la note
          </Button>
        )}
      </section>

      {session.status !== 'in_progress' && (
        <Button variant="danger" onClick={() => setConfirmDelete(true)}>
          Supprimer la séance
        </Button>
      )}

      <SetEditSheet
        set={edited}
        candidates={edited ? candidatesFor(edited, session, data, lookups) : []}
        bands={data.bands}
        lookups={lookups}
        onClose={() => setEdited(null)}
        onSave={(changes) => {
          if (edited) void updateSet(db, edited.id, changes);
        }}
        onDelete={() => {
          if (edited) void deleteSet(db, edited.id);
        }}
      />
      <ConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Supprimer cette séance ?"
        message={`La séance et ses ${sets.length} séries seront effacées du journal. C’est définitif.`}
        confirmLabel="Supprimer la séance"
        danger
        onConfirm={() => {
          goBack('/journal');
          void deleteSession(db, session.id).then(() => showToast('Séance supprimée.'));
        }}
      />
    </Screen>
  );
}
