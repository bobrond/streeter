import { useState } from 'react';
import { db } from '../../db/db';
import type { AppData } from '../../db/hooks';
import { useLookups, type Lookups } from '../../db/lookups';
import { changeTemplateMoment, deleteTemplate, saveTemplate } from '../../db/programStore';
import { estimateDuration } from '../../domain/duration';
import { duplicateTemplate, itemsByBlock, moveItem, nameError, templateDays, uniqueName } from '../../domain/editing';
import { formatDuration, formatIntensity, formatRest, formatSets, formatTarget } from '../../domain/labels';
import type { PrescriptionItem, SessionTemplate } from '../../domain/types';
import { newId } from '../../lib/id';
import { goBack, navigate } from '../../lib/router';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { ChipSelect, Field, ListGroup, TextArea, TextInput, Toggle } from '../../ui/form';
import { ArrowDownIcon, ArrowUpIcon, CopyIcon, PlusIcon, TrashIcon } from '../../ui/icons';
import { Screen } from '../../ui/Screen';
import { ConfirmSheet } from '../../ui/Sheet';
import { showToast } from '../../ui/toastStore';
import { ProgramChecks } from './ProgramChecks';

function itemSummary(item: PrescriptionItem): string {
  return [
    item.targets.length > 0 ? item.targets.map(formatTarget).join(' ou ') : item.targetText,
    item.intensity ? formatIntensity(item.intensity) : item.intensityText,
    `repos ${formatRest(item.restMinSec, item.restMaxSec)}`,
  ]
    .filter((d) => d && d !== '—')
    .join(' · ');
}

function ItemRow({
  item,
  lookups,
  onOpen,
  onMove,
  first,
  last,
}: {
  item: PrescriptionItem;
  lookups: Lookups;
  onOpen: () => void;
  onMove: (delta: -1 | 1) => void;
  first: boolean;
  last: boolean;
}) {
  const candidates = item.candidateExerciseIds.map((id) => lookups.exercises.get(id)?.name).filter(Boolean);
  return (
    <div className="flex items-stretch">
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 px-4 py-3 text-left active:bg-card-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-lg font-semibold">{lookups.elements.get(item.elementId)?.name ?? '?'}</span>
          <span className="shrink-0 tabular-nums">
            {formatSets(item.setsMin, item.setsMax)} <span className="text-ink-2">séries</span>
          </span>
        </div>
        <div className="text-ink-2">{itemSummary(item)}</div>
        <div className="mt-0.5 truncate text-sm text-ink-3">{candidates.length > 0 ? candidates.join(', ') : <span className="text-danger">aucun exercice candidat</span>}</div>
        {(item.optional || item.superset) && (
          <div className="mt-1 flex gap-1.5">
            {item.optional && <Badge>optionnel</Badge>}
            {item.superset && <Badge tone="accent">superset</Badge>}
          </div>
        )}
      </button>
      <div className="flex flex-col border-l border-line">
        <button type="button" aria-label="Monter" disabled={first} onClick={() => onMove(-1)} className="flex flex-1 items-center justify-center px-3 text-ink-2 active:bg-card-2 disabled:opacity-25">
          <ArrowUpIcon className="size-5" />
        </button>
        <button type="button" aria-label="Descendre" disabled={last} onClick={() => onMove(1)} className="flex flex-1 items-center justify-center px-3 text-ink-2 active:bg-card-2 disabled:opacity-25">
          <ArrowDownIcon className="size-5" />
        </button>
      </div>
    </div>
  );
}

export function TemplateEditor({ data, templateId }: { data: AppData; templateId: string }) {
  const lookups = useLookups(data);
  const template = lookups.templates.get(templateId);
  if (!template) {
    return (
      <Screen title="Modèle introuvable" onBack={() => goBack('/settings/templates')}>
        <p className="text-ink-2">Ce modèle de séance n’existe plus.</p>
      </Screen>
    );
  }
  return <TemplateForm template={template} data={data} lookups={lookups} />;
}

