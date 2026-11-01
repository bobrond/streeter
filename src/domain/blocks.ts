// Blocs communs (décidé avec l'utilisateur le 01/11/2026) : une séance assemble des blocs, et un bloc (les lignes
// d'un même type de bloc d'un modèle) peut être commun à plusieurs séances d'un programme. Ses lignes sont alors les
// mêmes, identifiants compris, dans chacune : modifier le bloc dans une séance le modifie dans toutes. Un bloc qui
// n'est pas commun est propre à sa séance. Chaque modèle garde ses lignes : la séance, le volume et l'historique
// lisent les modèles comme avant.
import { joinFrench } from './labels';
import type { ID, PrescriptionItem, SessionTemplate } from './types';

/** « Combo libre et Séance type », par ordre alphabétique. */
export function templateNames(templates: readonly Pick<SessionTemplate, 'name'>[]): string {
  return joinFrench(templates.map((t) => t.name).sort((a, b) => a.localeCompare(b, 'fr')));
}

/** Lignes d'un bloc d'un modèle, dans l'ordre du modèle. */
export function blockItems(template: Pick<SessionTemplate, 'items'>, blockTypeId: ID): PrescriptionItem[] {
  return template.items.filter((item) => item.blockTypeId === blockTypeId);
}

/** Types de bloc d'un modèle, dans l'ordre de ses lignes. */
export function templateBlockTypeIds(template: Pick<SessionTemplate, 'items'>): ID[] {
  return [...new Set(template.items.map((item) => item.blockTypeId))];
}

/** Autres modèles du même programme qui partagent ce bloc. */
export function blockPartners(template: SessionTemplate, blockTypeId: ID, templates: readonly SessionTemplate[]): SessionTemplate[] {
  const link = template.sharedBlocks[blockTypeId];
  if (!link) return [];
  return templates.filter((t) => t.id !== template.id && t.programId === template.programId && t.sharedBlocks[blockTypeId] === link);
}

/** Un bloc d'autres séances, à reprendre : un bloc commun (toutes ses séances) ou un bloc propre. */
export interface BlockSource {
  blockTypeId: ID;
  /** Séance d'où le bloc est repris : la première de celles qui l'ont. */
  source: SessionTemplate;
  /** Séances qui ont ce bloc. */
  templates: SessionTemplate[];
  items: PrescriptionItem[];
}

/**
 * Blocs que `target` peut reprendre d'une autre séance de son programme (non archivée), tous types de bloc ou un
 * seul : un par bloc commun, un par bloc propre ; pas ceux que `target` partage déjà.
 */
export function blockSources(target: SessionTemplate, templates: readonly SessionTemplate[], blockTypeId?: ID): BlockSource[] {
  const others = templates.filter((t) => t.id !== target.id && t.programId === target.programId && !t.archived);
  const sources: BlockSource[] = [];
  const seen = new Set<string>();
  for (const template of others) {
    for (const id of templateBlockTypeIds(template)) {
      if (blockTypeId !== undefined && id !== blockTypeId) continue;
      const link = template.sharedBlocks[id];
      if (link && target.sharedBlocks[id] === link) continue;
      if (link && seen.has(`${id}\n${link}`)) continue;
      if (link) seen.add(`${id}\n${link}`);
      const members = link ? others.filter((t) => t.sharedBlocks[id] === link) : [template];
      sources.push({ blockTypeId: id, source: template, templates: members, items: blockItems(template, id) });
    }
  }
  return sources;
}

/** Nombre de blocs d'un modèle, et combien sont communs avec un autre modèle. */
export function blockSummary(template: SessionTemplate, templates: readonly SessionTemplate[]): { blocks: number; shared: number } {
  const ids = templateBlockTypeIds(template);
  return { blocks: ids.length, shared: ids.filter((id) => blockPartners(template, id, templates).length > 0).length };
}

/** JSON aux clés triées : deux lignes identiques donnent le même texte, quel que soit l'ordre de leurs champs. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** Contenu d'une ligne, sans son identifiant ; des repères par tranche ou des progressions vides comptent pour rien. */
function lineKey(item: PrescriptionItem): string {
  const content: Partial<PrescriptionItem> = { ...item };
  delete content.id;
  if (Object.keys(item.byTranche ?? {}).length === 0) delete content.byTranche;
  if ((item.lowerProgressionIds ?? []).length === 0) delete content.lowerProgressionIds;
  return stableJson(content);
}

/** Contenu d'un bloc : deux blocs de même contenu sont identiques. */
export function blockKey(items: readonly PrescriptionItem[]): string {
  return items.map(lineKey).join('\n');
}

/**
 * Modèle dont le bloc `blockTypeId` a pour lignes des copies de `items` : à la place de l'ancien bloc, sinon avant le
 * premier bloc qui vient après lui (`blockOrder`), sinon à la fin. `link` : bloc commun, ou `null` pour un bloc propre ;
 * un bloc sans ligne n'est jamais commun.
 */
export function withBlock(
  template: SessionTemplate,
  blockTypeId: ID,
  items: readonly PrescriptionItem[],
  link: ID | null,
  blockOrder?: (blockTypeId: ID) => number,
): SessionTemplate {
  const others = template.items.filter((item) => item.blockTypeId !== blockTypeId);
  const at = template.items.findIndex((item) => item.blockTypeId === blockTypeId);
  // Les lignes d'avant la première du bloc ne sont pas du bloc : il reprend sa place au même rang.
  let index = others.length;
  if (at >= 0) index = at;
  else if (blockOrder) {
    const next = others.findIndex((item) => blockOrder(item.blockTypeId) > blockOrder(blockTypeId));
    if (next >= 0) index = next;
  }
  const sharedBlocks = { ...template.sharedBlocks };
  if (link && items.length > 0) sharedBlocks[blockTypeId] = link;
  else delete sharedBlocks[blockTypeId];
  const copies = items.map((item) => structuredClone(item));
  return { ...template, items: [...others.slice(0, index), ...copies, ...others.slice(index)], sharedBlocks };
}

