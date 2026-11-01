// Blocs d'une séance (décidé avec l'utilisateur le 01/11/2026) : options d'un bloc (le rendre propre, reprendre celui
// d'une autre séance, le retirer) et choix d'un bloc à reprendre. Un bloc commun se modifie une fois pour toutes les
// séances qui le partagent ; chaque action propose « Annuler ».
import { useState } from 'react';
import { db } from '../../db/db';
import type { Lookups } from '../../db/lookups';
import { replaceTemplates, restoreTemplates } from '../../db/programStore';
import { adoptBlock, blockItems, blockPartners, blockSources, detachBlock, removeBlock, templateNames, type BlockSource } from '../../domain/blocks';
import { formatSets } from '../../domain/labels';
import type { ID, SessionTemplate } from '../../domain/types';
import { newId } from '../../lib/id';
import { LinkIcon, TrashIcon, UnlinkIcon } from '../../ui/icons';
import { MenuItem, MenuList } from '../../ui/Menu';
import { ConfirmSheet, Sheet } from '../../ui/Sheet';
import { showToast } from '../../ui/toastStore';

/** Lignes d'un bloc en une phrase : « Planche 5 · Planche 4 ». */
function linesSummary(source: BlockSource, lookups: Lookups): string {
  return source.items.map((item) => `${lookups.elements.get(item.elementId)?.name ?? '?'} ${formatSets(item.setsMin, item.setsMax)}`).join(' · ');
}

const orderOf = (lookups: Lookups) => (blockTypeId: ID) => lookups.blocks.get(blockTypeId)?.order ?? Number.MAX_SAFE_INTEGER;

async function applyWithUndo(templates: readonly SessionTemplate[], message: string): Promise<void> {
  const previous = await replaceTemplates(db, templates);
  showToast(message, { action: { label: 'Annuler', run: () => void restoreTemplates(db, previous) } });
}

/** Options d'un bloc de la séance (⋯ de l'en-tête du bloc). `templates` : modèles du programme. */
export function BlockMenuSheet({
  template,
  blockTypeId,
  templates,
  lookups,
  onClose,
  onReplace,
}: {
  template: SessionTemplate;
  blockTypeId: ID | null;
  templates: readonly SessionTemplate[];
  lookups: Lookups;
  onClose: () => void;
  /** « Reprendre le bloc d'une autre séance » : ouvre le choix du bloc. */
  onReplace: (blockTypeId: ID) => void;
}) {
  if (!blockTypeId) return null;
  const name = lookups.blocks.get(blockTypeId)?.name ?? 'Bloc';
  const partners = blockPartners(template, blockTypeId, templates);
  const lines = blockItems(template, blockTypeId).length;
  // Une séance archivée garde des blocs propres (elle ne suit plus les autres séances).
  const sources = template.archived ? [] : blockSources(template, templates, blockTypeId);
  return (
    <Sheet open onClose={onClose} title={name}>
      <p className="mb-2 px-1 text-ink-2">
        {partners.length > 0
          ? `Bloc commun avec ${templateNames(partners)}. Une modification change ${partners.length > 1 ? 'toutes ces séances' : 'les deux séances'}.`
          : `Bloc propre à ${template.name}.`}
      </p>
      <MenuList>
        {partners.length > 0 && (
          <MenuItem
            icon={<UnlinkIcon />}
            label={`Rendre propre à « ${template.name} »`}
            hint={`${template.name} aura sa copie, modifiable à part ; ${templateNames(partners)} ${partners.length > 1 ? 'gardent' : 'garde'} le bloc commun.`}
            onClick={() => {
              onClose();
              void applyWithUndo([detachBlock(template, blockTypeId, newId)], `« ${name} » est maintenant propre à ${template.name}.`);
            }}
          />
        )}
        <MenuItem
          icon={<LinkIcon />}
          label="Reprendre le bloc d’une autre séance"
          hint={
            template.archived
              ? 'Séance archivée : ses blocs restent propres.'
              : sources.length > 0
                ? 'Remplace ce bloc par celui d’une autre séance, en commun.'
                : 'Aucune autre séance n’a ce bloc.'
          }
          disabled={sources.length === 0}
          onClick={() => {
            onClose();
            onReplace(blockTypeId);
          }}
        />
        <MenuItem
          icon={<TrashIcon />}
          label="Retirer ce bloc de la séance"
          hint={partners.length > 0 ? `${templateNames(partners)} ${partners.length > 1 ? 'le gardent' : 'le garde'}.` : `Ses ${lines} ligne${lines > 1 ? 's' : ''} ${lines > 1 ? 'sont supprimées' : 'est supprimée'} de cette séance.`}
          danger
          onClick={() => {
            onClose();
            void applyWithUndo([removeBlock(template, blockTypeId)], `« ${name} » retiré de ${template.name}.`);
          }}
        />
      </MenuList>
    </Sheet>
  );
}

