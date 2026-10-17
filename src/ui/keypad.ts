// Pavé numérique de la séance (aucun clavier du téléphone) : valeurs entières, 4 chiffres au plus.

export type Key = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'back';

const MAX_DIGITS = 4;

/**
 * Applique une touche. `fresh` : la valeur affichée est pré-remplie, le premier chiffre la remplace
 * (on corrige sans effacer d'abord) ; ensuite les chiffres s'ajoutent. « ⌫ » retire le dernier chiffre.
 */
export function applyKey(value: number | null, key: Key, fresh: boolean): number | null {
  const text = fresh ? '' : value === null ? '' : String(value);
  if (key === 'back') {
    if (fresh) return null;
    const shorter = text.slice(0, -1);
    return shorter === '' ? null : Number(shorter);
  }
  const next = text === '0' ? key : text + key;
  return next.length > MAX_DIGITS ? value : Number(next);
}
