import { useState } from 'react';
import type { Lookups } from '../../db/lookups';
import { UNIT_SHORT, formatDuration } from '../../domain/labels';
import type { Band, Exercise, SetKind, SetLog } from '../../domain/types';
import { Button } from '../../ui/Button';
import { CheckIcon, SoundIcon } from '../../ui/icons';
import { BandPicker, QualityToggle, RpePicker, ValueStepper } from '../../ui/inputs';
import { Segmented } from '../../ui/Segmented';
import { Sheet } from '../../ui/Sheet';
import { chipClass } from '../../ui/styles';

const KINDS: readonly { value: SetKind; label: string }[] = [
  { value: 'normal', label: 'Normale' },
  { value: 'warmup', label: 'Échauffement' },
  { value: 'failure', label: 'Échec' },
];

export function MenuSheet({
  open,
  onClose,
  sound,
  onToggleSound,
  onFinish,
  onAbandon,
  onLeave,
}: {
  open: boolean;
  onClose: () => void;
  sound: boolean;
  onToggleSound: () => void;
  onFinish: () => void;
  onAbandon: () => void;
  onLeave: () => void;
}) {
  const row = 'flex min-h-14 w-full items-center gap-3 rounded-2xl px-4 text-left text-lg font-semibold active:bg-card-2';
  return (
    <Sheet open={open} onClose={onClose} title="Séance">
      <div className="flex flex-col gap-1">
        <button type="button" className={row} onClick={onToggleSound}>
          <SoundIcon off={!sound} />
          <span className="flex-1">Son des minuteurs</span>
          <span className={sound ? 'text-ok' : 'text-ink-3'}>{sound ? 'activé' : 'coupé'}</span>
        </button>
        <button type="button" className={row} onClick={onLeave}>
          Revenir à l’accueil <span className="font-normal text-ink-2">(la séance reste en cours)</span>
        </button>
        <button type="button" className={row} onClick={onFinish}>
          <CheckIcon className="size-6 text-accent" />
          Terminer la séance
        </button>
        <button type="button" className={`${row} text-danger`} onClick={onAbandon}>
          Abandonner la séance
        </button>
      </div>
    </Sheet>
  );
}

export function FinishSheet({
  open,
  onClose,
  setCount,
  durationSec,
  unfinished,
  onFinish,
}: {
  open: boolean;
  onClose: () => void;
  setCount: number;
  durationSec: number;
  /** Lignes ni faites ni terminées. */
  unfinished: string[];
  onFinish: (note: string) => void;
}) {
  const [note, setNote] = useState('');
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Terminer la séance"
      footer={
        <>
          <Button onClick={() => onFinish(note.trim())}>Enregistrer la séance</Button>
          <Button variant="secondary" onClick={onClose}>
            Continuer la séance
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-card-2 p-3">
            <div className="text-3xl font-bold tabular-nums">{setCount}</div>
            <div className="text-ink-2">série{setCount > 1 ? 's' : ''}</div>
          </div>
          <div className="rounded-2xl bg-card-2 p-3">
            <div className="text-3xl font-bold tabular-nums">{formatDuration(durationSec)}</div>
            <div className="text-ink-2">de séance</div>
          </div>
        </div>
        {unfinished.length > 0 && (
          <div className="rounded-2xl border border-warn/60 p-3 text-warn">
            <div className="font-semibold">Pas encore fait :</div>
            <ul className="mt-1 list-disc pl-5 text-ink-2">
              {unfinished.map((name, i) => (
                <li key={i}>{name}</li>
              ))}
            </ul>
          </div>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-ink-2">Ressenti de la séance (facultatif)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="rounded-2xl border border-line bg-page p-3 text-lg outline-none focus:border-accent"
          />
        </label>
      </div>
    </Sheet>
  );
}

/** Correction d'une série enregistrée, depuis le journal. */
export function SetEditSheet({
  set,
  candidates,
  bands,
  lookups,
  onClose,
  onSave,
  onDelete,
}: {
  set: SetLog | null;
  candidates: readonly Exercise[];
  bands: readonly Band[];
  lookups: Lookups;
  onClose: () => void;
  onSave: (changes: Partial<SetLog>) => void;
  onDelete: () => void;
}) {
  return (
    <Sheet open={set !== null} onClose={onClose} title="Corriger la série">
      {set && <SetEditForm key={set.id} set={set} candidates={candidates} bands={bands} lookups={lookups} onClose={onClose} onSave={onSave} onDelete={onDelete} />}
    </Sheet>
  );
}

function SetEditForm({
  set,
  candidates,
  bands,
  lookups,
  onClose,
  onSave,
  onDelete,
}: {
  set: SetLog;
  candidates: readonly Exercise[];
  bands: readonly Band[];
  lookups: Lookups;
  onClose: () => void;
  onSave: (changes: Partial<SetLog>) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState(set);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const exercise = lookups.exercises.get(draft.exerciseId);
  const choices = candidates.some((c) => c.id === set.exerciseId) || !exercise ? candidates : [exercise, ...candidates];
  const patch = (changes: Partial<SetLog>) => setDraft((d) => ({ ...d, ...changes }));
  return (
    <div className="flex flex-col gap-3">
      {choices.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {choices.map((c) => (
            <button key={c.id} type="button" className={chipClass(c.id === draft.exerciseId)} onClick={() => patch({ exerciseId: c.id })}>
              {c.name}
            </button>
          ))}
        </div>
      )}
      {exercise && exercise.measure !== 'none' && (
        <ValueStepper value={draft.value} onChange={(value) => patch({ value })} unit={UNIT_SHORT[exercise.measure]} />
      )}
      <Segmented label="Type de série" options={KINDS} value={draft.kind} onChange={(kind) => patch({ kind })} />
      <BandPicker bands={bands} value={draft.bandId} onChange={(bandId) => patch({ bandId })} />
      <RpePicker value={draft.rpe} onChange={(rpe) => patch({ rpe })} />
      <QualityToggle value={draft.quality} onChange={(quality) => patch({ quality })} />
      <textarea
        value={draft.note}
        onChange={(e) => patch({ note: e.target.value })}
        rows={2}
        placeholder="Note"
        className="rounded-2xl border border-line bg-page p-3 text-lg outline-none focus:border-accent"
      />
      <Button
        onClick={() => {
          onSave({
            exerciseId: draft.exerciseId,
            value: exercise?.measure === 'none' ? null : draft.value,
            bandId: draft.bandId,
            rpe: draft.rpe,
            quality: draft.quality,
            kind: draft.kind,
            note: draft.note.trim(),
          });
          onClose();
        }}
      >
        Enregistrer
      </Button>
      {confirmDelete ? (
        <Button
          variant="danger"
          onClick={() => {
            onDelete();
            onClose();
          }}
        >
          Confirmer la suppression
        </Button>
      ) : (
        <Button variant="danger" onClick={() => setConfirmDelete(true)}>
          Supprimer la série
        </Button>
      )}
    </div>
  );
}
