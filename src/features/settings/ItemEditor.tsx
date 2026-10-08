import { useState, type ReactNode } from 'react';
import { db } from '../../db/db';
import type { AppData } from '../../db/hooks';
import { useLookups, type Lookups } from '../../db/lookups';
import { saveTemplate } from '../../db/programStore';
import { emptyItemForm, formErrors, formToItem, insertItem, itemToForm, type ItemForm } from '../../domain/editing';
import { formatIntensity, formatRest, formatTarget } from '../../domain/labels';
import { parseIntensity, parseRest, parseTargets } from '../../domain/parse';
import type { PrescriptionItem, SessionTemplate } from '../../domain/types';
import { newId } from '../../lib/id';
import { goBack, queryParam } from '../../lib/router';
import { Button } from '../../ui/Button';
import { ChipSelect, Field, ListGroup, TextArea, TextInput, Toggle } from '../../ui/form';
import { CloseIcon, PlusIcon } from '../../ui/icons';
import { ValueStepper } from '../../ui/inputs';
import { Screen } from '../../ui/Screen';
import { ConfirmSheet } from '../../ui/Sheet';
import { showToast } from '../../ui/toastStore';
import { CandidatesSheet } from './CandidatesSheet';
import { ProgramChecks } from './ProgramChecks';

const TARGET_PRESETS = ['8-15 reps', '3-5 reps', '3-6 s', '8-12 s', '1-3 combos', '8-15 reps ou 15-30 s', '8-12 s ou 3-5 reps'];
const INTENSITY_PRESETS = ['RPE ≤ 5', 'RPE ≤ 6', 'RPE 6-7', 'RPE 8', 'RPE 8-9', '1-2 reps en réserve', '2 reps en réserve'];
const REST_PRESETS = ['Libre', '60 s', '90 s', '2 min', '60-90 s', '90 s-2 min'];

function Presets({ values, onPick }: { values: readonly string[]; onPick: (value: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((value) => (
        <button key={value} type="button" onClick={() => onPick(value)} className="min-h-11 rounded-full border border-line px-3 text-ink-2 active:bg-card-2">
          {value}
        </button>
      ))}
    </div>
  );
}

function Reading({ ok, children }: { ok: boolean; children: ReactNode }) {
  return <div className={`text-sm ${ok ? 'text-ok' : 'text-ink-3'}`}>{children}</div>;
}

export function ItemEditor({ data, templateId, itemId, path }: { data: AppData; templateId: string; itemId: string; path: string }) {
  const lookups = useLookups(data);
  const template = lookups.templates.get(templateId);
  const existing = template?.items.find((i) => i.id === itemId) ?? null;
  if (!template || (itemId !== 'new' && !existing)) {
    return (
      <Screen title="Ligne introuvable" onBack={() => goBack(`/settings/templates/${templateId}`)}>
        <p className="text-ink-2">Cette ligne de prescription n’existe plus.</p>
      </Screen>
    );
  }
  return <ItemFormView template={template} existing={existing} data={data} lookups={lookups} initialBlock={queryParam(path, 'block')} />;
}

