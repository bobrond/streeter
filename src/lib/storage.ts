export type PersistState = 'granted' | 'denied' | 'unsupported';

/**
 * Petites préférences d'affichage propres à l'appareil (dernière vue ouverte…). Le stockage peut manquer
 * (navigation privée, données effacées) : on retombe alors sur la valeur par défaut.
 */
export function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Stockage indisponible : la préférence ne sera pas gardée.
  }
}

/** Demande au navigateur de ne jamais effacer les données de l'appli (stockage persistant). */
export async function ensurePersistentStorage(): Promise<PersistState> {
  if (!navigator.storage?.persist) return 'unsupported';
  try {
    if (await navigator.storage.persisted()) return 'granted';
    return (await navigator.storage.persist()) ? 'granted' : 'denied';
  } catch {
    return 'unsupported';
  }
}
