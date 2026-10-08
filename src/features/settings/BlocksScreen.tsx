import { useState } from 'react';
import { db } from '../../db/db';
import type { AppData } from '../../db/hooks';
import { InUseError, deleteBlock, saveBlock, saveOrder } from '../../db/programStore';
import { blockUsage, isUnused, moveInOrder, nameError, nextOrder } from '../../domain/editing';
import { cleanSpaces } from '../../domain/text';
import type { BlockType } from '../../domain/types';
import { newId } from '../../lib/id';
import { goBack } from '../../lib/router';
import { Button } from '../../ui/Button';
import { Field, ListGroup, ReorderRow, TextInput, Toggle } from '../../ui/form';
import { PlusIcon } from '../../ui/icons';
import { Sheet } from '../../ui/Sheet';
import { Screen } from '../../ui/Screen';
import { showToast } from '../../ui/toastStore';

function BlockForm({ data, block, onDone }: { data: AppData; block: BlockType | null; onDone: () => void }) {
  const [name, setName] = useState(block?.name ?? '');
  const [alternateSkills, setAlternate] = useState(block?.alternateSkills ?? false);
  const [reducedInDeload, setReduced] = useState(block?.reducedInDeload ?? true);
  const [tried, setTried] = useState(false);
  const error = nameError(name, block?.id ?? '', data.blockTypes);
  const usage = block ? blockUsage(block.id, data.templates, data.sets) : null;

  const save = async () => {
    setTried(true);
    if (error) return;
    await saveBlock(db, { id: block?.id ?? newId(), name: cleanSpaces(name), order: block?.order ?? nextOrder(data.blockTypes), alternateSkills, reducedInDeload });
    onDone();
  };
  const remove = async () => {
    if (!block) return;
    try {
      await deleteBlock(db, block.id);
      showToast('Bloc supprimé.');
      onDone();
    } catch (e) {
      showToast(e instanceof InUseError ? e.message : String(e), { tone: 'error' });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Field label="Nom" error={tried ? error : null}>
        <TextInput value={name} onChange={setName} autoFocus={!block} />
      </Field>
      <Toggle label="Planche et FL en alternance" description="Les séries des skills alternent, appariées par ordre (1re planche avec 1re FL…)." checked={alternateSkills} onChange={setAlternate} />
      <Toggle label="Réduit en semaine allégée" description="Désactivé pour l’échauffement : ses séries ne sont pas réduites." checked={reducedInDeload} onChange={setReduced} />
      {usage && <p className="text-ink-2">{usage.items} ligne{usage.items > 1 ? 's' : ''} · {usage.sets} série{usage.sets > 1 ? 's' : ''}</p>}
      <Button onClick={() => void save()}>Enregistrer</Button>
      {block && usage && isUnused(usage) && (
        <Button variant="danger" onClick={() => void remove()}>
          Supprimer le bloc
        </Button>
      )}
    </div>
  );
}

export function BlocksScreen({ data }: { data: AppData }) {
  const [editing, setEditing] = useState<BlockType | 'new' | null>(null);
  const move = (id: string, delta: -1 | 1) => void saveOrder(db, 'blockTypes', moveInOrder(data.blockTypes, id, delta));
  return (
    <Screen
      title="Blocs"
      subtitle="Les séances suivent cet ordre de blocs."
      onBack={() => goBack('/settings')}
      actions={
        <Button onClick={() => setEditing('new')}>
          <PlusIcon /> Nouveau bloc
        </Button>
      }
    >
      <ListGroup>
        {data.blockTypes.map((block, i) => (
          <ReorderRow
            key={block.id}
            title={block.name}
            subtitle={[block.alternateSkills && 'alternance planche / FL', !block.reducedInDeload && 'non réduit en semaine allégée'].filter(Boolean).join(' · ') || undefined}
            first={i === 0}
            last={i === data.blockTypes.length - 1}
            onOpen={() => setEditing(block)}
            onMove={(delta) => move(block.id, delta)}
          />
        ))}
      </ListGroup>
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nouveau bloc' : 'Bloc'}>
        {editing !== null && <BlockForm key={editing === 'new' ? 'new' : editing.id} data={data} block={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </Screen>
  );
}
