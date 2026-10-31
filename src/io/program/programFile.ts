// Fichier programme (format « streeter-programme », version 2), échangé avec l'agent de programmation de l'utilisateur.
// Le format est fixé par la consigne donnée à l'agent (docs/consigne_agent_programmation.md) : des noms plutôt que des
// identifiants, les textes de cible, d'intensité et de repos lus comme à l'import du tableur. L'export ajoute un
// `catalogue`, ignoré à l'import. La version 1 (semaine type seulement) reste lue.
// Version 2 (28/10/2026) : déroulé en séquence de séances (`sequence`, `matins.seances`, cycle en tranches), volume
// par type de travail (`programme.volumes`), séries sans minimum (`series.min` à 0), repères par tranche
// (`parTranche`) et progressions inférieures (`progressionsInferieures`) sur une ligne.
import { dateOf, dayInfo } from '../../domain/cycle';
import { DEFAULT_SESSION_TYPE_COLOR } from '../../domain/defaults';
import { nextOrder, uniqueName } from '../../domain/editing';
import { formatDateLong, formatIntensity, formatRest, formatTarget } from '../../domain/labels';
import { parseIntensity, parseRest, parseTargets } from '../../domain/parse';
import { programPhase, programStartDate, templatesOf, weekOfDate } from '../../domain/programs';
import { sequenceIds, sequenceWeekPlan } from '../../domain/sequence';
import { cleanSpaces, fold, nameKey } from '../../domain/text';
import type {
  AppSettings,
  Band,
  BlockType,
  ComponentVolume,
  Element,
  ElementKind,
  Exercise,
  ID,
  Measure,
  Moment,
  Objective,
  PrescriptionItem,
  Program,
  SeqDay,
  SessionTemplate,
  SessionType,
  TargetUnit,
  TrancheOverride,
  WeekPlan,
} from '../../domain/types';
import { SEQ_DAYS } from '../../domain/types';

export const PROGRAM_FILE_FORMAT = 'streeter-programme';
export const PROGRAM_FILE_VERSION = 2;
/** Fichiers acceptés : le .json enregistré, le .txt envoyé par le menu de partage. */
export const PROGRAM_FILE_ACCEPT = '.json,.txt,application/json,text/plain';

type Nature = 'skill' | 'composante' | 'autre';
type Mesure = 'reps' | 'secondes' | 'combos' | 'aucune';
type Unite = 's' | 'reps' | 'combos';
type MomentFr = 'matin' | 'soir';

/** Ce qui change pour une tranche du cycle : un champ absent garde la valeur de la ligne. */
export interface TrancheFichier {
  series?: { min: number; max: number };
  cible?: string;
  intensite?: string;
}

export interface LigneFichier {
  bloc: string;
  element: string;
  exercices: string[];
  /** `min` à 0 (version 2) : pas de minimum, `max` est un plafond. */
  series: { min: number; max: number };
  cible: string;
  intensite: string;
  repos: string;
  superset: boolean;
  optionnelle: boolean;
  notes: string;
  /** Version 2 : valeurs par numéro de tranche (« 2 », « 4 »…). */
  parTranche?: Record<string, TrancheFichier>;
  /** Version 2 : progressions inférieures de la figure, à la place de l'élastique. */
  progressionsInferieures?: string[];
}

export interface SeanceFichier {
  nom: string;
  type: string;
  moment: MomentFr;
  optionnelle: boolean;
  notes: string;
  lignes: LigneFichier[];
}

export interface ObjectifFichier {
  nom: string;
  critere: string;
  cible: number;
  unite: Unite;
  exercice: string | null;
}

export interface ElementFichier {
  nom: string;
  nature: Nature;
}

export interface ExerciceFichier {
  nom: string;
  element: string;
  mesure: Mesure;
  categorie: string;
  rapide: boolean;
  tempsParSerieSec: number | null;
  autresNoms: string[];
  notes: string;
}

export interface BlocFichier {
  nom: string;
  alternance: boolean;
  reduitEnAllegee: boolean;
  /** Nom du bloc après lequel il se place ; `null` : à la fin. */
  apres: string | null;
}

export interface TypeSeanceFichier {
  nom: string;
  moment: MomentFr | null;
  description: string;
  couleur: string;
  jourDeTest: boolean;
}

export interface DemandeFichier {
  sujet: string;
  besoin: string;
  exemple: string;
}

/** Ce qui existe déjà dans l'appli, pour l'agent ; ignoré à l'import. */
export interface CatalogueFichier {
  elements: ElementFichier[];
  blocs: Omit<BlocFichier, 'apres'>[];
  typesSeance: TypeSeanceFichier[];
  exercices: ExerciceFichier[];
  elastiques: { nom: string }[];
  /** Tous les objectifs de l'appli, suivis ou anciens : un ancien objectif se reprend par son nom. */
  objectifs: ObjectifFichier[];
}

type DayKey = `J${SeqDay}`;

export interface VolumeFichier {
  element: string;
  travail: string;
  min: number;
  max: number;
}

/** Cycle en tranches (séquence) ou en semaines (semaine type). */
export type CycleFichier =
  | { tranches: number; trancheAllegee: number; reductionAllegeePct: number; masquerMatinsAllegee: boolean }
  | { semaines: number; semaineAllegee: number; reductionAllegeePct: number; masquerMatinsAllegee: boolean };

export interface ProgramFile {
  format: typeof PROGRAM_FILE_FORMAT;
  version: number;
  programme: {
    nom: string;
    debut: string;
    notes: string;
    cycle: CycleFichier;
    volume: { min: number; max: number };
    /** Version 2. */
    volumes?: VolumeFichier[];
    /** `seances` (version 2, séquence) : séances du matin d'une tranche, disponibles n'importe quel jour. */
    matins: { dureeMaxMin: number; seances?: string[] };
  };
  /** Version 2 : séances du soir d'une tranche, dans l'ordre (à la place de `semaineType`). */
  sequence?: string[];
  semaineType?: Record<DayKey, { matin: string | null; soir: string | null }>;
  seances: SeanceFichier[];
  objectifs: ObjectifFichier[];
  nouveautes: { elements: ElementFichier[]; exercices: ExerciceFichier[]; blocs: BlocFichier[]; typesSeance: TypeSeanceFichier[] };
  demandesAppli: DemandeFichier[];
  catalogue?: CatalogueFichier;
}

