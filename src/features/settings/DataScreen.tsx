import { useState } from 'react';
import type { AppData } from '../../db/hooks';
import type { ImportReport } from '../../io/xlsx/importWorkbook';
import { checkForUpdate, isStandalone, useInstallPrompt } from '../../lib/pwa';
import { goBack } from '../../lib/router';
import { Button } from '../../ui/Button';
import { Screen } from '../../ui/Screen';
import { Section } from '../../ui/Section';
import { showToast } from '../../ui/toastStore';
import { BackupView } from './BackupView';
import { DataView } from './DataView';
import { ExportView } from './ExportView';

function AppSection() {
  const install = useInstallPrompt();
  const [standalone] = useState(isStandalone);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-ink-2">
        {standalone
          ? 'L’appli est installée : elle s’ouvre depuis l’écran d’accueil et fonctionne sans réseau.'
          : 'Installe l’appli sur l’écran d’accueil : plein écran, hors ligne, données mieux protégées.'}
      </p>
      {install && <Button onClick={() => void install()}>Installer sur l’écran d’accueil</Button>}
      {!install && !standalone && <p className="text-sm text-ink-3">Dans Chrome : menu ⋮ → « Installer l’application » (ou « Ajouter à l’écran d’accueil »).</p>}
      <Button
        variant="secondary"
        onClick={() =>
          void checkForUpdate().then((ok) => {
            if (!ok) showToast('Vérification impossible pour l’instant (hors ligne ?).');
            else showToast('Vérification faite : une nouvelle version sera proposée si elle existe.');
          })
        }
      >
        Rechercher une mise à jour
      </Button>
      <p className="text-sm text-ink-3">Version {__APP_VERSION__}</p>
    </div>
  );
}

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
    <Screen title="Sauvegarde et données" onBack={() => goBack('/settings')}>
      <Section title="Sauvegarde" defaultOpen>
        <BackupView data={data} />
      </Section>
      <Section title="Export du journal" defaultOpen>
        <ExportView data={data} />
      </Section>
      <Section title="Appli">
        <AppSection />
      </Section>
      <Section title="Tableur et effacement">
        <DataView data={data} onImported={onImported} onShowReport={onShowReport} />
      </Section>
    </Screen>
  );
}
