import { useState } from 'react';
import { db } from '../../db/db';
import type { AppData } from '../../db/hooks';
import { InUseError, deleteSessionType, saveSessionType } from '../../db/programStore';
import { SESSION_TYPE_COLORS, isUnused, nameError, sessionTypeUsage } from '../../domain/editing';
import { MOMENT_LABEL } from '../../domain/labels';
import { cleanSpaces } from '../../domain/text';
import type { Moment, SessionType } from '../../domain/types';
import { newId } from '../../lib/id';
import { goBack } from '../../lib/router';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { ChipSelect, ColorPicker, Field, ListGroup, ListRow, TextArea, TextInput, Toggle } from '../../ui/form';
import { PlusIcon } from '../../ui/icons';
import { Sheet } from '../../ui/Sheet';
import { Screen } from '../../ui/Screen';
import { showToast } from '../../ui/toastStore';

function TypeForm({ data, type, onDone }: { data: AppData; type: SessionType | null; onDone: () => void }) {
  const [name, setName] = useState(type?.name ?? '');
  const [moment, setMoment] = useState<Moment | null>(type?.moment ?? 'evening');
  const [description, setDescription] = useState(type?.description ?? '');
  const [color, setColor] = useState(type?.color ?? SESSION_TYPE_COLORS[0]);
  const [isTestDay, setTestDay] = useState(type?.isTestDay ?? false);
  const [tried, setTried] = useState(false);
  const error = nameError(name, type?.id ?? '', data.sessionTypes);
  const usage = type ? sessionTypeUsage(type.id, data.templates) : null;

  const save = async () => {
    setTried(true);
    if (error) return;
    await saveSessionType(db, { id: type?.id ?? newId(), name: cleanSpaces(name), moment, description: description.trim(), color, isTestDay });
    onDone();
  };
  const remove = async () => {
    if (!type) return;
    try {
      await deleteSessionType(db, type.id);
      showToast('Type supprimé.');
      onDone();
    } catch (e) {
      showToast(e instanceof InUseError ? e.message : String(e), { tone: 'error' });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Field label="Nom" error={tried ? error : null}>
        <TextInput value={name} onChange={setName} autoFocus={!type} />
      </Field>
      <Field label="Moment">
        <ChipSelect
          value={moment}
          onChange={setMoment}
          options={[
            { value: 'evening' as Moment | null, label: 'Soir' },
            { value: 'morning' as Moment | null, label: 'Matin' },
            { value: null as Moment | null, label: 'Indifférent' },
          ]}
        />
      </Field>
      <Field label="Principe">
        <TextArea value={description} onChange={setDescription} rows={2} />
      </Field>
      <Field label="Couleur">
        <ColorPicker colors={SESSION_TYPE_COLORS} value={color} onChange={setColor} />
      </Field>
      <Toggle
        label="Jour de test des objectifs"
        description="Le premier jour de ce type en début de cycle (semaine 5, 9…) rappelle de tester les objectifs."
        checked={isTestDay}
        onChange={setTestDay}
      />
      {usage && <p className="text-ink-2">{usage.templates} modèle{usage.templates > 1 ? 's' : ''} de séance</p>}
      <Button onClick={() => void save()}>Enregistrer</Button>
      {type && usage && isUnused(usage) && (
        <Button variant="danger" onClick={() => void remove()}>
          Supprimer le type
        </Button>
      )}
    </div>
  );
}

export function SessionTypesScreen({ data }: { data: AppData }) {
  const [editing, setEditing] = useState<SessionType | 'new' | null>(null);
  return (
    <Screen
      title="Types de séance"
      onBack={() => goBack('/settings')}
      actions={
        <Button onClick={() => setEditing('new')}>
          <PlusIcon /> Nouveau type
        </Button>
      }
    >
      <ListGroup>
        {data.sessionTypes.map((type) => (
          <ListRow
            key={type.id}
            leading={<span className="size-3.5 shrink-0 rounded-full" style={{ backgroundColor: type.color }} aria-hidden />}
            title={type.name}
            subtitle={[type.moment ? MOMENT_LABEL[type.moment] : null, type.description].filter(Boolean).join(' · ')}
            aside={type.isTestDay ? <Badge tone="warn">test</Badge> : undefined}
            onClick={() => setEditing(type)}
          />
        ))}
      </ListGroup>
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nouveau type' : 'Type de séance'}>
        {editing !== null && <TypeForm key={editing === 'new' ? 'new' : editing.id} data={data} type={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </Screen>
  );
}
