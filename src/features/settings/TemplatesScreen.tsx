import { db } from '../../db/db';
import type { AppData } from '../../db/hooks';
import { useLookups } from '../../db/lookups';
import { saveTemplate } from '../../db/programStore';
import { estimateDuration } from '../../domain/duration';
import { templateDays, uniqueName } from '../../domain/editing';
import { formatDuration } from '../../domain/labels';
import type { SessionTemplate } from '../../domain/types';
import { newId } from '../../lib/id';
import { goBack, navigate } from '../../lib/router';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { ListGroup, ListRow } from '../../ui/form';
import { PlusIcon } from '../../ui/icons';
import { Screen } from '../../ui/Screen';

async function createTemplate(data: AppData): Promise<void> {
  const type = data.sessionTypes.find((t) => t.moment === 'evening') ?? data.sessionTypes[0];
  const template: SessionTemplate = {
    id: newId(),
    name: uniqueName('Nouveau modèle', data.templates),
    sessionTypeId: type?.id ?? '',
    moment: 'evening',
    optional: false,
    notes: '',
    items: [],
  };
  await saveTemplate(db, template);
  navigate(`/settings/templates/${template.id}`);
}

export function TemplatesScreen({ data }: { data: AppData }) {
  const lookups = useLookups(data);
  const groups = (['evening', 'morning'] as const).map((moment) => ({
    moment,
    templates: data.templates.filter((t) => t.moment === moment).sort((a, b) => a.name.localeCompare(b.name)),
  }));
  return (
    <Screen
      title="Modèles de séance"
      onBack={() => goBack('/settings')}
      actions={
        <Button onClick={() => void createTemplate(data)}>
          <PlusIcon /> Nouveau modèle
        </Button>
      }
    >
      {groups.map(({ moment, templates }) =>
        templates.length === 0 ? null : (
          <ListGroup key={moment} title={moment === 'evening' ? 'Soir' : 'Matin'}>
            {templates.map((template) => {
              const days = templateDays(template.id, data.settings.weekPlan);
              const { minSec, maxSec } = estimateDuration(template, data.settings);
              return (
                <ListRow
                  key={template.id}
                  leading={<span className="size-3.5 shrink-0 rounded-full" style={{ backgroundColor: lookups.sessionTypes.get(template.sessionTypeId)?.color }} aria-hidden />}
                  title={template.name}
                  subtitle={`${days.length > 0 ? days.join(', ') : 'hors semaine type'} · ${template.items.length} lignes · ${formatDuration(minSec)}-${formatDuration(maxSec)}`}
                  aside={template.optional ? <Badge>optionnel</Badge> : undefined}
                  onClick={() => navigate(`/settings/templates/${template.id}`)}
                />
              );
            })}
          </ListGroup>
        ),
      )}
    </Screen>
  );
}
