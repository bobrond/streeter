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

/** Valeurs d'une ligne propres à la tranche (ou semaine) `cycleWeek` du cycle. */
export function trancheItem(item: PrescriptionItem, cycleWeek: number): PrescriptionItem {
  const o = item.byTranche?.[cycleWeek];
  if (!o) return item;
  const { setsMin, setsMax, targetText, targets, intensityText, intensity } = o;
  return {
    ...item,
    ...(setsMin !== undefined ? { setsMin } : {}),
    ...(setsMax !== undefined ? { setsMax } : {}),
    ...(targetText !== undefined ? { targetText, targets: targets ?? [] } : {}),
    ...(intensityText !== undefined ? { intensityText, intensity: intensity ?? null } : {}),
  };
}

/**
 * Modèle tel qu'il se pratique un jour donné : valeurs de la tranche du cycle, puis allègement en semaine (tranche)
 * allégée. Des séries données pour la tranche allégée sont celles à faire : elles ne sont pas réduites.
 */
export function practicedTemplate(
  template: SessionTemplate,
  at: { cycleWeek: number; isDeload: boolean },
  blocksById: ReadonlyMap<ID, BlockType>,
  settings: Pick<Settings, 'deloadReductionPct'>,
): SessionTemplate {
  const hasTranche = template.items.some((item) => item.byTranche?.[at.cycleWeek]);
  if (!hasTranche) return at.isDeload ? deloadTemplate(template, blocksById, settings) : template;
  return {
    ...template,
    items: template.items.map((item) => {
      const o = item.byTranche?.[at.cycleWeek];
      const own = trancheItem(item, at.cycleWeek);
      const keepsSets = o !== undefined && (o.setsMin !== undefined || o.setsMax !== undefined);
      return at.isDeload && template.moment === 'evening' && !keepsSets ? deloadItem(own, blocksById.get(item.blockTypeId), settings.deloadReductionPct) : own;
    }),
  };
}

export function morningsHidden(isDeload: boolean, settings: Pick<Settings, 'hideMorningsInDeload'>): boolean {
  return isDeload && settings.hideMorningsInDeload;
}
