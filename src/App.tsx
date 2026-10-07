import { useState } from 'react';
import { useAppData } from './db/hooks';
import { ImportReportScreen } from './features/setup/ImportReportView';
import { WelcomeScreen } from './features/setup/WelcomeScreen';
import { VerifyScreen } from './features/verify/VerifyScreen';
import type { ImportReport } from './io/xlsx/importWorkbook';

export default function App() {
  const data = useAppData();
  const [report, setReport] = useState<ImportReport | null>(null);

  if (data === undefined) return null;
  if (report) return <ImportReportScreen report={report} onDone={() => setReport(null)} />;
  if (data === null) return <WelcomeScreen onImported={setReport} />;
  return <VerifyScreen data={data} onImported={setReport} onShowReport={setReport} />;
}
