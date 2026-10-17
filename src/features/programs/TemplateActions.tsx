// Actions sur un modèle de séance (menu ⋯ de la semaine type, des autres modèles et de l'éditeur) : modifier,
// changer la séance du créneau, renommer, type / moment / notes, dupliquer, archiver ou désarchiver, supprimer.
import { useState } from 'react';
import { db } from '../../db/db';
import type { AppData } from '../../db/hooks';
import type { Lookups } from '../../db/lookups';
import { changeTemplateMoment, deleteTemplate, saveTemplate, setTemplateArchived, updateSettings } from '../../db/programStore';
import { duplicateTemplate, nameError, templateDays, uniqueName } from '../../domain/editing';
import { MOMENT_LABEL, seqDayLabel } from '../../domain/labels';
import { cleanSpaces } from '../../domain/text';
import type { Moment, SessionTemplate } from '../../domain/types';
import { newId } from '../../lib/id';
import { goBack, navigate } from '../../lib/router';
import { Button } from '../../ui/Button';
import { ChipSelect, Field, TextArea, TextInput, Toggle } from '../../ui/form';
import { ArchiveIcon, CopyIcon, PencilIcon, SettingsIcon, SwapIcon, TrashIcon } from '../../ui/icons';
import { MenuItem, MenuList } from '../../ui/Menu';
import { ConfirmSheet, Sheet } from '../../ui/Sheet';
import { showToast } from '../../ui/toastStore';
import { SlotPickerSheet, type Slot } from './SlotPickerSheet';

export interface TemplateTarget {
  template: SessionTemplate;
  /** Créneau de la semaine type d'où le menu est ouvert. */
  slot?: Slot;
}

type Mode = 'menu' | 'rename' | 'settings' | 'archive' | 'delete' | 'slot';

/** À rendre avec `key={target?.template.id}` : le menu repart de zéro pour chaque modèle. */
export function TemplateActions({
  target,
  onClose,
  data,
  lookups,
  inEditor = false,
}: {
  target: TemplateTarget | null;
  onClose: () => void;
  data: AppData;
  lookups: Lookups;
  /** Ouvert depuis l'éditeur du modèle : pas d'entrée « Modifier », retour à Programmes après archivage. */
  inEditor?: boolean;
}) {
  const [mode, setMode] = useState<Mode>('menu');
  if (!target) return null;
  const { template, slot } = target;
  const days = templateDays(template.id, data.settings.weekPlan);
  const type = lookups.sessionTypes.get(template.sessionTypeId);
  const close = () => {
    setMode('menu');
    onClose();
  };

  const duplicate = async () => {
    const copy = { ...duplicateTemplate(template, newId, uniqueName(`${template.name} (copie)`, data.templates)), archived: false };
    await saveTemplate(db, copy);
    close();
    showToast('Modèle dupliqué : il n’est pas dans la semaine type.');
    navigate(`/programs/template/${copy.id}`, { replace: inEditor });
  };

  const archive = async () => {
    const previous = data.settings.weekPlan;
    await setTemplateArchived(db, template.id, true);
    close();
    if (inEditor) goBack('/programs');
    showToast(`« ${template.name} » archivé.`, {
      action: {
        label: 'Annuler',
        run: () => void setTemplateArchived(db, template.id, false).then(() => updateSettings(db, { weekPlan: previous })),
      },
    });
  };

  const unarchive = async () => {
    await setTemplateArchived(db, template.id, false);
    close();
    showToast('Modèle désarchivé : place-le dans la semaine type depuis Programmes › ⋯ › Créneaux.');
  };

  return (
    <>
      <Sheet open={mode === 'menu'} onClose={close} title={template.name}>
        <MenuList>
          {!inEditor && (
            <MenuItem
              icon={<PencilIcon />}
              label="Modifier le modèle"
              hint="Lignes, séries, cibles, repos, exercices"
              onClick={() => {
                close();
                navigate(`/programs/template/${template.id}`);
              }}
            />
          )}
          {slot && <MenuItem icon={<SwapIcon />} label={`Changer la séance du ${seqDayLabel(slot.day)} ${MOMENT_LABEL[slot.moment].toLowerCase()}`} onClick={() => setMode('slot')} />}
          <MenuItem icon={<PencilIcon />} label="Renommer" onClick={() => setMode('rename')} />
          <MenuItem
            icon={<SettingsIcon />}
            label="Type, moment, notes"
            hint={[type?.name, MOMENT_LABEL[template.moment], template.optional ? 'optionnelle' : null].filter(Boolean).join(' · ')}
            onClick={() => setMode('settings')}
          />
          <MenuItem icon={<CopyIcon />} label="Dupliquer" hint="La copie n’est pas placée dans la semaine type." onClick={() => void duplicate()} />
          {template.archived ? (
            <MenuItem icon={<ArchiveIcon />} label="Désarchiver" onClick={() => void unarchive()} />
          ) : (
            <MenuItem
              icon={<ArchiveIcon />}
              label="Archiver"
              hint={days.length > 0 ? `Retiré de la semaine type (${days.join(', ')}).` : 'Plus proposé ; gardé dans Archivés.'}
              onClick={() => (days.length > 0 ? setMode('archive') : void archive())}
            />
          )}
          <MenuItem icon={<TrashIcon />} label="Supprimer" danger onClick={() => setMode('delete')} />
        </MenuList>
      </Sheet>

      {mode === 'rename' && <RenameSheet template={template} data={data} onClose={close} />}
      {mode === 'settings' && <TemplateSettingsSheet template={template} data={data} onClose={close} />}
      <SlotPickerSheet slot={mode === 'slot' && slot ? slot : null} onClose={close} data={data} lookups={lookups} />
      <ConfirmSheet
        open={mode === 'archive'}
        onClose={close}
        title="Archiver ce modèle ?"
        message={
          <>
            <p>Il quitte la semaine type ({days.join(', ')}) : ce{days.length > 1 ? 's' : ''} créneau{days.length > 1 ? 'x' : ''} devien{days.length > 1 ? 'nent' : 't'} Repos ou sans séance.</p>
            <p className="mt-2">Tu le retrouves dans Programmes › Archivés. Les séances déjà faites gardent leur contenu.</p>
          </>
        }
        confirmLabel="Archiver"
        onConfirm={() => void archive()}
      />
      <ConfirmSheet
        open={mode === 'delete'}
        onClose={close}
        title="Supprimer ce modèle ?"
        message={
          <>
            {days.length > 0 && <p>Il sera retiré de la semaine type ({days.join(', ')}).</p>}
            <p>Les séances déjà faites avec ce modèle gardent leur contenu. Pour le garder de côté, archive-le plutôt.</p>
          </>
        }
        confirmLabel="Supprimer le modèle"
        danger
        onConfirm={() => {
          if (inEditor) goBack('/programs');
          void deleteTemplate(db, template.id).then(() => showToast('Modèle supprimé.'));
        }}
      />
    </>
  );
}