const sameLines = (a: readonly PrescriptionItem[], b: readonly PrescriptionItem[]) =>
  a.length === b.length && a.every((item, i) => item.id === b[i].id) && blockKey(a) === blockKey(b);

/**
 * Avant d'enregistrer un modèle : ses blocs communs sont recopiés dans les autres modèles qui les partagent. Un bloc
 * commun vidé ne l'est plus, dans aucun modèle ; un bloc commun qu'aucun autre modèle ne partage redevient propre.
 * Renvoie le modèle à écrire et les autres modèles qui changent.
 */
export function syncSharedBlocks(template: SessionTemplate, others: readonly SessionTemplate[]): { saved: SessionTemplate; partners: SessionTemplate[] } {
  const sharedBlocks = { ...template.sharedBlocks };
  const changed = new Map<ID, SessionTemplate>();
  for (const [blockTypeId, link] of Object.entries(template.sharedBlocks)) {
    const items = blockItems(template, blockTypeId);
    const members = blockPartners(template, blockTypeId, others);
    if (members.length === 0 || items.length === 0) delete sharedBlocks[blockTypeId];
    for (const member of members) {
      const current = changed.get(member.id) ?? member;
      if (items.length > 0 && sameLines(blockItems(current, blockTypeId), items)) continue;
      changed.set(member.id, withBlock(current, blockTypeId, items, items.length > 0 ? link : null));
    }
  }
  return { saved: { ...template, sharedBlocks }, partners: [...changed.values()] };
}

/** Bloc rendu propre au modèle : copie de ses lignes, avec de nouveaux identifiants, hors du bloc commun. */
export function detachBlock(template: SessionTemplate, blockTypeId: ID, newId: () => ID): SessionTemplate {
  if (!template.sharedBlocks[blockTypeId]) return template;
  return withBlock(template, blockTypeId, blockItems(template, blockTypeId).map((item) => ({ ...item, id: newId() })), null);
}

/** Tous les blocs communs du modèle rendus propres (modèle archivé). */
export function detachAllBlocks(template: SessionTemplate, newId: () => ID): SessionTemplate {
  return Object.keys(template.sharedBlocks).reduce((t, blockTypeId) => detachBlock(t, blockTypeId, newId), template);
}

/** Retire un bloc du modèle ; les autres modèles qui le partagent le gardent. */
export function removeBlock(template: SessionTemplate, blockTypeId: ID): SessionTemplate {
  return withBlock(template, blockTypeId, [], null);
}

/**
 * « Reprendre le bloc d'une autre séance » : le bloc de `target` devient celui de `source`, en commun, à la place de
 * celui qu'il avait. La source reçoit un identifiant de bloc commun si elle n'en avait pas.
 */
export function adoptBlock(
  target: SessionTemplate,
  source: SessionTemplate,
  blockTypeId: ID,
  args: { newId: () => ID; blockOrder: (blockTypeId: ID) => number },
): { target: SessionTemplate; source: SessionTemplate } {
  const items = blockItems(source, blockTypeId);
  if (items.length === 0) return { target, source };
  const link = source.sharedBlocks[blockTypeId] ?? args.newId();
  return {
    target: withBlock(target, blockTypeId, items, link, args.blockOrder),
    source: source.sharedBlocks[blockTypeId] ? source : { ...source, sharedBlocks: { ...source.sharedBlocks, [blockTypeId]: link } },
  };
}

/**
 * « Nouvelle séance avec les mêmes blocs » : copie de `source` dont tous les blocs sont communs avec elle (la source
 * reçoit les identifiants de bloc commun qui lui manquent).
 */
export function withSameBlocks(source: SessionTemplate, copy: Pick<SessionTemplate, 'id' | 'name'>, newId: () => ID): { source: SessionTemplate; copy: SessionTemplate } {
  const sharedBlocks = Object.fromEntries(templateBlockTypeIds(source).map((blockTypeId) => [blockTypeId, source.sharedBlocks[blockTypeId] ?? newId()]));
  const linked = { ...source, sharedBlocks };
  return { source: linked, copy: { ...structuredClone(linked), id: copy.id, name: copy.name, archived: false } };
}

/**
 * Met en commun les blocs identiques (même type de bloc, mêmes lignes) des modèles non archivés d'un même programme :
 * migration de la base et des sauvegardes, import d'un fichier programme. Un bloc déjà commun le reste ; les lignes
 * d'un bloc mis en commun prennent les identifiants de celles du premier modèle. Renvoie tous les modèles.
 */
export function linkIdenticalBlocks(templates: readonly SessionTemplate[], newId: () => ID): SessionTemplate[] {
  const result = [...templates];
  const groups = new Map<string, { blockTypeId: ID; indices: number[] }>();
  result.forEach((template, index) => {
    if (template.archived) return;
    for (const blockTypeId of templateBlockTypeIds(template)) {
      if (template.sharedBlocks[blockTypeId]) continue;
      const key = `${template.programId}\n${blockTypeId}\n${blockKey(blockItems(template, blockTypeId))}`;
      const group = groups.get(key) ?? { blockTypeId, indices: [] };
      group.indices.push(index);
      groups.set(key, group);
    }
  });
  for (const { blockTypeId, indices } of groups.values()) {
    if (indices.length < 2) continue;
    const link = newId();
    const canonical = blockItems(result[indices[0]], blockTypeId);
    for (const index of indices) result[index] = withBlock(result[index], blockTypeId, canonical, link);
  }
  return result;
}