const NATURE: Record<ElementKind, Nature> = { skill: 'skill', component: 'composante', other: 'autre' };
const MESURE: Record<Measure, Mesure> = { reps: 'reps', seconds: 'secondes', combos: 'combos', none: 'aucune' };
const UNITE: Record<TargetUnit, Unite> = { reps: 'reps', seconds: 's', combos: 'combos' };
const MOMENT: Record<Moment, MomentFr> = { morning: 'matin', evening: 'soir' };

function invert<K extends string, V extends string>(record: Record<K, V>): Record<V, K> {
  return Object.fromEntries(Object.entries(record).map(([k, v]) => [v, k])) as Record<V, K>;
}

const FROM_NATURE = invert(NATURE);
const FROM_MESURE = invert(MESURE);
const FROM_UNITE = invert(UNITE);
const FROM_MOMENT = invert(MOMENT);

const dayKey = (day: SeqDay): DayKey => `J${day}`;

/** « — » ou vide : rien à mesurer, pas d'intensité. */
export function isEmptyText(text: string): boolean {
  return /^[\s—–-]*$/.test(text);
}

// ---------------------------------------------------------------------------------------------------------------
// Export

export interface CatalogData {
  elements: readonly Element[];
  blockTypes: readonly BlockType[];
  sessionTypes: readonly SessionType[];
  exercises: readonly Exercise[];
  bands: readonly Band[];
  objectives: readonly Objective[];
}

function byOrder<T extends { order: number }>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => a.order - b.order);
}

/** Noms des modèles du programme, rendus uniques s'il le faut (les noms servent de références dans le fichier). */
function templateNames(templates: readonly SessionTemplate[]): Map<ID, string> {
  const names = new Map<ID, string>();
  const taken: { name: string }[] = [];
  for (const template of templates) {
    const name = uniqueName(template.name, taken);
    taken.push({ name });
    names.set(template.id, name);
  }
  return names;
}

function exerciseToFile(exercise: Exercise, elementName: (id: ID | null) => string): ExerciceFichier {
  return {
    nom: exercise.name,
    element: elementName(exercise.elementId),
    mesure: MESURE[exercise.measure],
    categorie: exercise.category,
    rapide: exercise.quick,
    tempsParSerieSec: exercise.workSecPerSet,
    autresNoms: [...exercise.aliases],
    notes: exercise.notes,
  };
}

function objectiveToFile(objective: Objective, exerciseName: (id: ID) => string): ObjectifFichier {
  return {
    nom: objective.name,
    critere: objective.criterion,
    cible: objective.target,
    unite: UNITE[objective.unit],
    exercice: objective.exerciseId ? exerciseName(objective.exerciseId) : null,
  };
}

/**
 * Programme au format fichier, avec le catalogue : ses modèles non archivés (ceux de la semaine type d'abord, dans
 * l'ordre des jours), ses objectifs, sans nouveautés ni demandes.
 */
