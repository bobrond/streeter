// Éditeur d'un modèle de séance, dans le style du tableau de la séance : blocs, paires planche / FL et supersets
// (trait orange), une carte par ligne de prescription avec ses cellules à toucher (séries, cible, intensité, repos).
// Poignée ⠿ : glisser une ligne dans son bloc ; ⋯ ou appui long : options de la ligne ; contrôles du programme en haut.
// Chaque bloc est commun avec d'autres séances ou propre à celle-ci ; ⋯ de son en-tête : ses options (blocs communs).
import { useState, type ReactNode } from 'react';
import { db } from '../../db/db';
import type { AppData } from '../../db/hooks';
import { useLookups, type Lookups } from '../../db/lookups';
import { restoreTemplates, saveTemplate, setTemplateArchived } from '../../db/programStore';
import { blockPartners, blockSources, templateNames } from '../../domain/blocks';
import { componentDistribution, slotKey } from '../../domain/components';
import { estimateDuration } from '../../domain/duration';
import { duplicateItem, reorderItem, templateDays } from '../../domain/editing';
import { MOMENT_LABEL, formatDurationRange, formatRange, formatSets, formatTarget, joinFrench, restParts } from '../../domain/labels';
import { buildPlan } from '../../domain/session';
import { parseIntensities } from '../../domain/parse';
import type { ID, Intensity, PrescriptionItem, SessionTemplate } from '../../domain/types';
import { newId } from '../../lib/id';
import { goBack, navigate } from '../../lib/router';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { insertionIndex, measureDropRects, useLongPress, useVerticalDrag, type DragHandleProps } from '../../ui/gestures';
import { ArrowDownIcon, ArrowUpIcon, ChevronDownIcon, CopyIcon, DotsIcon, DragIcon, LinkIcon, PencilIcon, PlusIcon, TrashIcon } from '../../ui/icons';
import { MenuItem, MenuList } from '../../ui/Menu';
import { Screen } from '../../ui/Screen';
import { Sheet } from '../../ui/Sheet';
import { showToast } from '../../ui/toastStore';
import { BlockMenuSheet, BlockPickerSheet } from './BlockSheets';
import { CandidatesSheet } from './CandidatesSheet';
import { ItemSheet, type ItemField, type ItemSheetTarget } from './ItemSheet';
import { AcceptanceChips } from './ComponentsScreen';
import { ProgramChecks } from './ProgramChecks';
import { programContext, withProgram, type ProgramContext } from './programContext';
import { TemplateActions } from './TemplateActions';

export function TemplateEditor({ data, templateId }: { data: AppData; templateId: string }) {
  const lookups = useLookups(data);
  const template = lookups.templates.get(templateId);
  if (!template) {
    return (
      <Screen title="Modèle introuvable" onBack={() => goBack('/programs')}>
        <p className="text-ink-2">Ce modèle de séance n’existe plus.</p>
      </Screen>
    );
  }
  return <Editor template={template} data={data} lookups={lookups} />;
}

type SheetState = { kind: 'item'; target: ItemSheetTarget } | { kind: 'line'; itemId: ID } | { kind: 'candidates'; itemId: ID } | { kind: 'template' } | null;

/**
 * Valeur d'une cellule : intensité « RPE 8-9 » ou « 1-2 reps » en réserve, texte libre sinon ; une intensité par
 * alternative de cible : « 2 en rés. / RPE 8-9 ».
 */
function intensityCell(item: PrescriptionItem): { label: string; value: string } {
  const alternatives = parseIntensities(item.intensityText);
  if (alternatives.length > 1) {
    const short = (i: Intensity | null) => (i === null ? '?' : i.kind === 'rpe' ? `RPE ${formatRange(i.min, i.max)}` : `${formatRange(i.min, i.max)} en rés.`);
    return { label: 'Intensité', value: alternatives.map(short).join(' / ') };
  }
  if (item.intensity?.kind === 'rpe') return { label: 'RPE', value: formatRange(item.intensity.min, item.intensity.max) };
  if (item.intensity?.kind === 'rir') {
    const max = item.intensity.max ?? item.intensity.min ?? 0;
    return { label: 'En réserve', value: `${formatRange(item.intensity.min, item.intensity.max)} rep${max > 1 ? 's' : ''}` };
  }
  return { label: 'RPE', value: item.intensityText || '—' };
}

