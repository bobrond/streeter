// Édition d'une ligne de prescription, comme le pavé de la séance : toucher une cellule de la carte (séries, cible,
// intensité, repos, note) ouvre ce seul champ ; « Toute la ligne » ou une nouvelle ligne montrent tous les champs.
// Les textes sont lus comme à l'import ; les contrôles du programme suivent la saisie avant l'enregistrement.
import { useState, type ReactNode } from 'react';
import { db } from '../../db/db';
import type { AppData } from '../../db/hooks';
import type { Lookups } from '../../db/lookups';
import { saveTemplate } from '../../db/programStore';
import { emptyItemForm, formErrors, formToItem, insertItem, itemToForm, type ItemForm } from '../../domain/editing';
import { formatIntensity, formatRest, formatTarget } from '../../domain/labels';
import { KIND_ORDER } from '../../domain/library';
import { parseIntensity, parseRest, parseTargets } from '../../domain/parse';
import type { ID, SessionTemplate } from '../../domain/types';
import { newId } from '../../lib/id';
import { Button } from '../../ui/Button';
import { ChipSelect, Field, TextArea, TextInput, Toggle } from '../../ui/form';
import { CloseIcon, NextIcon, PlusIcon } from '../../ui/icons';
import { ValueStepper } from '../../ui/inputs';
import { Sheet } from '../../ui/Sheet';
import { showToast } from '../../ui/toastStore';
import { CandidatesSheet } from './CandidatesSheet';
import { ProgramChecks } from './ProgramChecks';
import { programContext } from './programContext';

export type ItemField = 'all' | 'sets' | 'target' | 'intensity' | 'rest' | 'notes';

export interface ItemSheetTarget {
  /** `null` : nouvelle ligne. */
  itemId: ID | null;
  field: ItemField;
  /** Bloc d'une nouvelle ligne. */
  blockTypeId?: ID;
}

const FIELD_TITLE: Record<Exclude<ItemField, 'all'>, string> = {
  sets: 'Séries',
  target: 'Reps / durée',
  intensity: 'RPE / marge',
  rest: 'Repos',
  notes: 'Note',
};

const TARGET_PRESETS = ['8-15 reps', '3-5 reps', '10-15 reps', '3-6 s', '8-12 s', '20-30 s', '1-3 combos', '8-12 s ou 3-5 reps'];
const INTENSITY_PRESETS = ['RPE ≤ 5', 'RPE ≤ 6', 'RPE 6-7', 'RPE 8', 'RPE 8-9', '1-2 reps en réserve', '2 reps en réserve'];
const REST_PRESETS = ['Libre', '30 s', '60 s', '90 s', '2 min', '60-90 s', '90 s-2 min'];

function Presets({ values, current, onPick }: { values: readonly string[]; current: string; onPick: (value: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={value === current.trim()}
          onClick={() => onPick(value)}
          className={`min-h-11 rounded-full border px-3 ${value === current.trim() ? 'border-ink bg-ink font-semibold text-page' : 'border-line text-ink-2 active:bg-card-2'}`}
        >
          {value}
        </button>
      ))}
    </div>
  );
}

function Reading({ ok, children }: { ok: boolean; children: ReactNode }) {
  return <div className={`text-sm ${ok ? 'text-ok' : 'text-ink-3'}`}>{children}</div>;
}

export function ItemSheet({
  target,
  template,
  data,
  lookups,
  onClose,
}: {
  target: ItemSheetTarget | null;
  template: SessionTemplate;
  data: AppData;
  lookups: Lookups;
  onClose: () => void;
}) {
  if (!target) return null;
  return <ItemSheetForm key={`${target.itemId}-${target.field}`} target={target} template={template} data={data} lookups={lookups} onClose={onClose} />;
}