function TemplateForm({ template, data, lookups }: { template: SessionTemplate; data: AppData; lookups: Lookups }) {
  const [name, setName] = useState(template.name);
  const [notes, setNotes] = useState(template.notes);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const error = nameError(name, template.id, data.templates);
  const days = templateDays(template.id, data.settings.weekPlan);
  const { minSec, maxSec } = estimateDuration(template, data.settings);
  const save = (patch: Partial<SessionTemplate>) => void saveTemplate(db, { ...template, ...patch });
  const groups = itemsByBlock(template.items, lookups.blocks);
  const types = [...data.sessionTypes].sort((a, b) => Number(b.moment === template.moment) - Number(a.moment === template.moment));

  const duplicate = async () => {
    const copy = duplicateTemplate(template, newId, uniqueName(`${template.name} (copie)`, data.templates));
    await saveTemplate(db, copy);
    showToast('Modèle dupliqué.');
    navigate(`/settings/templates/${copy.id}`, { replace: true });
  };

  return (
    <Screen title={template.name} subtitle={days.length > 0 ? `Prévu : ${days.join(', ')}` : 'Pas dans la semaine type'} onBack={() => goBack('/settings/templates')}>
      <ProgramChecks program={lookups.program} settings={data.settings} lookups={lookups} />

      <ListGroup title="Séance">
        <div className="flex flex-col gap-4 p-4">
          <Field label="Nom" error={error}>
            <TextInput value={name} onChange={setName} onBlur={() => !error && name.trim() !== template.name && save({ name: name.trim() })} />
          </Field>
          <Field label="Type de séance">
            <ChipSelect
              value={template.sessionTypeId}
              onChange={(sessionTypeId) => save({ sessionTypeId })}
              options={types.map((t) => ({
                value: t.id,
                label: (
                  <>
                    <span className="size-3 rounded-full" style={{ backgroundColor: t.color }} aria-hidden />
                    {t.name}
                  </>
                ),
              }))}
            />
          </Field>
          <Field label="Moment" hint={days.length > 0 ? 'Changer de moment retire le modèle des créneaux de la semaine type.' : undefined}>
            <ChipSelect
              value={template.moment}
              onChange={(moment) => moment !== template.moment && void changeTemplateMoment(db, template, moment)}
              options={[
                { value: 'evening', label: 'Soir' },
                { value: 'morning', label: 'Matin' },
              ]}
            />
          </Field>
          <Toggle
            label="Séance optionnelle"
            description="Ne compte pas dans le minimum garanti du volume (Matin A, Matin B, Technique léger)."
            checked={template.optional}
            onChange={(optional) => save({ optional })}
          />
          <Field label="Notes">
            <TextArea value={notes} onChange={setNotes} rows={2} />
            {notes !== template.notes && (
              <Button variant="secondary" onClick={() => save({ notes: notes.trim() })}>
                Enregistrer la note
              </Button>
            )}
          </Field>
          <p className="text-ink-2">
            Durée estimée : {formatDuration(minSec)} à {formatDuration(maxSec)}
          </p>
        </div>
      </ListGroup>

      {groups.map((group, g) => (
        <ListGroup key={`${group.blockTypeId}-${g}`} title={lookups.blocks.get(group.blockTypeId)?.name ?? 'Bloc inconnu'}>
          {group.items.map((item, i) => (
            <ItemRow
              key={item.id}
              item={item}
              lookups={lookups}
              first={i === 0}
              last={i === group.items.length - 1}
              onOpen={() => navigate(`/settings/templates/${template.id}/items/${item.id}`)}
              onMove={(delta) => save({ items: moveItem(template.items, item.id, delta) })}
            />
          ))}
        </ListGroup>
      ))}
      {template.items.length === 0 && <p className="text-ink-2">Aucune ligne pour l’instant.</p>}

      <Button onClick={() => navigate(`/settings/templates/${template.id}/items/new`)}>
        <PlusIcon /> Ajouter une ligne
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" className="text-base" onClick={() => void duplicate()}>
          <CopyIcon className="size-5" /> Dupliquer
        </Button>
        <Button variant="danger" className="text-base" onClick={() => setConfirmDelete(true)}>
          <TrashIcon className="size-5" /> Supprimer
        </Button>
      </div>

      <ConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Supprimer ce modèle ?"
        message={
          <>
            {days.length > 0 && <p>Il sera retiré de la semaine type ({days.join(', ')}).</p>}
            <p>Les séances déjà faites avec ce modèle gardent leur contenu.</p>
          </>
        }
        confirmLabel="Supprimer le modèle"
        danger
        onConfirm={() => {
          goBack('/settings/templates');
          void deleteTemplate(db, template.id).then(() => showToast('Modèle supprimé.'));
        }}
      />
    </Screen>
  );
}
