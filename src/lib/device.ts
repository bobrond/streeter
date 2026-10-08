// Vibration, écran allumé et préférences propres à l'appareil.
import { useEffect, useState } from 'react';

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

/** Partage de fichier possible (Android : Drive, e-mail, messagerie…). */
export function canShareFiles(): boolean {
  try {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([''], 'test.json', { type: 'application/json' })] });
  } catch {
    return false;
  }
}

/** Ouvre le menu de partage du téléphone avec le fichier ; `false` si l'utilisateur annule. */
export async function shareFile(fileName: string, blob: Blob, title: string): Promise<boolean> {
  try {
    await navigator.share({ files: [new File([blob], fileName, { type: blob.type })], title });
    return true;
  } catch {
    return false;
  }
}
