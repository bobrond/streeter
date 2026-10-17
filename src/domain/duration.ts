import { buildPlan } from './session';
import type { BlockType, Element, ID, PrescriptionItem, SessionTemplate, Settings } from './types';

export interface DurationEstimate {
  /** Séries min et repos min de chaque ligne. */
  minSec: number;
  /** Séries max et repos max de chaque ligne. */
  maxSec: number;
}

/** Blocs et éléments : de quoi retrouver les paires planche / FL d'un modèle. */
export interface PlanStructure {
  blocks: ReadonlyMap<ID, BlockType>;
  elements: ReadonlyMap<ID, Element>;
}

type DurationSettings = Pick<Settings, 'avgWorkSecPerSet' | 'freeRestSec'>;

/** Paire planche / FL : un tour = une série de chaque ligne encore en cours, puis le plus long de leurs repos. */
function alternateSec(items: readonly PrescriptionItem[], bound: 'min' | 'max', settings: DurationSettings): number {
  const sets = (item: PrescriptionItem) => (bound === 'min' ? item.setsMin : item.setsMax);
  const rest = (item: PrescriptionItem) => (bound === 'min' ? item.restMinSec : item.restMaxSec) ?? settings.freeRestSec;
  let total = 0;
  const rounds = Math.max(0, ...items.map(sets));
  for (let k = 1; k <= rounds; k++) {
    const round = items.filter((item) => sets(item) >= k);
    total += round.length * settings.avgWorkSecPerSet + Math.max(...round.map(rest));
  }
  return total;
}

/**
 * Durée estimée = Σ séries × (temps de travail moyen par série + repos prescrit), sauf dans une alternance
 * planche / FL : pas de repos entre les deux séries d'une paire, un seul repos par tour.
 */
export function estimateDuration(template: SessionTemplate, settings: DurationSettings, structure: PlanStructure): DurationEstimate {
  const plan = buildPlan(template, structure.blocks, structure.elements);
  let minSec = 0;
  let maxSec = 0;
  for (const unit of plan.units) {
    const items = unit.itemIds.map((id) => plan.itemsById.get(id)!).filter((item) => item.setsMax > 0);
    if (unit.mode === 'alternate') {
      minSec += alternateSec(items, 'min', settings);
      maxSec += alternateSec(items, 'max', settings);
      continue;
    }
    for (const item of items) {
      minSec += item.setsMin * (settings.avgWorkSecPerSet + (item.restMinSec ?? settings.freeRestSec));
      maxSec += item.setsMax * (settings.avgWorkSecPerSet + (item.restMaxSec ?? settings.freeRestSec));
    }
  }
  return { minSec, maxSec };
}
