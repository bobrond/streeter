import { useState } from 'react';
import { readBackup, markBackupDone } from '../../db/backupStore';
import { db } from '../../db/db';
import type { AppData } from '../../db/hooks';
import { localISODate } from '../../domain/cycle';
import { backupFileName, serializeBackup } from '../../io/json/backup';
import { downloadFile } from '../../lib/device';
import { Button } from '../../ui/Button';
import { showToast } from '../../ui/toastStore';

const DATE_TIME = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' });

export function BackupView({ data }: { data: AppData }) {
  const [busy, setBusy] = useState(false);
  const exportJson = async () => {
    setBusy(true);
    try {
      const now = Date.now();
      const backup = await readBackup(db, now);
      downloadFile(backupFileName(localISODate(new Date(now))), new Blob([serializeBackup(backup)], { type: 'application/json' }));
      await markBackupDone(db, now);
      showToast('Sauvegarde enregistrée dans les téléchargements.');
    } catch (e) {
      showToast(`Sauvegarde impossible : ${e instanceof Error ? e.message : String(e)}`, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const last = data.settings.lastBackupAt;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-ink-2">
        Tes données ne sont que sur ce téléphone. Une sauvegarde contient tout : programme, catalogue, objectifs, séances et séries.
      </p>
      <p className="text-ink-2">
        Dernière sauvegarde : <span className="text-ink">{last ? DATE_TIME.format(last) : 'jamais'}</span>
      </p>
      <Button onClick={() => void exportJson()} disabled={busy}>
        {busy ? 'Export en cours…' : 'Exporter une sauvegarde (.json)'}
      </Button>
    </div>
  );
}
