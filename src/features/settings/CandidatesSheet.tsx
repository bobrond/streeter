import { useState } from 'react';
import { db } from '../../db/db';
import type { AppData } from '../../db/hooks';
import { saveExercise } from '../../db/programStore';
import { nameError, nextOrder } from '../../domain/editing';
import { MEASURE_LABEL } from '../../domain/labels';
import { fold } from '../../domain/text';
import type { Exercise, ID, Measure } from '../../domain/types';
import { newId } from '../../lib/id';
import { Button } from '../../ui/Button';
import { ChipSelect, Field, TextInput } from '../../ui/form';
import { CheckIcon } from '../../ui/icons';
import { Sheet } from '../../ui/Sheet';

const MEASURES: Measure[] = ['reps', 'seconds', 'combos', 'none'];

function ExerciseToggle({ exercise, index, onToggle }: { exercise: Exercise; index: number; onToggle: () => void }) {
  const selected = index >= 0;
  return (
    <button type="button" onClick={onToggle} aria-pressed={selected} className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 py-2 text-left active:bg-card-2">
      <span
        className={`flex size-8 shrink-0 items-center justify-center rounded-lg border-2 text-sm font-bold ${selected ? 'border-accent bg-accent text-accent-ink' : 'border-line text-transparent'}`}
        aria-hidden
      >
        {selected ? index + 1 : <CheckIcon className="size-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg">
          {exercise.name}
          {exercise.quick && <span className="text-accent"> ⚡</span>}
        </span>
        <span className="block text-sm text-ink-3">
          {exercise.category} · {MEASURE_LABEL[exercise.measure]}
          {!exercise.active && ' · désactivé'}
        </span>
      </span>
    </button>
  );
}

/** Choix des exercices candidats d'une ligne : ceux de l'élément d'abord, recherche, création rapide. */
export function CandidatesSheet({
  open,
  onClose,
  data,
  elementId,
  selected,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  data: AppData;
  elementId: ID;
  selected: readonly ID[];
  onChange: (ids: ID[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [newName, setNewName] = useState('');
  const [newMeasure, setNewMeasure] = useState<Measure>('reps');
  const element = data.elements.find((e) => e.id === elementId);
  const q = fold(query);
  const visible = (e: Exercise) => (e.active || selected.includes(e.id)) && (!q || fold(`${e.name} ${e.category}`).includes(q));
  const ofElement = data.exercises.filter((e) => e.elementId === elementId && visible(e));
  const others = data.exercises.filter((e) => e.elementId !== elementId && visible(e));
  const toggle = (id: ID) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const createError = newName.trim() ? nameError(newName, '', data.exercises) : null;

  const create = async () => {
    if (!newName.trim() || createError) return;
    const exercise: Exercise = {
      id: newId(),
      name: newName.trim(),
      category: element?.name ?? 'Autres',
      elementId: elementId || null,
      measure: newMeasure,
      quick: false,
      active: true,
      notes: '',
      aliases: [],
      order: nextOrder(data.exercises),
    };
    await saveExercise(db, exercise);
    onChange([...selected, exercise.id]);
    setNewName('');
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Exercices au choix"
      footer={<Button onClick={onClose}>Valider ({selected.length})</Button>}
    >
      <div className="flex flex-col gap-3">
        <TextInput value={query} onChange={setQuery} placeholder="Rechercher un exercice" />
        <section>
          <h3 className="mb-1 text-sm font-bold tracking-wide text-ink-3 uppercase">{element ? `Exercices de l’élément ${element.name}` : 'Exercices'}</h3>
          {ofElement.length === 0 && <p className="px-3 text-ink-2">Aucun.</p>}
          {ofElement.map((e) => (
            <ExerciseToggle key={e.id} exercise={e} index={selected.indexOf(e.id)} onToggle={() => toggle(e.id)} />
          ))}
        </section>
        <details open={q !== '' || others.some((e) => selected.includes(e.id))} className="group/others">
          <summary className="flex min-h-12 cursor-pointer list-none items-center text-sm font-bold tracking-wide text-ink-3 uppercase">
            Autres exercices du catalogue ({others.length})
          </summary>
          {others.map((e) => (
            <ExerciseToggle key={e.id} exercise={e} index={selected.indexOf(e.id)} onToggle={() => toggle(e.id)} />
          ))}
        </details>
        <section className="flex flex-col gap-2 rounded-2xl border border-dashed border-line p-3">
          <Field label="Nouvel exercice" error={createError} hint={`Ajouté au catalogue (élément ${element?.name ?? '—'}) et à la ligne.`}>
            <TextInput value={newName} onChange={setNewName} placeholder="Nom de l’exercice" />
          </Field>
          <ChipSelect value={newMeasure} onChange={setNewMeasure} options={MEASURES.map((m) => ({ value: m, label: MEASURE_LABEL[m] }))} />
          <Button variant="secondary" disabled={!newName.trim() || createError !== null} onClick={() => void create()}>
            Créer et ajouter
          </Button>
        </section>
      </div>
    </Sheet>
  );
}
