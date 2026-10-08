import { useState } from 'react';
import type { Lookups } from '../../db/lookups';
import { UNIT_SHORT, formatDuration, formatSets } from '../../domain/labels';
import { itemStatus, type ItemProgress, type ItemStatus, type SessionPlan } from '../../domain/session';
import type { Band, Exercise, ID, PrescriptionItem, SetLog } from '../../domain/types';
import { Button } from '../../ui/Button';
import { CheckIcon, PlayIcon, SoundIcon } from '../../ui/icons';
import { BandPicker, QualityToggle, RpePicker, ValueStepper } from '../../ui/inputs';
import { Sheet } from '../../ui/Sheet';
import { chipClass } from '../../ui/styles';

const STATUS_MARK: Record<ItemStatus, { mark: string; className: string }> = {
  todo: { mark: '○', className: 'text-ink-3' },
  started: { mark: '◐', className: 'text-accent' },
  min_reached: { mark: '◕', className: 'text-ok' },
  done: { mark: '●', className: 'text-ok' },
  skipped: { mark: '–', className: 'text-ink-3' },
};

export function PlanSheet({
  open,
  onClose,
  plan,
  progress,
  activeId,
  proposedId,
  lookups,
  exerciseNameOf,
  onGoTo,
}: {
  open: boolean;
  onClose: () => void;
  plan: SessionPlan;
  progress: ReadonlyMap<ID, ItemProgress>;
  activeId: ID | null;
  proposedId: ID | null;
  lookups: Lookups;
  exerciseNameOf: (item: PrescriptionItem) => string;
  onGoTo: (itemId: ID) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Plan de la séance">
      <div className="flex flex-col gap-4">
        {plan.blocks.map((block, i) => (
          <section key={`${block.blockTypeId}-${i}`}>
            <h3 className="mb-1 text-sm font-bold tracking-wide text-ink-3 uppercase">
              {lookups.blocks.get(block.blockTypeId)?.name ?? '?'}
              {block.units.some((u) => u.mode === 'alternate') && <span className="font-normal normal-case"> · en alternance</span>}
              {block.units.some((u) => u.mode === 'superset') && <span className="font-normal normal-case"> · superset</span>}
            </h3>
            <ul className="flex flex-col gap-1">
              {block.items.map((item) => {
                const p = progress.get(item.id);
                const status = itemStatus(item, p);
                const { mark, className } = STATUS_MARK[status];
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onGoTo(item.id);
                        onClose();
                      }}
                      className={`flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 py-2 text-left active:bg-card-2 ${item.id === activeId ? 'bg-card-2 ring-2 ring-accent' : ''}`}
                    >
                      <span className={`w-5 text-center text-xl ${className}`} aria-hidden>
                        {mark}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{lookups.elements.get(item.elementId)?.name ?? '?'}</span>
                        <span className="block truncate text-ink-2">{exerciseNameOf(item)}</span>
                      </span>
                      {item.id === proposedId && item.id !== activeId && <PlayIcon className="size-4 text-accent" />}
                      <span className="shrink-0 text-lg tabular-nums">
                        {p?.done ?? 0}
                        <span className="text-ink-2">/{formatSets(item.setsMin, item.setsMax)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </Sheet>
  );
}

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

export function NoteSheet({ open, initial, onClose, onSave }: { open: boolean; initial: string; onClose: () => void; onSave: (note: string) => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Note de la série">
      {open && <NoteForm initial={initial} onSave={onSave} onClose={onClose} />}
    </Sheet>
  );
}

function NoteForm({ initial, onSave, onClose }: { initial: string; onSave: (note: string) => void; onClose: () => void }) {
  const [note, setNote] = useState(initial);
  return (
    <div className="flex flex-col gap-3">
      <textarea
        autoFocus
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        placeholder="Sensations, gêne, réglage de l’élastique…"
        className="rounded-2xl border border-line bg-page p-3 text-lg outline-none focus:border-accent"
      />
      <Button
        onClick={() => {
          onSave(note.trim());
          onClose();
        }}
      >
        Enregistrer la note
      </Button>
    </div>
  );
}

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
