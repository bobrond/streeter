import { UNIT_SHORT } from '../../domain/labels';
import type { Band, SetDraft } from '../../domain/types';
import { CheckIcon, PencilIcon, TimerIcon } from '../../ui/icons';
import { BandPicker, QualityToggle, RpePicker, ValueStepper } from '../../ui/inputs';
import type { ItemView } from './useSessionController';

/** Saisie de la série, fixée en bas de l'écran (zone du pouce). */
export function EntryPanel({
  view,
  bands,
  onDraft,
  onValidate,
  onStartHold,
  onNote,
}: {
  view: ItemView;
  bands: readonly Band[];
  onDraft: (patch: Partial<SetDraft>) => void;
  onValidate: () => void;
  onStartHold: () => void;
  onNote: () => void;
}) {
  const { exercise, draft, sets, status } = view;
  const measure = exercise?.measure ?? 'reps';
  const nextNumber = sets.length + 1;
  return (
    <section className="flex flex-col gap-2 border-t border-line bg-card px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" aria-label="Saisie de la série">
      {measure !== 'none' && (
        <div className="flex items-stretch gap-2">
          <ValueStepper value={draft.value} onChange={(value) => onDraft({ value })} unit={UNIT_SHORT[measure]} />
          {measure === 'seconds' && (
            <button
              type="button"
              onClick={onStartHold}
              aria-label="Lancer le minuteur de hold"
              className="flex size-16 shrink-0 flex-col items-center justify-center rounded-2xl border border-accent/70 bg-card-2 text-accent active:scale-[0.95]"
            >
              <TimerIcon className="size-8" />
              <span className="text-xs font-semibold">Chrono</span>
            </button>
          )}
        </div>
      )}
      <BandPicker bands={bands} value={draft.bandId} onChange={(bandId) => onDraft({ bandId })} />
      <RpePicker value={draft.rpe} onChange={(rpe) => onDraft({ rpe })} />
      <div className="flex items-center gap-1.5">
        <QualityToggle value={draft.quality} onChange={(quality) => onDraft({ quality })} />
        <button
          type="button"
          onClick={onNote}
          aria-label="Note de la série"
          className={`flex size-14 shrink-0 items-center justify-center rounded-2xl border active:scale-[0.95] ${draft.note ? 'border-accent text-accent' : 'border-line bg-card-2 text-ink-2'}`}
        >
          <PencilIcon />
        </button>
      </div>
      <button
        type="button"
        onClick={onValidate}
        disabled={!exercise}
        className="mt-1 flex min-h-16 items-center justify-center gap-2 rounded-2xl bg-accent px-5 text-xl font-bold text-accent-ink active:scale-[0.98] disabled:opacity-40"
      >
        <CheckIcon className="size-7" />
        {status === 'done' ? `Ajouter une série (${nextNumber})` : `Valider la série ${nextNumber}`}
      </button>
    </section>
  );
}
