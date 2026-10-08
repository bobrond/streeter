import { useState } from 'react';
import { backupSummary, type Backup } from '../../io/json/backup';
import type { ImportReport } from '../../io/xlsx/importWorkbook';
import { navigate } from '../../lib/router';
import { FileButton } from '../../ui/Button';
import { Screen } from '../../ui/Screen';
import { ConfirmSheet } from '../../ui/Sheet';
import { showToast } from '../../ui/toastStore';
import { readBackupFile, restoreFromBackup } from '../settings/dataActions';
import { XLSX_ACCEPT, useImport } from './useImport';

const DATE_TIME = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' });

export function WelcomeScreen({ onImported }: { onImported: (report: ImportReport) => void }) {
  const { importing, error, run } = useImport(onImported);
  const [pending, setPending] = useState<Backup | null>(null);
  const summary = pending ? backupSummary(pending) : null;
  const open = async (file: File) => {
    try {
      setPending(await readBackupFile(file));
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), { tone: 'error' });
    }
  };
  return (
    <Screen
      title="Streeter"
      subtitle="Programmation et suivi : planche et touch front lever"
      actions={
        <>
          {error && <p className="rounded-xl border border-danger/60 bg-danger/10 p-3 whitespace-pre-line text-danger">{error}</p>}
          <FileButton accept={XLSX_ACCEPT} onFile={run} disabled={importing}>
            {importing ? 'Import en cours…' : 'Importer mon tableur (.xlsx)'}
          </FileButton>
          <FileButton variant="secondary" accept=".json,application/json" onFile={(file) => void open(file)} disabled={importing}>
            Restaurer une sauvegarde (.json)
          </FileButton>
        </>
      }
    >
      <div className="rounded-2xl border border-line bg-card p-4 text-lg leading-relaxed text-ink-2">
        <p>
          Pour commencer, importe ton tableur <span className="font-semibold text-ink">programme_planche_touch_fl.xlsx</span>. L’appli
          en reprend :
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-6">
          <li>la semaine type et ses séances ;</li>
          <li>le catalogue d’exercices ;</li>
          <li>les objectifs ;</li>
          <li>les séances déjà notées dans le journal.</li>
        </ul>
        <p className="mt-3">
          Tu changes de téléphone ? Restaure plutôt la dernière sauvegarde de l’appli (fichier <span className="text-ink">streeter-sauvegarde-….json</span>).
        </p>
        <p className="mt-3">Tes données restent sur ce téléphone, rien n’est envoyé sur Internet.</p>
      </div>
      <ConfirmSheet
        open={pending !== null}
        onClose={() => setPending(null)}
        title="Restaurer cette sauvegarde ?"
        message={
          summary &&
          `Sauvegarde du ${summary.exportedAt ? DATE_TIME.format(summary.exportedAt) : '?'} : ${summary.sessions} séances, ${summary.sets} séries, ${summary.exercises} exercices, ${summary.templates} modèles, ${summary.objectives} objectifs.`
        }
        confirmLabel="Restaurer"
        onConfirm={() => {
          if (pending) void restoreFromBackup(pending).then(() => navigate('/', { replace: true }));
          setPending(null);
        }}
      />
    </Screen>
  );
}