function RenameSheet({ template, data, onClose }: { template: SessionTemplate; data: AppData; onClose: () => void }) {
  const [name, setName] = useState(template.name);
  const error = nameError(name, template.id, data.templates);
  const save = async () => {
    if (error) return;
    await saveTemplate(db, { ...template, name: cleanSpaces(name) });
    onClose();
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title="Renommer le modèle"
      footer={
        <Button disabled={error !== null} onClick={() => void save()}>
          Enregistrer
        </Button>
      }
    >
      <Field label="Nom" error={error}>
        <TextInput value={name} onChange={setName} autoFocus />
      </Field>
    </Sheet>
  );
}

function TemplateSettingsSheet({ template, data, onClose }: { template: SessionTemplate; data: AppData; onClose: () => void }) {
  const [form, setForm] = useState({ sessionTypeId: template.sessionTypeId, moment: template.moment, optional: template.optional, notes: template.notes });
  const days = templateDays(template.id, data.settings.weekPlan);
  const types = [...data.sessionTypes].sort((a, b) => Number(b.moment === form.moment) - Number(a.moment === form.moment));
  const save = async () => {
    const next = { ...template, sessionTypeId: form.sessionTypeId, optional: form.optional, notes: form.notes.trim() };
    if (form.moment !== template.moment) await changeTemplateMoment(db, next, form.moment);
    else await saveTemplate(db, next);
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title={template.name} footer={<Button onClick={() => void save()}>Enregistrer</Button>}>
      <div className="flex flex-col gap-4">
        <Field label="Type de séance">
          <ChipSelect
            value={form.sessionTypeId}
            onChange={(sessionTypeId) => setForm((f) => ({ ...f, sessionTypeId }))}
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
        <Field label="Moment" hint={days.length > 0 && form.moment !== template.moment ? `Changer de moment retire le modèle de la semaine type (${days.join(', ')}).` : undefined}>
          <ChipSelect
            value={form.moment}
            onChange={(moment: Moment) => setForm((f) => ({ ...f, moment }))}
            options={[
              { value: 'evening' as Moment, label: 'Soir' },
              { value: 'morning' as Moment, label: 'Matin' },
            ]}
          />
        </Field>
        <Toggle
          label="Séance optionnelle"
          description="Ne compte pas dans le minimum garanti du volume (Matin A, Matin B, Technique léger)."
          checked={form.optional}
          onChange={(optional) => setForm((f) => ({ ...f, optional }))}
        />
        <Field label="Notes">
          <TextArea value={form.notes} onChange={(notes) => setForm((f) => ({ ...f, notes }))} rows={3} />
        </Field>
      </div>
    </Sheet>
  );
}
