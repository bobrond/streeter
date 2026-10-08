import { useState } from 'react';
import { db } from '../../db/db';
import type { AppData } from '../../db/hooks';
import { InUseError, deleteBand, saveBand, saveOrder } from '../../db/programStore';
import { BAND_COLORS, bandUsage, isUnused, moveInOrder, nameError, nextOrder } from '../../domain/editing';
import { cleanSpaces } from '../../domain/text';
import type { Band } from '../../domain/types';
import { newId } from '../../lib/id';
import { goBack } from '../../lib/router';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { ColorPicker, Field, ListGroup, ReorderRow, TextInput, Toggle } from '../../ui/form';
import { PlusIcon } from '../../ui/icons';
import { BandSwatch } from '../../ui/inputs';
import { Sheet } from '../../ui/Sheet';
import { Screen } from '../../ui/Screen';
import { showToast } from '../../ui/toastStore';

function BandForm({ data, band, onDone }: { data: AppData; band: Band | null; onDone: () => void }) {
  const [name, setName] = useState(band?.name ?? '');
  const [color, setColor] = useState(band?.color ?? BAND_COLORS[0]);
  const [active, setActive] = useState(band?.active ?? true);
  const [tried, setTried] = useState(false);
  const error = nameError(name, band?.id ?? '', data.bands);
  const usage = band ? bandUsage(band.id, data.sets) : null;

  const save = async () => {
    setTried(true);
    if (error) return;
    await saveBand(db, { id: band?.id ?? newId(), name: cleanSpaces(name), color, active, order: band?.order ?? nextOrder(data.bands) });
    onDone();
  };
  const remove = async () => {
    if (!band) return;
    try {
      await deleteBand(db, band.id);
      showToast('Élastique supprimé.');
      onDone();
    } catch (e) {
      showToast(e instanceof InUseError ? e.message : String(e), { tone: 'error' });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Field label="Nom" error={tried ? error : null}>
        <TextInput value={name} onChange={setName} autoFocus={!band} />
      </Field>
      <Field label="Couleur">
        <ColorPicker colors={BAND_COLORS.includes(color as (typeof BAND_COLORS)[number]) ? BAND_COLORS : [...BAND_COLORS, color]} value={color} onChange={setColor} />
      </Field>
      <Toggle label="Actif" description="Désactivé : n’est plus proposé en séance ; l’historique est gardé." checked={active} onChange={setActive} />
      {usage && <p className="text-ink-2">{usage.sets} série{usage.sets > 1 ? 's' : ''} avec cet élastique</p>}
      <Button onClick={() => void save()}>Enregistrer</Button>
      {band && usage && isUnused(usage) && (
        <Button variant="danger" onClick={() => void remove()}>
          Supprimer l’élastique
        </Button>
      )}
    </div>
  );
}

export function BandsScreen({ data }: { data: AppData }) {
  const [editing, setEditing] = useState<Band | 'new' | null>(null);
  const move = (id: string, delta: -1 | 1) => void saveOrder(db, 'bands', moveInOrder(data.bands, id, delta));
  return (
    <Screen
      title="Élastiques"
      subtitle="Du plus assistant (en haut) au moins assistant ; « sans élastique » vient après le dernier."
      onBack={() => goBack('/settings')}
      actions={
        <Button onClick={() => setEditing('new')}>
          <PlusIcon /> Nouvel élastique
        </Button>
      }
    >
      <ListGroup>
        {data.bands.map((band, i) => (
          <ReorderRow
            key={band.id}
            leading={<BandSwatch band={band} />}
            title={band.name}
            aside={band.active ? undefined : <Badge>désactivé</Badge>}
            first={i === 0}
            last={i === data.bands.length - 1}
            onOpen={() => setEditing(band)}
            onMove={(delta) => move(band.id, delta)}
          />
        ))}
      </ListGroup>
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nouvel élastique' : 'Élastique'}>
        {editing !== null && <BandForm key={editing === 'new' ? 'new' : editing.id} data={data} band={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </Screen>
  );
}
