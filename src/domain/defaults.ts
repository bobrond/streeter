import type { Settings, WeekPlan } from './types';

export const DEFAULT_SETTINGS: Omit<Settings, 'cycleStartDate' | 'weekPlan'> = {
  id: 'settings',
  cycleLengthWeeks: 4,
  deloadWeek: 4,
  deloadReductionPct: 40,
  hideMorningsInDeload: true,
  volumeMin: 4,
  volumeMax: 6,
  morningMaxMinutes: 30,
  avgWorkSecPerSet: 30,
  freeRestSec: 30,
  lastBackupAt: null,
};

export function emptyWeekPlan(): WeekPlan {
  const slot = () => ({ morning: null, evening: null });
  return { 1: slot(), 2: slot(), 3: slot(), 4: slot(), 5: slot(), 6: slot(), 7: slot() };
}

/** Élastiques de l'utilisateur, du plus assistant (le plus lourd) au moins assistant. */
export const DEFAULT_BANDS: readonly { name: string; color: string }[] = [
  { name: 'orange', color: '#f97316' },
  { name: 'jaune', color: '#facc15' },
  { name: 'vert', color: '#22c55e' },
  { name: 'bleue', color: '#3b82f6' },
];

export const UNKNOWN_BAND_COLOR = '#a3a3a3';

interface SessionTypePreset {
  description: string;
  color: string;
  isTestDay: boolean;
  /** Séance optionnelle dans son ensemble. */
  optional: boolean;
}

/** Préréglages des types de séance, indexés par `nameKey`. */
export const SESSION_TYPE_PRESETS: Record<string, SessionTypePreset> = {
  max: { description: 'Skills isolés, intensité haute (RPE 8-9)', color: '#ff5c5c', isTestDay: true, optional: false },
  combo: {
    description: 'Enchaînements (hold to press, PU to press, PU to touch, FL press), RPE 8',
    color: '#ffb020',
    isTestDay: false,
    optional: false,
  },
  technique: {
    description: 'Skills isolés à environ 70 %, focus qualité (RPE 6-7)',
    color: '#4da3ff',
    isTestDay: false,
    optional: false,
  },
  'technique leger': {
    description: 'Optionnel, RPE ≤ 6, aucune fatigue résiduelle',
    color: '#2dd4bf',
    isTestDay: false,
    optional: true,
  },
  'matin a': {
    description: 'Pousser · 30 min maximum, exercices rapides, optionnel',
    color: '#c084fc',
    isTestDay: false,
    optional: true,
  },
  'matin b': {
    description: 'Tirer · 30 min maximum, exercices rapides, optionnel',
    color: '#f472b6',
    isTestDay: false,
    optional: true,
  },
};

export const DEFAULT_SESSION_TYPE_COLOR = '#a3a3a3';

/** Préréglages des blocs, indexés par `nameKey`. Les autres blocs : pas d'alternance, réduits en allégé. */
export const BLOCK_PRESETS: Record<string, { alternateSkills: boolean; reducedInDeload: boolean }> = {
  echauffement: { alternateSkills: false, reducedInDeload: false },
  skill: { alternateSkills: true, reducedInDeload: true },
  'skill assiste': { alternateSkills: true, reducedInDeload: true },
};
