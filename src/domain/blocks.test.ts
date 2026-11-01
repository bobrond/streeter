import { describe, expect, it } from 'vitest';
import { item, template } from '../test/builders';
import {
  adoptBlock,
  blockItems,
  blockPartners,
  blockSources,
  blockSummary,
  detachAllBlocks,
  detachBlock,
  linkIdenticalBlocks,
  removeBlock,
  syncSharedBlocks,
  withSameBlocks,
} from './blocks';
import type { PrescriptionItem, SessionTemplate } from './types';

// Blocs dans l'ordre : échauffement, travail principal, renfo composante.
const ORDER: Record<string, number> = { echauf: 0, principal: 1, compo: 2 };
const blockOrder = (id: string) => ORDER[id] ?? 99;

const line = (id: string, blockTypeId: string, elementId: string, options: Partial<PrescriptionItem> = {}) => item({ id, blockTypeId, elementId, ...options });

function counter(prefix: string) {
  let n = 0;
  return () => `${prefix}${++n}`;
}

/** Novembre en petit : Séance type et Combo libre ont le même échauffement, pas le même travail principal. */
function november() {
  const seanceType = template('Séance type', 'evening', [line('a1', 'echauf', 'connexion'), line('a2', 'principal', 'planche', { setsMin: 4, setsMax: 5 }), line('a3', 'compo', 'dentele')], { id: 'st' });
  const combo = template('Combo libre', 'evening', [line('b1', 'echauf', 'connexion'), line('b2', 'principal', 'planche', { setsMin: 0, setsMax: 8 }), line('b3', 'compo', 'dentele')], { id: 'cl' });
  return { seanceType, combo };
}

describe('mise en commun des blocs identiques', () => {
  it('met en commun les blocs identiques d’un programme, avec les lignes du premier modèle', () => {
    const { seanceType, combo } = november();
    const [st, cl] = linkIdenticalBlocks([seanceType, combo], counter('commun-'));
    expect(st.sharedBlocks).toEqual({ echauf: 'commun-1', compo: 'commun-2' });
    expect(cl.sharedBlocks).toEqual({ echauf: 'commun-1', compo: 'commun-2' });
    expect(st.items).toEqual(seanceType.items);
    expect(cl.items.map((i) => i.id)).toEqual(['a1', 'b2', 'a3']);
    expect(blockItems(cl, 'principal')).toEqual(blockItems(combo, 'principal'));
  });

  it('laisse à part les modèles archivés, ceux d’un autre programme et les blocs déjà communs', () => {
    const { seanceType, combo } = november();
    const archived = { ...combo, id: 'old', archived: true };
    const october = { ...combo, id: 'oct', programId: 'octobre' };
    const linked = { ...seanceType, id: 'lie', sharedBlocks: { echauf: 'deja' } };
    const result = linkIdenticalBlocks([archived, october, linked, seanceType], counter('commun-'));
    expect(result.map((t) => t.id)).toEqual(['old', 'oct', 'lie', 'st']);
    expect(result[0]).toEqual(archived);
    expect(result[1]).toEqual(october);
    // L'échauffement de « lie » est déjà commun : seuls les autres blocs identiques se rejoignent.
    expect(result[2].sharedBlocks).toEqual({ echauf: 'deja', principal: 'commun-1', compo: 'commun-2' });
    expect(result[3].sharedBlocks).toEqual({ principal: 'commun-1', compo: 'commun-2' });
  });

  it('compare le contenu des lignes, pas l’ordre de leurs champs ni des repères vides', () => {
    const a = template('A', 'evening', [line('a1', 'echauf', 'connexion', { byTranche: {}, lowerProgressionIds: [] })]);
    const reordered = Object.fromEntries(Object.entries(line('b1', 'echauf', 'connexion')).reverse()) as unknown as PrescriptionItem;
    const b = template('B', 'evening', [reordered]);
    const c = template('C', 'evening', [line('c1', 'echauf', 'connexion', { notes: 'autre' })]);
    const [la, lb, lc] = linkIdenticalBlocks([a, b, c], counter('commun-'));
    expect(la.sharedBlocks.echauf).toBe('commun-1');
    expect(lb.sharedBlocks.echauf).toBe('commun-1');
    expect(lc.sharedBlocks).toEqual({});
  });
});

describe('enregistrement d’un bloc commun', () => {
  function linked() {
    const { seanceType, combo } = november();
    const [st, cl] = linkIdenticalBlocks([seanceType, combo], counter('commun-'));
    return { st, cl };
  }

  it('recopie la modification d’un bloc commun dans les autres séances, à sa place', () => {
    const { st, cl } = linked();
    const edited = { ...cl, items: cl.items.map((i) => (i.id === 'a1' ? { ...i, setsMax: 3 } : i)) };
    const { saved, partners } = syncSharedBlocks(edited, [st, cl]);
    expect(saved).toEqual(edited);
    expect(partners).toHaveLength(1);
    expect(partners[0].items.map((i) => [i.id, i.setsMax])).toEqual([
      ['a1', 3],
      ['a2', 5],
      ['a3', 2],
    ]);
  });

  it('ne touche ni les blocs propres ni les séances qui ne changent pas', () => {
    const { st, cl } = linked();
    const edited = { ...cl, items: cl.items.map((i) => (i.id === 'b2' ? { ...i, setsMax: 6 } : i)), name: 'Combo' };
    expect(syncSharedBlocks(edited, [st, cl]).partners).toEqual([]);
  });

  it('une ligne ajoutée ou supprimée dans un bloc commun l’est partout ; un bloc vidé n’est plus commun', () => {
    const { st, cl } = linked();
    const added = { ...cl, items: [...cl.items, line('x', 'echauf', 'connexion')] };
    expect(blockItems(syncSharedBlocks(added, [st, cl]).partners[0], 'echauf').map((i) => i.id)).toEqual(['a1', 'x']);
    const emptied = { ...cl, items: cl.items.filter((i) => i.blockTypeId !== 'echauf') };
    const { saved, partners } = syncSharedBlocks(emptied, [st, cl]);
    expect(saved.sharedBlocks).toEqual({ compo: 'commun-2' });
    expect(partners[0].items.map((i) => i.id)).toEqual(['a2', 'a3']);
    expect(partners[0].sharedBlocks).toEqual({ compo: 'commun-2' });
  });

  it('un bloc commun qu’aucune autre séance ne partage redevient propre ; un autre programme n’est pas touché', () => {
    const { st, cl } = linked();
    const elsewhere = { ...st, id: 'ailleurs', programId: 'autre' };
    const { saved, partners } = syncSharedBlocks({ ...cl, items: cl.items.map((i) => ({ ...i, notes: 'x' })) }, [elsewhere]);
    expect(saved.sharedBlocks).toEqual({});
    expect(partners).toEqual([]);
  });
});

