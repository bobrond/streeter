/** Choix entre quelques vues (« Séances | Exercices ») : segments de 44 px, celui choisi en clair sur fond de carte. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="grid gap-1 rounded-xl bg-card p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option.value)}
            className={`min-h-11 rounded-md px-2 text-base font-semibold ${selected ? 'bg-line text-ink' : 'text-ink-2 active:bg-card-2'}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
