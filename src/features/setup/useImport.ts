import { useCallback, useState } from 'react';
import { db } from '../../db/db';
import { importSpreadsheet } from '../../db/importStore';
import type { ImportReport } from '../../io/xlsx/importWorkbook';

export const XLSX_ACCEPT = '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function useImport(onImported: (report: ImportReport) => void) {
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(
    async (file: File) => {
      setImporting(true);
      setError(null);
      try {
        onImported(await importSpreadsheet(db, file));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setImporting(false);
      }
    },
    [onImported],
  );
  return { importing, error, run };
}
