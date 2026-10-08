// Champs de formulaire des Réglages : grands, lisibles, au pouce.
import type { ReactNode } from 'react';
import { ArrowDownIcon, ArrowUpIcon, NextIcon } from './icons';
import { chipClass } from './styles';

export function Field({ label, hint, error, children }: { label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-sm font-semibold text-ink-2">{label}</div>
      {children}
      {hint && !error && <div className="text-sm text-ink-3">{hint}</div>}
      {error && <div className="text-sm font-semibold text-danger">{error}</div>}
    </div>
  );
}

const inputClass = 'min-h-14 w-full rounded-2xl border border-line bg-page px-4 text-lg outline-none focus:border-accent';

export function TextInput({
  value,
  onChange,
  onBlur,
  placeholder,
  list,
  autoFocus,
  type = 'text',
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  list?: string;
  autoFocus?: boolean;
  type?: 'text' | 'date';
}) {
  return (
    <input
      type={type}
      value={value}
      list={list}
      autoFocus={autoFocus}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      className={inputClass}
    />
  );
}

export function TextArea({ value, onChange, placeholder, rows = 3 }: { value: string; onChange: (value: string) => void; placeholder?: string; rows?: number }) {
  return (
    <textarea
      value={value}
      rows={rows}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-2xl border border-line bg-page p-4 text-lg outline-none focus:border-accent"
    />
  );
}

/** Interrupteur sur toute la largeur de la ligne. */
export function Toggle({ label, description, checked, onChange }: { label: ReactNode; description?: ReactNode; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-line bg-card-2 px-4 py-2 text-left active:scale-[0.99]"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-semibold">{label}</span>
        {description && <span className="block text-sm text-ink-2">{description}</span>}
      </span>
      <span className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-line'}`} aria-hidden>
        <span className={`absolute top-1 size-6 rounded-full transition-all ${checked ? 'left-7 bg-accent-ink' : 'left-1 bg-ink-2'}`} />
      </span>
    </button>
  );
}

/** Choix unique parmi des puces (qui passent à la ligne). */
export function ChipSelect<T extends string | number | null>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={chipClass(option.value === value, 'min-h-12', 'text-base')}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Ligne de liste qui ouvre un écran ou une feuille. */
export function ListRow({
  title,
  subtitle,
  aside,
  onClick,
  leading,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  aside?: ReactNode;
  onClick: () => void;
  leading?: ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left active:bg-card-2">
      {leading}
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-semibold">{title}</span>
        {subtitle && <span className="block text-ink-2">{subtitle}</span>}
      </span>
      {aside}
      <NextIcon className="size-5 text-ink-3" />
    </button>
  );
}

/** Groupe de lignes sur fond de carte, avec un titre facultatif. */
export function ListGroup({ title, children }: { title?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      {title && <h2 className="px-1 text-sm font-bold tracking-wide text-ink-3 uppercase">{title}</h2>}
      <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">{children}</div>
    </section>
  );
}

/** Pastilles de couleur à choisir. */
export function ColorPicker({ colors, value, onChange }: { colors: readonly string[]; value: string; onChange: (color: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={`Couleur ${color}`}
          aria-pressed={color === value}
          onClick={() => onChange(color)}
          className={`size-12 rounded-full border-4 ${color === value ? 'border-ink' : 'border-transparent'}`}
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}

/** Ligne de liste ordonnée : toucher pour modifier, flèches pour monter ou descendre. */
export function ReorderRow({
  title,
  subtitle,
  leading,
  aside,
  first,
  last,
  onOpen,
  onMove,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  aside?: ReactNode;
  first: boolean;
  last: boolean;
  onOpen: () => void;
  onMove: (delta: -1 | 1) => void;
}) {
  return (
    <div className="flex items-stretch">
      <button type="button" onClick={onOpen} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-4 py-2.5 text-left active:bg-card-2">
        {leading}
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-semibold">{title}</span>
          {subtitle && <span className="block text-ink-2">{subtitle}</span>}
        </span>
        {aside}
      </button>
      <div className="flex border-l border-line">
        <button type="button" aria-label="Monter" disabled={first} onClick={() => onMove(-1)} className="flex w-12 items-center justify-center text-ink-2 active:bg-card-2 disabled:opacity-25">
          <ArrowUpIcon className="size-5" />
        </button>
        <button type="button" aria-label="Descendre" disabled={last} onClick={() => onMove(1)} className="flex w-12 items-center justify-center text-ink-2 active:bg-card-2 disabled:opacity-25">
          <ArrowDownIcon className="size-5" />
        </button>
      </div>
    </div>
  );
}