describe('actions sur un bloc', () => {
  const linked = () => {
    const { seanceType, combo } = november();
    return linkIdenticalBlocks([seanceType, combo], counter('commun-'));
  };

  it('rendre propre : copie des lignes sous de nouveaux identifiants, hors du bloc commun', () => {
    const [st, cl] = linked();
    const own = detachBlock(cl, 'echauf', counter('n'));
    expect(own.sharedBlocks).toEqual({ compo: 'commun-2' });
    expect(blockItems(own, 'echauf')).toEqual([{ ...blockItems(cl, 'echauf')[0], id: 'n1' }]);
    expect(blockPartners(st, 'echauf', [st, own])).toEqual([]);
    expect(detachBlock(own, 'principal', counter('n'))).toBe(own);
    expect(detachAllBlocks(cl, counter('n')).sharedBlocks).toEqual({});
  });

  it('retirer un bloc : ses lignes quittent la séance, les autres séances le gardent', () => {
    const [st, cl] = linked();
    const without = removeBlock(cl, 'echauf');
    expect(without.items.map((i) => i.id)).toEqual(['b2', 'a3']);
    expect(without.sharedBlocks).toEqual({ compo: 'commun-2' });
    expect(blockItems(st, 'echauf')).toHaveLength(1);
  });

  it('reprendre le bloc d’une autre séance : en commun, à sa place dans l’ordre des blocs', () => {
    const { seanceType } = november();
    const morning = template('Matin', 'morning', [line('m2', 'compo', 'dentele', { optional: true })], { id: 'matin' });
    const { target, source } = adoptBlock(morning, seanceType, 'principal', { newId: counter('lien-'), blockOrder });
    expect(source.sharedBlocks).toEqual({ principal: 'lien-1' });
    expect(target.sharedBlocks).toEqual({ principal: 'lien-1' });
    expect(target.items.map((i) => i.id)).toEqual(['a2', 'm2']);
    // Un bloc propre est remplacé ; un bloc déjà commun garde son identifiant.
    const again = adoptBlock(morning, source, 'principal', { newId: counter('autre-'), blockOrder });
    expect(again.target.sharedBlocks).toEqual({ principal: 'lien-1' });
    expect(again.source).toBe(source);
    const replaced = adoptBlock({ ...morning, items: [line('m0', 'principal', 'planche'), ...morning.items] }, source, 'principal', { newId: counter('x'), blockOrder });
    expect(replaced.target.items.map((i) => i.id)).toEqual(['a2', 'm2']);
  });

  it('nouvelle séance avec les mêmes blocs : tous les blocs communs aux deux', () => {
    const { seanceType } = november();
    const { source, copy } = withSameBlocks({ ...seanceType, sharedBlocks: { echauf: 'deja', ancien: 'vide' } }, { id: 'copie', name: 'Séance type 2' }, counter('lien-'));
    expect(source.sharedBlocks).toEqual({ echauf: 'deja', principal: 'lien-1', compo: 'lien-2' });
    expect(copy).toMatchObject({ id: 'copie', name: 'Séance type 2', archived: false, sharedBlocks: source.sharedBlocks, items: seanceType.items });
    expect(blockSummary(copy, [source, copy])).toEqual({ blocks: 3, shared: 3 });
  });

  it('liste les blocs à reprendre : un par bloc commun, pas ceux déjà partagés ni les séances archivées', () => {
    const [st, cl] = linked();
    const matin = template('Matin', 'morning', [line('m1', 'principal', 'planche')], { id: 'matin' });
    const archived = template('Ancienne', 'evening', [line('o1', 'principal', 'planche')], { id: 'old', archived: true });
    const all: SessionTemplate[] = [st, cl, matin, archived];
    const sources = blockSources(matin, all);
    expect(sources.map((s) => [s.blockTypeId, s.templates.map((t) => t.id)])).toEqual([
      ['echauf', ['st', 'cl']],
      ['principal', ['st']],
      ['compo', ['st', 'cl']],
      ['principal', ['cl']],
    ]);
    expect(blockSources(cl, all).map((s) => [s.blockTypeId, s.source.id])).toEqual([
      ['principal', 'st'],
      ['principal', 'matin'],
    ]);
    expect(blockSources(cl, all, 'echauf')).toEqual([]);
    expect(blockSummary(cl, all)).toEqual({ blocks: 3, shared: 2 });
  });
});