function ItemFormView({
  template,
  existing,
  data,
  lookups,
  initialBlock,
}: {
  template: SessionTemplate;
  existing: PrescriptionItem | null;
  data: AppData;
  lookups: Lookups;
  initialBlock: string | null;
}) {
  const [form, setForm] = useState<ItemForm>(() =>
    existing ? itemToForm(existing) : emptyItemForm(initialBlock ?? data.blockTypes.at(-1)?.id ?? '', data.elements.find((e) => e.kind === 'component')?.id ?? ''),
  );
  const [picking, setPicking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const patch = (changes: Partial<ItemForm>) => setForm((f) => ({ ...f, ...changes }));
  const back = () => goBack(`/settings/templates/${template.id}`);

  const errors = formErrors(form);
  const draft = formToItem(existing?.id ?? 'brouillon', form, lookups.exercises);
  const draftItems = existing ? template.items.map((i) => (i.id === existing.id ? draft : i)) : insertItem(template.items, draft, lookups.blocks);
  const draftProgram = { ...lookups.program, templates: new Map(lookups.templates).set(template.id, { ...template, items: draftItems }) };

  const targets = parseTargets(form.targetText);
  const intensity = parseIntensity(form.intensityText);
  const rest = parseRest(form.restText);

  const save = async () => {
    if (errors.length > 0) {
      setShowErrors(true);
      return;
    }
    const item = existing ? draft : { ...draft, id: newId() };
    const items = existing ? template.items.map((i) => (i.id === item.id ? item : i)) : insertItem(template.items, item, lookups.blocks);
    await saveTemplate(db, { ...template, items });
    showToast(existing ? 'Ligne enregistrée.' : 'Ligne ajoutée.');
    back();
  };

  const remove = async () => {
    if (!existing) return;
    await saveTemplate(db, { ...template, items: template.items.filter((i) => i.id !== existing.id) });
    showToast('Ligne supprimée.');
    back();
  };

  return (
    <Screen
      title={existing ? 'Ligne de prescription' : 'Nouvelle ligne'}
      subtitle={template.name}
      onBack={back}
      actions={
        <>
          {showErrors && errors.length > 0 && <p className="font-semibold text-danger">{errors.join(' ')}</p>}
          <Button onClick={() => void save()}>Enregistrer</Button>
        </>
      }
    >
      <ListGroup title="Bloc et élément">
        <div className="flex flex-col gap-4 p-4">
          <Field label="Bloc">
            <ChipSelect value={form.blockTypeId} onChange={(blockTypeId) => patch({ blockTypeId })} options={data.blockTypes.map((b) => ({ value: b.id, label: b.name }))} />
          </Field>
          <Field label="Élément" hint="Planche et Touch FL : skills (alternance, totaux) ; composantes : volume hebdo.">
            <ChipSelect value={form.elementId} onChange={(elementId) => patch({ elementId })} options={data.elements.map((e) => ({ value: e.id, label: e.name }))} />
          </Field>
        </div>
      </ListGroup>

      <ListGroup title="Exercices au choix">
        <div className="flex flex-col gap-3 p-4">
          {form.candidateExerciseIds.length === 0 && <p className="text-ink-2">Aucun exercice pour l’instant : ajoutes-en au moins un.</p>}
          <div className="flex flex-wrap gap-1.5">
            {form.candidateExerciseIds.map((id) => (
              <span key={id} className="flex min-h-11 items-center gap-1 rounded-full border border-line bg-card-2 pr-1 pl-3">
                {lookups.exercises.get(id)?.name ?? '?'}
                <button
                  type="button"
                  aria-label="Retirer"
                  onClick={() => patch({ candidateExerciseIds: form.candidateExerciseIds.filter((x) => x !== id) })}
                  className="flex size-9 items-center justify-center rounded-full text-ink-3 active:bg-line"
                >
                  <CloseIcon className="size-4" />
                </button>
              </span>
            ))}
          </div>
          <Button variant="secondary" onClick={() => setPicking(true)}>
            <PlusIcon className="size-5" /> Choisir les exercices
          </Button>
          <p className="text-sm text-ink-3">Le premier de la liste est proposé la toute première fois ; ensuite, celui fait la dernière fois.</p>
        </div>
      </ListGroup>

      <ListGroup title="Prescription">
        <div className="flex flex-col gap-4 p-4">
          <Field label="Séries min">
            <ValueStepper size="md" value={form.setsMin} min={0} onChange={(v) => patch({ setsMin: v ?? 0, setsMax: Math.max(form.setsMax, v ?? 0) })} unit="séries" />
          </Field>
          <Field label="Séries max">
            <ValueStepper size="md" value={form.setsMax} min={1} onChange={(v) => patch({ setsMax: v ?? 1, setsMin: Math.min(form.setsMin, v ?? 1) })} unit="séries" />
          </Field>
          <Field label="Reps / durée">
            <TextInput value={form.targetText} onChange={(targetText) => patch({ targetText })} placeholder="8-15 reps ou 15-30 s" />
            <Presets values={TARGET_PRESETS} onPick={(targetText) => patch({ targetText })} />
            <Reading ok={targets.length > 0}>{targets.length > 0 ? `Lu : ${targets.map(formatTarget).join(' ou ')}` : 'Texte libre (pas de cible chiffrée).'}</Reading>
          </Field>
          <Field label="RPE / marge">
            <TextInput value={form.intensityText} onChange={(intensityText) => patch({ intensityText })} placeholder="RPE 8-9 ou 1-2 reps en réserve" />
            <Presets values={INTENSITY_PRESETS} onPick={(intensityText) => patch({ intensityText })} />
            <Reading ok={intensity !== null}>{intensity ? `Lu : ${formatIntensity(intensity)}` : 'Texte libre.'}</Reading>
          </Field>
          <Field label="Repos">
            <TextInput value={form.restText} onChange={(restText) => patch({ restText })} placeholder="90 s-2 min" />
            <Presets values={REST_PRESETS} onPick={(restText) => patch({ restText })} />
            <Reading ok>
              Lu : {formatRest(rest.minSec, rest.maxSec)}
              {rest.minSec !== null && rest.minSec !== rest.maxSec ? ' (signal au minimum, fin au maximum)' : ''}
            </Reading>
          </Field>
          <Toggle
            label="Superset"
            description="Alterne série par série avec les lignes voisines du même bloc marquées superset."
            checked={form.superset || rest.superset}
            onChange={(superset) => patch({ superset, restText: superset ? form.restText : form.restText.replace(/superset\s*,?\s*/i, '') })}
          />
          <Toggle label="Ligne optionnelle" description="Ne compte pas dans le minimum garanti du volume." checked={form.optional} onChange={(optional) => patch({ optional })} />
          <Field label="Notes">
            <TextArea value={form.notes} onChange={(notes) => patch({ notes })} rows={2} placeholder="Critère d’arrêt, consignes…" />
          </Field>
        </div>
      </ListGroup>

      <ProgramChecks program={draftProgram} settings={data.settings} lookups={lookups} />

      {existing && (
        <Button variant="danger" onClick={() => setConfirmDelete(true)}>
          Supprimer la ligne
        </Button>
      )}

      <CandidatesSheet
        open={picking}
        onClose={() => setPicking(false)}
        data={data}
        elementId={form.elementId}
        selected={form.candidateExerciseIds}
        onChange={(candidateExerciseIds) => patch({ candidateExerciseIds })}
      />
      <ConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Supprimer cette ligne ?"
        message="Les séances déjà faites gardent leur contenu."
        confirmLabel="Supprimer la ligne"
        danger
        onConfirm={() => void remove()}
      />
    </Screen>
  );
}
