import type { AppData } from '../../db/hooks';
import type { ImportReport } from '../../io/xlsx/importWorkbook';
import { goBack } from '../../lib/router';
import { Screen } from '../../ui/Screen';
import { Section } from '../../ui/Section';
import { BackupView } from './BackupView';
import { DataView } from './DataView';

export function DataScreen({
  data,
  onImported,
  onShowReport,
}: {
  data: AppData;
  onImported: (report: ImportReport) => void;
  onShowReport: (report: ImportReport) => void;
}) {
  return (
    <Screen title="Sauvegarde et tableur" onBack={() => goBack('/settings')}>
      <Section title="Sauvegarde" defaultOpen>
        <BackupView data={data} />
      </Section>
      <Section title="Tableur et données" defaultOpen>
        <DataView data={data} onImported={onImported} onShowReport={onShowReport} />
      </Section>
    </Screen>
  );
}
