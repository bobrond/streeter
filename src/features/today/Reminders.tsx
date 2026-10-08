import { useState } from 'react';
import type { AppData } from '../../db/hooks';
import { daysSince, isBackupDue } from '../../io/json/backup';
import { canShareFiles } from '../../lib/device';
import { isStandalone, useInstallPrompt } from '../../lib/pwa';
import { navigate } from '../../lib/router';
import { Button } from '../../ui/Button';
import { downloadBackup, shareBackup } from '../settings/dataActions';

/** Rappel de sauvegarde : plus de 7 jours, ou jamais alors que des séances ont été faites dans l'appli. */
export function BackupReminder({ data, now }: { data: AppData; now: number }) {
  const [canShare] = useState(canShareFiles);
  const appSessions = data.sessions.filter((s) => s.source === 'app' && s.status !== 'in_progress').length;
  const last = data.settings.lastBackupAt;
  if (!isBackupDue(last, now, appSessions)) return null;
  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-warn/60 bg-card p-4">
      <h2 className="text-lg font-bold text-warn">Pense à sauvegarder</h2>
      <p className="text-ink-2">
        {last ? `Dernière sauvegarde il y a ${daysSince(last, now)} jours.` : 'Aucune sauvegarde de tes séances pour l’instant.'} Tes données ne sont que
        sur ce téléphone.
      </p>
      <Button variant="secondary" onClick={() => void (canShare ? shareBackup() : downloadBackup())}>
        {canShare ? 'Envoyer une sauvegarde' : 'Enregistrer une sauvegarde'}
      </Button>
      <button type="button" onClick={() => navigate('/settings/data')} className="min-h-11 text-left text-ink-2 underline underline-offset-4">
        Autres options de sauvegarde
      </button>
    </section>
  );
}

/** Proposition d'installation sur l'écran d'accueil, tant que l'appli n'est pas installée. */
export function InstallCard() {
  const install = useInstallPrompt();
  const [standalone] = useState(isStandalone);
  if (!install || standalone) return null;
  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-line bg-card p-4">
      <h2 className="text-lg font-bold">Installer Streeter</h2>
      <p className="text-ink-2">Sur l’écran d’accueil : plein écran, hors ligne au parc, données mieux protégées.</p>
      <Button variant="secondary" onClick={() => void install()}>
        Installer sur l’écran d’accueil
      </Button>
    </section>
  );
}