function Cell({ label, children, onClick }: { label: string; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}, toucher pour modifier`}
      className="flex min-h-14 min-w-0 flex-col items-center justify-center rounded-xl border border-line bg-page px-1 py-1 text-center leading-tight active:scale-[0.97]"
    >
      <span className="text-[11px] font-semibold tracking-wide text-ink-3 uppercase">{label}</span>
      <span className="text-base font-bold tabular-nums [overflow-wrap:anywhere]">{children}</span>
    </button>
  );
}

function LineCard({
  item,
  lookups,
  dragging,
  dy,
  handleProps,
  onCell,
  onCandidates,
  onMenu,
}: {
  item: PrescriptionItem;
  lookups: Lookups;
  dragging: boolean;
  dy: number;
  handleProps: DragHandleProps;
  onCell: (field: ItemField) => void;
  onCandidates: () => void;
  onMenu: () => void;
}) {
  const element = lookups.elements.get(item.elementId);
  const candidates = item.candidateExerciseIds.map((id) => lookups.exercises.get(id)).filter((e) => e !== undefined);
  const longPress = useLongPress(onMenu);
  const intensity = intensityCell(item);
  return (
    <article
      data-sort-item={item.id}
      aria-label={element?.name}
      style={dragging ? { transform: `translateY(${dy}px)` } : undefined}
      className={`relative rounded-2xl border bg-card ${dragging ? 'z-20 border-accent shadow-2xl shadow-black' : 'border-line'}`}
    >
      <header {...longPress} className="flex items-center gap-1 pt-1 pr-1 select-none">
        <button type="button" aria-label={`Déplacer ${element?.name ?? 'la ligne'} (glisser)`} {...handleProps} className="flex h-12 w-11 shrink-0 cursor-grab items-center justify-center text-ink-3 active:text-accent">
          <DragIcon />
        </button>
        <h3 className="min-w-0 flex-1 truncate text-xl font-bold">{element?.name ?? '?'}</h3>
        {item.optional && <Badge>optionnel</Badge>}
        <button type="button" aria-label={`Options de la ligne ${element?.name ?? ''}`} onClick={onMenu} className="flex size-12 shrink-0 items-center justify-center rounded-xl text-ink-2 active:bg-card-2">
          <DotsIcon className="size-7" />
        </button>
      </header>
      <div className="px-3">
        <button
          type="button"
          onClick={onCandidates}
          className={`flex min-h-11 w-full items-center gap-1.5 rounded-xl border px-3 text-left font-semibold active:bg-line ${candidates.length > 0 ? 'border-line bg-card-2' : 'border-danger/60 text-danger'}`}
        >
          <span className="min-w-0 flex-1 truncate">{candidates.length > 0 ? candidates.map((e) => e.name).join(' · ') : 'Aucun exercice : en choisir'}</span>
          {candidates.length > 1 && <span className="shrink-0 text-sm font-normal text-ink-3">{candidates.length} au choix</span>}
          <ChevronDownIcon className="size-5 shrink-0 text-ink-2" />
        </button>
      </div>
      <div className="grid grid-cols-[3.75rem_repeat(3,minmax(0,1fr))] gap-1.5 p-3">
        <Cell label="Séries" onClick={() => onCell('sets')}>
          {formatSets(item.setsMin, item.setsMax)}
        </Cell>
        <Cell label="Cible" onClick={() => onCell('target')}>
          {item.targets.length > 0
            ? item.targets.map((t, i) => (
                <span key={i} className="block">
                  {i > 0 && <span className="font-normal text-ink-2">ou </span>}
                  {formatTarget(t)}
                </span>
              ))
            : item.targetText || '—'}
        </Cell>
        <Cell label={intensity.label} onClick={() => onCell('intensity')}>
          {intensity.value}
        </Cell>
        <Cell label="Repos" onClick={() => onCell('rest')}>
          {restParts(item.restMinSec, item.restMaxSec).map((part, i) => (
            <span key={i} className="block whitespace-nowrap">
              {i > 0 && <span className="font-normal text-ink-2">à </span>}
              {part}
            </span>
          ))}
        </Cell>
      </div>
      {(Object.keys(item.byTranche ?? {}).length > 0 || (item.lowerProgressionIds ?? []).length > 0) && (
        <div className="-mt-1 flex flex-col gap-0.5 px-3 pb-2 text-sm text-ink-2">
          {Object.entries(item.byTranche ?? {}).map(([tranche, o]) => (
            <span key={tranche}>
              <b className="text-ink">T{tranche}</b> :{' '}
              {[
                o.setsMin !== undefined || o.setsMax !== undefined ? `${formatSets(o.setsMin ?? item.setsMin, o.setsMax ?? item.setsMax)} séries` : '',
                o.targetText ?? '',
                o.intensityText ?? '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          ))}
          {(item.lowerProgressionIds ?? []).length > 0 && (
            <span>
              Progressions inférieures : {(item.lowerProgressionIds ?? []).map((id) => lookups.exercises.get(id)?.name ?? '?').join(' → ')}
            </span>
          )}
        </div>
      )}
      {item.notes && (
        <button type="button" onClick={() => onCell('notes')} className="-mt-1 block w-full px-3 pb-3 text-left text-sm text-ink-2 active:text-ink">
          <span className="line-clamp-2">Note : {item.notes}</span>
        </button>
      )}
    </article>
  );
}

/**
 * Bloc des composantes réparties par l'appli : ce que le type de la séance accepte (réglage du programme) et ce que
 * la séance reçoit à chacune de ses places du déroulé.
 */
function ComponentBlock({ template, context, lookups, href }: { template: SessionTemplate; context: ProgramContext; lookups: Lookups; href: string }) {
  const { program } = context;
  const sequence = program.schedule === 'sequence';
  const d = componentDistribution(context.settings, lookups.templates);
  const type = lookups.sessionTypes.get(template.sessionTypeId);
  const name = (id: string) => lookups.elements.get(id)?.name.toLowerCase() ?? '?';
  // Places de la séance, regroupées par composantes reçues.
  const groups = new Map<string, { labels: string[]; text: string }>();
  for (const slot of d.slots.filter((s) => s.template.id === template.id)) {
    const list = d.bySlot.get(slotKey(slot.seqDay, slot.moment)) ?? [];
    const sets = [...new Set(list.map((c) => c.setsPerSession))];
    const text =
      list.length === 0
        ? 'aucune composante'
        : sets.length === 1
          ? `${joinFrench(list.map((c) => name(c.elementId)))}, ${sets[0]} série${sets[0] > 1 ? 's' : ''}${list.length > 1 ? ' chacun' : ''}`
          : joinFrench(list.map((c) => `${name(c.elementId)} ${c.setsPerSession}`));
    const group = groups.get(text) ?? { labels: [], text };
    group.labels.push(sequence ? String(slot.seqDay) : `J${slot.seqDay}`);
    groups.set(text, group);
  }
  const where = (labels: string[]) => {
    const plural = labels.length > 1;
    if (!sequence) return joinFrench(labels);
    return template.moment === 'morning' ? `Matin${plural ? 's' : ''} ${joinFrench(labels)}` : `Séance${plural ? 's' : ''} ${joinFrench(labels)}`;
  };
  const blockName = lookups.blocks.get(program.componentBlockTypeId ?? '')?.name ?? 'Composantes';
  return (
    <section className="mt-2 flex flex-col gap-2 rounded-2xl border border-line bg-card p-3" aria-label={blockName}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-2xl leading-none tracking-wider text-ink-3">{blockName}</h2>
        <Badge>Réparti par l’appli</Badge>
      </div>
      <p className="text-sm text-ink-2">Les séances {type ? `de type « ${type.name} »` : 'de ce type'} acceptent :</p>
      <AcceptanceChips program={program} sessionTypeId={template.sessionTypeId} lookups={lookups} />
      {groups.size === 0 ? (
        <p className="text-sm text-ink-2">Hors du déroulé : faite à une place, la séance reçoit les composantes de cette place.</p>
      ) : (
        [...groups.values()].map((g) => (
          <p key={g.text} className="text-sm text-ink">
            {where(g.labels)} : {g.text}.
          </p>
        ))
      )}
      <button type="button" onClick={() => navigate(href)} className="flex min-h-11 items-center justify-center rounded-xl border border-line font-semibold text-ink-2 active:bg-card-2">
        Composantes et répartition
      </button>
    </section>
  );
}

/** Repère orange de l'endroit où la ligne glissée sera déposée. */
function DropMark() {
  return <div className="-my-1 h-1 rounded-full bg-accent" aria-hidden />;
}

function Editor({ template, data, lookups }: { template: SessionTemplate; data: AppData; lookups: Lookups }) {
  const [sheet, setSheet] = useState<SheetState>(null);
  const [candidates, setCandidates] = useState<ID[]>([]);
  const [blockMenu, setBlockMenu] = useState<ID | null>(null);
  const [picker, setPicker] = useState<{ blockTypeId?: ID } | null>(null);
  const plan = buildPlan(template, lookups.blocks, lookups.elements);
  const context = programContext(data, lookups, template.programId);
  const canAdopt = !template.archived && blockSources(template, context.templates).length > 0;
  const days = templateDays(template.id, context.program.weekPlan);
  const type = lookups.sessionTypes.get(template.sessionTypeId);
  const { minSec, maxSec } = estimateDuration(template, context.settings, lookups);
  const saveItems = (items: PrescriptionItem[]) => saveTemplate(db, { ...template, items });
  /** Lignes d'un bloc dans l'ordre affiché (paires et supersets ensemble). */
  const shownIds = (blockTypeId: ID) => plan.blocks.filter((b) => b.blockTypeId === blockTypeId).flatMap((b) => b.units.flatMap((u) => u.itemIds));
  const blockOf = (id: ID) => template.items.find((i) => i.id === id)?.blockTypeId ?? '';

  const drag = useVerticalDrag<ID>({
    measure: (handle) => measureDropRects(handle.closest('[data-sort-group]') ?? document, '[data-sort-item]', handle),
    pick: insertionIndex,
    onDrop: (id, to) => {
      const shown = shownIds(blockOf(id));
      if (to !== shown.indexOf(id)) void saveItems(reorderItem(template.items, shown, id, to));
    },
  });
  const dragState = drag.state;
  /** Ligne devant laquelle la ligne glissée irait (`null` : à la fin du bloc), ou rien si elle ne bouge pas. */
  const dropBefore = (() => {
    if (!dragState || dragState.target === null) return undefined;
    const shown = shownIds(blockOf(dragState.source));
    const from = shown.indexOf(dragState.source);
    if (dragState.target === from) return undefined;
    return shown.filter((x) => x !== dragState.source)[dragState.target] ?? null;
  })();

  const lineItem = sheet?.kind === 'line' ? template.items.find((i) => i.id === sheet.itemId) : undefined;
  const lineShown = lineItem ? shownIds(lineItem.blockTypeId) : [];
  const lineIndex = lineItem ? lineShown.indexOf(lineItem.id) : -1;
  const candidatesItem = sheet?.kind === 'candidates' ? template.items.find((i) => i.id === sheet.itemId) : undefined;

  const removeLine = async (item: PrescriptionItem) => {
    const partners = blockPartners(template, item.blockTypeId, context.templates);
    const previous = await saveItems(template.items.filter((i) => i.id !== item.id));
    showToast(partners.length > 0 ? `Ligne supprimée, aussi dans ${templateNames(partners)}.` : 'Ligne supprimée.', {
      action: { label: 'Annuler', run: () => void restoreTemplates(db, previous) },
    });
  };

  const card = (item: PrescriptionItem) => (
    <div key={item.id} className="flex flex-col gap-3">
      {dropBefore === item.id && <DropMark />}
      <LineCard
        item={item}
        lookups={lookups}
        dragging={dragState?.source === item.id}
        dy={dragState?.dy ?? 0}
        handleProps={drag.handleProps(item.id)}
        onCell={(field) => setSheet({ kind: 'item', target: { itemId: item.id, field } })}
        onCandidates={() => {
          setCandidates(item.candidateExerciseIds);
          setSheet({ kind: 'candidates', itemId: item.id });
        }}
        onMenu={() => setSheet({ kind: 'line', itemId: item.id })}
      />
    </div>
  );

  return (
    <Screen
      title={template.name}
      subtitle={
        <button type="button" onClick={() => setSheet({ kind: 'template' })} className="text-left active:text-ink">
          <span className="mr-2 inline-block size-3 rounded-full align-middle" style={{ backgroundColor: type?.color }} aria-hidden />
          {[type?.name, MOMENT_LABEL[template.moment], days.length > 0 ? days.join(', ') : 'hors semaine type'].filter(Boolean).join(' · ')}
          {' · '}
          <span className="whitespace-nowrap">{formatDurationRange(minSec, maxSec)}</span>
          {template.optional && (
            <span className="ml-2 align-middle">
              <Badge>optionnelle</Badge>
            </span>
          )}
        </button>
      }
      onBack={() => goBack('/programs')}
      aside={
        <button type="button" aria-label="Options du modèle" onClick={() => setSheet({ kind: 'template' })} className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-line text-ink-2 active:bg-card-2">
          <DotsIcon className="size-7" />
        </button>
      }
    >
      <ProgramChecks program={context.plan} settings={context.settings} lookups={lookups} template={template} sticky />

      {template.archived && (
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-card-2 p-3">
          <span className="flex-1 text-ink-2">Modèle archivé : il n’est plus proposé.</span>
          <button type="button" onClick={() => void setTemplateArchived(db, template.id, false)} className="min-h-11 rounded-xl border border-line px-3 font-semibold active:bg-card">
            Désarchiver
          </button>
        </div>
      )}
      {template.notes && <p className="text-ink-2">{template.notes}</p>}

      {plan.blocks.map((block, b) => {
        const name = lookups.blocks.get(block.blockTypeId)?.name ?? 'Bloc inconnu';
        const last = block.units.at(-1)?.itemIds.at(-1);
        const partners = blockPartners(template, block.blockTypeId, context.templates);
        return (
          <section key={`${block.blockTypeId}-${b}`} data-sort-group className="flex flex-col gap-3" aria-label={name}>
            <div className="mt-2 flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <h2 className="min-w-0 font-display text-2xl leading-none tracking-wider text-ink-3">{name}</h2>
                {partners.length > 0 ? <Badge tone="accent">Commun</Badge> : <Badge>Propre</Badge>}
                <button
                  type="button"
                  aria-label={`Options du bloc ${name}`}
                  onClick={() => setBlockMenu(block.blockTypeId)}
                  className="ml-auto flex size-12 shrink-0 items-center justify-center rounded-xl text-ink-2 active:bg-card-2"
                >
                  <DotsIcon className="size-6" />
                </button>
              </div>
              {partners.length > 0 && (
                <p className="text-sm text-ink-3">
                  Aussi dans {templateNames(partners)}. Une modification change {partners.length > 1 ? 'toutes ces séances' : 'les deux séances'}.
                </p>
              )}
            </div>
            {block.units.map((unit) => {
              const items = unit.itemIds.map((id) => plan.itemsById.get(id)!);
              if (unit.mode === 'single') return items.map(card);
              return (
                <div key={unit.itemIds.join('|')} className="flex flex-col gap-3 border-l-4 border-accent pl-2.5">
                  <div className="text-sm font-semibold text-accent">{unit.mode === 'alternate' ? 'En alternance · repos après la paire' : 'Superset · repos après chaque série'}</div>
                  {items.map(card)}
                </div>
              );
            })}
            {dropBefore === null && dragState && blockOf(dragState.source) === block.blockTypeId && last && <DropMark />}
            <button
              type="button"
              onClick={() => setSheet({ kind: 'item', target: { itemId: null, field: 'all', blockTypeId: block.blockTypeId } })}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line font-semibold text-ink-2 active:bg-card-2"
            >
              <PlusIcon className="size-5" /> Ligne en {name}
            </button>
          </section>
        );
      })}
      {template.items.length === 0 && <p className="text-ink-2">Aucune ligne pour l’instant.</p>}
      {context.program.components.length > 0 && !template.archived && (
        <ComponentBlock template={template} context={context} lookups={lookups} href={withProgram('/programs/components', data, context.program.id)} />
      )}

      <Button variant="secondary" className="mt-2" onClick={() => setSheet({ kind: 'item', target: { itemId: null, field: 'all' } })}>
        <PlusIcon /> Ajouter une ligne
      </Button>
      {canAdopt && (
        <Button variant="secondary" onClick={() => setPicker({})}>
          <LinkIcon /> Reprendre un bloc d’une autre séance
        </Button>
      )}

      <ItemSheet target={sheet?.kind === 'item' ? sheet.target : null} template={template} data={data} lookups={lookups} onClose={() => setSheet(null)} />
      <BlockMenuSheet
        template={template}
        blockTypeId={blockMenu}
        templates={context.templates}
        lookups={lookups}
        onClose={() => setBlockMenu(null)}
        onReplace={(blockTypeId) => setPicker({ blockTypeId })}
      />
      <BlockPickerSheet target={picker ? { template, ...picker } : null} templates={context.templates} lookups={lookups} onClose={() => setPicker(null)} />

      <Sheet open={lineItem !== undefined} onClose={() => setSheet(null)} title={lineItem ? lookups.elements.get(lineItem.elementId)?.name : ''}>
        {lineItem && (
          <MenuList>
            <MenuItem icon={<PencilIcon />} label="Modifier toute la ligne" hint="Exercices, bloc, élément, optionnelle…" onClick={() => setSheet({ kind: 'item', target: { itemId: lineItem.id, field: 'all' } })} />
            <MenuItem
              icon={<CopyIcon />}
              label="Dupliquer la ligne"
              onClick={() => {
                void saveItems(duplicateItem(template.items, lineItem.id, newId));
                setSheet(null);
              }}
            />
            <MenuItem
              icon={<ArrowUpIcon />}
              label="Monter"
              disabled={lineIndex <= 0}
              onClick={() => {
                void saveItems(reorderItem(template.items, lineShown, lineItem.id, lineIndex - 1));
                setSheet(null);
              }}
            />
            <MenuItem
              icon={<ArrowDownIcon />}
              label="Descendre"
              disabled={lineIndex < 0 || lineIndex >= lineShown.length - 1}
              onClick={() => {
                void saveItems(reorderItem(template.items, lineShown, lineItem.id, lineIndex + 1));
                setSheet(null);
              }}
            />
            <MenuItem
              icon={<TrashIcon />}
              label="Supprimer la ligne"
              hint="Les séances déjà faites gardent leur contenu."
              danger
              onClick={() => {
                setSheet(null);
                void removeLine(lineItem);
              }}
            />
          </MenuList>
        )}
      </Sheet>

      {candidatesItem && (
        <CandidatesSheet
          open
          onClose={() => setSheet(null)}
          data={data}
          elementId={candidatesItem.elementId}
          selected={candidates}
          onChange={setCandidates}
          onValidate={() => {
            const names = candidates.map((id) => lookups.exercises.get(id)?.name ?? '?').join(', ');
            void saveItems(template.items.map((i) => (i.id === candidatesItem.id ? { ...i, candidateExerciseIds: candidates, candidatesText: names } : i)));
            setSheet(null);
          }}
        />
      )}

      <TemplateActions key={sheet?.kind === 'template' ? template.id : 'aucun'} target={sheet?.kind === 'template' ? { template } : null} onClose={() => setSheet(null)} data={data} lookups={lookups} inEditor />
    </Screen>
  );
}
