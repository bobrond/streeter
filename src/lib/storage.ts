export type PersistState = 'granted' | 'denied' | 'unsupported';

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
