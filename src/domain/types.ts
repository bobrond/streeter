// Modèle de données de Streeter. Vocabulaire : voir le glossaire du CLAUDE.md.

export type ID = string;

export type Moment = 'morning' | 'evening';
export const MOMENTS: readonly Moment[] = ['morning', 'evening'];

/** Jour de séquence J1…J7 (pas un jour de la semaine). */
export type SeqDay = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const SEQ_DAYS: readonly SeqDay[] = [1, 2, 3, 4, 5, 6, 7];

export type ElementKind = 'skill' | 'component' | 'other';
export type Measure = 'reps' | 'seconds' | 'combos' | 'none';
export type TargetUnit = Exclude<Measure, 'none'>;
export type Quality = 'clean' | 'degraded';
/** Type de série : l'échauffement ne compte ni dans le volume ni dans les records ; `failure` : à l'échec total. */
export type SetKind = 'normal' | 'warmup' | 'failure';

export interface Element {
  id: ID;
  name: string;
  /** `component` : compte dans le volume des composantes de renfo. */
  kind: ElementKind;
  order: number;
}

export interface BlockType {
  id: ID;
  name: string;
  order: number;
  /** Les séries des deux skills (planche / FL) alternent, appariées par ordre. */
  alternateSkills: boolean;
  /** Séries réduites en semaine allégée (pas l'échauffement). */
  reducedInDeload: boolean;
}

export interface SessionType {
  id: ID;
  name: string;
  moment: Moment | null;
  description: string;
  color: string;
  /** Jour de test des objectifs (Max). */
  isTestDay: boolean;
}

export interface Exercise {
  id: ID;
  name: string;
  category: string;
  elementId: ID | null;
  measure: Measure;
  /** « Rapide (matin) » : sans barre, peu d'installation. */
  quick: boolean;
  active: boolean;
  notes: string;
  /** Autres orthographes reconnues à l'import. */
  aliases: string[];
  /** Ordre d'affichage dans le catalogue. */
  order: number;
  /** Temps de travail moyen d'une série (installation comprise), en secondes ; `null` : le réglage général. */
  workSecPerSet: number | null;
}

export interface Band {
  id: ID;
  name: string;
  color: string;
  /** 0 = le plus assistant. */
  order: number;
  active: boolean;
}

export interface Target {
  unit: TargetUnit;
  min: number | null;
  max: number | null;
}

export interface Intensity {
  /** `rir` : reps en réserve. */
  kind: 'rpe' | 'rir';
  min: number | null;
  max: number | null;
}

export interface PrescriptionItem {
  id: ID;
  blockTypeId: ID;
  elementId: ID;
  candidateExerciseIds: ID[];
  /** Texte d'origine de « Exercices au choix ». */
  candidatesText: string;
  setsMin: number;
  setsMax: number;
  targetText: string;
  targets: Target[];
  intensityText: string;
  intensity: Intensity | null;
  restText: string;
  /** `null` : repos libre, pas de décompte. */
  restMinSec: number | null;
  restMaxSec: number | null;
  /** Lignes consécutives du même bloc marquées superset : elles alternent série par série. */
  superset: boolean;
  optional: boolean;
  notes: string;
}

export interface SessionTemplate {
  id: ID;
  name: string;
  sessionTypeId: ID;
  moment: Moment;
  optional: boolean;
  notes: string;
  items: PrescriptionItem[];
  /** Archivé : hors de la semaine type, plus proposé ; gardé pour plus tard. */
  archived: boolean;
}

export interface WeekSlot {
  /** `null` : pas de séance ce matin-là. */
  morning: ID | null;
  /** `null` : Repos. */
  evening: ID | null;
}

export type WeekPlan = Record<SeqDay, WeekSlot>;

