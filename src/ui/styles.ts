// Classes partagées des composants tactiles.

/**
 * Puce sélectionnable de 56 px de haut (mode séance), 44 px hors séance (`min-h-11`). Sélection en clair sur sombre
 * (18:1 au soleil), neutre vis-à-vis des couleurs d'élastique (l'orange de l'appli est aussi celui d'un élastique).
 */
export function chipClass(
  selected: boolean,
  extra = '',
  text: 'text-lg' | 'text-base' | 'text-sm' = 'text-lg',
  height: 'min-h-14' | 'min-h-11' = 'min-h-14',
): string {
  return `flex ${height} items-center justify-center gap-2 rounded-2xl border px-3 font-semibold transition-transform active:scale-[0.97] ${text} ${
    selected ? 'border-ink bg-ink text-page' : 'border-line bg-card-2 text-ink'
  } ${extra}`;
}