export function programToFile(program: Program, templates: readonly SessionTemplate[], catalog: CatalogData, app: Pick<AppSettings, 'cycleStartDate'>): ProgramFile {
  const elements = new Map(catalog.elements.map((e) => [e.id, e]));
  const blocks = new Map(catalog.blockTypes.map((b) => [b.id, b]));
  const types = new Map(catalog.sessionTypes.map((t) => [t.id, t]));
  const exercises = new Map(catalog.exercises.map((e) => [e.id, e]));
  const elementName = (id: ID | null) => (id ? (elements.get(id)?.name ?? '?') : '');
  const exerciseName = (id: ID) => exercises.get(id)?.name ?? '?';

  const own = templatesOf(templates, program.id).filter((t) => !t.archived);
  const isSequence = program.schedule === 'sequence';
  const planned = isSequence
    ? [...sequenceIds(program.weekPlan, 'evening'), ...sequenceIds(program.weekPlan, 'morning')]
    : SEQ_DAYS.flatMap((day) => [program.weekPlan[day].evening, program.weekPlan[day].morning]);
  const rank = (t: SessionTemplate) => {
    const i = planned.indexOf(t.id);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  const ordered = own.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  const names = templateNames(ordered);
  const slotName = (id: ID | null) => (id && names.has(id) ? names.get(id)! : null);

  const semaineType = Object.fromEntries(
    SEQ_DAYS.map((day) => [dayKey(day), { matin: slotName(program.weekPlan[day].morning), soir: slotName(program.weekPlan[day].evening) }]),
  ) as NonNullable<ProgramFile['semaineType']>;
  const namesOf = (ids: ID[]) => ids.map(slotName).filter((n): n is string => n !== null);
  const tranches = (item: PrescriptionItem): Record<string, TrancheFichier> =>
    Object.fromEntries(
      Object.entries(item.byTranche ?? {}).map(([tranche, o]) => {
        const entry: TrancheFichier = {};
        if (o.setsMin !== undefined || o.setsMax !== undefined) entry.series = { min: o.setsMin ?? item.setsMin, max: o.setsMax ?? item.setsMax };
        if (o.targetText !== undefined) entry.cible = o.targetText;
        if (o.intensityText !== undefined) entry.intensite = o.intensityText;
        return [tranche, entry];
      }),
    );

  const seances: SeanceFichier[] = ordered.map((template) => ({
    nom: names.get(template.id)!,
    type: types.get(template.sessionTypeId)?.name ?? '?',
    moment: MOMENT[template.moment],
    optionnelle: template.optional,
    notes: template.notes,
    lignes: template.items.map((item) => ({
      bloc: blocks.get(item.blockTypeId)?.name ?? '?',
      element: elementName(item.elementId),
      exercices: item.candidateExerciseIds.map(exerciseName),
      series: { min: item.setsMin, max: item.setsMax },
      cible: !isEmptyText(item.targetText) ? item.targetText : item.targets.length > 0 ? item.targets.map(formatTarget).join(' ou ') : '—',
      intensite: !isEmptyText(item.intensityText) ? item.intensityText : item.intensity ? formatIntensity(item.intensity) : '—',
      repos: !isEmptyText(item.restText) ? item.restText : formatRest(item.restMinSec, item.restMaxSec),
      superset: item.superset,
      optionnelle: item.optional,
      notes: item.notes,
      parTranche: tranches(item),
      progressionsInferieures: (item.lowerProgressionIds ?? []).map(exerciseName),
    })),
  }));

  const used = new Set(ordered.flatMap((t) => t.items.flatMap((i) => [...i.candidateExerciseIds, ...(i.lowerProgressionIds ?? [])])));
  const cycle = { reductionAllegeePct: program.deloadReductionPct, masquerMatinsAllegee: program.hideMorningsInDeload };
  return {
    format: PROGRAM_FILE_FORMAT,
    version: PROGRAM_FILE_VERSION,
    programme: {
      nom: program.name,
      debut: programStartDate(app, program),
      notes: program.notes,
      cycle: isSequence
        ? { tranches: program.cycleLengthWeeks, trancheAllegee: program.deloadWeek, ...cycle }
        : { semaines: program.cycleLengthWeeks, semaineAllegee: program.deloadWeek, ...cycle },
      volume: { min: program.volumeMin, max: program.volumeMax },
      volumes: program.componentVolumes.map((v) => ({ element: elementName(v.elementId), travail: v.work, min: v.min, max: v.max })),
      matins: { dureeMaxMin: program.morningMaxMinutes, seances: isSequence ? namesOf(sequenceIds(program.weekPlan, 'morning')) : [] },
    },
    ...(isSequence ? { sequence: namesOf(sequenceIds(program.weekPlan, 'evening')) } : { semaineType }),
    seances,
    objectifs: catalog.objectives.filter((o) => program.objectiveIds.includes(o.id)).map((o) => objectiveToFile(o, exerciseName)),
    nouveautes: { elements: [], exercices: [], blocs: [], typesSeance: [] },
    demandesAppli: [],
    catalogue: {
      elements: byOrder(catalog.elements).map((e) => ({ nom: e.name, nature: NATURE[e.kind] })),
      blocs: byOrder(catalog.blockTypes).map((b) => ({ nom: b.name, alternance: b.alternateSkills, reduitEnAllegee: b.reducedInDeload })),
      typesSeance: catalog.sessionTypes.map((t) => ({
        nom: t.name,
        moment: t.moment ? MOMENT[t.moment] : null,
        description: t.description,
        couleur: t.color,
        jourDeTest: t.isTestDay,
      })),
      // Exercices actifs, et ceux du programme même désactivés.
      exercices: byOrder(catalog.exercises)
        .filter((e) => e.active || used.has(e.id))
        .map((e) => exerciseToFile(e, elementName)),
      elastiques: byOrder(catalog.bands)
        .filter((b) => b.active)
        .map((b) => ({ nom: b.name })),
      objectifs: byOrder(catalog.objectives).map((o) => objectiveToFile(o, exerciseName)),
    },
  };
}

export function serializeProgramFile(file: ProgramFile): string {
  return JSON.stringify(file, null, 2);
}

/** « streeter-programme-novembre-2026.json » (`.txt` pour le menu de partage, qui refuse le JSON). */
export function programFileName(name: string, extension: 'json' | 'txt' = 'json'): string {
  const slug = fold(name)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `streeter-programme-${slug || 'programme'}.${extension}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Import

export interface ProgramImportContext {
  app: AppSettings;
  programs: readonly Program[];
  templates: readonly SessionTemplate[];
  elements: readonly Element[];
  blockTypes: readonly BlockType[];
  sessionTypes: readonly SessionType[];
  exercises: readonly Exercise[];
  objectives: readonly Objective[];
  /** Modèles auxquels une séance enregistrée renvoie : ils sont archivés plutôt que supprimés. */
  usedTemplateIds: ReadonlySet<ID>;
  /** Date du jour : un programme en séquence commence au plus tôt ce jour-là. */
  today: string;
  currentWeek: number;
  newId: () => ID;
  now: number;
}

/** Ce que l'import va écrire, et de quoi en montrer l'aperçu. */
export interface ProgramImport {
  program: Program;
  /** Modèles du programme importé. */
  templates: SessionTemplate[];
  /** Programme remplacé (même semaine de début) ; `null` : nouveau programme. */
  replaces: Program | null;
  /** Modèles non archivés du programme remplacé absents du fichier : archivés s'ils ont servi, supprimés sinon. */
  removedTemplates: { template: SessionTemplate; archive: boolean }[];
  newElements: Element[];
  newBlocks: BlockType[];
  /** Tous les blocs, avec leur nouvel ordre (un nouveau bloc se place après un autre). */
  blockTypes: BlockType[];
  newSessionTypes: SessionType[];
  newExercises: Exercise[];
  newObjectives: Objective[];
  /** Objectifs repris, avec leurs nouveaux critère, cible, unité et exercice (les tests restent). */
  updatedObjectives: Objective[];
  requests: DemandeFichier[];
  /** Remarques de lecture : rien de bloquant. */
  warnings: string[];
}

export type ProgramFileResult = { ok: true; value: ProgramImport } | { ok: false; errors: string[] };

export class ProgramFileError extends Error {}

/**
 * Texte JSON d'un fichier ou d'un texte collé : le bloc ```json d'une réponse de l'agent s'il y en a un, sinon du
 * premier « { » au dernier « } ».
 */
export function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*\n([\s\S]*?)```/i);
  if (fenced) return fenced[1];
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return start !== -1 && end > start ? text.slice(start, end + 1) : text;
}

type Json = Record<string, unknown>;

/** Lecture d'un objet du fichier : erreurs avec l'endroit où elles se trouvent, clés inconnues refusées. */
class Reader {
  readonly errors: string[] = [];
  readonly warnings: string[] = [];

  error(where: string, message: string): void {
    this.errors.push(where ? `${where} : ${message}` : message);
  }

  warn(message: string): void {
    if (!this.warnings.includes(message)) this.warnings.push(message);
  }

  /** Objet avec ces clés ; une clé absente prend sa valeur par défaut si elle en a une, sinon c'est une erreur. */
  object(value: unknown, where: string, required: readonly string[], defaults: Json = {}): Json | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      this.error(where, 'un objet { … } est attendu');
      return null;
    }
    const obj = { ...defaults, ...(value as Json) };
    const known = new Set([...required, ...Object.keys(defaults)]);
    for (const key of Object.keys(value as Json)) if (!known.has(key)) this.error(where, `clé inconnue « ${key} »`);
    for (const key of required) if (!(key in obj)) this.error(where, `clé « ${key} » absente`);
    return obj;
  }

  list(value: unknown, where: string): unknown[] {
    if (!Array.isArray(value)) {
      this.error(where, 'une liste [ … ] est attendue');
      return [];
    }
    return value;
  }

  text(value: unknown, where: string): string {
    if (typeof value !== 'string') {
      this.error(where, 'un texte entre guillemets est attendu');
      return '';
    }
    return value.trim();
  }

  name(value: unknown, where: string): string {
    const name = cleanSpaces(this.text(value, where));
    if (typeof value === 'string' && !name) this.error(where, 'nom vide');
    return name;
  }

  optionalName(value: unknown, where: string): string | null {
    return value === null ? null : this.name(value, where);
  }

  bool(value: unknown, where: string): boolean {
    if (typeof value !== 'boolean') {
      this.error(where, 'true ou false est attendu');
      return false;
    }
    return value;
  }

  number(value: unknown, where: string, opts: { min?: number; max?: number; integer?: boolean } = {}): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      this.error(where, 'un nombre est attendu (sans guillemets)');
      return opts.min ?? 0;
    }
    if (opts.integer && !Number.isInteger(value)) this.error(where, 'un nombre entier est attendu');
    else if (opts.min !== undefined && value < opts.min) this.error(where, `au moins ${opts.min}`);
    else if (opts.max !== undefined && value > opts.max) this.error(where, `au plus ${opts.max}`);
    return value;
  }

  choice<T extends string>(value: unknown, where: string, options: Record<string, T>): T | null {
    if (typeof value === 'string' && value in options) return options[value];
    this.error(where, `${JSON.stringify(value)} : valeur attendue parmi ${Object.keys(options).map((o) => `« ${o} »`).join(', ')}`);
    return null;
  }
}

/** Recherche par nom : exact, sinon sans accents ni casse (et autres noms pour un exercice), signalé. */
function finder<T extends { name: string }>(reader: Reader, list: () => readonly T[], what: string, aliases: (t: T) => readonly string[] = () => []) {
  return (name: string, where: string): T | null => {
    if (!name) return null;
    const items = list();
    const exact = items.find((t) => t.name === name);
    if (exact) return exact;
    const key = nameKey(name);
    const close = items.find((t) => nameKey(t.name) === key) ?? items.find((t) => aliases(t).some((a) => nameKey(a) === key));
    if (close) {
      reader.warn(`${what} « ${name} » lu comme « ${close.name} ».`);
      return close;
    }
    reader.error(where, `${what} « ${name} » introuvable`);
    return null;
  };
}

function isValidDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(`${iso}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}


/** `parTranche` d'une ligne : numéros de tranche de 1 à la durée du cycle, séries, cible et intensité facultatives. */
function readTranches(r: Reader, value: unknown, where: string, tranches: number): Record<number, TrancheOverride> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    r.error(where, 'un objet { "2": { … } } est attendu');
    return {};
  }
  const result: Record<number, TrancheOverride> = {};
  for (const [key, raw] of Object.entries(value as Json)) {
    const at = `${where}.${key}`;
    const n = Number(key);
    if (!/^\d+$/.test(key) || n < 1 || n > tranches) {
      r.error(where, `« ${key} » : un numéro de tranche de 1 à ${tranches} est attendu`);
      continue;
    }
    const t = r.object(raw, at, [], { series: undefined, cible: undefined, intensite: undefined });
    if (!t) continue;
    const override: TrancheOverride = {};
    if (t.series !== undefined) {
      const series = r.object(t.series, `${at}.series`, ['min', 'max']);
      if (series) {
        override.setsMin = r.number(series.min, `${at}.series.min`, { min: 0, integer: true });
        override.setsMax = r.number(series.max, `${at}.series.max`, { min: Math.max(1, override.setsMin), integer: true });
      }
    }
    if (t.cible !== undefined) {
      override.targetText = r.text(t.cible, `${at}.cible`);
      override.targets = parseTargets(override.targetText);
    }
    if (t.intensite !== undefined) {
      override.intensityText = r.text(t.intensite, `${at}.intensite`);
      override.intensity = parseIntensity(override.intensityText);
    }
    if (Object.keys(override).length > 0) result[n] = override;
  }
  return result;
}

