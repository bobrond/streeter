import type { AppData } from '../../db/hooks';
import type { ImportReport } from '../../io/xlsx/importWorkbook';
import { Badge } from '../../ui/Badge';
import { Screen } from '../../ui/Screen';
import { Section } from '../../ui/Section';
import { BackupView } from './BackupView';
import { CatalogueView } from './CatalogueView';
import { DataView } from './DataView';

export function SettingsScreen({
  data,
  onImported,
  onShowReport,
}: {
  data: AppData;
  onImported: (report: ImportReport) => void;
  onShowReport: (report: ImportReport) => void;
}) {
  return (
    <Screen title="Réglages">
      <Section title="Sauvegarde" defaultOpen>
        <BackupView data={data} />
      </Section>
      <Section title="Catalogue" aside={<Badge>{data.exercises.length}</Badge>}>
        <CatalogueView exercises={data.exercises} />
      </Section>
      <Section title="Tableur et données">
        <DataView data={data} onImported={onImported} onShowReport={onShowReport} />
      </Section>
    </Screen>
  );
}
