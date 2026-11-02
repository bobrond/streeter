// Passage d'un programme aux composantes réparties (phase H2) : ses lignes de composantes écrites deviennent les
// composantes du programme, que l'appli répartit ensuite elle-même (`components.ts`). Novembre : « Séance type 5 »
// ne diffère plus de Séance type une fois ses composantes retirées ; elle disparaît de la séquence. Les séances déjà
// faites gardent leur copie ; les programmes passés gardent leurs composantes écrites (on ne les convertit pas).
import { blockKey, detachAllBlocks } from './blocks';
import { componentFromLine, normalizeAcceptance } from './components';
import type { ComponentAcceptance, Element, ID, Program, ProgramComponent, SessionTemplate } from './types';
import { SEQ_DAYS } from './types';

export interface ComponentConversion {
  program: Program;
  /** Modèles du programme réécrits : sans leurs lignes de composantes ; une séance fusionnée archivée. */
  templates: SessionTemplate[];
  /** Séances identiques à une autre une fois leurs composantes retirées : archivées si elles ont servi, supprimées sinon. */
  merged: { template: SessionTemplate; into: SessionTemplate; archive: boolean }[];
  /** Lignes de composantes retirées des séances. */
  removedLines: number;
}

/**
 * Composantes réparties tirées des lignes écrites d'un programme, ou `null` s'il n'en a pas (ou déjà des composantes
 * réparties). Pour chaque composante, sa prescription est celle de sa première ligne obligatoire d'un soir obligatoire
 * (dans l'ordre du déroulé, puis les matins, puis les autres séances), ses séries par séance le minimum de cette
 * ligne ; son bloc devient celui des composantes. Chaque type de séance accepte les composantes que ses séances
 * avaient (toutes : aucun réglage). Les séances devenues identiques (même type, moment, notes et lignes)
 * sont fusionnées dans la première du déroulé.
 */
export function convertToComponents(
  program: Program,
  templates: readonly SessionTemplate[],
  elements: readonly Element[],
  args: { newId: () => ID; usedTemplateIds: ReadonlySet<ID> },
): ComponentConversion | null {
  if (program.components.length > 0) return null;
  const componentIds = new Set(elements.filter((e) => e.kind === 'component').map((e) => e.id));
  const active = templates.filter((t) => t.programId === program.id && !t.archived);
  const isComponent = (elementId: ID) => componentIds.has(elementId);
  if (!active.some((t) => t.items.some((item) => isComponent(item.elementId)))) return null;

  // Ordre des séances : soirs du déroulé, matins, puis les autres.
  const rank = new Map<ID, number>();
  for (const moment of ['evening', 'morning'] as const) {
    for (const day of SEQ_DAYS) {
      const id = program.weekPlan[day][moment];
      if (id && !rank.has(id)) rank.set(id, rank.size);
    }
  }
  const ordered = [...active].sort((a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name, 'fr'));

  const components: ProgramComponent[] = [];
  let componentBlockTypeId: ID | null = null;
  for (const element of [...elements].filter((e) => isComponent(e.id)).sort((a, b) => a.order - b.order)) {
    const lines = ordered.flatMap((t) => t.items.filter((item) => item.elementId === element.id).map((item) => ({ item, template: t })));
    const source =
      lines.find(({ item, template }) => template.moment === 'evening' && !template.optional && !item.optional) ??
      lines.find(({ item }) => !item.optional) ??
      lines[0];
    if (!source) continue;
    components.push(componentFromLine(args.newId(), source.item));
    componentBlockTypeId ??= source.item.blockTypeId;
  }

  const componentAcceptance: Record<ID, ComponentAcceptance> = { ...program.componentAcceptance };
  for (const typeId of new Set(active.map((t) => t.sessionTypeId))) {
    const lines = active.filter((t) => t.sessionTypeId === typeId).flatMap((t) => t.items.filter((item) => isComponent(item.elementId)));
    const accepted = normalizeAcceptance(lines.map((item) => item.elementId), components);
    if (accepted === null) delete componentAcceptance[typeId];
    else componentAcceptance[typeId] = accepted;
  }

  let removedLines = 0;
  const stripped = ordered.map((template) => {
    const items = template.items.filter((item) => !isComponent(item.elementId));
    removedLines += template.items.length - items.length;
    if (items.length === template.items.length) return template;
    // Un bloc commun vidé ne l'est plus.
    const sharedBlocks = Object.fromEntries(Object.entries(template.sharedBlocks).filter(([blockTypeId]) => items.some((i) => i.blockTypeId === blockTypeId)));
    return { ...template, items, sharedBlocks };
  });

  const merged: ComponentConversion['merged'] = [];
  const kept = new Map<string, SessionTemplate>();
  const remap = new Map<ID, ID>();
  for (const template of stripped) {
    const key = JSON.stringify([template.sessionTypeId, template.moment, template.optional, template.notes, blockKey(template.items)]);
    const into = kept.get(key);
    if (!into) {
      kept.set(key, template);
      continue;
    }
    remap.set(template.id, into.id);
    merged.push({ template, into, archive: args.usedTemplateIds.has(template.id) });
  }
  const weekPlan = structuredClone(program.weekPlan);
  for (const day of SEQ_DAYS) {
    for (const moment of ['morning', 'evening'] as const) {
      const id = weekPlan[day][moment];
      if (id && remap.has(id)) weekPlan[day][moment] = remap.get(id)!;
    }
  }

  const changed = stripped.filter((t, i) => t !== ordered[i] && !remap.has(t.id));
  const archived = merged.filter((m) => m.archive).map((m) => ({ ...detachAllBlocks(m.template, args.newId), archived: true }));
  return {
    program: { ...program, components, componentBlockTypeId, componentAcceptance, weekPlan },
    templates: [...changed, ...archived],
    merged,
    removedLines,
  };
}
