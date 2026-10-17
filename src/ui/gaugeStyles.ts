// Couleurs et libellés des jauges de volume (vue Volume).
import type { RangeStatus } from '../domain/volume';

/** `neutral` : semaine allégée, la fourchette habituelle ne s'applique pas. */
export type GaugeTone = RangeStatus | 'neutral';

export const GAUGE_FILL: Record<GaugeTone, string> = {
  below: 'bg-ink-3',
  within: 'bg-accent',
  above: 'bg-warn',
  neutral: 'bg-ink-2',
};

export const GAUGE_TEXT: Record<GaugeTone, string> = {
  below: 'text-ink-2',
  within: 'text-ink',
  above: 'text-warn',
  neutral: 'text-ink',
};

export const GAUGE_LABEL: Record<RangeStatus, string> = {
  below: 'à compléter',
  within: 'dans la cible',
  above: 'au-delà de la cible',
};
