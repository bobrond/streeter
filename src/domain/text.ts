/** Espaces normalisés, sans espaces aux extrémités. `\s` couvre aussi les espaces insécables. */
export function cleanSpaces(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Minuscules, sans accents, apostrophes et espaces unifiés. */
export function fold(s: string): string {
  return cleanSpaces(
    s
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[’‘`´]/g, "'"),
  );
}

const WORD_SYNONYMS: Record<string, string> = {
  elastic: 'elastique',
  elastics: 'elastique',
  elastiques: 'elastique',
  mur: 'wall',
  legere: 'leger',
};

/**
 * Clé de rapprochement d'un nom : `fold`, ponctuation remplacée par des espaces,
 * synonymes du tableur unifiés (« elastic » / « élastique », « mur » / « wall »…).
 */
export function nameKey(s: string): string {
  const folded = fold(s)
    .replace(/front lever/g, 'fl')
    .replace(/[()[\]/,;:.!?"«»]/g, ' ');
  return cleanSpaces(folded)
    .split(' ')
    .map((w) => WORD_SYNONYMS[w] ?? w)
    .join(' ');
}

export function nameTokens(s: string): string[] {
  return nameKey(s).split(' ').filter(Boolean);
}

/** Vrai si `key` commence par `prefix` suivi d'une fin de mot. */
export function startsWithWords(key: string, prefix: string): boolean {
  return key === prefix || key.startsWith(prefix + ' ');
}
