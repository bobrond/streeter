import { useState } from 'react';
import { db } from '../../db/db';
import type { AppData } from '../../db/hooks';
import { InUseError, deleteExercise, saveExercise } from '../../db/programStore';
import { exerciseUsage, nameError, nextOrder } from '../../domain/editing';
import { MEASURE_LABEL } from '../../domain/labels';
import { cleanSpaces } from '../../domain/text';
import type { Exercise, ID, Measure } from '../../domain/types';
import { newId } from '../../lib/id';
import { goBack, queryParam } from '../../lib/router';
import { Button } from '../../ui/Button';
import { ChipSelect, Field, ListGroup, TextArea, TextInput, Toggle } from '../../ui/form';
import { Screen } from '../../ui/Screen';
import { ConfirmSheet } from '../../ui/Sheet';
import { showToast } from '../../ui/toastStore';

const MEASURES: Measure[] = ['reps', 'seconds', 'combos', 'none'];

interface ExerciseForm {
  name: string;
  category: string;
  elementId: ID | null;
  measure: Measure;
  quick: boolean;
  active: boolean;
  notes: string;
  aliases: string;
}

function toForm(exercise: Exercise): ExerciseForm {
  return { ...exercise, aliases: exercise.aliases.join(', ') };
}

export function ExerciseEditor({ data, exerciseId, path }: { data: AppData; exerciseId: string; path: string }) {
  const existing = data.exercises.find((e) => e.id === exerciseId) ?? null;
  if (exerciseId !== 'new' && !existing) {
    return (
      <Screen title="Exercice introuvable" onBack={() => goBack('/settings/exercises')}>
        <p className="text-ink-2">Cet exercice n’existe plus.</p>
      </Screen>
    );
  }
  return <ExerciseFormView data={data} existing={existing} initialElement={queryParam(path, 'element')} />;
}

function ExerciseFormView({ data, existing, initialElement }: { data: AppData; existing: Exercise | null; initialElement: string | null }) {
  const [form, setForm] = useState<ExerciseForm>(() =>
    existing
      ? toForm(existing)
      : { name: '', category: '', elementId: initialElement, measure: 'reps', quick: false, active: true, notes: '', aliases: '' },
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const patch = (changes: Partial<ExerciseForm>) => setForm((f) => ({ ...f, ...changes }));
  const error = nameError(form.name, existing?.id ?? '', data.exercises);
  const usage = existing ? exerciseUsage(existing.id, data.templates, data.sets, data.objectives) : null;
  const categories = [...new Set(data.exercises.map((e) => e.category).filter(Boolean))];
  const element = data.elements.find((e) => e.id === form.elementId);

  const save = async () => {
    if (error) {
      setShowErrors(true);
      return;
    }
    const exercise: Exercise = {
      id: existing?.id ?? newId(),
      name: cleanSpaces(form.name),
      category: cleanSpaces(form.category) || element?.name || 'Autres',
      elementId: form.elementId,
      measure: form.measure,
      quick: form.quick,
      active: form.active,
      notes: form.notes.trim(),
      aliases: form.aliases
        .split(',')
        .map(cleanSpaces)
        .filter(Boolean),
      order: existing?.order ?? nextOrder(data.exercises),
    };
    await saveExercise(db, exercise);
    showToast(existing ? 'Exercice enregistré.' : 'Exercice ajouté au catalogue.');
    goBack('/settings/exercises');
  };

  const remove = async () => {
    if (!existing) return;
    try {
      await deleteExercise(db, existing.id);
      showToast('Exercice supprimé.');
      goBack('/settings/exercises');
    } catch (e) {
      showToast(e instanceof InUseError ? e.message : String(e), { tone: 'error' });
    }
  };

  return (
    <Screen
      title={existing ? existing.name : 'Nouvel exercice'}
      onBack={() => goBack('/settings/exercises')}
      actions={<Button onClick={() => void save()}>Enregistrer</Button>}
    >
      <ListGroup>
        <div className="flex flex-col gap-4 p-4">
          <Field label="Nom" error={showErrors || form.name ? error : null}>
            <TextInput value={form.name} onChange={(name) => patch({ name })} autoFocus={!existing} />
          </Field>
          <Field label="Élément travaillé" hint="Sert à proposer l’exercice dans les lignes de cet élément.">
            <ChipSelect
              value={form.elementId}
              onChange={(elementId) => patch({ elementId })}
              options={[{ value: null as ID | null, label: 'aucun' }, ...data.elements.map((e) => ({ value: e.id as ID | null, label: e.name }))]}
            />
          </Field>
          <Field label="Catégorie" hint={`Vide : « ${element?.name ?? 'Autres'} ».`}>
            <TextInput value={form.category} onChange={(category) => patch({ category })} list="exercise-categories" placeholder={element?.name ?? 'Autres'} />
            <datalist id="exercise-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Mesure">
            <ChipSelect value={form.measure} onChange={(measure) => patch({ measure })} options={MEASURES.map((m) => ({ value: m, label: MEASURE_LABEL[m] }))} />
          </Field>
          <Toggle label="Rapide (matin)" description="Sans barre, peu d’installation : mis en avant le matin." checked={form.quick} onChange={(quick) => patch({ quick })} />
          <Toggle
            label="Actif"
            description="Désactivé : n’est plus proposé en séance ; l’historique est gardé."
            checked={form.active}
            onChange={(active) => patch({ active })}
          />
          <Field label="Notes">
            <TextArea value={form.notes} onChange={(notes) => patch({ notes })} rows={2} />
          </Field>
          <Field label="Autres noms" hint="Séparés par des virgules : reconnus à l’import du journal.">
            <TextInput value={form.aliases} onChange={(aliases) => patch({ aliases })} />
          </Field>
        </div>
      </ListGroup>

      {usage && (
        <p className="text-ink-2">
          Candidat dans {usage.items} ligne{usage.items > 1 ? 's' : ''} ({usage.templates} modèle{usage.templates > 1 ? 's' : ''}) · {usage.sets} série
          {usage.sets > 1 ? 's' : ''} enregistrée{usage.sets > 1 ? 's' : ''}
          {usage.objectives > 0 ? ` · lié à ${usage.objectives} objectif${usage.objectives > 1 ? 's' : ''}` : ''}.
        </p>
      )}
      {existing &&
        (usage && usage.sets > 0 ? (
          <p className="text-sm text-ink-3">Déjà fait en séance : il ne peut pas être supprimé, seulement désactivé.</p>
        ) : (
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>
            Supprimer l’exercice
          </Button>
        ))}

      <ConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Supprimer cet exercice ?"
        message="Il sera retiré des exercices au choix des lignes et des objectifs liés."
        confirmLabel="Supprimer"
        danger
        onConfirm={() => void remove()}
      />
    </Screen>
  );
}
