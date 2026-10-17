import { buildPlan } from './session';
import type { BlockType, Element, Exercise, ID, PrescriptionItem, SessionTemplate, Settings } from './types';

export interface DurationEstimate {
  /** Séries min, repos min et le plus court des exercices candidats de chaque ligne. */
  minSec: number;
  /** Séries max, repos max et le plus long des exercices candidats de chaque ligne. */
  maxSec: number;
}

/** Blocs, éléments et exercices : de quoi retrouver les paires planche / FL d'un modèle et le temps de ses séries. */
export interface PlanStructure {
  blocks: ReadonlyMap<ID, BlockType>;
  elements: ReadonlyMap<ID, Element>;
  exercises: ReadonlyMap<ID, Exercise>;
}

type DurationSettings = Pick<Settings, 'avgWorkSecPerSet' | 'freeRestSec'>;
type Bound = 'min' | 'max';

/**
 * Temps de travail d'une série de la ligne : celui de ses exercices candidats actifs (le réglage général pour
 * un exercice sans temps propre), le plus court pour la borne basse, le plus long pour la borne haute.
 */
export function workSecOf(item: PrescriptionItem, bound: Bound, settings: DurationSettings, exercises: ReadonlyMap<ID, Exercise>): number {
  const times = item.candidateExerciseIds
    .map((id) => exercises.get(id))
    .filter((exercise) => exercise?.active)
    .map((exercise) => exercise!.workSecPerSet ?? settings.avgWorkSecPerSet);
  if (times.length === 0) return settings.avgWorkSecPerSet;
  return bound === 'min' ? Math.min(...times) : Math.max(...times);
}

/** Paire planche / FL : un tour = une série de chaque ligne encore en cours, puis le plus long de leurs repos. */
function alternateSec(items: readonly PrescriptionItem[], bound: Bound, settings: DurationSettings, exercises: ReadonlyMap<ID, Exercise>): number {
  const sets = (item: PrescriptionItem) => (bound === 'min' ? item.setsMin : item.setsMax);
  const rest = (item: PrescriptionItem) => (bound === 'min' ? item.restMinSec : item.restMaxSec) ?? settings.freeRestSec;
  let total = 0;
  const rounds = Math.max(0, ...items.map(sets));
  for (let k = 1; k <= rounds; k++) {
    const round = items.filter((item) => sets(item) >= k);
    total += round.reduce((sum, item) => sum + workSecOf(item, bound, settings, exercises), 0) + Math.max(...round.map(rest));
  }
  return total;
}

/**
 * Durée estimée = Σ séries × (temps de travail par série + repos prescrit), sauf dans une alternance
 * planche / FL : pas de repos entre les deux séries d'une paire, un seul repos par tour.
 */
export function estimateDuration(template: Pick<SessionTemplate, 'items'>, settings: DurationSettings, structure: PlanStructure): DurationEstimate {
  const plan = buildPlan(template, structure.blocks, structure.elements);
  const { exercises } = structure;
  let minSec = 0;
  let maxSec = 0;
  for (const unit of plan.units) {
    const items = unit.itemIds.map((id) => plan.itemsById.get(id)!).filter((item) => item.setsMax > 0);
    if (unit.mode === 'alternate') {
      minSec += alternateSec(items, 'min', settings, exercises);
      maxSec += alternateSec(items, 'max', settings, exercises);
      continue;
    }
    for (const item of items) {
      minSec += item.setsMin * (workSecOf(item, 'min', settings, exercises) + (item.restMinSec ?? settings.freeRestSec));
      maxSec += item.setsMax * (workSecOf(item, 'max', settings, exercises) + (item.restMaxSec ?? settings.freeRestSec));
    }
  }
  return { minSec, maxSec };
}
