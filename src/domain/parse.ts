// Lecture des textes de prescription du tableur (« 8-12 s ou 3-5 reps », « RPE ≤ 5 », « 90 s-2 min »…).
import { fold } from './text';
import type { Intensity, Target, TargetUnit } from './types';

const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
const RANGE = `${NUM}(?:\\s*-\\s*${NUM})?`;

function num(s: string): number {
  return Number(s.replace(',', '.'));
}

function isEmptyMark(t: string): boolean {
  return t === '' || /^[—–-]+$/.test(t);
}

function unitFromWord(word: string | undefined): TargetUnit | null {
  if (!word) return null;
  if (/^(s|sec|secs|seconde|secondes)$/.test(word)) return 'seconds';
  if (/^(rep|reps|repetition|repetitions)$/.test(word)) return 'reps';
  if (/^combos?$/.test(word)) return 'combos';
  return null;
}

/**
 * Cibles d'une ligne : une par alternative séparée par « ou ».
 * « 8-12 s ou 3-5 reps » → [{seconds 8-12}, {reps 3-5}] ; « 1 (singles) » → [{reps 1-1}] ;
 * « Au choix » ou « — » → [].
 */
export function parseTargets(text: string): Target[] {
  const t = fold(text);
  if (isEmptyMark(t)) return [];
  const targets: Target[] = [];
  for (const part of t.split(/\bou\b/)) {
    const m = part.match(new RegExp(`${RANGE}\\s*([a-z]+)?`));
    if (!m) continue;
    const min = num(m[1]);
    const max = m[2] ? num(m[2]) : min;
    targets.push({ unit: unitFromWord(m[3]) ?? 'reps', min, max });
  }
  return targets;
}

/** « RPE ≤ 5 », « RPE 8-9 », « 1-2 reps en réserve »… ; `null` si rien de reconnu. */
export function parseIntensity(text: string): Intensity | null {
  const t = fold(text);
  if (isEmptyMark(t)) return null;
  const rpe = t.match(new RegExp(`rpe\\s*(<=|≤|<)?\\s*${RANGE}`));
  if (rpe) {
    const a = num(rpe[2]);
    if (rpe[1]) return { kind: 'rpe', min: null, max: a };
    return { kind: 'rpe', min: a, max: rpe[3] ? num(rpe[3]) : a };
  }
  const rir = t.match(new RegExp(`${RANGE}\\s*reps?\\s+en\\s+reserve`));
  if (rir) {
    const a = num(rir[1]);
    return { kind: 'rir', min: a, max: rir[2] ? num(rir[2]) : a };
  }
  return null;
}

export interface Rest {
  /** `null` : repos libre (pas de décompte). */
  minSec: number | null;
  maxSec: number | null;
  superset: boolean;
}

/** « Libre », « 90 s », « 2 min », « 90 s-2 min », « Superset, 60-90 s ». */
export function parseRest(text: string): Rest {
  const t = fold(text);
  const superset = /\bsuperset\b/.test(t);
  const parts: { value: number; unit: string | undefined }[] = [];
  for (const m of t.matchAll(new RegExp(`${NUM}\\s*(min|mn|sec|s)?\\b`, 'g'))) {
    parts.push({ value: num(m[1]), unit: m[2] });
  }
  if (parts.length === 0) return { minSec: null, maxSec: null, superset };
  // Un nombre sans unité prend celle du suivant (« 60-90 s ») ; secondes par défaut.
  for (let i = parts.length - 1; i >= 0; i--) {
    parts[i].unit ??= parts[i + 1]?.unit ?? 's';
  }
  const secs = parts.map((p) => (p.unit === 'min' || p.unit === 'mn' ? p.value * 60 : p.value));
  return { minSec: Math.min(...secs), maxSec: Math.max(...secs), superset };
}

/** « Oui » / « Non » du tableur. */
export function parseYes(value: unknown): boolean {
  return /^(oui|o|yes|y|x|vrai|true|1)$/.test(fold(String(value ?? '')));
}

/** « J3 », « j3 », « 3 » ou 3 → 3 ; `null` sinon. */
export function parseSeqDay(value: unknown): 1 | 2 | 3 | 4 | 5 | 6 | 7 | null {
  const m = fold(String(value ?? '')).match(/^j?\s*([1-7])$/);
  return m ? (Number(m[1]) as 1 | 2 | 3 | 4 | 5 | 6 | 7) : null;
}
