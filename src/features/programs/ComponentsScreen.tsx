// Composantes d'un programme, réparties par l'appli (phase H2) : pour chaque composante, son travail (force ou
// endurance), son volume par tranche, ses séries par séance, ses exercices et sa prescription ; ce que chaque type de
// séance accepte ; la répartition d'une tranche. Un programme dont les composantes sont écrites dans ses séances
// (novembre avant H2) passe aux composantes réparties après un aperçu, avec « Annuler ».
import { useMemo, useState } from 'react';
import { db } from '../../db/db';
import type { AppData } from '../../db/hooks';
import { useLookups, type Lookups } from '../../db/lookups';
import { applyComponentConversion, restoreProgram, updateProgram } from '../../db/programStore';
import { convertToComponents, type ComponentConversion } from '../../domain/componentConversion';
import {
  ACCEPTANCES,
  acceptanceOf,
  acceptsWork,
  componentBounds,
  componentDistribution,
  componentFromLine,
  componentLine,
  slotKey,
  type ComponentPlan,
  type DistributionSlot,
} from '../../domain/components';
import { localISODate } from '../../domain/cycle';
import { deloadSets } from '../../domain/deload';
import { emptyItemForm, formToItem, itemToForm, type ItemForm } from '../../domain/editing';
import { ACCEPTANCE_LABEL, formatIntensity, formatRest, formatTarget, joinFrench, workLabel } from '../../domain/labels';
import { parseIntensity, parseRest, parseTargets } from '../../domain/parse';
import { programPhase } from '../../domain/programs';
import type { BlockType, ComponentAcceptance, ComponentVolume, ID, Program, ProgramComponent, SessionTemplate } from '../../domain/types';
import { useNow } from '../../lib/device';
import { newId } from '../../lib/id';
import { goBack, navigate } from '../../lib/router';
import { Button } from '../../ui/Button';
import { ChipSelect, Field, TextArea, TextInput } from '../../ui/form';
import { CloseIcon, NextIcon, PlusIcon, TrashIcon } from '../../ui/icons';
import { ValueStepper } from '../../ui/inputs';
import { Screen } from '../../ui/Screen';
import { Sheet } from '../../ui/Sheet';
import { showToast } from '../../ui/toastStore';
import { CandidatesSheet } from './CandidatesSheet';
import { Presets, Reading } from './ItemSheet';
import { INTENSITY_PRESETS, REST_PRESETS, TARGET_PRESETS } from './presets';
import { ProgramChecks } from './ProgramChecks';
import { programContext, withProgram, type ProgramContext } from './programContext';

const WORKS = ['endurance', 'force'] as const;

/** Bloc des composantes d'un programme qui n'en a pas encore : celui dont le nom parle de composante, sinon le dernier. */
function defaultComponentBlock(blockTypes: readonly BlockType[]): ID | null {
  return (blockTypes.find((b) => /composante/i.test(b.name)) ?? blockTypes.at(-1))?.id ?? null;
}

/** Composante, prescription comprise, en une ligne : « 30-60 s · RPE 5-6 · repos 60 s ». */
function prescriptionText(c: ProgramComponent): string {
  return [
    c.targets.length > 0 ? c.targets.map(formatTarget).join(' ou ') : c.targetText,
    c.intensity ? formatIntensity(c.intensity) : c.intensityText,
    c.restText ? `repos ${formatRest(c.restMinSec, c.restMaxSec)}` : '',
  ]
    .filter((part) => part && part !== '—')
    .join(' · ');
}

/** Libellé d'un créneau : « 3 » (séance de la séquence), « M1 » (matin), « J4 soir » (semaine type). */
function slotLabel(slot: Pick<DistributionSlot, 'seqDay' | 'moment'>, sequence: boolean): string {
  if (sequence) return slot.moment === 'morning' ? `M${slot.seqDay}` : String(slot.seqDay);
  return `J${slot.seqDay} ${slot.moment === 'morning' ? 'matin' : 'soir'}`;
}

