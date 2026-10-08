import { useState } from 'react';
import { db } from '../../db/db';
import type { AppData } from '../../db/hooks';
import { InUseError, deleteElement, saveElement, saveOrder } from '../../db/programStore';
import { elementUsage, isUnused, moveInOrder, nameError, nextOrder } from '../../domain/editing';
import { cleanSpaces } from '../../domain/text';
import type { Element, ElementKind } from '../../domain/types';
import { newId } from '../../lib/id';
import { goBack } from '../../lib/router';
import { Button } from '../../ui/Button';
import { ChipSelect, Field, ListGroup, ReorderRow, TextInput } from '../../ui/form';
import { PlusIcon } from '../../ui/icons';
import { Sheet } from '../../ui/Sheet';
import { Screen } from '../../ui/Screen';
import { showToast } from '../../ui/toastStore';

const KIND_LABEL: Record<ElementKind, string> = { skill: 'Skill', component: 'Composante', other: 'Autre' };
const KIND_HINT: Record<ElementKind, string> = {
  skill: 'Travaillé à chaque soir, en alternance avec les autres skills ; totaux par skill.',
  component: 'Compte dans le volume hebdo des composantes (bornes min / max).',
  other: 'Échauffement, connexion, activation…',
};

function ElementForm({ data, element, onDone }: { data: AppData; element: Element | null; onDone: () => void }) {
  const [name, setName] = useState(element?.name ?? '');
  const [kind, setKind] = useState<ElementKind>(element?.kind ?? 'component');
  const [tried, setTried] = useState(false);
  const error = nameError(name, element?.id ?? '', data.elements);
  const usage = element ? elementUsage(element.id, data.templates, data.sets, data.exercises) : null;

  const save = async () => {
    setTried(true);
    if (error) return;
    await saveElement(db, { id: element?.id ?? newId(), name: cleanSpaces(name), kind, order: element?.order ?? nextOrder(data.elements) });
    onDone();
  };
  const remove = async () => {
    if (!element) return;
    try {
      await deleteElement(db, element.id);
      showToast('Élément supprimé.');
      onDone();
    } catch (e) {
      showToast(e instanceof InUseError ? e.message : String(e), { tone: 'error' });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Field label="Nom" error={tried ? error : null}>
        <TextInput value={name} onChange={setName} autoFocus={!element} />
      </Field>
      <Field label="Nature" hint={KIND_HINT[kind]}>
        <ChipSelect value={kind} onChange={setKind} options={(['skill', 'component', 'other'] as const).map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
      </Field>
      {usage && (
        <p className="text-ink-2">
          {usage.items} ligne{usage.items > 1 ? 's' : ''} · {usage.exercises} exercice{usage.exercises > 1 ? 's' : ''} · {usage.sets} série{usage.sets > 1 ? 's' : ''}
        </p>
      )}
      <Button onClick={() => void save()}>Enregistrer</Button>
      {element && usage && isUnused(usage) && (
        <Button variant="danger" onClick={() => void remove()}>
          Supprimer l’élément
        </Button>
      )}
    </div>
  );
}

export function ElementsScreen({ data }: { data: AppData }) {
  const [editing, setEditing] = useState<Element | 'new' | null>(null);
  const move = (id: string, delta: -1 | 1) => void saveOrder(db, 'elements', moveInOrder(data.elements, id, delta));
  return (
    <Screen
      title="Éléments"
      subtitle="Ce que travaille une ligne : skills, composantes de renfo, autres."
      onBack={() => goBack('/settings')}
      actions={
        <Button onClick={() => setEditing('new')}>
          <PlusIcon /> Nouvel élément
        </Button>
      }
    >
      <ListGroup>
        {data.elements.map((element, i) => (
          <ReorderRow
            key={element.id}
            title={element.name}
            subtitle={KIND_LABEL[element.kind]}
            first={i === 0}
            last={i === data.elements.length - 1}
            onOpen={() => setEditing(element)}
            onMove={(delta) => move(element.id, delta)}
          />
        ))}
      </ListGroup>
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nouvel élément' : 'Élément'}>
        {editing !== null && <ElementForm key={editing === 'new' ? 'new' : editing.id} data={data} element={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </Screen>
  );
}
