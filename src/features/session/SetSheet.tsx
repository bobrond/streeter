// Feuille de saisie d'une série : valeur au pavé numérique (aucun clavier du téléphone), type de série,
// élastique, RPE, qualité, note. Série à faire : valider ou garder les valeurs ; série faite : corriger ou supprimer.
import { useState } from 'react';
import type { Lookups } from '../../db/lookups';
import { UNIT_SHORT, formatSetValue } from '../../domain/labels';
import type { TableRow } from '../../domain/sessionTable';
import type { Band, ID, SetDraft, SetKind } from '../../domain/types';
import { Button } from '../../ui/Button';
import { MinusIcon, PlusIcon } from '../../ui/icons';
import { BandPicker, QualityToggle, RpePicker } from '../../ui/inputs';
import { applyKey, type Key } from '../../ui/keypad';
import { Segmented } from '../../ui/Segmented';
import { Sheet } from '../../ui/Sheet';
import { chipClass } from '../../ui/styles';
import type { LineView } from './useSessionController';

const KEYS: readonly Key[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
const KINDS: readonly { value: SetKind; label: string }[] = [
  { value: 'normal', label: 'Normale' },
  { value: 'warmup', label: 'Échauffement' },
  { value: 'failure', label: 'Échec' },
];

export interface SetSheetTarget {
  line: LineView;
  row: TableRow;
}

function KeyButton({ label, onPress, aria }: { label: string; onPress: () => void; aria?: string }) {
  return (
    <button type="button" aria-label={aria ?? label} onClick={onPress} className="min-h-14 rounded-xl border border-line bg-card-2 text-2xl font-bold tabular-nums active:scale-[0.96] active:bg-line">
      {label}
    </button>
  );
}

export function SetSheet({
  target,
  bands,
  lookups,
  onClose,
  onKeep,
  onValidate,
  onSaveDone,
  onDeleteDone,
}: {
  target: SetSheetTarget;
  bands: readonly Band[];
  lookups: Lookups;
  onClose: () => void;
  /** Série à faire : garde les valeurs sans valider. */
  onKeep: (draft: SetDraft) => void;
  onValidate: (draft: SetDraft) => void;
  /** Série faite : enregistre la correction (exercice compris). */
  onSaveDone: (draft: SetDraft, exerciseId: ID) => void;
  onDeleteDone: () => void;
}) {
  const { line, row } = target;
  const done = row.status === 'done';
  const initial: SetDraft = done
    ? { value: row.set.value, bandId: row.set.bandId, rpe: row.set.rpe, quality: row.set.quality, kind: row.set.kind, note: row.set.note }
    : row.draft;
  const [draft, setDraft] = useState<SetDraft>(initial);
  const [fresh, setFresh] = useState(true);
  const [exerciseId, setExerciseId] = useState<ID>(done ? row.set.exerciseId : (line.exercise?.id ?? ''));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const exercise = lookups.exercises.get(exerciseId) ?? line.exercise;
  const measure = exercise?.measure ?? 'reps';
  const element = lookups.elements.get(line.item.elementId);
  const patch = (changes: Partial<SetDraft>) => setDraft((d) => ({ ...d, ...changes }));
  const press = (key: Key) => {
    patch({ value: applyKey(draft.value, key, fresh) });
    setFresh(false);
  };
  const step = (delta: number) => {
    patch({ value: Math.max(0, (draft.value ?? 0) + delta) });
    setFresh(false);
  };
  const choices = done && line.candidates.length > 0 && !line.candidates.some((c) => c.id === row.set.exerciseId) && exercise ? [exercise, ...line.candidates] : line.candidates;
  const rowName = draft.kind === 'warmup' ? 'Échauffement' : `Série ${row.label === 'E' ? '' : row.label}`.trim();

  return (
    <Sheet
      open
      onClose={onClose}
      title={`${element?.name ?? ''} · ${rowName}`}
      footer={
        done ? (
          <>
            <Button
              onClick={() => {
                onSaveDone(draft, exerciseId);
                onClose();
              }}
            >
              Enregistrer la correction
            </Button>
            {confirmDelete ? (
              <Button
                variant="danger"
                onClick={() => {
                  onDeleteDone();
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
          </>
        ) : (
          <>
            <Button
              onClick={() => {
                onValidate(draft);
                onClose();
              }}
            >
              Valider {draft.kind === 'warmup' ? 'l’échauffement' : 'la série'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                onKeep(draft);
                onClose();
              }}
            >
              Garder ces valeurs
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {done && choices.length > 1 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Exercice">
            {choices.map((c) => (
              <button key={c.id} type="button" aria-pressed={c.id === exerciseId} onClick={() => setExerciseId(c.id)} className={chipClass(c.id === exerciseId, 'text-left', 'text-base')}>
                {c.name}
              </button>
            ))}
          </div>
        )}
        {!done && exercise && <p className="-mt-1 text-ink-2">{exercise.name}</p>}

        {measure !== 'none' && (
          <section className="flex flex-col gap-2" aria-label="Valeur">
            <div className="flex items-stretch gap-2">
              <button type="button" aria-label="Moins un" onClick={() => step(-1)} className="flex size-16 shrink-0 items-center justify-center rounded-xl border border-line bg-card-2 active:bg-line">
                <MinusIcon className="size-8" />
              </button>
              <div className={`flex min-w-0 flex-1 items-baseline justify-center gap-1.5 rounded-xl border-2 bg-page px-2 py-1 ${fresh ? 'border-line' : 'border-accent'}`} aria-live="polite">
                <span className="text-5xl font-bold tabular-nums">{draft.value ?? '–'}</span>
                <span className="text-lg text-ink-2">{UNIT_SHORT[measure]}</span>
              </div>
              <button type="button" aria-label="Plus un" onClick={() => step(1)} className="flex size-16 shrink-0 items-center justify-center rounded-xl border border-line bg-card-2 active:bg-line">
                <PlusIcon className="size-8" />
              </button>
            </div>
            {row.previous && (
              <button
                type="button"
                onClick={() => {
                  patch({ value: row.previous!.value, bandId: row.previous!.bandId });
                  setFresh(false);
                }}
                className="min-h-11 self-start rounded-full border border-line px-4 text-ink-2 active:bg-card-2"
              >
                Précédent : {formatSetValue(row.previous.value, measure)} · recopier
              </button>
            )}
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Pavé numérique">
              {KEYS.map((key) => (
                <KeyButton key={key} label={key} onPress={() => press(key)} />
              ))}
              <KeyButton
                label="C"
                aria="Effacer la valeur"
                onPress={() => {
                  patch({ value: null });
                  setFresh(false);
                }}
              />
              <KeyButton label="0" onPress={() => press('0')} />
              <KeyButton label="⌫" aria="Effacer un chiffre" onPress={() => press('back')} />
            </div>
          </section>
        )}

        <section className="flex flex-col gap-1.5">
          <h3 className="text-sm font-bold tracking-wide text-ink-3 uppercase">Type de série</h3>
          <Segmented label="Type de série" options={KINDS} value={draft.kind} onChange={(kind) => patch({ kind })} />
          {draft.kind === 'warmup' && <p className="text-sm text-ink-2">Ne compte ni dans le volume ni dans les records.</p>}
        </section>
        <BandPicker bands={bands} value={draft.bandId} onChange={(bandId) => patch({ bandId })} />
        <RpePicker value={draft.rpe} onChange={(rpe) => patch({ rpe })} />
        <QualityToggle value={draft.quality} onChange={(quality) => patch({ quality })} />
        <textarea
          value={draft.note}
          onChange={(e) => patch({ note: e.target.value })}
          rows={2}
          placeholder="Note (facultative)"
          className="rounded-2xl border border-line bg-page p-3 text-lg outline-none focus:border-accent"
        />
      </div>
    </Sheet>
  );
}
