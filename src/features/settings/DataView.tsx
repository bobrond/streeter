import { useEffect, useState } from 'react';
import { db } from '../../db/db';
import type { AppData } from '../../db/hooks';
import { clearAll } from '../../db/importStore';
import type { ImportReport } from '../../io/xlsx/importWorkbook';
import { ensurePersistentStorage, type PersistState } from '../../lib/storage';
import { Button, FileButton } from '../../ui/Button';
import { XLSX_ACCEPT, useImport } from '../setup/useImport';

const PERSIST_TEXT: Record<PersistState, string> = {
  granted: 'accordé : le navigateur ne supprimera pas tes données.',
  denied: 'pas encore accordé. Chrome l’accorde en général une fois l’appli installée sur l’écran d’accueil.',
  unsupported: 'non pris en charge par ce navigateur.',
};

const DATE_TIME = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' });

export function DataView({
  data,
  onImported,
  onShowReport,
}: {
  data: AppData;
  onImported: (report: ImportReport) => void;
  onShowReport: (report: ImportReport) => void;
}) {
  const [persist, setPersist] = useState<PersistState | null>(null);
  const [confirming, setConfirming] = useState(false);
  const { importing, error, run } = useImport(onImported);

  useEffect(() => {
    void ensurePersistentStorage().then(setPersist);
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-ink-2">
        Stockage persistant : <span className="text-ink">{persist ? PERSIST_TEXT[persist] : '…'}</span>
      </p>
      {data.lastImport && (
        <p className="text-ink-2">
          Dernier import : <span className="text-ink">{data.lastImport.fileName}</span>, le {DATE_TIME.format(data.lastImport.at)}.
        </p>
      )}
      {data.lastImport && (
        <Button variant="secondary" onClick={() => onShowReport(data.lastImport!.report)}>
          Revoir le rapport d’import
        </Button>
      )}
      <p className="text-ink-2">
        Réimporter met à jour le catalogue et les objectifs, ajoute les séances du journal sans doublon, et{' '}
        <span className="font-semibold text-warn">remplace les modèles de séance et la semaine type par ceux du tableur</span> : les modifications du
        programme faites dans l’appli sont alors perdues.
      </p>
      {error && <p className="rounded-xl border border-danger/60 bg-danger/10 p-3 whitespace-pre-line text-danger">{error}</p>}
      <FileButton variant="secondary" accept={XLSX_ACCEPT} onFile={run} disabled={importing}>
        {importing ? 'Import en cours…' : 'Réimporter un tableur'}
      </FileButton>
      {confirming ? (
        <div className="flex flex-col gap-2 rounded-xl border border-danger/60 p-3">
          <p className="text-danger">Effacer toutes les données de l’appli ? C’est définitif.</p>
          <Button
            variant="danger"
            onClick={() => {
              setConfirming(false);
              void clearAll(db);
            }}
          >
            Oui, tout effacer
          </Button>
          <Button variant="secondary" onClick={() => setConfirming(false)}>
            Annuler
          </Button>
        </div>
      ) : (
        <Button variant="danger" onClick={() => setConfirming(true)}>
          Tout effacer
        </Button>
      )}
    </div>
  );
}
