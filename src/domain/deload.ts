// Semaine allégée : séries du soir réduites (min et max de chaque ligne), matins masqués,
// intensité inchangée, échauffement non réduit (réglage par bloc).
import type { BlockType, ID, PrescriptionItem, SessionTemplate, Settings } from './types';

/** `ROUND(x; 0)` d'Excel pour x ≥ 0 : demi vers le haut. */
export function excelRound(x: number): number {
  return Math.floor(x + 0.5);
}

/**
 * Séries d'une ligne en semaine allégée : `ROUND(séries × (1 − réduction))`, jamais sous 1 série.
 * Calcul en entiers (pourcentage entier) pour reproduire exactement le tableur.
 */
export function deloadSets(sets: number, reductionPct: number): number {
  if (sets <= 0) return 0;
  return Math.max(1, excelRound((sets * (100 - reductionPct)) / 100));
}

export function deloadItem(
  item: PrescriptionItem,
  block: BlockType | undefined,
  reductionPct: number,
): PrescriptionItem {
  if (!block?.reducedInDeload) return item;
  return {
    ...item,
    setsMin: deloadSets(item.setsMin, reductionPct),
    setsMax: deloadSets(item.setsMax, reductionPct),
  };
}

/** Modèle tel qu'il se pratique en semaine allégée (seules les séances du soir sont réduites). */
export function deloadTemplate(
  template: SessionTemplate,
  blocksById: ReadonlyMap<ID, BlockType>,
  settings: Pick<Settings, 'deloadReductionPct'>,
): SessionTemplate {
  if (template.moment !== 'evening') return template;
  return {
    ...template,
    items: template.items.map((item) =>
      deloadItem(item, blocksById.get(item.blockTypeId), settings.deloadReductionPct),
    ),
  };
}

export function morningsHidden(isDeload: boolean, settings: Pick<Settings, 'hideMorningsInDeload'>): boolean {
  return isDeload && settings.hideMorningsInDeload;
}
