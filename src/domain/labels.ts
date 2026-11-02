// Libellés et formats français.
import { diffDays } from './cycle';
import type { ObjectiveStatus } from './objectives';
import { parseIntensities } from './parse';
import type { ComponentAcceptance, Equipment, Intensity, Measure, Moment, PrescriptionItem, SeqDay, Target, TargetUnit } from './types';
import { EQUIPMENTS } from './types';
import type { VolumeStatus } from './volume';

export const MOMENT_LABEL: Record<Moment, string> = { morning: 'Matin', evening: 'Soir' };

/** Ce qu'un type de séance accepte des composantes réparties : « toutes », « aucune », ou leurs noms. */
export function acceptanceText(accepted: ComponentAcceptance | null, name: (elementId: string) => string): string {
  if (accepted === null) return 'toutes';
  if (accepted.length === 0) return 'aucune';
  return joinFrench(accepted.map(name));
}

/** « Force », « Endurance » ; un autre type de travail tel quel, avec une majuscule. */
export function workLabel(work: string | null): string {
  if (!work) return 'Non précisé';
  return work.charAt(0).toUpperCase() + work.slice(1);
}

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

export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  floor: 'Sol',
  parallettes: 'Parallèles',
  bar: 'Barre',
  band: 'Élastiques',
  dumbbell: 'Haltères',
};

/** « Sol, parallèles » (dans l'ordre canonique) ; vide si non restreint. */
export function formatEquipment(equipment: readonly Equipment[]): string {
  const ordered = EQUIPMENTS.filter((eq) => equipment.includes(eq));
  if (ordered.length === 0) return '';
  return ordered.map((eq, i) => (i === 0 ? EQUIPMENT_LABEL[eq] : EQUIPMENT_LABEL[eq].toLowerCase())).join(', ');
}

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

/** « 8-9 », « ≤ 6 », « 4 » ; vide sans bornes. */
export function formatRange(min: number | null, max: number | null): string {
  if (min === null && max === null) return '';
  if (min === null) return `≤ ${max}`;
  if (max === null || max === min) return `${min}`;
  return `${min}-${max}`;
}

export function formatTarget(target: Target): string {
  const single = (target.max ?? target.min ?? 0) <= 1;
  const unit = single && target.unit !== 'seconds' ? UNIT_SHORT[target.unit].replace(/s$/, '') : UNIT_SHORT[target.unit];
  return `${formatRange(target.min, target.max)} ${unit}`;
}

export function formatIntensity(intensity: Intensity): string {
  if (intensity.kind === 'rpe') return `RPE ${formatRange(intensity.min, intensity.max)}`;
  const value = formatRange(intensity.min, intensity.max);
  return `${value} rep${intensity.max !== null && intensity.max > 1 ? 's' : ''} en réserve`;
}

/**
 * Intensité d'une ligne à afficher. Avec une intensité par alternative de cible (autant d'alternatives que de cibles,
 * séparées par « ou ») : celle de l'unité donnée (celle de l'exercice choisi), sinon toutes (« 2 reps en réserve ou
 * RPE 8-9 »). Sans unité ni alternative : l'intensité lue, sinon le texte tel quel.
 */
export function intensityLabel(item: Pick<PrescriptionItem, 'intensityText' | 'intensity' | 'targets'>, unit?: TargetUnit | null): string {
  const parsed = parseIntensities(item.intensityText);
  if (parsed.length > 1) {
    const parts = item.intensityText.split(/\s+ou\s+/i);
    const texts = parsed.map((intensity, i) => (intensity ? formatIntensity(intensity) : (parts[i] ?? '').trim()));
    const index = unit && item.targets.length === texts.length ? item.targets.findIndex((t) => t.unit === unit) : -1;
    return index >= 0 ? texts[index] : texts.filter(Boolean).join(' ou ');
  }
  return item.intensity ? formatIntensity(item.intensity) : item.intensityText;
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

/** Bornes d'un repos en peu de place : [« 90 s », « 2 min »], [« 60-90 s »], [« 2 min »], [« Libre »]. */
export function restParts(minSec: number | null, maxSec: number | null): string[] {
  if (minSec === null || maxSec === null) return ['Libre'];
  const bound = (sec: number) => (sec < 120 ? `${sec} s` : sec % 60 === 0 ? `${sec / 60} min` : formatSeconds(sec));
  if (minSec === maxSec) return [bound(minSec)];
  if (maxSec < 120) return [`${minSec}-${maxSec} s`];
  return [bound(minSec), bound(maxSec)];
}

/** « 4-5 », « 3 » ; « ≤ 8 » pour une ligne sans minimum (le maximum est un plafond). */
export function formatSets(min: number, max: number): string {
  if (min === 0 && max > 0) return `≤ ${max}`;
  return min === max ? `${min}` : `${min}-${max}`;
}

/** « A », « A et B », « A, B et C ». */
export function joinFrench(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} et ${parts.at(-1)}`;
}

/** « 17 min », « 1 h 05 ». */
export function formatDuration(sec: number): string {
  const minutes = Math.round(sec / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
}

/** « 17 à 25 min », « 46 min à 1 h 06 », « 25 min » si les deux bornes sont égales. */
export function formatDurationRange(minSec: number, maxSec: number): string {
  const min = formatDuration(minSec);
  const max = formatDuration(maxSec);
  if (min === max) return min;
  if (min.endsWith(' min') && max.endsWith(' min')) return `${min.slice(0, -4)} à ${max}`;
  return `${min} à ${max}`;
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

/** Date calendaire YYYY-MM-DD → « 07/10 », quand l'année va de soi. */
export function formatDayMonth(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

const WEEKDAY_FORMAT = new Intl.DateTimeFormat('fr-FR', { weekday: 'long' });

/** Jour d'une date passée vu d'aujourd'hui : « aujourd'hui », « hier », « mercredi » dans la semaine, « 07/10 » avant. */
export function formatRelativeDay(iso: string, today: string): string {
  const days = diffDays(iso, today);
  if (days === 0) return 'aujourd’hui';
  if (days === 1) return 'hier';
  if (days > 1 && days < 7) return WEEKDAY_FORMAT.format(new Date(`${iso}T12:00:00`));
  return formatDayMonth(iso);
}

/** « Express 30 min · Max » : nom d'une séance express, d'après le type de la séance remplacée. */
export function expressName(minutes: number, replacedLabel: string): string {
  return `Express ${minutes} min · ${replacedLabel}`;
}

/** Chronomètre : « 1:30 », « 0:05 », « 12:00 ». */
export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Valeur d'une série : « 4 s », « 3 reps », « 1 combo » ; « fait » sans mesure, « — » sans valeur. */
export function formatSetValue(value: number | null, measure: Measure): string {
  if (measure === 'none') return 'fait';
  if (value === null) return '—';
  return formatValue(value, measure);
}

/** Valeurs de plusieurs séries, unité à la fin, comme dans le tableur : « 3 ; 3 ; 2 s ». */
export function formatValueList(values: readonly (number | null)[], measure: Measure): string {
  if (measure === 'none') return `${values.length} série${values.length > 1 ? 's' : ''}`;
  const list = values.map((v) => (v === null ? '–' : String(v).replace('.', ','))).join(' ; ');
  const numbers = values.filter((v): v is number => v !== null);
  if (numbers.length === 0) return list;
  const unit = measure === 'seconds' ? 's' : measure === 'reps' ? (Math.max(...numbers) > 1 ? 'reps' : 'rep') : Math.max(...numbers) > 1 ? 'combos' : 'combo';
  return `${list} ${unit}`;
}
