import type { SessionTemplate, Settings } from './types';

export interface DurationEstimate {
  /** Séries min et repos min de chaque ligne. */
  minSec: number;
  /** Séries max et repos max de chaque ligne. */
  maxSec: number;
}

/** Durée estimée = Σ séries × (temps de travail moyen par série + repos prescrit). */
export function estimateDuration(
  template: SessionTemplate,
  settings: Pick<Settings, 'avgWorkSecPerSet' | 'freeRestSec'>,
): DurationEstimate {
  let minSec = 0;
  let maxSec = 0;
  for (const item of template.items) {
    if (item.setsMax <= 0) continue;
    const restMin = item.restMinSec ?? settings.freeRestSec;
    const restMax = item.restMaxSec ?? settings.freeRestSec;
    minSec += item.setsMin * (settings.avgWorkSecPerSet + restMin);
    maxSec += item.setsMax * (settings.avgWorkSecPerSet + restMax);
  }
  return { minSec, maxSec };
}