/** Types de séance des séances non archivées d'un programme, dans l'ordre du déroulé. */
function programSessionTypes(program: Program, templates: readonly SessionTemplate[]): ID[] {
  const ordered: ID[] = [];
  const byId = new Map(templates.map((t) => [t.id, t]));
  for (const moment of ['evening', 'morning'] as const) {
    for (const day of [1, 2, 3, 4, 5, 6, 7] as const) {
      const type = byId.get(program.weekPlan[day][moment] ?? '')?.sessionTypeId;
      if (type && !ordered.includes(type)) ordered.push(type);
    }
  }
  for (const t of templates) if (!t.archived && t.programId === program.id && !ordered.includes(t.sessionTypeId)) ordered.push(t.sessionTypeId);
  return ordered;
}

export function ComponentsScreen({ data, programId }: { data: AppData; programId: string | null }) {
  const lookups = useLookups(data);
  const context = programContext(data, lookups, programId);
  const { program, settings } = context;
  const [editing, setEditing] = useState<ID | 'new' | null>(null);
  const per = settings.schedule === 'sequence' ? 'tranche' : 'semaine';
  const hasComponents = program.components.length > 0;
  return (
    <Screen title="Composantes" subtitle={`${program.name} · volume par ${per}, réparti par l’appli`} onBack={() => goBack(withProgram('/programs', data, program.id))}>
      {hasComponents && <ProgramChecks program={context.plan} settings={settings} lookups={lookups} sticky />}
      <p className="text-ink-2">
        Le soir fait le minimum, les matins complètent jusqu’au maximum. Chaque type de séance dit ce qu’il accepte : toutes les composantes, l’endurance seulement, ou aucune.
      </p>

      {!hasComponents && <Conversion data={data} lookups={lookups} context={context} onAdd={() => setEditing('new')} />}

      {hasComponents && (
        <>
          <ul className="flex flex-col gap-2">
            {program.components.map((c) => (
              <li key={c.id}>
                <ComponentCard component={c} program={program} lookups={lookups} per={per} onEdit={() => setEditing(c.id)} />
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setEditing('new')}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line font-semibold text-ink-2 active:bg-card-2"
          >
            <PlusIcon className="size-5" /> Ajouter une composante
          </button>

          <section className="mt-2 flex flex-col gap-2">
            <h2 className="font-display text-2xl leading-none tracking-wider text-ink-3">Ce que chaque séance accepte</h2>
            <p className="text-sm text-ink-3">Réglage par type de séance, pour ce programme.</p>
            {programSessionTypes(program, context.templates).map((typeId) => (
              <AcceptanceRow key={typeId} program={program} sessionTypeId={typeId} templates={context.templates} lookups={lookups} />
            ))}
          </section>

          <section className="mt-2 flex flex-col gap-2">
            <h2 className="font-display text-2xl leading-none tracking-wider text-ink-3">Répartition d’une {per}</h2>
            <p className="text-sm text-ink-3">Séries par séance, calculées par l’appli. La même répartition à chaque {per}.</p>
            <DistributionTable plan={settings} templates={lookups.templates} lookups={lookups} sequence={settings.schedule === 'sequence'} />
          </section>
        </>
      )}

      {editing && <ComponentSheet key={editing} program={program} componentId={editing} data={data} lookups={lookups} per={per} onClose={() => setEditing(null)} />}
    </Screen>
  );
}

function ComponentCard({ component, program, lookups, per, onEdit }: { component: ProgramComponent; program: Program; lookups: Lookups; per: string; onEdit?: () => void }) {
  const element = lookups.elements.get(component.elementId);
  const bounds = componentBounds(program, component.elementId);
  const exercises = component.candidateExerciseIds.map((id) => lookups.exercises.get(id)?.name ?? '?');
  const content = (
    <>
      <span className="flex items-center gap-2">
        <span className="min-w-0 flex-1 text-xl font-bold">{element?.name ?? '?'}</span>
        {onEdit && <NextIcon className="size-5 shrink-0 text-ink-3" />}
      </span>
      <span className="grid grid-cols-3 gap-2 text-sm">
        <span>
          <span className="block text-ink-3">Travail</span>
          <b>{workLabel(bounds.work)}</b>
        </span>
        <span>
          <span className="block text-ink-3">Par {per}</span>
          <b>
            {bounds.min} à {bounds.max} séries
          </b>
        </span>
        <span>
          <span className="block text-ink-3">Par séance</span>
          <b>
            {component.setsPerSession} série{component.setsPerSession > 1 ? 's' : ''}
          </b>
        </span>
      </span>
      <span className="text-sm text-ink-2">
        <span className="text-ink-3">Exercices au choix : </span>
        {exercises.length > 0 ? exercises.join(', ') : <span className="text-danger">aucun</span>}
      </span>
      {prescriptionText(component) && <span className="text-sm text-ink-2">{prescriptionText(component)}</span>}
      {component.notes && <span className="text-sm text-ink-3">{component.notes}</span>}
    </>
  );
  const className = 'flex w-full flex-col gap-1.5 rounded-2xl border border-line bg-card p-3 text-left';
  if (!onEdit) return <div className={className}>{content}</div>;
  return (
    <button type="button" onClick={onEdit} className={`${className} active:bg-card-2`}>
      {content}
    </button>
  );
}

/** Ce qu'un type de séance accepte des composantes du programme : toutes, l'endurance seulement, aucune. */
export function AcceptanceChips({ program, sessionTypeId }: { program: Program; sessionTypeId: ID }) {
  const value = acceptanceOf(program, sessionTypeId);
  const change = (next: ComponentAcceptance) =>
    void updateProgram(db, program.id, { componentAcceptance: { ...program.componentAcceptance, [sessionTypeId]: next } });
  return <ChipSelect value={value} onChange={change} options={ACCEPTANCES.map((a) => ({ value: a, label: ACCEPTANCE_LABEL[a] }))} />;
}

function AcceptanceRow({ program, sessionTypeId, templates, lookups }: { program: Program; sessionTypeId: ID; templates: readonly SessionTemplate[]; lookups: Lookups }) {
  const type = lookups.sessionTypes.get(sessionTypeId);
  const sessions = templates.filter((t) => !t.archived && t.sessionTypeId === sessionTypeId).map((t) => t.name);
  const others = sessions.filter((name) => name !== type?.name);
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line bg-card p-3">
      <span className="flex items-center gap-2">
        <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: type?.color }} aria-hidden />
        <span className="font-semibold">{type?.name ?? 'Type inconnu'}</span>
      </span>
      {others.length > 0 && <span className="text-sm text-ink-3">Séances : {joinFrench(sessions)}</span>}
      <AcceptanceChips program={program} sessionTypeId={sessionTypeId} />
    </div>
  );
}

