// Effets de la séance en cours, actifs quel que soit l'écran affiché : sons et vibrations du repos,
// écran allumé, son débloqué au toucher. Le bandeau de repos de l'écran Séance ne fait qu'afficher.
import { useEffect, useMemo } from 'react';
import { readResume } from '../../domain/session';
import { restSignals } from '../../domain/timers';
import type { RestTimer, SessionLog } from '../../domain/types';
import { unlockAudio } from '../../lib/audio';
import { useNow, useSoundPref, useWakeLock } from '../../lib/device';
import { useTimerSignals } from './signals';

export function SessionRuntime({ sessions }: { sessions: readonly SessionLog[] }) {
  const active = sessions.find((s) => s.status === 'in_progress');
  const raw = active ? readResume(active.resume).rest : null;
  // Le même minuteur tant que ses valeurs ne changent pas : une autre écriture de la séance ne le relance pas.
  const itemId = raw?.itemId ?? null;
  const startedAt = raw?.startedAt ?? null;
  const minSec = raw?.minSec ?? null;
  const maxSec = raw?.maxSec ?? null;
  const extraSec = raw?.extraSec ?? 0;
  const rest = useMemo<RestTimer | null>(
    () => (itemId !== null && startedAt !== null ? { itemId, startedAt, minSec, maxSec, extraSec } : null),
    [itemId, startedAt, minSec, maxSec, extraSec],
  );
  const inSession = active !== undefined;
  const sound = useSoundPref();
  const now = useNow(rest ? 200 : 60_000);
  useTimerSignals(rest, now, restSignals, sound);
  useWakeLock(inSession);

  // Le son n'est autorisé qu'après un geste : chaque toucher le (ré)active.
  useEffect(() => {
    if (!inSession) return;
    const unlock = () => unlockAudio();
    window.addEventListener('pointerup', unlock);
    return () => window.removeEventListener('pointerup', unlock);
  }, [inSession]);

  return null;
}
