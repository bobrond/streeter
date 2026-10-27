import { useEffect } from 'react';
import type { AppData } from '../../db/hooks';
import { localISODate } from '../../domain/cycle';
import { formatDateShort } from '../../domain/labels';
import type { ImportReport } from '../../io/xlsx/importWorkbook';
import { goBack, navigate, queryParam } from '../../lib/router';
import { ListGroup, ListRow } from '../../ui/form';
import { Screen } from '../../ui/Screen';
import { BandsScreen } from './BandsScreen';
import { BlocksScreen } from './BlocksScreen';
import { CycleScreen } from './CycleScreen';
import { DataScreen } from './DataScreen';
import { ElementsScreen } from './ElementsScreen';
import { SessionTypesScreen } from './SessionTypesScreen';

const WEEKDAY = new Intl.DateTimeFormat('fr-FR', { weekday: 'long' });

/** Réglages, derrière la roue crantée de Programmes (semaine type, modèles et exercices sont dans Programmes). */
function SettingsMenu({ data }: { data: AppData }) {
  const { settings } = data;
  const lastBackup = settings.lastBackupAt;
  return (
    <Screen title="Réglages" onBack={() => goBack('/programs')}>
      <ListGroup title="Programme">
        <ListRow title="Blocs" subtitle="Ordre des blocs, alternance, semaine allégée" aside={<Count n={data.blockTypes.length} />} onClick={() => navigate('/settings/blocks')} />
        <ListRow title="Types de séance" subtitle="Max, Combo, Technique…" aside={<Count n={data.sessionTypes.length} />} onClick={() => navigate('/settings/types')} />
      </ListGroup>
      <ListGroup title="Catalogue">
        <ListRow title="Éléments" subtitle="Skills, composantes, autres" aside={<Count n={data.elements.length} />} onClick={() => navigate('/settings/elements')} />
        <ListRow title="Élastiques" subtitle={data.bands.map((b) => b.name).join(' → ')} onClick={() => navigate('/settings/bands')} />
      </ListGroup>
      <ListGroup title="Paramètres">
        <ListRow
          title="Cycle, volume et durées"
          subtitle={`J1 = ${WEEKDAY.format(new Date(`${settings.cycleStartDate}T12:00:00`))} · cycle de ${settings.cycleLengthWeeks} semaines · volume ${settings.volumeMin}-${settings.volumeMax}`}
          onClick={() => navigate('/settings/cycle')}
        />
      </ListGroup>
      <ListGroup title="Données">
        <ListRow
          title="Sauvegarde et données"
          subtitle={lastBackup ? `Dernière sauvegarde le ${formatDateShort(localISODate(new Date(lastBackup)))}` : 'Aucune sauvegarde pour l’instant'}
          onClick={() => navigate('/settings/data')}
        />
      </ListGroup>
    </Screen>
  );
}

/** Anciennes adresses (avant la phase D, le programme et les exercices étaient dans les Réglages). */
function Redirect({ to }: { to: string }) {
  useEffect(() => navigate(to, { replace: true }), [to]);
  return null;
}

function Count({ n }: { n: number }) {
  return <span className="text-lg text-ink-2 tabular-nums">{n}</span>;
}

/** Réglages et leurs sous-écrans : #/settings/<section>/<id>… */
export function SettingsScreen({
  data,
  path,
  onImported,
  onShowReport,
}: {
  data: AppData;
  path: string;
  onImported: (report: ImportReport) => void;
  onShowReport: (report: ImportReport) => void;
}) {
  const parts = path.split('?')[0].split('/').filter(Boolean).slice(1);
  switch (parts[0]) {
    case 'week':
      return <Redirect to="/programs/week" />;
    case 'templates':
      return <Redirect to={parts[1] ? `/programs/template/${parts[1]}` : '/programs'} />;
    case 'exercises':
      return <Redirect to={parts[1] === 'new' ? '/programs/exercise/new' : parts[1] ? `/programs/exercise/${parts[1]}/edit` : '/programs?vue=exercices'} />;
    case 'elements':
      return <ElementsScreen data={data} />;
    case 'blocks':
      return <BlocksScreen data={data} />;
    case 'types':
      return <SessionTypesScreen data={data} />;
    case 'bands':
      return <BandsScreen data={data} />;
    case 'cycle':
      return <CycleScreen data={data} programId={queryParam(path, 'programme')} />;
    case 'data':
      return <DataScreen data={data} onImported={onImported} onShowReport={onShowReport} />;
    default:
      return <SettingsMenu data={data} />;
  }
}
