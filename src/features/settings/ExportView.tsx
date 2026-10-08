import { useState } from 'react';
import type { AppData } from '../../db/hooks';
import { Button } from '../../ui/Button';
import { exportJournal } from './dataActions';

/** Export du journal aux colonnes de l'onglet Journal du tableur. */
export function ExportView({ data }: { data: AppData }) {
  const [busy, setBusy] = useState(false);
  const run = async (format: 'xlsx' | 'csv') => {
    setBusy(true);
    try {
      await exportJournal(data, format);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <p className="text-ink-2">
        Mêmes colonnes que l’onglet Journal du tableur : une ligne par séance, bloc et exercice ; les séries dégradées sont signalées dans les notes.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" className="text-base" disabled={busy} onClick={() => void run('xlsx')}>
          Excel (.xlsx)
        </Button>
        <Button variant="secondary" className="text-base" disabled={busy} onClick={() => void run('csv')}>
          CSV
        </Button>
      </div>
    </div>
  );
}
