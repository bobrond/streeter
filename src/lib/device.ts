// Vibration, écran allumé et préférences propres à l'appareil.
import { useEffect, useState, useSyncExternalStore } from 'react';

export function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Vibration indisponible : sans conséquence.
  }
}

/** Garde l'écran allumé tant que `active` ; le verrou est repris au retour au premier plan. */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let disposed = false;
    const acquire = async () => {
      if (document.visibilityState !== 'visible' || (sentinel && !sentinel.released)) return;
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (disposed) void lock.release();
        else sentinel = lock;
      } catch {
        // Refusé (économie d'énergie…) : on réessaiera au prochain retour au premier plan.
      }
    };
    const onVisibility = () => void acquire();
    void acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibility);
      void sentinel?.release();
    };
  }, [active]);
}

/** Heure courante, rafraîchie toutes les `intervalMs`. */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

const SOUND_KEY = 'streeter.sound';

export function readSoundPref(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function writeSoundPref(on: boolean): void {
  try {
    localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
  } catch {
    // Stockage indisponible : la préférence ne sera pas gardée.
  }
}

// Préférence partagée : le menu de la séance la change, les minuteurs (au niveau de l'appli) la lisent.
let soundOn: boolean | null = null;
const soundListeners = new Set<() => void>();

function currentSoundPref(): boolean {
  soundOn ??= readSoundPref();
  return soundOn;
}

function subscribeSoundPref(listener: () => void): () => void {
  soundListeners.add(listener);
  return () => soundListeners.delete(listener);
}

export function setSoundPref(on: boolean): void {
  soundOn = on;
  writeSoundPref(on);
  for (const listener of soundListeners) listener();
}

/** Sons des minuteurs activés (préférence gardée sur l'appareil). */
export function useSoundPref(): boolean {
  return useSyncExternalStore(subscribeSoundPref, currentSoundPref);
}

/** Enregistre un fichier dans les téléchargements du téléphone. */
export function downloadFile(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Partage de fichier possible (Android : Drive, e-mail, messagerie…). `canShare` ne vérifie pas le type du fichier :
 * Chrome ne partage qu'une liste fermée de types (texte, CSV, PDF, images…), sans le JSON.
 */
export function canShareFiles(): boolean {
  try {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([''], 'test.txt', { type: 'text/plain' })] });
  } catch {
    return false;
  }
}

function isAbort(e: unknown): boolean {
  return typeof e === 'object' && e !== null && 'name' in e && e.name === 'AbortError';
}

/**
 * Ouvre le menu de partage du téléphone avec le fichier : `true` s'il est parti, `false` si l'utilisateur a annulé.
 * Un refus (type de fichier non accepté…) remonte en erreur, pour être affiché.
 */
export async function shareFile(fileName: string, blob: Blob, title: string): Promise<boolean> {
  try {
    await navigator.share({ files: [new File([blob], fileName, { type: blob.type })], title });
    return true;
  } catch (e) {
    if (isAbort(e)) return false;
    throw e;
  }
}
