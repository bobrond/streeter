// Contrôles de saisie au pouce : gros boutons +/−, puces. Aucune saisie au clavier n'est obligatoire.
import { useState, type ReactNode } from 'react';
import type { Band, ID, Quality } from '../domain/types';
import { MinusIcon, PlusIcon } from './icons';
import { chipClass } from './styles';

/** Valeur entière avec +/− ; un toucher sur la valeur permet de la taper. */
export function ValueStepper({
  value,
  onChange,
  unit,
  min = 0,
  step = 1,
  size = 'lg',
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  unit?: string;
  min?: number;
  step?: number;
  size?: 'lg' | 'md';
}) {
  const [editing, setEditing] = useState(false);
  const button = `flex shrink-0 items-center justify-center rounded-2xl border border-line bg-card-2 text-ink active:scale-[0.95] active:bg-line ${size === 'lg' ? 'size-16' : 'size-14'}`;
  const commit = (text: string) => {
    const n = Number(text.replace(',', '.'));
    if (text.trim() === '') onChange(null);
    else if (Number.isFinite(n)) onChange(Math.max(min, n));
    setEditing(false);
  };
  return (
    <div className="flex min-w-0 flex-1 items-stretch gap-2">
      <button type="button" aria-label="Moins" className={button} onClick={() => onChange(Math.max(min, (value ?? min + step) - step))}>
        <MinusIcon className="size-8" />
      </button>
      {editing ? (
        <input
          autoFocus
          type="text"
          inputMode="decimal"
          defaultValue={value ?? ''}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          className="w-0 min-w-0 flex-1 rounded-2xl border-2 border-accent bg-page text-center text-4xl font-bold tabular-nums outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex min-w-0 flex-1 items-baseline justify-center gap-1.5 rounded-2xl bg-page px-2 py-1"
          aria-label="Saisir la valeur"
        >
          <span className={`font-bold tabular-nums ${size === 'lg' ? 'text-5xl' : 'text-4xl'}`}>{value ?? '–'}</span>
          {unit && <span className="truncate text-lg text-ink-2">{unit}</span>}
        </button>
      )}
      <button type="button" aria-label="Plus" className={button} onClick={() => onChange((value ?? min) + step)}>
        <PlusIcon className="size-8" />
      </button>
    </div>
  );
}

/** Ligne de puces à choix unique ; toucher la puce choisie la désélectionne si `allowNone`. */
export function ChoiceRow<T extends string | number | null>({
  options,
  value,
  onChange,
  allowNone = false,
  label,
}: {
  options: readonly { value: T; label: ReactNode; className?: string }[];
  value: T | null;
  onChange: (value: T | null) => void;
  allowNone?: boolean;
  label?: string;
}) {
  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      {label && <span className="w-12 shrink-0 text-sm font-semibold text-ink-3">{label}</span>}
      <div className="flex min-w-0 flex-1 gap-1.5">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={String(option.value)}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(selected && allowNone ? null : option.value)}
              className={chipClass(selected, `min-w-0 flex-1 px-1 ${option.className ?? ''}`)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const RPE_VALUES = [5, 6, 7, 8, 9, 10] as const;

export function RpePicker({ value, onChange }: { value: number | null; onChange: (value: number | null) => void }) {
  return <ChoiceRow label="RPE" value={value} onChange={onChange} allowNone options={RPE_VALUES.map((v) => ({ value: v, label: v }))} />;
}

export function BandSwatch({ band }: { band: Pick<Band, 'color'> | null }) {
  return (
    <span
      aria-hidden
      className="inline-block size-3.5 shrink-0 rounded-full border border-white/40"
      style={{ backgroundColor: band ? band.color : 'transparent' }}
    />
  );
}

/** Élastique de la série : pastille de couleur au-dessus du nom, sans libellé (la pastille suffit). */
export function BandPicker({ bands, value, onChange }: { bands: readonly Band[]; value: ID | null; onChange: (value: ID | null) => void }) {
  const options: { id: ID | null; band: Band | null; name: string }[] = [{ id: null, band: null, name: 'sans' }, ...bands.map((band) => ({ id: band.id, band, name: band.name }))];
  return (
    <div className="flex min-w-0 gap-1.5 overflow-x-auto" role="group" aria-label="Élastique">
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <button
            key={option.id ?? 'none'}
            type="button"
            aria-pressed={selected}
            aria-label={option.band ? `Élastique ${option.name}` : 'Sans élastique'}
            onClick={() => onChange(option.id)}
            className={chipClass(selected, 'min-w-[3rem] flex-auto flex-col gap-0.5 px-1.5 py-1 leading-tight', 'text-sm')}
          >
            {option.band ? <BandSwatch band={option.band} /> : <span aria-hidden className="inline-block size-3.5 rounded-full border border-dashed border-ink-3" />}
            <span className="max-w-full truncate">{option.name}</span>
          </button>
        );
      })}
    </div>
  );
}

export function QualityToggle({ value, onChange }: { value: Quality | null; onChange: (value: Quality | null) => void }) {
  return (
    <div className="flex min-w-0 flex-1 gap-1.5" role="group" aria-label="Qualité de la série">
      <button
        type="button"
        aria-pressed={value === 'clean'}
        onClick={() => onChange(value === 'clean' ? null : 'clean')}
        className={`flex min-h-14 flex-1 items-center justify-center rounded-2xl border text-lg font-semibold active:scale-[0.97] ${
          value === 'clean' ? 'border-ok bg-ok text-accent-ink' : 'border-line bg-card-2 text-ink'
        }`}
      >
        Propre
      </button>
      <button
        type="button"
        aria-pressed={value === 'degraded'}
        onClick={() => onChange(value === 'degraded' ? null : 'degraded')}
        className={`flex min-h-14 flex-1 items-center justify-center rounded-2xl border text-lg font-semibold active:scale-[0.97] ${
          value === 'degraded' ? 'border-warn bg-warn text-accent-ink' : 'border-line bg-card-2 text-ink'
        }`}
      >
        Dégradée
      </button>
    </div>
  );
}
