import { progressPoints } from '../../domain/journal';
import type { Band, ID, SessionLog, SetLog } from '../../domain/types';
import type { ChartSeries } from '../../ui/LineChart';

/** Couleur de « sans élastique » : blanc (pas d'élastique = pas de couleur). */
export const NO_BAND_COLOR = '#ffffff';

/**
 * Courbes d'un exercice : meilleure série par séance, une courbe par élastique, du plus assistant
 * à « sans élastique » ; séries dégradées et d'échauffement exclues (`progressPoints`).
 */
export function bandSeries(
  exerciseId: ID,
  sets: readonly SetLog[],
  sessions: ReadonlyMap<ID, Pick<SessionLog, 'date'>>,
  bands: ReadonlyMap<ID, Band>,
): ChartSeries[] {
  const byBand = new Map<ID | null, Map<string, number>>();
  for (const point of progressPoints(exerciseId, sets, sessions)) {
    const dates = byBand.get(point.bandId) ?? new Map<string, number>();
    dates.set(point.date, Math.max(dates.get(point.date) ?? 0, point.best));
    byBand.set(point.bandId, dates);
  }
  const order = (id: ID | null) => (id === null ? Number.MAX_SAFE_INTEGER : (bands.get(id)?.order ?? 99));
  return [...byBand.entries()]
    .sort((a, b) => order(a[0]) - order(b[0]))
    .map(([bandId, dates]) => {
      const band = bandId ? bands.get(bandId) : null;
      return {
        id: bandId ?? 'none',
        label: band ? `élastique ${band.name}` : 'sans élastique',
        shortLabel: band ? band.name : 'sans',
        color: band?.color ?? NO_BAND_COLOR,
        points: [...dates].map(([date, value]) => ({ date, value })),
      };
    });
}