/**
 * Tableau de la répartition : une ligne par séance du soir, le total du soir, une ligne par matin (ou soir optionnel),
 * le total et le volume ; une colonne par composante. Puis ce qu'il faut savoir : minimum atteint ou non, composantes
 * qui restent sous leur maximum, tranche allégée.
 */
export function DistributionTable({
  plan,
  templates,
  lookups,
  sequence,
}: {
  plan: ComponentPlan & Pick<Program, 'deloadWeek' | 'deloadReductionPct' | 'hideMorningsInDeload'>;
  templates: ReadonlyMap<ID, SessionTemplate>;
  lookups: Lookups;
  sequence: boolean;
}) {
  const components = plan.components ?? [];
  const d = componentDistribution(plan, templates);
  const has = (slot: DistributionSlot, c: ProgramComponent) => (d.bySlot.get(slotKey(slot.seqDay, slot.moment)) ?? []).some((x) => x.id === c.id);
  const evenings = d.slots.filter((s) => !s.extra);
  const extras = d.slots.filter((s) => s.extra);
  const name = (c: ProgramComponent) => lookups.elements.get(c.elementId)?.name ?? '?';
  const row = (slot: DistributionSlot) => (
    <tr key={slotKey(slot.seqDay, slot.moment)} className="border-t border-line">
      <th scope="row" className="py-1.5 pr-2 text-left font-normal">
        <span className="font-semibold tabular-nums">{slotLabel(slot, sequence)}</span> <span className="text-ink-2">{slot.template.name}</span>
      </th>
      {components.map((c) => (
        <td key={c.id} className={`px-1 text-center tabular-nums ${has(slot, c) ? 'font-bold' : 'text-ink-3'}`}>
          {has(slot, c) ? c.setsPerSession : '–'}
        </td>
      ))}
    </tr>
  );
  const totalRow = (label: string, value: (c: ProgramComponent) => string, strong = true) => (
    <tr className="border-t-2 border-line">
      <th scope="row" className={`py-1.5 pr-2 text-left ${strong ? 'font-semibold' : 'font-normal text-ink-2'}`}>
        {label}
      </th>
      {components.map((c) => (
        <td key={c.id} className={`px-1 text-center tabular-nums ${strong ? 'font-bold' : 'text-ink-2'}`}>
          {value(c)}
        </td>
      ))}
    </tr>
  );
  const totals = (c: ProgramComponent) => d.totals.get(c.id) ?? { evening: 0, extra: 0 };

  // Ce qu'il faut savoir sur la répartition.
  const notes: string[] = [];
  const short = components.filter((c) => totals(c).evening < componentBounds(plan, c.elementId).min);
  if (short.length === 0) notes.push('Chaque composante atteint son minimum le soir.');
  for (const c of short) {
    const { min } = componentBounds(plan, c.elementId);
    notes.push(`${name(c)} : ${totals(c).evening} séries le soir, sous son minimum de ${min} : pas assez de séances du soir qui l’acceptent.`);
  }
  const below = components.filter((c) => totals(c).evening >= componentBounds(plan, c.elementId).min && totals(c).evening + totals(c).extra < componentBounds(plan, c.elementId).max);
  const unaccepted = below.filter((c) => !extras.some((s) => acceptsWork(acceptanceOf(plan, s.template.sessionTypeId), componentBounds(plan, c.elementId).work)));
  if (unaccepted.length > 0 && extras.length > 0) {
    const total = (c: ProgramComponent) => totals(c).evening + totals(c).extra;
    const same = unaccepted.every((c) => total(c) === total(unaccepted[0]));
    const who = joinFrench(unaccepted.map((c, i) => (i === 0 ? name(c) : name(c).toLowerCase())));
    notes.push(`${who} ${unaccepted.length > 1 ? 'restent' : 'reste'} ${same ? `à ${total(unaccepted[0])}` : 'sous le maximum'} : aucun matin ne ${unaccepted.length > 1 ? 'les ' : 'l’'}accepte.`);
  }
  for (const c of below.filter((c) => !unaccepted.includes(c))) {
    notes.push(`${name(c)} reste à ${totals(c).evening + totals(c).extra} (maximum ${componentBounds(plan, c.elementId).max}) : séances complètes de ${c.setsPerSession} séries.`);
  }
  const block = lookups.blocks.get(plan.componentBlockTypeId ?? '');
  if (plan.deloadWeek > 0 && components.length > 0) {
    const sets = [...new Set(components.map((c) => c.setsPerSession))];
    const reduced = block?.reducedInDeload ?? true;
    const change = reduced
      ? sets.map((s) => `${deloadSets(s, plan.deloadReductionPct)} série${deloadSets(s, plan.deloadReductionPct) > 1 ? 's' : ''} par séance au lieu de ${s}`).join(', ')
      : 'mêmes séries par séance';
    notes.push(`${sequence ? 'Tranche' : 'Semaine'} ${plan.deloadWeek}, allégée : ${change}${plan.hideMorningsInDeload && extras.some((s) => s.moment === 'morning') ? ', et pas de matin' : ''}.`);
  }

  if (d.slots.length === 0) return <p className="text-ink-2">Aucune séance dans le déroulé.</p>;
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line bg-card p-3">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th scope="col" className="pb-1 text-left font-semibold text-ink-3">
                Séance
              </th>
              {components.map((c) => (
                <th key={c.id} scope="col" lang="fr" className="px-1 pb-1 text-center align-bottom text-xs leading-tight font-semibold text-ink-3 hyphens-auto">
                  {name(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {evenings.map(row)}
            {totalRow('Soirs', (c) => String(totals(c).evening))}
            {extras.map(row)}
            {extras.length > 0 && totalRow('Total', (c) => String(totals(c).evening + totals(c).extra))}
            {totalRow('Volume', (c) => {
              const { min, max } = componentBounds(plan, c.elementId);
              return `${min}-${max}`;
            }, false)}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col gap-1 text-sm text-ink-2">
        {notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </div>
  );
}

/** Programme sans composante répartie : passer aux composantes réparties (aperçu), ou en ajouter une. */
function Conversion({ data, lookups, context, onAdd }: { data: AppData; lookups: Lookups; context: ProgramContext; onAdd: () => void }) {
  const { program } = context;
  const today = localISODate(new Date(useNow(60_000)));
  const phase = programPhase(data.programs, program, { app: data.appSettings, today });
  const conversion = useMemo(() => {
    const used = new Set(data.sessions.map((s) => s.templateId).filter((id): id is ID => id !== null));
    return convertToComponents(program, context.templates, data.elements, { newId, usedTemplateIds: used });
  }, [program, context.templates, data.elements, data.sessions]);
  if (phase === 'past') return <p className="rounded-2xl border border-line bg-card-2 p-3 text-ink-2">Programme passé : ses composantes restent écrites dans ses séances.</p>;
  if (!conversion) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-ink-2">Aucune composante répartie pour l’instant.</p>
        <Button onClick={onAdd}>
          <PlusIcon /> Ajouter une composante
        </Button>
      </div>
    );
  }
  return <ConversionPreview conversion={conversion} context={context} lookups={lookups} />;
}

function ConversionPreview({ conversion, context, lookups }: { conversion: ComponentConversion; context: ProgramContext; lookups: Lookups }) {
  const converted = conversion.program;
  const sequence = converted.schedule === 'sequence';
  const per = sequence ? 'tranche' : 'semaine';
  const templates = new Map(lookups.templates);
  for (const t of conversion.templates) templates.set(t.id, t);
  for (const m of conversion.merged) if (!m.archive) templates.delete(m.template.id);
  const apply = async () => {
    try {
      const undo = await applyComponentConversion(db, conversion);
      showToast('Composantes réparties par l’appli.', { action: { label: 'Annuler', run: () => void restoreProgram(db, undo) } });
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), { tone: 'error' });
    }
  };
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-accent bg-card p-3">
      <h2 className="font-display text-2xl leading-none tracking-wider text-accent">Répartir les composantes</h2>
      <p className="text-ink-2">
        Les composantes de ce programme sont écrites dans ses séances ({conversion.removedLines} lignes). L’appli peut les répartir elle-même, avec la même prescription :
      </p>
      <ul className="flex flex-col gap-2">
        {converted.components.map((c) => (
          <li key={c.id}>
            <ComponentCard component={c} program={converted} lookups={lookups} per={per} />
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-1 text-sm text-ink-2">
        <span className="font-semibold text-ink">Ce que chaque séance accepte, d’après ses lignes</span>
        {programSessionTypes(converted, [...templates.values()].filter((t) => t.programId === converted.id)).map((typeId) => (
          <span key={typeId}>
            {lookups.sessionTypes.get(typeId)?.name ?? '?'} : {ACCEPTANCE_LABEL[acceptanceOf(converted, typeId)].toLowerCase()}
          </span>
        ))}
      </div>
      {conversion.merged.map(({ template, into, archive }) => (
        <p key={template.id} className="text-sm text-ink-2">
          « {template.name} » est identique à « {into.name} » sans ses composantes : elle est remplacée par « {into.name} » dans le déroulé et {archive ? 'archivée (elle a déjà servi)' : 'supprimée'}.
        </p>
      ))}
      <DistributionTable plan={{ ...context.settings, ...converted }} templates={templates} lookups={lookups} sequence={sequence} />
      <p className="text-sm text-ink-3">Les séances déjà faites gardent leur contenu.</p>
      <Button onClick={() => void apply()}>Répartir les composantes</Button>
    </section>
  );
}

function ComponentSheet({
  program,
  componentId,
  data,
  lookups,
  per,
  onClose,
}: {
  program: Program;
  componentId: ID | 'new';
  data: AppData;
  lookups: Lookups;
  per: string;
  onClose: () => void;
}) {
  const existing = program.components.find((c) => c.id === componentId) ?? null;
  const taken = new Set(program.components.map((c) => c.elementId));
  const available = data.elements.filter((e) => e.kind === 'component' && !taken.has(e.id));
  const blockTypeId = program.componentBlockTypeId ?? defaultComponentBlock(data.blockTypes) ?? '';
  const [elementId, setElementId] = useState<ID>(existing?.elementId ?? available[0]?.id ?? '');
  const initialBounds = componentBounds(program, elementId);
  const [work, setWork] = useState<string>(initialBounds.work ?? 'endurance');
  const [min, setMin] = useState(initialBounds.min);
  const [max, setMax] = useState(initialBounds.max);
  const [sets, setSets] = useState(existing?.setsPerSession ?? 2);
  const [form, setForm] = useState<ItemForm>(() => (existing ? itemToForm(componentLine(existing, blockTypeId, false)) : emptyItemForm(blockTypeId, elementId)));
  const [picking, setPicking] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const patch = (changes: Partial<ItemForm>) => setForm((f) => ({ ...f, ...changes }));
  const element = lookups.elements.get(elementId);
  const targets = parseTargets(form.targetText);
  const intensity = parseIntensity(form.intensityText);
  const rest = parseRest(form.restText);

  const errors = [
    !elementId ? 'Choisis une composante.' : '',
    form.candidateExerciseIds.length === 0 ? 'Ajoute au moins un exercice.' : '',
    min > max ? 'Le minimum dépasse le maximum.' : '',
  ].filter(Boolean);

  const save = async () => {
    if (errors.length > 0) {
      setShowErrors(true);
      return;
    }
    const id = existing?.id ?? newId();
    const line = formToItem(id, { ...form, elementId, blockTypeId, setsMin: sets, setsMax: sets }, lookups.exercises);
    const component = componentFromLine(id, line);
    const order = (c: ProgramComponent) => lookups.elements.get(c.elementId)?.order ?? Number.MAX_SAFE_INTEGER;
    const components = existing ? program.components.map((c) => (c.id === id ? component : c)) : [...program.components, component].sort((a, b) => order(a) - order(b));
    const volume: ComponentVolume = { elementId, work, min, max };
    const componentVolumes = [...program.componentVolumes.filter((v) => v.elementId !== elementId), volume];
    await updateProgram(db, program.id, { components, componentVolumes, componentBlockTypeId: blockTypeId || null });
    onClose();
    if (!existing) showToast(`${element?.name ?? 'Composante'} répartie par l’appli.`);
  };

  const remove = async () => {
    if (!existing) return;
    const previous = program.components;
    await updateProgram(db, program.id, { components: previous.filter((c) => c.id !== existing.id) });
    onClose();
    showToast(`${element?.name ?? 'Composante'} retirée de la répartition.`, { action: { label: 'Annuler', run: () => void updateProgram(db, program.id, { components: previous }) } });
  };

  if (!existing && available.length === 0) {
    return (
      <Sheet open onClose={onClose} title="Ajouter une composante">
        <p className="text-ink-2">Toutes les composantes sont déjà réparties. Une nouvelle composante se crée dans Réglages › Éléments (type composante).</p>
        <Button variant="secondary" onClick={() => navigate('/settings/elements')}>
          Éléments
        </Button>
      </Sheet>
    );
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={existing ? (element?.name ?? 'Composante') : 'Nouvelle composante'}
      footer={
        <>
          {showErrors && errors.length > 0 && <p className="font-semibold text-danger">{errors.join(' ')}</p>}
          <Button onClick={() => void save()}>{existing ? 'Enregistrer' : 'Ajouter la composante'}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {!existing && (
          <Field label="Composante">
            <ChipSelect
              value={elementId}
              onChange={(id) => {
                setElementId(id);
                const bounds = componentBounds(program, id);
                setWork(bounds.work ?? 'endurance');
                setMin(bounds.min);
                setMax(bounds.max);
                patch({ elementId: id, candidateExerciseIds: [] });
              }}
              options={available.map((e) => ({ value: e.id, label: e.name }))}
            />
          </Field>
        )}
        <Field label="Travail" hint="« Endurance seulement » : les séances de ce réglage ne reçoivent que les composantes d’endurance.">
          <ChipSelect value={work} onChange={setWork} options={[...WORKS, ...(WORKS.includes(work as (typeof WORKS)[number]) ? [] : [work])].map((w) => ({ value: w, label: workLabel(w) }))} />
        </Field>
        <Field label={`Volume par ${per}, minimum`} hint="Le soir le fait à lui seul.">
          <ValueStepper size="md" value={min} min={0} onChange={(v) => {
            setMin(v ?? 0);
            setMax((m) => Math.max(m, v ?? 0));
          }} unit="séries" />
        </Field>
        <Field label={`Volume par ${per}, maximum`} hint="Les matins complètent jusqu’ici.">
          <ValueStepper size="md" value={max} min={1} onChange={(v) => {
            setMax(v ?? 1);
            setMin((m) => Math.min(m, v ?? 1));
          }} unit="séries" />
        </Field>
        <Field label="Séries par séance" hint="Chaque séance qui reçoit la composante en fait autant (réduites en tranche allégée).">
          <ValueStepper size="md" value={sets} min={1} onChange={(v) => setSets(Math.max(1, v ?? 1))} unit="séries" />
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
        <Field label="Reps / durée">
          <Presets values={TARGET_PRESETS} current={form.targetText} onPick={(targetText) => patch({ targetText })} />
          <TextInput value={form.targetText} onChange={(targetText) => patch({ targetText })} placeholder="30-60 s ou 15-30 reps" />
          <Reading ok={targets.length > 0}>{targets.length > 0 ? `Lu : ${targets.map(formatTarget).join(' ou ')}` : 'Texte libre (pas de cible chiffrée).'}</Reading>
        </Field>
        <Field label="RPE / marge">
          <Presets values={INTENSITY_PRESETS} current={form.intensityText} onPick={(intensityText) => patch({ intensityText })} />
          <TextInput value={form.intensityText} onChange={(intensityText) => patch({ intensityText })} placeholder="RPE 5-6" />
          <Reading ok={intensity !== null}>{intensity ? `Lu : ${formatIntensity(intensity)}` : 'Texte libre.'}</Reading>
        </Field>
        <Field label="Repos">
          <Presets values={REST_PRESETS} current={form.restText} onPick={(restText) => patch({ restText })} />
          <TextInput value={form.restText} onChange={(restText) => patch({ restText })} placeholder="60 s" />
          <Reading ok>Lu : {formatRest(rest.minSec, rest.maxSec)}</Reading>
        </Field>
        <Field label="Notes">
          <TextArea value={form.notes} onChange={(notes) => patch({ notes })} rows={3} placeholder="Consignes, critère d’arrêt…" />
        </Field>
        {existing && (
          <Button variant="secondary" onClick={() => void remove()}>
            <TrashIcon /> Retirer de la répartition
          </Button>
        )}
      </div>
      <CandidatesSheet
        open={picking}
        onClose={() => setPicking(false)}
        data={data}
        elementId={elementId}
        selected={form.candidateExerciseIds}
        onChange={(candidateExerciseIds) => patch({ candidateExerciseIds })}
      />
    </Sheet>
  );
}