/**
 * Choix d'un bloc d'une autre séance à reprendre, en commun : tous types de bloc (bas de l'éditeur) ou un seul
 * (options d'un bloc). Remplacer un bloc qui a des lignes demande confirmation.
 */
export function BlockPickerSheet({
  target,
  templates,
  lookups,
  onClose,
}: {
  target: { template: SessionTemplate; blockTypeId?: ID } | null;
  templates: readonly SessionTemplate[];
  lookups: Lookups;
  onClose: () => void;
}) {
  const [replacing, setReplacing] = useState<BlockSource | null>(null);
  if (!target) return null;
  const { template } = target;
  const order = orderOf(lookups);
  const blockName = (id: ID) => lookups.blocks.get(id)?.name ?? 'Bloc';
  const sources = blockSources(template, templates, target.blockTypeId).sort(
    (a, b) => order(a.blockTypeId) - order(b.blockTypeId) || a.source.name.localeCompare(b.source.name, 'fr'),
  );
  const adopt = (source: BlockSource) => {
    const result = adoptBlock(template, source.source, source.blockTypeId, { newId, blockOrder: order });
    onClose();
    void applyWithUndo([result.target, result.source], `« ${blockName(source.blockTypeId)} » repris de ${templateNames(source.templates)} : bloc commun.`);
  };
  const current = replacing ? blockItems(template, replacing.blockTypeId).length : 0;
  const currentPartners = replacing ? blockPartners(template, replacing.blockTypeId, templates) : [];
  return (
    <>
      <Sheet open={replacing === null} onClose={onClose} title={target.blockTypeId ? `Reprendre « ${blockName(target.blockTypeId)} »` : 'Reprendre un bloc'}>
        <p className="mb-3 px-1 text-ink-2">Le bloc repris devient commun. Une modification changera toutes les séances qui l’ont.</p>
        {sources.length === 0 ? (
          <p className="px-1 text-ink-3">Aucune autre séance du programme n’a de bloc à reprendre.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {sources.map((source) => (
              <button
                key={`${source.blockTypeId}-${source.source.id}`}
                type="button"
                onClick={() => (blockItems(template, source.blockTypeId).length > 0 ? setReplacing(source) : adopt(source))}
                className="flex min-h-14 flex-col gap-0.5 rounded-2xl border border-line bg-card px-4 py-3 text-left active:bg-card-2"
              >
                <span className="font-semibold">
                  {blockName(source.blockTypeId)} <span className="font-normal text-ink-2">· {templateNames(source.templates)}</span>
                </span>
                <span className="line-clamp-2 text-sm text-ink-3">{linesSummary(source, lookups)}</span>
              </button>
            ))}
          </div>
        )}
      </Sheet>
      <ConfirmSheet
        open={replacing !== null}
        onClose={() => setReplacing(null)}
        title={`Remplacer « ${replacing ? blockName(replacing.blockTypeId) : ''} » ?`}
        message={
          replacing && (
            <>
              <p>
                Les {current} ligne{current > 1 ? 's' : ''} de ce bloc dans {template.name} {current > 1 ? 'sont remplacées' : 'est remplacée'} par celles de{' '}
                {templateNames(replacing.templates)}, en commun.
              </p>
              {currentPartners.length > 0 && <p className="mt-2">{templateNames(currentPartners)} {currentPartners.length > 1 ? 'gardent' : 'garde'} l’ancien bloc.</p>}
            </>
          )
        }
        confirmLabel="Remplacer"
        onConfirm={() => replacing && adopt(replacing)}
      />
    </>
  );
}
