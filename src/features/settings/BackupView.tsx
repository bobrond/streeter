import { useState } from 'react';
import type { AppData } from '../../db/hooks';
import { backupSummary, daysSince, type Backup } from '../../io/json/backup';
import { canShareFiles, useNow } from '../../lib/device';
import { Button, FileButton } from '../../ui/Button';
import { ConfirmSheet } from '../../ui/Sheet';
import { showToast } from '../../ui/toastStore';
import { downloadBackup, readBackupFile, restoreFromBackup, shareBackup } from './dataActions';

const DATE_TIME = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' });

export function BackupView({ data }: { data: AppData }) {
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Backup | null>(null);
  const [canShare] = useState(canShareFiles);
  const now = useNow(60_000);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };
  const open = async (file: File) => {
    try {
      setPending(await readBackupFile(file));
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), { tone: 'error' });
    }
  };
  const last = data.settings.lastBackupAt;
  const summary = pending ? backupSummary(pending) : null;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-ink-2">
        Tes données ne sont que sur ce téléphone. Une sauvegarde contient tout : programme, catalogue, objectifs, séances et séries. Garde-la ailleurs (Drive,
        e-mail) : c’est aussi elle qui permet de changer de téléphone.
      </p>
      <p className="text-ink-2">
        Dernière sauvegarde :{' '}
        <span className="text-ink">{last ? `${DATE_TIME.format(last)} (il y a ${daysSince(last, now)} j)` : 'jamais'}</span>
      </p>
      {canShare && (
        <Button onClick={() => void run(shareBackup)} disabled={busy}>
          Envoyer une sauvegarde
        </Button>
      )}
      <Button variant={canShare ? 'secondary' : 'primary'} onClick={() => void run(downloadBackup)} disabled={busy}>
        Enregistrer une sauvegarde (.json)
      </Button>
      <FileButton variant="secondary" accept=".json,application/json" onFile={(file) => void open(file)} disabled={busy}>
        Restaurer une sauvegarde
      </FileButton>

      <ConfirmSheet
        open={pending !== null}
        onClose={() => setPending(null)}
        title="Restaurer cette sauvegarde ?"
        message={
          summary && (
            <>
              <p>
                Sauvegarde du {summary.exportedAt ? DATE_TIME.format(summary.exportedAt) : '?'} : {summary.sessions} séances, {summary.sets} séries,{' '}
                {summary.exercises} exercices, {summary.templates} modèles, {summary.objectives} objectifs.
              </p>
              <p className="mt-2 font-semibold text-warn">Toutes les données actuelles seront remplacées.</p>
              <p className="mt-2">Pour garder une trace des données actuelles, enregistre d’abord une sauvegarde.</p>
            </>
          )
        }
        confirmLabel="Remplacer mes données"
        danger
        onConfirm={() => {
          const backup = pending;
          setPending(null);
          if (backup) void run(() => restoreFromBackup(backup));
        }}
      />
    </div>
  );
}