function ItemSheetForm({ target, template, data, lookups, onClose }: { target: ItemSheetTarget; template: SessionTemplate; data: AppData; lookups: Lookups; onClose: () => void }) {
  const existing = target.itemId ? (template.items.find((i) => i.id === target.itemId) ?? null) : null;
  const [field, setField] = useState<ItemField>(existing ? target.field : 'all');
  const [form, setForm] = useState<ItemForm>(() => {
    if (existing) return itemToForm(existing);
    const blockTypeId = target.blockTypeId ?? data.blockTypes.at(-1)?.id ?? '';
    const kind = lookups.blocks.get(blockTypeId)?.alternateSkills ? 'skill' : 'component';
    return emptyItemForm(blockTypeId, data.elements.find((e) => e.kind === kind)?.id ?? data.elements[0]?.id ?? '');
  });
  const [picking, setPicking] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const patch = (changes: Partial<ItemForm>) => setForm((f) => ({ ...f, ...changes }));
  const show = (f: Exclude<ItemField, 'all'>) => field === 'all' || field === f;

  const errors = formErrors(form);
  const draft = formToItem(existing?.id ?? 'brouillon', form, lookups.exercises);
  const draftTemplate = { ...template, items: existing ? template.items.map((i) => (i.id === existing.id ? draft : i)) : insertItem(template.items, draft, lookups.blocks) };
  const context = programContext(data, lookups, template.programId);
  const draftProgram = { ...context.plan, templates: new Map(lookups.templates).set(template.id, draftTemplate) };
  const element = lookups.elements.get(form.elementId);
  const targets = parseTargets(form.targetText);
  const intensity = parseIntensity(form.intensityText);
  const rest = parseRest(form.restText);
  const elements = [...data.elements].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.order - b.order);

  const save = async () => {
    if (errors.length > 0) {
      setShowErrors(true);
      return;
    }
    const item = existing ? draft : { ...draft, id: newId() };
    const items = existing ? template.items.map((i) => (i.id === item.id ? item : i)) : insertItem(template.items, item, lookups.blocks);
    await saveTemplate(db, { ...template, items });
    onClose();
    if (!existing) showToast('Ligne ajoutée.');
  };

  const title = !existing ? 'Nouvelle ligne' : field === 'all' ? (element?.name ?? 'Ligne') : `${FIELD_TITLE[field]} · ${element?.name ?? ''}`;
  return (
    <Sheet
      open
      onClose={onClose}
      title={title}
      footer={
        <>
          {showErrors && errors.length > 0 && <p className="font-semibold text-danger">{errors.join(' ')}</p>}
          <Button onClick={() => void save()}>{existing ? 'Enregistrer' : 'Ajouter la ligne'}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {field === 'all' && (
          <>
            <Field label="Bloc">
              <ChipSelect value={form.blockTypeId} onChange={(blockTypeId) => patch({ blockTypeId })} options={data.blockTypes.map((b) => ({ value: b.id, label: b.name }))} />
            </Field>
            <Field label="Élément" hint="Planche et Touch FL : skills (alternance, totaux) ; composantes : volume hebdo.">
              <ChipSelect value={form.elementId} onChange={(elementId) => patch({ elementId })} options={elements.map((e) => ({ value: e.id, label: e.name }))} />
            </Field>
            <Field label="Exercices au choix" hint="Le premier est proposé la toute première fois ; ensuite, celui fait la dernière fois.">
              {form.candidateExerciseIds.length === 0 && <p className={showErrors ? 'text-danger' : 'text-ink-2'}>Aucun exercice pour l’instant : ajoutes-en au moins un.</p>}
              <div className="flex flex-wrap gap-1.5">
                {form.candidateExerciseIds.map((id, i) => (
                  <span key={id} className="flex min-h-11 items-center gap-1 rounded-full border border-line bg-card-2 pr-1 pl-3">
                    <span className="text-ink-3 tabular-nums">{i + 1}.</span> {lookups.exercises.get(id)?.name ?? '?'}
                    <button
                      type="button"
                      aria-label={`Retirer ${lookups.exercises.get(id)?.name ?? ''}`}
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
            </Field>
          </>
        )}

        {show('sets') && (
          <>
            <Field label="Séries min" hint={field === 'sets' ? 'Le minimum compte dans le volume garanti ; le tableau de la séance en propose autant de lignes.' : undefined}>
              <ValueStepper size="md" value={form.setsMin} min={0} onChange={(v) => patch({ setsMin: v ?? 0, setsMax: Math.max(form.setsMax, v ?? 0) })} unit="séries" />
            </Field>
            <Field label="Séries max">
              <ValueStepper size="md" value={form.setsMax} min={1} onChange={(v) => patch({ setsMax: v ?? 1, setsMin: Math.min(form.setsMin, v ?? 1) })} unit="séries" />
            </Field>
          </>
        )}
        {show('target') && (
          <Field label="Reps / durée">
            <Presets values={TARGET_PRESETS} current={form.targetText} onPick={(targetText) => patch({ targetText })} />
            <TextInput value={form.targetText} onChange={(targetText) => patch({ targetText })} placeholder="8-15 reps ou 15-30 s" />
            <Reading ok={targets.length > 0}>{targets.length > 0 ? `Lu : ${targets.map(formatTarget).join(' ou ')}` : 'Texte libre (pas de cible chiffrée).'}</Reading>
          </Field>
        )}
        {show('intensity') && (
          <Field label="RPE / marge">
            <Presets values={INTENSITY_PRESETS} current={form.intensityText} onPick={(intensityText) => patch({ intensityText })} />
            <TextInput value={form.intensityText} onChange={(intensityText) => patch({ intensityText })} placeholder="RPE 8-9 ou 1-2 reps en réserve" />
            <Reading ok={intensity !== null}>{intensity ? `Lu : ${formatIntensity(intensity)}` : 'Texte libre.'}</Reading>
          </Field>
        )}
        {show('rest') && (
          <>
            <Field label="Repos">
              <Presets values={REST_PRESETS} current={form.restText} onPick={(restText) => patch({ restText })} />
              <TextInput value={form.restText} onChange={(restText) => patch({ restText })} placeholder="90 s-2 min" />
              <Reading ok>
                Lu : {formatRest(rest.minSec, rest.maxSec)}
                {rest.minSec !== null && rest.minSec !== rest.maxSec ? ' (signal au minimum, fin au maximum)' : ''}
              </Reading>
            </Field>
            <Toggle
              label="Superset"
              description="Alterne série par série avec les lignes voisines du même bloc marquées superset ; repos après chaque série."
              checked={form.superset || rest.superset}
              onChange={(superset) => patch({ superset, restText: superset ? form.restText : form.restText.replace(/superset\s*,?\s*/i, '') })}
            />
          </>
        )}
        {field === 'all' && <Toggle label="Ligne optionnelle" description="Ne compte pas dans le minimum garanti du volume." checked={form.optional} onChange={(optional) => patch({ optional })} />}
        {show('notes') && (
          <Field label="Notes">
            <TextArea value={form.notes} onChange={(notes) => patch({ notes })} rows={3} placeholder="Critère d’arrêt, consignes…" />
          </Field>
        )}

        <ProgramChecks program={draftProgram} settings={context.settings} lookups={lookups} template={draftTemplate} compact />

        {field !== 'all' && (
          <button type="button" onClick={() => setField('all')} className="flex min-h-12 items-center justify-between rounded-2xl border border-line px-4 font-semibold text-ink-2 active:bg-card-2">
            Toute la ligne (exercices, bloc, optionnelle…) <NextIcon className="size-5" />
          </button>
        )}
      </div>

      <CandidatesSheet
        open={picking}
        onClose={() => setPicking(false)}
        data={data}
        elementId={form.elementId}
        selected={form.candidateExerciseIds}
        onChange={(candidateExerciseIds) => patch({ candidateExerciseIds })}
      />
    </Sheet>
  );
}
