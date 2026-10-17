// Création et modification d'un exercice en deux niveaux : l'essentiel d'abord (nom, mesure, élément),
// le reste replié (temps par série, catégorie, rapide, actif, notes techniques, autres noms).
import { useState } from 'react';
import { db } from '../../db/db';
import type { AppData } from '../../db/hooks';
import { InUseError, deleteExercise, saveExercise } from '../../db/programStore';
import { exerciseUsage, nameError, nextOrder } from '../../domain/editing';
import { MEASURE_LABEL } from '../../domain/labels';
import { KIND_ORDER } from '../../domain/library';
import { cleanSpaces } from '../../domain/text';
import type { Exercise, ID, Measure } from '../../domain/types';
import { newId } from '../../lib/id';
import { goBack, queryParam } from '../../lib/router';
import { Button } from '../../ui/Button';
import { ChipSelect, Field, ListGroup, TextArea, TextInput, Toggle } from '../../ui/form';
import { ChevronDownIcon } from '../../ui/icons';
import { ValueStepper } from '../../ui/inputs';
import { Screen } from '../../ui/Screen';
import { ConfirmSheet } from '../../ui/Sheet';
import { showToast } from '../../ui/toastStore';

const MEASURES: Measure[] = ['reps', 'seconds', 'combos', 'none'];

interface ExerciseForm {
  name: string;
  measure: Measure;
  elementId: ID | null;
  workSecPerSet: number | null;
  category: string;
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
      <Screen title="Exercice introuvable" onBack={() => goBack('/programs?vue=exercices')}>
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
      : { name: '', measure: 'reps', elementId: initialElement, workSecPerSet: null, category: '', quick: false, active: true, notes: '', aliases: '' },
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const patch = (changes: Partial<ExerciseForm>) => setForm((f) => ({ ...f, ...changes }));
  const error = nameError(form.name, existing?.id ?? '', data.exercises);
  const usage = existing ? exerciseUsage(existing.id, data.templates, data.sets, data.objectives) : null;
  const categories = [...new Set(data.exercises.map((e) => e.category).filter(Boolean))];
  const element = data.elements.find((e) => e.id === form.elementId);
  const elements = [...data.elements].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.order - b.order);
  const back = existing ? `/programs/exercise/${existing.id}` : '/programs?vue=exercices';
  const defaultWork = data.settings.avgWorkSecPerSet;
  // Résumé du niveau 2 replié : ce qui s'écarte des valeurs par défaut.
  const extras = [
    form.workSecPerSet !== null ? `${form.workSecPerSet} s par série` : null,
    form.quick ? 'rapide' : null,
    form.active ? null : 'désactivé',
    form.notes.trim() ? 'notes' : null,
    form.aliases.trim() ? 'autres noms' : null,
  ].filter(Boolean);

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
      workSecPerSet: form.workSecPerSet,
    };
    await saveExercise(db, exercise);
    showToast(existing ? 'Exercice enregistré.' : 'Exercice ajouté à la bibliothèque.');
    goBack(back);
  };

  const remove = async () => {
    if (!existing) return;
    try {
      await deleteExercise(db, existing.id);
      showToast('Exercice supprimé.');
      goBack('/programs?vue=exercices');
    } catch (e) {
      showToast(e instanceof InUseError ? e.message : String(e), { tone: 'error' });
    }
  };

  return (
    <Screen title={existing ? existing.name : 'Nouvel exercice'} onBack={() => goBack(back)} actions={<Button onClick={() => void save()}>Enregistrer</Button>}>
      <ListGroup>
        <div className="flex flex-col gap-4 p-4">
          <Field label="Nom" error={showErrors || form.name ? error : null}>
            <TextInput value={form.name} onChange={(name) => patch({ name })} autoFocus={!existing} placeholder="Tuck planche hold" />
          </Field>
          <Field label="Type de mesure" hint="Ce qu’on saisit à chaque série.">
            <ChipSelect value={form.measure} onChange={(measure) => patch({ measure })} options={MEASURES.map((m) => ({ value: m, label: MEASURE_LABEL[m] }))} />
          </Field>
          <Field label="Élément" hint="Skill, composante ou autre : l’exercice est proposé dans les lignes de cet élément et nourrit son volume.">
            <ChipSelect
              value={form.elementId}
              onChange={(elementId) => patch({ elementId })}
              options={[...elements.map((e) => ({ value: e.id as ID | null, label: e.name })), { value: null as ID | null, label: 'aucun' }]}
            />
          </Field>
        </div>
      </ListGroup>

      <details className="group/more overflow-hidden rounded-2xl border border-line bg-card">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-2 px-4 py-2">
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-semibold">Plus d’options</span>
            <span className="block text-sm text-ink-2">{extras.length > 0 ? extras.join(' · ') : 'Temps par série, catégorie, rapide, notes techniques…'}</span>
          </span>
          <ChevronDownIcon className="size-5 text-ink-2 transition-transform group-open/more:rotate-180" />
        </summary>
        <div className="flex flex-col gap-4 border-t border-line p-4">
          <Field label="Temps par série" hint="Installation comprise ; sert à la durée estimée des séances (le plus court et le plus long des exercices d’une ligne).">
            <ChipSelect
              value={form.workSecPerSet === null ? 'default' : 'own'}
              onChange={(choice) => patch({ workSecPerSet: choice === 'default' ? null : (form.workSecPerSet ?? defaultWork) })}
              options={[
                { value: 'default', label: `Réglage général (${defaultWork} s)` },
                { value: 'own', label: 'Propre à l’exercice' },
              ]}
            />
            {form.workSecPerSet !== null && (
              <ValueStepper size="md" value={form.workSecPerSet} min={5} step={5} unit="s" onChange={(v) => patch({ workSecPerSet: v ?? defaultWork })} />
            )}
          </Field>
          <Field label="Catégorie" hint={`Vide : « ${element?.name ?? 'Autres'} ».`}>
            <TextInput value={form.category} onChange={(category) => patch({ category })} list="exercise-categories" placeholder={element?.name ?? 'Autres'} />
            <datalist id="exercise-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Toggle label="Rapide (matin)" description="Sans barre, peu d’installation : mis en avant le matin." checked={form.quick} onChange={(quick) => patch({ quick })} />
          <Toggle label="Actif" description="Désactivé : n’est plus proposé en séance ; l’historique est gardé." checked={form.active} onChange={(active) => patch({ active })} />
          <Field label="Notes techniques">
            <TextArea value={form.notes} onChange={(notes) => patch({ notes })} rows={3} placeholder="Consignes, critère d’arrêt…" />
          </Field>
          <Field label="Autres noms" hint="Séparés par des virgules : reconnus à l’import du journal.">
            <TextInput value={form.aliases} onChange={(aliases) => patch({ aliases })} />
          </Field>
        </div>
      </details>

      {usage && (
        <p className="text-ink-2">
          Candidat dans {usage.items} ligne{usage.items > 1 ? 's' : ''} ({usage.templates} modèle{usage.templates > 1 ? 's' : ''}) · {usage.sets} série
          {usage.sets > 1 ? 's' : ''} enregistrée{usage.sets > 1 ? 's' : ''}
          {usage.objectives > 0 ? ` · lié à ${usage.objectives} objectif${usage.objectives > 1 ? 's' : ''}` : ''}.
        </p>
      )}
      {existing &&
        (usage && usage.sets > 0 ? (
          <p className="text-sm text-ink-3">Déjà fait en séance : il ne peut pas être supprimé, seulement désactivé (Plus d’options).</p>
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
