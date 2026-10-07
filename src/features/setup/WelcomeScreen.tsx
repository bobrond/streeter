import type { ImportReport } from '../../io/xlsx/importWorkbook';
import { FileButton } from '../../ui/Button';
import { Screen } from '../../ui/Screen';
import { XLSX_ACCEPT, useImport } from './useImport';

export function WelcomeScreen({ onImported }: { onImported: (report: ImportReport) => void }) {
  const { importing, error, run } = useImport(onImported);
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
        <p className="mt-3">Tes données restent sur ce téléphone, rien n’est envoyé sur Internet.</p>
      </div>
    </Screen>
  );
}