/**
 * Lit un fichier programme (ou le texte collé d'une réponse de l'agent) et prépare son import : refusé avec la liste
 * des erreurs s'il s'écarte du format ou cite un nom introuvable. Un programme qui commence la même semaine qu'un
 * programme en cours ou à venir le remplace ; sinon, il commence au plus tôt la semaine prochaine.
 */
export function readProgramFile(text: string, ctx: ProgramImportContext): ProgramFileResult {
  let raw: unknown;
  try {
    raw = JSON.parse(extractJson(text));
  } catch (e) {
    return { ok: false, errors: [`Ce n'est pas du JSON valide (${e instanceof Error ? e.message : String(e)}).`] };
  }
  const r = new Reader();
  const head = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Json) : {};
  if (typeof head.version === 'number' && head.version > PROGRAM_FILE_VERSION) {
    return { ok: false, errors: [`Fichier au format version ${head.version}, plus récent que celui de l'appli (version ${PROGRAM_FILE_VERSION}) : mets l'appli à jour.`] };
  }
  const v2 = head.version === 2;
  // Version 2 : `sequence` ou `semaineType`, l'un des deux ; version 1 : `semaineType`.
  const root = v2
    ? r.object(raw, '', ['format', 'version', 'programme', 'seances'], { sequence: undefined, semaineType: undefined, objectifs: [], nouveautes: {}, demandesAppli: [], catalogue: null })
    : r.object(raw, '', ['format', 'version', 'programme', 'semaineType', 'seances', 'objectifs', 'nouveautes', 'demandesAppli'], { objectifs: [], nouveautes: {}, demandesAppli: [], catalogue: null });
  if (!root) return { ok: false, errors: r.errors };
  if (root.format !== PROGRAM_FILE_FORMAT) return { ok: false, errors: [`« format » doit valoir « ${PROGRAM_FILE_FORMAT} ».`] };
  if (root.version !== 1 && root.version !== 2) return { ok: false, errors: [`« version » doit valoir ${PROGRAM_FILE_VERSION} (ou 1 pour un ancien fichier).`] };
  const isSequence = v2 && root.sequence !== undefined;
  if (v2 && root.sequence !== undefined && root.semaineType !== undefined) r.error('', '« sequence » et « semaineType » ensemble : un seul des deux');
  if (v2 && root.sequence === undefined && root.semaineType === undefined) r.error('', 'clé « sequence » absente');

  // Catalogue de l'appli, complété par les nouveautés au fil de la lecture.
  const elements = [...ctx.elements];
  const sessionTypes = [...ctx.sessionTypes];
  const exercises = [...ctx.exercises];
  let blockTypes = [...ctx.blockTypes].sort((a, b) => a.order - b.order);
  const findElement = finder(r, () => elements, 'Élément');
  const findBlock = finder(r, () => blockTypes, 'Bloc');
  const findType = finder(r, () => sessionTypes, 'Type de séance');
  const findExercise = finder(r, () => exercises, 'Exercice', (e) => e.aliases);

  // Nouveautés
  const newElements: Element[] = [];
  const newBlocks: BlockType[] = [];
  const newSessionTypes: SessionType[] = [];
  const newExercises: Exercise[] = [];
  const nouveautes = r.object(root.nouveautes, 'nouveautes', [], { elements: [], exercices: [], blocs: [], typesSeance: [] });
  /** Une nouveauté qui existe déjà : l'appli garde la sienne (une seule remarque pour toutes). */
  const known: string[] = [];
  const exists = (list: readonly { name: string }[], name: string, what: string): boolean => {
    const found = list.find((x) => nameKey(x.name) === nameKey(name));
    if (found) known.push(`${what.toLowerCase()} « ${name} »`);
    return found !== undefined;
  };
  if (nouveautes) {
    r.list(nouveautes.elements, 'nouveautes.elements').forEach((value, i) => {
      const where = `nouveautes.elements[${i + 1}]`;
      const o = r.object(value, where, ['nom', 'nature']);
      if (!o) return;
      const name = r.name(o.nom, `${where}.nom`);
      const kind = r.choice(o.nature, `${where}.nature`, FROM_NATURE);
      if (!name || !kind || exists(elements, name, 'Élément')) return;
      const element: Element = { id: ctx.newId(), name, kind, order: nextOrder(elements) };
      elements.push(element);
      newElements.push(element);
    });
    r.list(nouveautes.blocs, 'nouveautes.blocs').forEach((value, i) => {
      const where = `nouveautes.blocs[${i + 1}]`;
      const o = r.object(value, where, ['nom', 'alternance', 'reduitEnAllegee', 'apres']);
      if (!o) return;
      const name = r.name(o.nom, `${where}.nom`);
      const block: BlockType = {
        id: ctx.newId(),
        name,
        order: 0,
        alternateSkills: r.bool(o.alternance, `${where}.alternance`),
        reducedInDeload: r.bool(o.reduitEnAllegee, `${where}.reduitEnAllegee`),
      };
      const after = r.optionalName(o.apres, `${where}.apres`);
      if (!name || exists(blockTypes, name, 'Bloc')) return;
      const anchor = after === null ? null : findBlock(after, `${where}.apres`);
      const index = anchor ? blockTypes.indexOf(anchor) + 1 : blockTypes.length;
      blockTypes = [...blockTypes.slice(0, index), block, ...blockTypes.slice(index)];
      newBlocks.push(block);
    });
    r.list(nouveautes.typesSeance, 'nouveautes.typesSeance').forEach((value, i) => {
      const where = `nouveautes.typesSeance[${i + 1}]`;
      const o = r.object(value, where, ['nom', 'moment', 'description', 'couleur', 'jourDeTest']);
      if (!o) return;
      const name = r.name(o.nom, `${where}.nom`);
      const moment = o.moment === null ? null : r.choice(o.moment, `${where} › moment`, FROM_MOMENT);
      const color = r.text(o.couleur, `${where}.couleur`);
      if (typeof o.couleur === 'string' && !/^#[0-9a-f]{6}$/i.test(color)) r.error(`${where}.couleur`, `« ${color} » : une couleur « #rrggbb » est attendue`);
      const type: SessionType = {
        id: ctx.newId(),
        name,
        moment,
        description: r.text(o.description, `${where}.description`),
        color: /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : DEFAULT_SESSION_TYPE_COLOR,
        isTestDay: r.bool(o.jourDeTest, `${where}.jourDeTest`),
      };
      if (!name || exists(sessionTypes, name, 'Type de séance')) return;
      sessionTypes.push(type);
      newSessionTypes.push(type);
    });
    r.list(nouveautes.exercices, 'nouveautes.exercices').forEach((value, i) => {
      const where = `nouveautes.exercices[${i + 1}]`;
      const o = r.object(value, where, ['nom', 'element', 'mesure', 'categorie', 'rapide', 'tempsParSerieSec', 'autresNoms', 'notes']);
      if (!o) return;
      const name = r.name(o.nom, `${where}.nom`);
      const element = findElement(r.name(o.element, `${where}.element`), `${where}.element`);
      const measure = r.choice(o.mesure, `${where}.mesure`, FROM_MESURE);
      const exercise: Exercise = {
        id: ctx.newId(),
        name,
        category: r.text(o.categorie, `${where}.categorie`),
        elementId: element?.id ?? null,
        measure: measure ?? 'reps',
        quick: r.bool(o.rapide, `${where}.rapide`),
        active: true,
        notes: r.text(o.notes, `${where} › notes`),
        aliases: r.list(o.autresNoms, `${where}.autresNoms`).map((a, k) => r.name(a, `${where}.autresNoms[${k + 1}]`)),
        order: nextOrder(exercises),
        workSecPerSet: o.tempsParSerieSec === null ? null : r.number(o.tempsParSerieSec, `${where}.tempsParSerieSec`, { min: 1, integer: true }),
      };
      if (!name || exists(exercises, name, 'Exercice')) return;
      exercises.push(exercise);
      newExercises.push(exercise);
    });
  }
  if (known.length === 1) r.warn(`${known[0].charAt(0).toUpperCase()}${known[0].slice(1)} existe déjà : l'appli garde le sien.`);
  if (known.length > 1) r.warn(`Nouveautés déjà dans l'appli, gardées telles quelles : ${known.join(', ')}.`);
  blockTypes = blockTypes.map((b, order) => ({ ...b, order }));
  const blockOrder = new Map(blockTypes.map((b) => [b.id, b.order]));

  // Programme
  const p = r.object(root.programme, 'programme', ['nom', 'debut', 'cycle', 'volume', 'matins'], v2 ? { notes: '', volumes: [] } : { notes: '' });
  let startWeek = 0;
  let startDate: string | null = null;
  let replaces: Program | null = null;
  let programName = '';
  const config = { cycleLengthWeeks: 4, deloadWeek: 4, deloadReductionPct: 40, hideMorningsInDeload: true, volumeMin: 4, volumeMax: 6, morningMaxMinutes: 30 };
  let notes = '';
  let volumesRaw: unknown[] = [];
  let morningNames: unknown[] = [];
  if (p) {
    programName = r.name(p.nom, 'programme.nom');
    notes = r.text(p.notes, 'programme.notes');
    const start = r.text(p.debut, 'programme.debut');
    if (typeof p.debut === 'string' && !isValidDate(start)) r.error('programme.debut', `« ${start} » : une date AAAA-MM-JJ est attendue`);
    else if (isValidDate(start) && isSequence) {
      // Séquence : n'importe quel jour, au plus tôt aujourd'hui ; la même date qu'un programme en cours ou à venir le remplace.
      startWeek = weekOfDate(ctx.app, start);
      startDate = start;
      const same = ctx.programs.find((prog) => programStartDate(ctx.app, prog) === start) ?? null;
      const sameWeek = ctx.programs.find((prog) => prog.startWeek === startWeek && prog.id !== same?.id) ?? null;
      if (startWeek < 1) r.error('programme.debut', `le ${formatDateLong(start)} est avant le début de la semaine 1 (${formatDateLong(ctx.app.cycleStartDate)})`);
      else if (same && programPhase(ctx.programs, same, { app: ctx.app, today: ctx.today }) === 'past') {
        r.error('programme.debut', `le programme « ${same.name} » commence déjà le ${formatDateLong(start)} et il est terminé`);
      } else if (same) replaces = same;
      else if (sameWeek) {
        r.error('programme.debut', `le programme « ${sameWeek.name} » commence la même semaine (le ${formatDateLong(programStartDate(ctx.app, sameWeek))}) : un seul programme par semaine`);
      } else if (start < ctx.today && ctx.programs.length > 0) r.error('programme.debut', "un nouveau programme commence au plus tôt aujourd'hui");
    } else if (isValidDate(start)) {
      const info = dayInfo(start, { cycleStartDate: ctx.app.cycleStartDate, cycleLengthWeeks: 1, deloadWeek: 0 });
      if (info.beforeStart) r.error('programme.debut', `le ${formatDateLong(start)} est avant le début de la semaine 1 (${formatDateLong(ctx.app.cycleStartDate)})`);
      else if (info.seqDay !== 1) {
        const before = dateOf(info.week, 1, ctx.app);
        r.error('programme.debut', `le ${formatDateLong(start)} est un J${info.seqDay} ; un programme commence un J1 (le ${formatDateLong(before)} ou le ${formatDateLong(dateOf(info.week + 1, 1, ctx.app))})`);
      } else {
        startWeek = info.week;
        const same = ctx.programs.find((prog) => prog.startWeek === startWeek) ?? null;
        if (same && programPhase(ctx.programs, same, { app: ctx.app, today: ctx.today }) === 'past') {
          r.error('programme.debut', `le programme « ${same.name} » commence déjà le ${formatDateLong(start)} et il est terminé`);
        } else if (same) replaces = same;
        else if (startWeek <= ctx.currentWeek) {
          r.error('programme.debut', `un nouveau programme commence au plus tôt la semaine prochaine (le ${formatDateLong(dateOf(ctx.currentWeek + 1, 1, ctx.app))})`);
        }
      }
    }
    const [length, deload] = isSequence ? ['tranches', 'trancheAllegee'] : ['semaines', 'semaineAllegee'];
    const cycle = r.object(p.cycle, 'programme.cycle', [length, deload, 'reductionAllegeePct', 'masquerMatinsAllegee']);
    if (cycle) {
      if (length in cycle) config.cycleLengthWeeks = r.number(cycle[length], `programme.cycle.${length}`, { min: 1, max: 12, integer: true });
      if (deload in cycle) config.deloadWeek = r.number(cycle[deload], `programme.cycle.${deload}`, { min: 0, max: config.cycleLengthWeeks, integer: true });
      config.deloadReductionPct = r.number(cycle.reductionAllegeePct, 'programme.cycle.reductionAllegeePct', { min: 0, max: 100, integer: true });
      config.hideMorningsInDeload = r.bool(cycle.masquerMatinsAllegee, 'programme.cycle.masquerMatinsAllegee');
    }
    const volume = r.object(p.volume, 'programme.volume', ['min', 'max']);
    if (volume) {
      config.volumeMin = r.number(volume.min, 'programme.volume.min', { min: 0, integer: true });
      config.volumeMax = r.number(volume.max, 'programme.volume.max', { min: config.volumeMin, integer: true });
    }
    const mornings = r.object(p.matins, 'programme.matins', ['dureeMaxMin'], v2 ? { seances: [] } : {});
    if (mornings) {
      config.morningMaxMinutes = r.number(mornings.dureeMaxMin, 'programme.matins.dureeMaxMin', { min: 1, integer: true });
      if (v2) morningNames = r.list(mornings.seances, 'programme.matins.seances');
      if (!isSequence && morningNames.length > 0) r.error('programme.matins.seances', 'réservé à un programme en séquence : en semaine type, les matins sont dans « semaineType »');
      if (morningNames.length > 7) r.error('programme.matins.seances', 'au plus 7 séances du matin');
    }
    if (v2) volumesRaw = r.list(p.volumes, 'programme.volumes');
  }
  const programId = replaces?.id ?? ctx.newId();
  const previous = replaces ? templatesOf(ctx.templates, replaces.id) : [];

  // Séances
  const templates: SessionTemplate[] = [];
  r.list(root.seances, 'seances').forEach((value, i) => {
    const s = r.object(value, `seances[${i + 1}]`, ['nom', 'type', 'moment', 'lignes'], { optionnelle: false, notes: '' });
    if (!s) return;
    const name = r.name(s.nom, `seances[${i + 1}].nom`);
    const where = name ? `séance « ${name} »` : `seances[${i + 1}]`;
    if (name && templates.some((t) => nameKey(t.name) === nameKey(name))) r.error(where, 'deux séances portent ce nom');
    const type = findType(r.name(s.type, `${where} › type`), `${where} › type`);
    const moment = r.choice(s.moment, `${where} › moment`, FROM_MOMENT) ?? 'evening';
    const items: PrescriptionItem[] = [];
    r.list(s.lignes, `${where} › lignes`).forEach((line, k) => {
      const at = `${where}, ligne ${k + 1}`;
      const l = r.object(
        line,
        at,
        ['bloc', 'element', 'exercices', 'series', 'cible', 'intensite', 'repos'],
        v2 ? { superset: false, optionnelle: false, notes: '', parTranche: {}, progressionsInferieures: [] } : { superset: false, optionnelle: false, notes: '' },
      );
      if (!l) return;
      const block = findBlock(r.name(l.bloc, `${at} › bloc`), `${at} › bloc`);
      const element = findElement(r.name(l.element, `${at} › element`), `${at} › element`);
      const names = r.list(l.exercices, `${at} › exercices`);
      if (Array.isArray(l.exercices) && names.length === 0) r.error(`${at} › exercices`, 'au moins un exercice est attendu');
      const candidates = names.map((n, j) => findExercise(r.name(n, `${at} › exercices[${j + 1}]`), `${at} › exercices`)).filter((e): e is Exercise => e !== null);
      const series = r.object(l.series, `${at} › series`, ['min', 'max']);
      const setsMin = series ? r.number(series.min, `${at} › series.min`, { min: v2 ? 0 : 1, integer: true }) : 1;
      if (series && setsMin === 0 && series.max === 0) r.error(`${at} › series.max`, 'au moins 1 (le plafond d’une ligne sans minimum)');
      const setsMax = series ? r.number(series.max, `${at} › series.max`, { min: setsMin, integer: true }) : 1;
      const targetText = r.text(l.cible, `${at} › cible`);
      const intensityText = r.text(l.intensite, `${at} › intensite`);
      const restText = r.text(l.repos, `${at} › repos`);
      const targets = parseTargets(targetText);
      const intensity = parseIntensity(intensityText);
      const rest = parseRest(restText);
      // Une cible ou une intensité non lue s'affiche telle quelle ; un repos non lu n'aurait pas de minuteur.
      if (rest.minSec === null && !isEmptyText(restText) && !/\blibre\b/.test(fold(restText))) r.warn(`${at} : repos « ${restText} » non lu, compté comme libre.`);
      const lower = v2
        ? r.list(l.progressionsInferieures, `${at} › progressionsInferieures`)
            .map((n, j) => findExercise(r.name(n, `${at} › progressionsInferieures[${j + 1}]`), `${at} › progressionsInferieures`))
            .filter((e): e is Exercise => e !== null)
        : [];
      const byTranche = v2 ? readTranches(r, l.parTranche, `${at} › parTranche`, config.cycleLengthWeeks) : {};
      items.push({
        id: ctx.newId(),
        blockTypeId: block?.id ?? '',
        elementId: element?.id ?? '',
        candidateExerciseIds: candidates.map((e) => e.id),
        candidatesText: candidates.map((e) => e.name).join(', '),
        setsMin,
        setsMax,
        targetText,
        targets,
        intensityText,
        intensity,
        restText,
        restMinSec: rest.minSec,
        restMaxSec: rest.maxSec,
        superset: r.bool(l.superset, `${at} › superset`) || rest.superset,
        optional: r.bool(l.optionnelle, `${at} › optionnelle`),
        notes: r.text(l.notes, `${at} › notes`),
        ...(Object.keys(byTranche).length > 0 ? { byTranche } : {}),
        ...(lower.length > 0 ? { lowerProgressionIds: lower.map((e) => e.id) } : {}),
      });
    });
    // Lignes regroupées par bloc dans l'ordre des blocs ; l'ordre du fichier reste celui d'un même bloc.
    const sorted = items.map((item, k) => ({ item, k })).sort((a, b) => (blockOrder.get(a.item.blockTypeId) ?? 0) - (blockOrder.get(b.item.blockTypeId) ?? 0) || a.k - b.k);
    const reused = previous.find((t) => nameKey(t.name) === nameKey(name));
    templates.push({
      id: reused?.id ?? ctx.newId(),
      name,
      sessionTypeId: type?.id ?? '',
      moment,
      optional: r.bool(s.optionnelle, `${where} › optionnelle`),
      notes: r.text(s.notes, `${where} › notes`),
      items: sorted.map((x) => x.item),
      archived: false,
      programId,
    });
  });

  // Séquence, ou semaine type
  const findSession = (name: string, where: string, moment: Moment): ID | null => {
    const template = templates.find((t) => t.name === name) ?? templates.find((t) => nameKey(t.name) === nameKey(name));
    if (!template) r.error(where, `séance « ${name} » absente de « seances »`);
    else if (template.moment !== moment) r.error(where, `« ${template.name} » est une séance du ${MOMENT[template.moment]}`);
    else return template.id;
    return null;
  };
  let weekPlan = {} as WeekPlan;
  if (isSequence) {
    const evenings = r.list(root.sequence, 'sequence');
    if (Array.isArray(root.sequence) && (evenings.length === 0 || evenings.length > 7)) r.error('sequence', 'de 1 à 7 séances du soir');
    const ids = (names: unknown[], where: string, moment: Moment) =>
      names.map((n, k) => findSession(r.name(n, `${where}[${k + 1}]`), `${where}[${k + 1}]`, moment)).filter((id): id is ID => id !== null);
    weekPlan = sequenceWeekPlan(ids(evenings.slice(0, 7), 'sequence', 'evening'), ids(morningNames.slice(0, 7), 'programme.matins.seances', 'morning'));
  }
  const week = isSequence ? null : r.object(root.semaineType, 'semaineType', SEQ_DAYS.map(dayKey));
  for (const day of isSequence ? [] : SEQ_DAYS) {
    weekPlan[day] = { morning: null, evening: null };
    const slot = week && dayKey(day) in week ? r.object(week[dayKey(day)], `semaineType.${dayKey(day)}`, ['matin', 'soir']) : null;
    if (!slot) continue;
    for (const moment of ['morning', 'evening'] as const) {
      const where = `semaineType.${dayKey(day)}.${MOMENT[moment]}`;
      const name = r.optionalName(slot[MOMENT[moment]], where);
      if (name) weekPlan[day][moment] = findSession(name, where, moment);
    }
  }

  // Volume par type de travail
  const componentVolumes: ComponentVolume[] = [];
  volumesRaw.forEach((value, i) => {
    const where = `programme.volumes[${i + 1}]`;
    const o = r.object(value, where, ['element', 'travail', 'min', 'max']);
    if (!o) return;
    const element = findElement(r.name(o.element, `${where}.element`), `${where}.element`);
    const work = r.name(o.travail, `${where}.travail`);
    const min = r.number(o.min, `${where}.min`, { min: 0, integer: true });
    const max = r.number(o.max, `${where}.max`, { min, integer: true });
    if (!element) return;
    if (element.kind !== 'component') r.error(`${where}.element`, `« ${element.name} » n'est pas une composante (seules les composantes ont un volume)`);
    else if (componentVolumes.some((v) => v.elementId === element.id)) r.error(`${where}.element`, `« ${element.name} » a déjà un volume`);
    else componentVolumes.push({ elementId: element.id, work, min, max });
  });

  // Objectifs
  const newObjectives: Objective[] = [];
  const updatedObjectives: Objective[] = [];
  const objectiveIds: ID[] = [];
  let order = nextOrder(ctx.objectives);
  r.list(root.objectifs, 'objectifs').forEach((value, i) => {
    const o = r.object(value, `objectifs[${i + 1}]`, ['nom', 'cible', 'unite', 'exercice'], { critere: '' });
    if (!o) return;
    const name = r.name(o.nom, `objectifs[${i + 1}].nom`);
    const where = name ? `objectif « ${name} »` : `objectifs[${i + 1}]`;
    const target = r.number(o.cible, `${where} › cible`, { min: 0 });
    const unit = r.choice(o.unite, `${where} › unite`, FROM_UNITE) ?? 'reps';
    const exerciseName = r.optionalName(o.exercice, `${where} › exercice`);
    const exercise = exerciseName ? findExercise(exerciseName, `${where} › exercice`) : null;
    const fields = { name, criterion: r.text(o.critere, `${where} › critere`), target, unit, exerciseId: exercise?.id ?? null };
    if (!name) return;
    const existing = ctx.objectives.find((x) => x.name === name) ?? ctx.objectives.find((x) => nameKey(x.name) === nameKey(name));
    const id = existing?.id ?? ctx.newId();
    if (objectiveIds.includes(id) || newObjectives.some((x) => nameKey(x.name) === nameKey(name))) {
      r.error(where, 'deux objectifs portent ce nom');
      return;
    }
    objectiveIds.push(id);
    if (existing) updatedObjectives.push({ ...existing, ...fields, name: existing.name });
    else newObjectives.push({ id, ...fields, order: order++, tests: [] });
  });

  // Demandes à l'appli
  const requests: DemandeFichier[] = [];
  r.list(root.demandesAppli, 'demandesAppli').forEach((value, i) => {
    const where = `demandesAppli[${i + 1}]`;
    const o = r.object(value, where, ['sujet', 'besoin'], { exemple: '' });
    if (o) requests.push({ sujet: r.text(o.sujet, `${where}.sujet`), besoin: r.text(o.besoin, `${where}.besoin`), exemple: r.text(o.exemple, `${where}.exemple`) });
  });

  if (r.errors.length > 0) return { ok: false, errors: r.errors };

  const others = ctx.programs.filter((prog) => prog.id !== replaces?.id);
  const name = uniqueName(programName, others);
  if (name !== programName) r.warn(`Un autre programme s'appelle déjà « ${programName} » : celui-ci s'appellera « ${name} ».`);
  const program: Program = {
    ...config,
    schedule: isSequence ? 'sequence' : 'week',
    startDate,
    componentVolumes,
    id: programId,
    name,
    startWeek,
    notes,
    objectiveIds,
    createdAt: replaces?.createdAt ?? ctx.now,
    weekPlan,
  };
  const keptIds = new Set(templates.map((t) => t.id));
  const removedTemplates = previous.filter((t) => !t.archived && !keptIds.has(t.id)).map((template) => ({ template, archive: ctx.usedTemplateIds.has(template.id) }));
  return {
    ok: true,
    value: {
      program,
      templates,
      replaces,
      removedTemplates,
      newElements,
      newBlocks,
      blockTypes,
      newSessionTypes,
      newExercises,
      newObjectives,
      updatedObjectives,
      requests,
      warnings: r.warnings,
    },
  };
}

