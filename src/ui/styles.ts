// Classes partagées des composants tactiles.

/** Puce sélectionnable de 56 px de haut (mode séance). */
export function chipClass(selected: boolean, extra = '', text: 'text-lg' | 'text-base' | 'text-sm' = 'text-lg'): string {
  return `flex min-h-14 items-center justify-center gap-2 rounded-2xl border px-3 font-semibold transition-transform active:scale-[0.97] ${text} ${
    selected ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-card-2 text-ink'
  } ${extra}`;
}
