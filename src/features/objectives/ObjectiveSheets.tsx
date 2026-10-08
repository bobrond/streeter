import { useState } from 'react';
import { db } from '../../db/db';
import type { AppData } from '../../db/hooks';
import { deleteObjective, deleteTest, saveObjective, saveTest } from '../../db/objectiveStore';
import { localISODate } from '../../domain/cycle';
import { nameError, nextOrder } from '../../domain/editing';
import { UNIT_SHORT } from '../../domain/labels';
import { cleanSpaces } from '../../domain/text';
import type { ID, Objective, ObjectiveTest, TargetUnit } from '../../domain/types';
import { newId } from '../../lib/id';
import { Button } from '../../ui/Button';
import { ChipSelect, Field, TextArea, TextInput } from '../../ui/form';
import { ValueStepper } from '../../ui/inputs';
import { Sheet } from '../../ui/Sheet';
import { showToast } from '../../ui/toastStore';

const UNITS: { value: TargetUnit; label: string }[] = [
  { value: 'seconds', label: 'secondes' },
  { value: 'reps', label: 'reps' },
  { value: 'combos', label: 'combos' },
];

function TestForm({ objective, test, initialValue, onDone }: { objective: Objective; test: ObjectiveTest | null; initialValue: number | null; onDone: () => void }) {
  const [date, setDate] = useState(test?.date ?? localISODate(new Date()));
  const [value, setValue] = useState<number | null>(test?.value ?? initialValue);
  const [note, setNote] = useState(test?.note ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const save = async () => {
    if (value === null || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    await saveTest(db, objective.id, { id: test?.id ?? newId(), date, value, note: note.trim() });
    showToast(value >= objective.target ? 'Test enregistré : objectif atteint !' : 'Test enregistré.');
    onDone();
  };
  return (
    <div className="flex flex-col gap-4">
      <p className="text-ink-2">{objective.criterion}</p>
      <Field label="Résultat">
        <ValueStepper value={value} onChange={setValue} unit={UNIT_SHORT[objective.unit]} />
      </Field>
      <Field label="Date">
        <TextInput type="date" value={date} onChange={setDate} />
      </Field>
      <Field label="Note">
        <TextInput value={note} onChange={setNote} placeholder="Qualité, conditions…" />
      </Field>
      <Button onClick={() => void save()} disabled={value === null}>
        Enregistrer le test
      </Button>
      {test &&
        (confirmDelete ? (
          <Button
            variant="danger"
            onClick={() => {
              void deleteTest(db, objective.id, test.id).then(() => showToast('Test supprimé.'));
              onDone();
            }}
          >
            Confirmer la suppression
          </Button>
        ) : (
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>
            Supprimer ce test
          </Button>
        ))}
    </div>
  );
}

/** Saisie ou correction d'un test d'objectif. */
export function TestSheet({
  objective,
  test,
  initialValue,
  open,
  onClose,
}: {
  objective: Objective;
  test: ObjectiveTest | null;
  initialValue: number | null;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={test ? 'Corriger le test' : `Test · ${objective.name}`}>
      {open && <TestForm key={test?.id ?? 'new'} objective={objective} test={test} initialValue={initialValue} onDone={onClose} />}
    </Sheet>
  );
}

function ObjectiveForm({ data, objective, onDone, onDeleted }: { data: AppData; objective: Objective | null; onDone: (id: ID) => void; onDeleted: () => void }) {
  const [name, setName] = useState(objective?.name ?? '');
  const [criterion, setCriterion] = useState(objective?.criterion ?? '');
  const [target, setTarget] = useState<number | null>(objective?.target ?? 10);
  const [unit, setUnit] = useState<TargetUnit>(objective?.unit ?? 'seconds');
  const [exerciseId, setExerciseId] = useState<ID | null>(objective?.exerciseId ?? null);
  const [tried, setTried] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const error = nameError(name, objective?.id ?? '', data.objectives);
  const exercises = [...data.exercises].filter((e) => e.measure !== 'none').sort((a, b) => a.name.localeCompare(b.name));

  const save = async () => {
    setTried(true);
    if (error || target === null || target <= 0) return;
    const saved: Objective = {
      id: objective?.id ?? newId(),
      name: cleanSpaces(name),
      criterion: criterion.trim(),
      target,
      unit,
      exerciseId,
      order: objective?.order ?? nextOrder(data.objectives),
      tests: objective?.tests ?? [],
    };
    await saveObjective(db, saved);
    onDone(saved.id);
  };

  return (
    <div className="flex flex-col gap-4">
      <Field label="Objectif" error={tried ? error : null}>
        <TextInput value={name} onChange={setName} autoFocus={!objective} placeholder="Planche hold" />
      </Field>
      <Field label="Critère de qualité">
        <TextArea value={criterion} onChange={setCriterion} rows={2} placeholder="Bonne activation du grand dentelé" />
      </Field>
      <Field label="Unité">
        <ChipSelect value={unit} onChange={setUnit} options={UNITS} />
      </Field>
      <Field label="Cible">
        <ValueStepper size="md" value={target} onChange={setTarget} unit={UNIT_SHORT[unit]} min={1} />
      </Field>
      <Field label="Exercice lié" hint="Affiche la meilleure performance en séance (sans élastique, séries propres).">
        <select
          value={exerciseId ?? ''}
          onChange={(e) => setExerciseId(e.target.value || null)}
          className="min-h-14 w-full rounded-2xl border border-line bg-page px-4 text-lg outline-none focus:border-accent"
        >
          <option value="">Aucun</option>
          {exercises.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </Field>
      <Button onClick={() => void save()}>Enregistrer</Button>
      {objective &&
        (confirmDelete ? (
          <Button
            variant="danger"
            onClick={() => {
              onDeleted();
              void deleteObjective(db, objective.id).then(() => showToast('Objectif supprimé.'));
            }}
          >
            Confirmer : supprimer l’objectif et ses {objective.tests.length} tests
          </Button>
        ) : (
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>
            Supprimer l’objectif
          </Button>
        ))}
    </div>
  );
}

/** Création ou modification d'un objectif. */
export function ObjectiveSheet({
  data,
  objective,
  open,
  onClose,
  onSaved,
  onDeleted,
}: {
  data: AppData;
  objective: Objective | null;
  open: boolean;
  onClose: () => void;
  onSaved: (id: ID) => void;
  onDeleted: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={objective ? 'Modifier l’objectif' : 'Nouvel objectif'}>
      {open && <ObjectiveForm key={objective?.id ?? 'new'} data={data} objective={objective} onDone={onSaved} onDeleted={onDeleted} />}
    </Sheet>
  );
}
