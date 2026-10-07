// Petit classeur au format du tableur, construit en mémoire (sans données personnelles).
import * as XLSX from 'xlsx';
import { toDayNumber } from '../domain/cycle';

export const serial = (iso: string) => toDayNumber(iso) - toDayNumber('1899-12-30');

export const PROGRAMME = [
  ['Jour', 'Moment', 'Ordre', 'Type séance', 'Bloc', 'Élément', 'Exercices au choix', 'Séries min', 'Séries max', 'Reps / durée', 'RPE / marge', 'Repos', 'Optionnel', 'Notes'],
  ['J1', 'Soir', 1, 'Max', 'Skill', 'Planche', 'Planche hold', 4, 5, '3-6 s', 'RPE 8-9', '90 s-2 min', 'Non', null],
  ['J1', 'Soir', 2, 'Max', 'Skill', 'Touch FL', 'Touch FL hold (full / one leg)', 4, 5, '3-5 s', 'RPE 8-9', '90 s-2 min', 'Non', null],
  ['J1', 'Soir', 3, 'Max', 'Renfo composantes', 'Grand dentelé', 'Wall slide', 2, 2, '8-15 reps', '1-2 reps en réserve', '90 s', 'Non', null],
  ['J2', 'Matin', 1, 'Matin A', 'Renfo composantes', 'Grand dentelé', 'Wall slide', 2, 2, '8-15 reps', '2 reps en réserve', 'Superset, 60-90 s', 'Oui', null],
  ['J2', 'Soir', 1, 'Repos', 'Repos', '—', 'Aucun entraînement le soir', 0, 0, '—', '—', '—', 'Non', null],
];
export const EXERCICES = [
  ['Catégorie', 'Exercice', 'Rapide (matin)'],
  ['Planche skill', 'Planche Hold', 'Non'],
  ['Touch FL skill', 'Touch FL hold full', 'Non'],
  ['Touch FL skill', 'Touch FL hold one leg', 'Non'],
  ['Grand dentelé', 'Wall slide', 'Oui'],
];
export const OBJECTIFS = [
  ['Objectif', 'Critère de qualité', 'Cible', 'Unité', 'Dernier test', 'Date du test', 'Écart à la cible', 'Statut'],
  ['Planche hold', 'Bonne activation grand dentelé', 10, 's', 6, serial('2026-11-02'), null, null],
];
export const JOURNAL = [
  ['Date', 'Semaine', 'Jour', 'Moment', 'Type séance', 'Bloc', 'Exercice', 'Séries faites', 'Reps / durée', 'Élastique', 'RPE', 'Ressenti / notes'],
  [serial('2026-10-12'), 2, 'J1', 'Soir', 'Max', 'Skill', 'Planche Hold', 3, '3 ; 3 ; 2 ; 2', null, 8, 'bien'],
  [serial('2026-10-12'), 2, 1, 'Soir', 'Max', 'Skill', 'Muscle-up', 2, '-', 'rouge', 9, null],
  ['13/10/2026', 2, '2', 'Matin', 'Matin A — pousser', 'Renfo composantes', 'Wall slide', null, '12 ;10', 'vert', null, null],
];
export const VOLUME = [
  ['Paramètres'],
  ['Minimum séries / composante / semaine', 3],
  ['Maximum séries / composante / semaine', 5],
  ['Réduction semaine allégée', 0.5],
];

export function workbook(sheets: Record<string, unknown[][]>): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

export const SAMPLE_SHEETS = { Programme: PROGRAMME, 'Volume hebdo': VOLUME, Journal: JOURNAL, Objectifs: OBJECTIFS, Exercices: EXERCICES };
