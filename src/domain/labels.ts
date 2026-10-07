// Libellés et formats français.
import type { ObjectiveStatus } from './objectives';
import type { Intensity, Measure, Moment, SeqDay, Target, TargetUnit } from './types';
import type { VolumeStatus } from './volume';

export const MOMENT_LABEL: Record<Moment, string> = { morning: 'Matin', evening: 'Soir' };

export const VOLUME_STATUS_LABEL: Record<VolumeStatus, string> = {
  ok: 'OK',
  under_min: 'Sous le min (soir)',
  over_max: 'Au-dessus du max',
  deload: 'Semaine allégée',
};

export const OBJECTIVE_STATUS_LABEL: Record<ObjectiveStatus, string> = {
  to_test: 'À tester',
  in_progress: 'En cours',
  achieved: 'Atteint',
};

export const MEASURE_LABEL: Record<Measure, string> = {
  reps: 'reps',
  seconds: 'secondes',
  combos: 'combos',
  none: 'sans mesure',
};

export const UNIT_SHORT: Record<TargetUnit, string> = { reps: 'reps', seconds: 's', combos: 'combos' };

/** « 10 s », « 1 rep », « 3 reps », « 2 combos ». */
export function formatValue(value: number, unit: TargetUnit): string {
  const n = String(value).replace('.', ',');
  if (unit === 'seconds') return `${n} s`;
  const word = unit === 'reps' ? 'rep' : 'combo';
  return `${n} ${word}${value > 1 ? 's' : ''}`;
}

export function seqDayLabel(day: SeqDay | number): string {
  return `J${day}`;
}

function range(min: number | null, max: number | null): string {
  if (min === null && max === null) return '';
  if (min === null) return `≤ ${max}`;
  if (max === null || max === min) return `${min}`;
  return `${min}-${max}`;
}

export function formatTarget(target: Target): string {
  const single = (target.max ?? target.min ?? 0) <= 1;
  const unit = single && target.unit !== 'seconds' ? UNIT_SHORT[target.unit].replace(/s$/, '') : UNIT_SHORT[target.unit];
  return `${range(target.min, target.max)} ${unit}`;
}

export function formatIntensity(intensity: Intensity): string {
  if (intensity.kind === 'rpe') return `RPE ${range(intensity.min, intensity.max)}`;
  const value = range(intensity.min, intensity.max);
  return `${value} rep${intensity.max !== null && intensity.max > 1 ? 's' : ''} en réserve`;
}

export function formatSeconds(sec: number): string {
  if (sec < 60) return `${sec} s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m} min` : `${m} min ${String(s).padStart(2, '0')}`;
}

export function formatRest(minSec: number | null, maxSec: number | null): string {
  if (minSec === null || maxSec === null) return 'Libre';
  if (minSec === maxSec) return formatSeconds(minSec);
  return `${formatSeconds(minSec)} – ${formatSeconds(maxSec)}`;
}

export function formatSets(min: number, max: number): string {
  return min === max ? `${min}` : `${min}-${max}`;
}

/** « 17 min », « 1 h 05 ». */
export function formatDuration(sec: number): string {
  const minutes = Math.round(sec / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
}

const DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const SHORT_DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** Date calendaire YYYY-MM-DD → « mercredi 7 octobre ». */
export function formatDateLong(iso: string): string {
  return DATE_FORMAT.format(new Date(`${iso}T12:00:00`));
}

/** Date calendaire YYYY-MM-DD → « 07/10/2026 ». */
export function formatDateShort(iso: string): string {
  return SHORT_DATE_FORMAT.format(new Date(`${iso}T12:00:00`));
}
