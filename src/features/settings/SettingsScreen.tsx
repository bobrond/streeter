import type { AppData } from '../../db/hooks';
import { useLookups } from '../../db/lookups';
import { localISODate } from '../../domain/cycle';
import { formatDateShort } from '../../domain/labels';
import type { ImportReport } from '../../io/xlsx/importWorkbook';
import { navigate } from '../../lib/router';
import { ListGroup, ListRow } from '../../ui/form';
import { Screen } from '../../ui/Screen';
import { BandsScreen } from './BandsScreen';
import { BlocksScreen } from './BlocksScreen';
import { CycleScreen } from './CycleScreen';
import { DataScreen } from './DataScreen';
import { ElementsScreen } from './ElementsScreen';
import { ExerciseEditor } from './ExerciseEditor';
import { ExercisesScreen } from './ExercisesScreen';
import { ItemEditor } from './ItemEditor';
import { ProgramChecks } from './ProgramChecks';
import { SessionTypesScreen } from './SessionTypesScreen';
import { TemplateEditor } from './TemplateEditor';
import { TemplatesScreen } from './TemplatesScreen';
import { WeekPlanEditor } from './WeekPlanEditor';

const WEEKDAY = new Intl.DateTimeFormat('fr-FR', { weekday: 'long' });

function SettingsMenu({ data }: { data: AppData }) {
  const lookups = useLookups(data);
  const { settings } = data;
  const lastBackup = settings.lastBackupAt;
  return (
    <Screen title="Réglages">
      <ProgramChecks program={lookups.program} settings={settings} lookups={lookups} compact />
      <ListGroup title="Programme">
        <ListRow title="Semaine type" subtitle="Séance du matin et du soir, J1 à J7" onClick={() => navigate('/settings/week')} />
        <ListRow title="Modèles de séance" subtitle="Lignes de prescription, exercices candidats" aside={<Count n={data.templates.length} />} onClick={() => navigate('/settings/templates')} />
        <ListRow title="Blocs" subtitle="Ordre des blocs, alternance, semaine allégée" aside={<Count n={data.blockTypes.length} />} onClick={() => navigate('/settings/blocks')} />
        <ListRow title="Types de séance" subtitle="Max, Combo, Technique…" aside={<Count n={data.sessionTypes.length} />} onClick={() => navigate('/settings/types')} />
      </ListGroup>
      <ListGroup title="Catalogue">
        <ListRow title="Exercices" aside={<Count n={data.exercises.length} />} onClick={() => navigate('/settings/exercises')} />
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
      return <WeekPlanEditor data={data} />;
    case 'templates':
      if (parts[1] && parts[2] === 'items' && parts[3]) return <ItemEditor key={`${parts[1]}-${parts[3]}`} data={data} templateId={parts[1]} itemId={parts[3]} path={path} />;
      if (parts[1]) return <TemplateEditor key={parts[1]} data={data} templateId={parts[1]} />;
      return <TemplatesScreen data={data} />;
    case 'exercises':
      if (parts[1]) return <ExerciseEditor key={parts[1]} data={data} exerciseId={parts[1]} path={path} />;
      return <ExercisesScreen data={data} />;
    case 'elements':
      return <ElementsScreen data={data} />;
    case 'blocks':
      return <BlocksScreen data={data} />;
    case 'types':
      return <SessionTypesScreen data={data} />;
    case 'bands':
      return <BandsScreen data={data} />;
    case 'cycle':
      return <CycleScreen data={data} />;
    case 'data':
      return <DataScreen data={data} onImported={onImported} onShowReport={onShowReport} />;
    default:
      return <SettingsMenu data={data} />;
  }
}