export interface Settings {
  id: 'settings';
  /** Date d'un J1 (YYYY-MM-DD) : début de la semaine 1 du cycle 1. */
  cycleStartDate: string;
  cycleLengthWeeks: number;
  deloadWeek: number;
  /** Pourcentage entier (40 = −40 %). */
  deloadReductionPct: number;
  hideMorningsInDeload: boolean;
  volumeMin: number;
  volumeMax: number;
  morningMaxMinutes: number;
  avgWorkSecPerSet: number;
  /** Durée comptée pour un repos « Libre » dans l'estimation de durée. */
  freeRestSec: number;
  lastBackupAt: number | null;
  weekPlan: WeekPlan;
}

export type SessionStatus = 'in_progress' | 'done' | 'abandoned';

/** Saisie d'une série pas encore validée. */
export interface SetDraft {
  value: number | null;
  bandId: ID | null;
  rpe: number | null;
  quality: Quality | null;
  kind: SetKind;
  note: string;
}

/** Minuteur de repos, lancé à la validation d'une série. */
export interface RestTimer {
  /** Ligne dont la série a lancé le repos. */
  itemId: ID;
  startedAt: number;
  /** `null` : repos libre (simple chronomètre). */
  minSec: number | null;
  maxSec: number | null;
  /** Secondes ajoutées ou retirées avec « +15 s » et « −15 s ». */
  extraSec: number;
}

/** État d'interface d'une séance en cours, écrit à chaque action pour une reprise exacte. */
export interface SessionResume {
  /** Ligne où l'on vient d'agir : la série proposée reste dans son unité (paire, superset). */
  activeItemId: ID | null;
  /** Exercice choisi par ligne. */
  chosenExercise: Record<ID, ID>;
  /** Lignes terminées ou passées avant leurs séries prévues. */
  closedItems: ID[];
  /** Séries à faire modifiées avant validation, par ligne et par rang (`null` : pré-remplie). */
  pendingDrafts: Record<ID, (SetDraft | null)[]>;
  /** Lignes ajoutées (« + Ajouter une série ») ou retirées, par rapport au minimum de séries. */
  extraRows: Record<ID, number>;
  rest: RestTimer | null;
}

export interface SessionLog {
  id: ID;
  date: string;
  /** Numéro de semaine absolu depuis le début (continue d'un cycle à l'autre). */
  week: number;
  cycleWeek: number;
  seqDay: SeqDay;
  moment: Moment;
  templateId: ID | null;
  /** Copie figée du modèle au démarrage de la séance. */
  templateSnapshot: SessionTemplate | null;
  sessionTypeId: ID | null;
  sessionTypeName: string;
  deload: boolean;
  status: SessionStatus;
  startedAt: number | null;
  endedAt: number | null;
  note: string;
  source: 'app' | 'xlsx';
  /** État d'interface de la séance en cours, pour la reprise ; `null` une fois terminée. */
  resume: SessionResume | null;
  /**
   * Séance express : durée choisie, en minutes (20, 30 ou 45). `templateId` est alors la séance du jour remplacée
   * et `templateSnapshot` la séance générée. `null` : séance d'un modèle ou importée.
   */
  expressMinutes: number | null;
}

export interface SetLog {
  id: ID;
  sessionId: ID;
  itemId: ID | null;
  blockTypeId: ID | null;
  elementId: ID | null;
  exerciseId: ID;
  /** 1 pour la première série de l'exercice dans le bloc. */
  setIndex: number;
  /** Reps, secondes ou combos selon la mesure de l'exercice ; `null` si rien à mesurer. */
  value: number | null;
  bandId: ID | null;
  rpe: number | null;
  quality: Quality | null;
  kind: SetKind;
  note: string;
  createdAt: number;
}

export interface ObjectiveTest {
  id: ID;
  date: string;
  value: number;
  note: string;
}

export interface Objective {
  id: ID;
  name: string;
  criterion: string;
  target: number;
  unit: TargetUnit;
  exerciseId: ID | null;
  order: number;
  tests: ObjectiveTest[];
}
