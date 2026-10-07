// Import du tableur : fonction pure « lignes du fichier + données existantes → entités + rapport ».
// Les entités existantes sont rapprochées par nom et gardent leur identifiant (ré-import sans doublon).
import { addDays, dayInfo, toDayNumber, weekdayOf } from '../../domain/cycle';
import {
  BLOCK_PRESETS,
  DEFAULT_BANDS,
  DEFAULT_SESSION_TYPE_COLOR,
  DEFAULT_SETTINGS,
  SESSION_TYPE_PRESETS,
  UNKNOWN_BAND_COLOR,
  emptyWeekPlan,
} from '../../domain/defaults';
import { parseIntensity, parseRest, parseTargets } from '../../domain/parse';
import { cleanSpaces, fold, nameKey, startsWithWords } from '../../domain/text';
import type {
  Band,
  BlockType,
  Element,
  ElementKind,
  Exercise,
  ID,
  Moment,
  Objective,
  PrescriptionItem,
  SeqDay,
  SessionLog,
  SessionTemplate,
  SessionType,
  SetLog,
  Settings,
  TargetUnit,
} from '../../domain/types';
import { ExerciseMatcher, elementForCategory, inferMeasure, matchExerciseName } from './catalogue';
import { refersToSkillLine, resolveCandidates } from './candidates';
import type { JournalRow, ProgrammeRow, WorkbookData } from './readWorkbook';
import { compareVolume, type VolumeCheck } from './volumeCheck';

export interface ExistingData {
  elements: Element[];
  blockTypes: BlockType[];
  sessionTypes: SessionType[];
  exercises: Exercise[];
  bands: Band[];
  templates: SessionTemplate[];
  objectives: Objective[];
  sessions: SessionLog[];
  settings: Settings | null;
}

export function emptyExisting(): ExistingData {
  return {
    elements: [],
    blockTypes: [],
    sessionTypes: [],
    exercises: [],
    bands: [],
    templates: [],
    objectives: [],
    sessions: [],
    settings: null,
  };
}

export interface ImportOptions {
  newId: () => ID;
  /** Date du jour (YYYY-MM-DD), pour les valeurs par défaut. */
  today: string;
}

export type IssueLevel = 'error' | 'warning' | 'info';

export interface ImportIssue {
  level: IssueLevel;
  sheet: string;
  /** Lignes Excel concernées. */
  lines: number[];
  message: string;
}

export interface ImportCounts {
  exercises: number;
  newExercises: number;
  templates: number;
  objectives: number;
  sessions: number;
  sets: number;
  skippedSessions: number;
}

export interface ImportReport {
  counts: ImportCounts;
  issues: ImportIssue[];
  volumeCheck: VolumeCheck | null;
}

export interface ImportResult {
  elements: Element[];
  blockTypes: BlockType[];
  sessionTypes: SessionType[];
  exercises: Exercise[];
  bands: Band[];
  templates: SessionTemplate[];
  settings: Settings;
  objectives: Objective[];
  sessions: SessionLog[];
  sets: SetLog[];
  /** Séances déjà importées d'un précédent tableur, remplacées (leurs séries sont à supprimer). */
  replacedSessionIds: ID[];
  report: ImportReport;
}

/** Entités repérées par nom (sans accents ni casse) ; garde l'ordre d'insertion. */
class Registry<T extends { id: ID; name: string }> {
  private readonly byKey = new Map<string, T>();

  constructor(existing: readonly T[]) {
    for (const entity of existing) this.byKey.set(nameKey(entity.name), entity);
  }

  get(name: string): T | undefined {
    return this.byKey.get(nameKey(name));
  }

  /** Renvoie l'entité existante (éventuellement mise à jour) ou la crée. */
  ensure(name: string, create: () => T, update?: (existing: T) => T): { entity: T; created: boolean } {
    const key = nameKey(name);
    const existing = this.byKey.get(key);
    const entity = existing ? (update ? update(existing) : existing) : create();
    this.byKey.set(key, entity);
    return { entity, created: !existing };
  }

  replace(entity: T): void {
    this.byKey.set(nameKey(entity.name), entity);
  }

  all(): T[] {
    return [...this.byKey.values()];
  }
}

function nextOrder(list: readonly { order: number }[]): number {
  return list.reduce((max, e) => Math.max(max, e.order), -1) + 1;
}

function isRestRow(row: ProgrammeRow): boolean {
  return nameKey(row.block) === 'repos' || nameKey(row.sessionType) === 'repos';
}

function isBlank(name: string): boolean {
  return cleanSpaces(name) === '' || /^[—–-]+$/.test(cleanSpaces(name));
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** Ordre des blocs déduit des séances (tri topologique, à défaut ordre d'apparition). */
function orderBlocks(sequences: string[][]): string[] {
  const display = new Map<string, string>();
  const keys: string[] = [];
  for (const seq of sequences) {
    for (const name of seq) {
      const key = nameKey(name);
      if (!display.has(key)) {
        display.set(key, name);
        keys.push(key);
      }
    }
  }
  const next = new Map(keys.map((k) => [k, new Set<string>()]));
  const incoming = new Map(keys.map((k) => [k, 0]));
  for (const seq of sequences) {
    for (let i = 0; i + 1 < seq.length; i++) {
      const a = nameKey(seq[i]);
      const b = nameKey(seq[i + 1]);
      if (a !== b && !next.get(a)!.has(b)) {
        next.get(a)!.add(b);
        incoming.set(b, incoming.get(b)! + 1);
      }
    }
  }
  const ordered: string[] = [];
  const ready = keys.filter((k) => incoming.get(k) === 0);
  while (ready.length > 0) {
    ready.sort((x, y) => keys.indexOf(x) - keys.indexOf(y));
    const key = ready.shift()!;
    ordered.push(key);
    for (const b of next.get(key)!) {
      incoming.set(b, incoming.get(b)! - 1);
      if (incoming.get(b) === 0) ready.push(b);
    }
  }
  return (ordered.length === keys.length ? ordered : keys).map((k) => display.get(k)!);
}

function parseObjectiveUnit(unit: string): TargetUnit | null {
  const u = fold(unit);
  if (/^(s|sec|secs|seconde|secondes)$/.test(u)) return 'seconds';
  if (/^(rep|reps|repetition|repetitions)$/.test(u)) return 'reps';
  if (/^combos?$/.test(u)) return 'combos';
  return null;
}

function parseValues(text: string): { values: number[]; invalid: string[] } {
  const values: number[] = [];
  const invalid: string[] = [];
  for (const part of text.split(';')) {
    const p = cleanSpaces(part);
    if (isBlank(p)) continue;
    const m = p.match(/^\d+(?:[.,]\d+)?/);
    if (m) values.push(Number(m[0].replace(',', '.')));
    else invalid.push(p);
  }
  return { values, invalid };
}

/** Date de début (un J1) déduite des lignes du Journal : date − ((semaine − 1) × 7 + (jour − 1)). */
function inferStartDate(journal: readonly JournalRow[]): { date: string | null; conflicting: boolean } {
  const votes = new Map<string, number>();
  for (const row of journal) {
    if (!row.date || row.week === null || row.day === null) continue;
    const start = addDays(row.date, -((row.week - 1) * 7 + (row.day - 1)));
    votes.set(start, (votes.get(start) ?? 0) + 1);
  }
  const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return { date: ranked[0]?.[0] ?? null, conflicting: ranked.length > 1 };
}

export function buildImport(data: WorkbookData, existing: ExistingData, opts: ImportOptions): ImportResult {
  const { newId } = opts;
  const issueIndex = new Map<string, ImportIssue>();
  const issue = (level: IssueLevel, sheet: string, line: number | null, message: string) => {
    const key = `${level}|${sheet}|${message}`;
    const found = issueIndex.get(key);
    if (found) {
      if (line !== null && !found.lines.includes(line)) found.lines.push(line);
    } else {
      issueIndex.set(key, { level, sheet, lines: line === null ? [] : [line], message });
    }
  };
  for (const error of data.errors) issue('error', 'Fichier', null, error);

  const programme = data.programme ?? [];
  const journal = data.journal ?? [];
  const programmeRows = programme.filter((r) => !isRestRow(r));

  // Éléments, avec leur nature déduite des blocs où ils apparaissent.
  const elementReg = new Registry(existing.elements);
  const blocksOfElement = new Map<string, Set<string>>();
  for (const row of programmeRows) {
    if (isBlank(row.element)) continue;
    const key = nameKey(row.element);
    if (!blocksOfElement.has(key)) blocksOfElement.set(key, new Set());
    blocksOfElement.get(key)!.add(nameKey(row.block));
  }
  const createdElements: Element[] = [];
  for (const row of programmeRows) {
    if (isBlank(row.element)) continue;
    const blocks = blocksOfElement.get(nameKey(row.element))!;
    const kind: ElementKind = blocks.has('skill') ? 'skill' : blocks.has('renfo composantes') ? 'component' : 'other';
    const { entity, created } = elementReg.ensure(row.element, () => ({ id: newId(), name: row.element, kind, order: 0 }));
    if (created) createdElements.push(entity);
  }
  // Ordre d'affichage des nouveaux éléments : skills, composantes (ordre de Volume hebdo), autres.
  const volumeOrder = (data.volume?.components ?? []).map((c) => nameKey(c.element));
  const kindRank: Record<ElementKind, number> = { skill: 0, component: 1, other: 2 };
  const rank = (e: Element) => {
    const inVolume = volumeOrder.indexOf(nameKey(e.name));
    return [kindRank[e.kind], inVolume < 0 ? volumeOrder.length : inVolume, createdElements.indexOf(e)];
  };
  const firstNewElementOrder = nextOrder(existing.elements);
  [...createdElements]
    .sort((a, b) => {
      const [ra, rb] = [rank(a), rank(b)];
      return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2];
    })
    .forEach((e, i) => elementReg.replace({ ...e, order: firstNewElementOrder + i }));

  // Blocs, dans l'ordre des séances.
  const groups = new Map<string, { day: SeqDay; moment: Moment; rows: ProgrammeRow[] }>();
  for (const row of programme) {
    if (row.day === null || row.moment === null) {
      issue('warning', 'Programme', row.line, 'Jour ou moment illisible : ligne ignorée.');
      continue;
    }
    const key = `${row.day}|${row.moment}`;
    if (!groups.has(key)) groups.set(key, { day: row.day, moment: row.moment, rows: [] });
    groups.get(key)!.rows.push(row);
  }
  for (const group of groups.values()) group.rows.sort((a, b) => a.order - b.order);
  const blockReg = new Registry(existing.blockTypes);
  const blockSequences = [...groups.values()].map((g) =>
    g.rows.filter((r) => !isRestRow(r)).map((r) => r.block).filter((b, i, all) => i === 0 || nameKey(b) !== nameKey(all[i - 1])),
  );
  const firstNewBlockOrder = nextOrder(existing.blockTypes);
  orderBlocks(blockSequences).forEach((name, i) => {
    const preset = BLOCK_PRESETS[nameKey(name)] ?? { alternateSkills: false, reducedInDeload: true };
    blockReg.ensure(name, () => ({ id: newId(), name, order: firstNewBlockOrder + i, ...preset }));
  });

  // Types de séance.
  const sessionTypeReg = new Registry(existing.sessionTypes);
  for (const row of programmeRows) {
    if (isBlank(row.sessionType)) continue;
    const preset = SESSION_TYPE_PRESETS[nameKey(row.sessionType)];
    sessionTypeReg.ensure(row.sessionType, () => ({
      id: newId(),
      name: row.sessionType,
      moment: row.moment,
      description: preset?.description ?? '',
      color: preset?.color ?? DEFAULT_SESSION_TYPE_COLOR,
      isTestDay: preset?.isTestDay ?? false,
    }));
  }

  // Catalogue.
  const exerciseReg = new Registry([...existing.exercises].sort((a, b) => a.order - b.order));
  let newExercises = 0;
  const firstNewExerciseOrder = nextOrder(existing.exercises);
  (data.catalogue ?? []).forEach((row, index) => {
    const name = cleanSpaces(row.name);
    const category = cleanSpaces(row.category);
    const element =
      elementForCategory(category, elementReg.all()) ??
      elementReg.ensure(category, () => ({ id: newId(), name: category, kind: 'other', order: nextOrder(elementReg.all()) })).entity;
    const { created } = exerciseReg.ensure(
      name,
      () => ({
        id: newId(),
        name,
        category,
        elementId: element.id,
        measure: inferMeasure(name, category),
        quick: row.quick,
        active: true,
        notes: '',
        aliases: [],
        order: firstNewExerciseOrder + index,
      }),
      (e) => ({ ...e, category, quick: row.quick, elementId: e.elementId ?? element.id }),
    );
    if (created) newExercises++;
  });
  const matcher = new ExerciseMatcher(exerciseReg.all());
  const exercisesByCategory = new Map<string, Exercise[]>();
  for (const exercise of exerciseReg.all()) {
    if (!exercise.active) continue;
    if (!exercisesByCategory.has(exercise.category)) exercisesByCategory.set(exercise.category, []);
    exercisesByCategory.get(exercise.category)!.push(exercise);
  }
  const genericExerciseFor = (element: Element): Exercise => {
    const { entity, created } = exerciseReg.ensure(element.name, () => ({
      id: newId(),
      name: element.name,
      category: element.name,
      elementId: element.id,
      measure: 'none',
      quick: true,
      active: true,
      notes: 'Exercice générique créé à l’import pour « Au choix ».',
      aliases: [],
      order: nextOrder(exerciseReg.all()),
    }));
    if (created) {
      matcher.add(entity);
      newExercises++;
      issue('info', 'Programme', null, `Exercice générique « ${entity.name} » créé pour les lignes « Au choix ».`);
    }
    return entity;
  };

  // Modèles de séance et semaine type.
  const weekPlan = emptyWeekPlan();
  const templates: SessionTemplate[] = [];
  const templateBySignature = new Map<string, SessionTemplate>();
  const templateDays = new Map<ID, SeqDay[]>();
  for (const group of groups.values()) {
    const rows = group.rows.filter((r) => !isRestRow(r));
    if (rows.length === 0) continue; // Repos
    if (rows.length < group.rows.length) {
      issue('warning', 'Programme', group.rows.find(isRestRow)!.line, 'Ligne « Repos » mêlée à une séance : ignorée.');
    }
    const signature = JSON.stringify(
      rows.map((r) => [r.order, r.sessionType, r.block, r.element, r.candidates, r.setsMin, r.setsMax, r.target, r.intensity, r.rest, r.optional, r.notes]),
    );
    let template = templateBySignature.get(signature);
    if (!template) {
      const typeNames = [...new Set(rows.map((r) => nameKey(r.sessionType)))];
      if (typeNames.length > 1) issue('warning', 'Programme', rows[0].line, `J${group.day} : plusieurs types de séance dans la même séance.`);
      const type = sessionTypeReg.get(rows[0].sessionType);
      const resolved = new Map<ProgrammeRow, Exercise[]>();
      const resolveRow = (row: ProgrammeRow) => {
        const element = elementReg.get(row.element);
        if (!element) return;
        const resolution = resolveCandidates(row.candidates, {
          matcher,
          elementName: element.name,
          exercisesByCategory,
          genericExercise: () => genericExerciseFor(element),
          skillLineCandidates: () => {
            const skillRow = rows.find((o) => o !== row && nameKey(o.block) === 'skill' && nameKey(o.element) === nameKey(row.element));
            return skillRow ? (resolved.get(skillRow) ?? null) : null;
          },
        });
        for (const text of resolution.unresolved) {
          issue('warning', 'Programme', row.line, `Exercice candidat non reconnu : « ${text} ».`);
        }
        for (const approx of resolution.approximations) {
          issue('info', 'Programme', row.line, `« ${approx.text} » rapproché de : ${approx.exercises.join(', ')}.`);
        }
        resolved.set(row, resolution.exercises);
      };
      for (const row of rows) if (!refersToSkillLine(row.candidates)) resolveRow(row);
      for (const row of rows) if (refersToSkillLine(row.candidates)) resolveRow(row);

      const items: PrescriptionItem[] = [];
      for (const row of rows) {
        const element = elementReg.get(row.element);
        const block = blockReg.get(row.block);
        if (!element || !block) {
          issue('warning', 'Programme', row.line, 'Bloc ou élément manquant : ligne ignorée.');
          continue;
        }
        let { setsMin, setsMax } = row;
        if (setsMin > setsMax) {
          issue('warning', 'Programme', row.line, `Séries min (${setsMin}) > séries max (${setsMax}) : valeurs inversées.`);
          [setsMin, setsMax] = [setsMax, setsMin];
        }
        const candidates = resolved.get(row) ?? [];
        if (candidates.length === 0) issue('warning', 'Programme', row.line, `Aucun exercice candidat pour « ${row.element} ».`);
        const rest = parseRest(row.rest);
        items.push({
          id: newId(),
          blockTypeId: block.id,
          elementId: element.id,
          candidateExerciseIds: candidates.map((e) => e.id),
          candidatesText: row.candidates,
          setsMin,
          setsMax,
          targetText: row.target,
          targets: parseTargets(row.target),
          intensityText: row.intensity,
          intensity: parseIntensity(row.intensity),
          restText: row.rest,
          restMinSec: rest.minSec,
          restMaxSec: rest.maxSec,
          superset: rest.superset,
          optional: row.optional,
          notes: row.notes,
        });
      }
      const preset = SESSION_TYPE_PRESETS[nameKey(rows[0].sessionType)];
      template = {
        id: newId(),
        name: type?.name ?? rows[0].sessionType,
        sessionTypeId: type?.id ?? '',
        moment: group.moment,
        optional: (preset?.optional ?? false) || group.moment === 'morning' || rows.every((r) => r.optional),
        notes: '',
        items,
      };
      templateBySignature.set(signature, template);
      templates.push(template);
      templateDays.set(template.id, []);
    }
    templateDays.get(template.id)!.push(group.day);
    weekPlan[group.day][group.moment] = template.id;
  }

  // Noms des modèles : le type, complété par les composantes quand plusieurs modèles partagent un type.
  const elementsById = new Map(elementReg.all().map((e) => [e.id, e]));
  for (const template of templates) {
    const sameType = templates.filter((t) => t.sessionTypeId === template.sessionTypeId);
    if (sameType.length < 2) continue;
    const components = [
      ...new Set(template.items.map((i) => elementsById.get(i.elementId)).filter((e) => e?.kind === 'component').map((e) => e!.name)),
    ];
    if (components.length > 0) template.name = `${template.name} + ${components.map(lowerFirst).join(' + ')}`;
  }
  const nameCounts = new Map<string, number>();
  for (const template of templates) nameCounts.set(template.name, (nameCounts.get(template.name) ?? 0) + 1);
  for (const template of templates) {
    if (nameCounts.get(template.name)! > 1) template.name = `${template.name} (J${templateDays.get(template.id)![0]})`;
  }
  // Ré-import : un modèle du même nom garde son identifiant.
  for (const template of templates) {
    const previous = existing.templates.find((t) => nameKey(t.name) === nameKey(template.name));
    if (!previous) continue;
    for (const slot of Object.values(weekPlan)) {
      if (slot.morning === template.id) slot.morning = previous.id;
      if (slot.evening === template.id) slot.evening = previous.id;
    }
    template.id = previous.id;
  }

  // Réglages : créés au premier import (paramètres du tableur), la semaine type est toujours remplacée.
  let settings: Settings;
  if (existing.settings) {
    settings = { ...existing.settings, weekPlan };
  } else {
    const inferred = inferStartDate(journal);
    if (inferred.conflicting) {
      issue('warning', 'Journal', null, 'Les semaines et jours notés ne donnent pas tous la même date de début : la plus fréquente est retenue.');
    }
    const monday = addDays(opts.today, -((weekdayOf(opts.today) + 6) % 7));
    settings = {
      ...DEFAULT_SETTINGS,
      cycleStartDate: inferred.date ?? monday,
      volumeMin: data.volume?.min ?? DEFAULT_SETTINGS.volumeMin,
      volumeMax: data.volume?.max ?? DEFAULT_SETTINGS.volumeMax,
      deloadReductionPct: data.volume?.deloadPct ?? DEFAULT_SETTINGS.deloadReductionPct,
      weekPlan,
    };
  }

  // Objectifs.
  const objectiveReg = new Registry(existing.objectives);
  (data.objectives ?? []).forEach((row, index) => {
    if (row.target === null) {
      issue('warning', 'Objectifs', row.line, `« ${row.name} » : cible manquante, objectif ignoré.`);
      return;
    }
    const target = row.target;
    const unit = parseObjectiveUnit(row.unit);
    if (!unit) issue('warning', 'Objectifs', row.line, `Unité « ${row.unit} » inconnue : reps retenues.`);
    const match = matchExerciseName(row.name, matcher);
    if (!match.exercise) issue('info', 'Objectifs', row.line, `« ${row.name} » n'est relié à aucun exercice du catalogue.`);
    let { entity } = objectiveReg.ensure(
      row.name,
      () => ({
        id: newId(),
        name: row.name,
        criterion: row.criterion,
        target,
        unit: unit ?? 'reps',
        exerciseId: match.exercise?.id ?? null,
        order: index,
        tests: [],
      }),
      (e) => ({ ...e, criterion: row.criterion, target, unit: unit ?? e.unit, exerciseId: e.exerciseId ?? match.exercise?.id ?? null }),
    );
    if (row.lastTest !== null) {
      const date = row.lastTestDate ?? opts.today;
      if (!row.lastTestDate) issue('warning', 'Objectifs', row.line, `« ${row.name} » : test sans date, daté d'aujourd'hui.`);
      if (!entity.tests.some((t) => t.date === date && t.value === row.lastTest)) {
        entity = { ...entity, tests: [...entity.tests, { id: newId(), date, value: row.lastTest, note: 'Importé du tableur' }] };
        objectiveReg.replace(entity);
      }
    }
  });

  // Élastiques : ceux de l'utilisateur, puis ceux rencontrés dans le Journal.
  const bandReg = new Registry(existing.bands);
  if (existing.bands.length === 0) {
    DEFAULT_BANDS.forEach((band, i) => {
      bandReg.ensure(band.name, () => ({ id: newId(), name: band.name, color: band.color, order: i, active: true }));
    });
  }
  const bandFor = (name: string, line: number): Band | null => {
    if (isBlank(name)) return null;
    const { entity, created } = bandReg.ensure(name, () => ({
      id: newId(),
      name: cleanSpaces(name),
      color: UNKNOWN_BAND_COLOR,
      order: nextOrder(bandReg.all()),
      active: true,
    }));
    if (created) issue('warning', 'Journal', line, `Élastique « ${entity.name} » inconnu : ajouté en fin de liste (le moins assistant).`);
    return entity;
  };

  // Journal.
  const templatesById = new Map(templates.map((t) => [t.id, t]));
  const sessionTypes = sessionTypeReg.all();
  const sessionTypeFor = (name: string): SessionType | null => {
    const key = nameKey(name);
    const candidates = sessionTypes
      .filter((t) => startsWithWords(key, nameKey(t.name)))
      .sort((a, b) => nameKey(b.name).length - nameKey(a.name).length);
    return candidates[0] ?? null;
  };
  const journalGroups = new Map<string, JournalRow[]>();
  for (const row of journal) {
    if (!row.date || !row.moment) {
      issue('warning', 'Journal', row.line, 'Date ou moment illisible : ligne ignorée.');
      continue;
    }
    if (row.dayText && row.day === null) issue('warning', 'Journal', row.line, `Jour « ${row.dayText} » illisible.`);
    const key = `${row.date}|${row.moment}`;
    if (!journalGroups.has(key)) journalGroups.set(key, []);
    journalGroups.get(key)!.push(row);
  }
  const existingSessions = new Map(existing.sessions.map((s) => [`${s.date}|${s.moment}`, s]));
  const sessions: SessionLog[] = [];
  const sets: SetLog[] = [];
  const replacedSessionIds: ID[] = [];
  let skippedSessions = 0;
  for (const [key, rows] of journalGroups) {
    const previous = existingSessions.get(key);
    if (previous?.source === 'app') {
      skippedSessions++;
      issue('warning', 'Journal', rows[0].line, `Séance du ${rows[0].date} déjà saisie dans l'appli : lignes du tableur ignorées.`);
      continue;
    }
    if (previous) replacedSessionIds.push(previous.id);
    const first = rows[0];
    const date = first.date!;
    const moment = first.moment!;
    const info = dayInfo(date, settings);
    const seqDay = first.day ?? info.seqDay;
    const week = first.week ?? info.week;
    const length = Math.max(1, settings.cycleLengthWeeks);
    const cycleWeek = ((((week - 1) % length) + length) % length) + 1;
    const type = sessionTypeFor(first.sessionType);
    if (!type && first.sessionType) issue('warning', 'Journal', first.line, `Type de séance « ${first.sessionType} » inconnu.`);
    const planned = templatesById.get(settings.weekPlan[seqDay][moment] ?? '');
    const session: SessionLog = {
      id: previous?.id ?? newId(),
      date,
      week,
      cycleWeek,
      seqDay,
      moment,
      templateId: planned && type && planned.sessionTypeId === type.id ? planned.id : null,
      templateSnapshot: null,
      sessionTypeId: type?.id ?? null,
      sessionTypeName: type?.name ?? first.sessionType,
      deload: cycleWeek === settings.deloadWeek,
      status: 'done',
      startedAt: null,
      endedAt: null,
      note: '',
      source: 'xlsx',
      resume: null,
    };
    sessions.push(session);

    const setCounters = new Map<string, number>();
    const noon = toDayNumber(date) * 86_400_000 + 12 * 3_600_000;
    rows.forEach((row, rowIndex) => {
      const match = matchExerciseName(row.exercise, matcher);
      let exercise = match.exercise;
      if (!exercise) {
        const name = cleanSpaces(row.exercise) || 'Exercice sans nom';
        exercise = exerciseReg.ensure(name, () => ({
          id: newId(),
          name,
          category: 'Importé (journal)',
          elementId: null,
          measure: 'reps',
          quick: false,
          active: true,
          notes: 'Créé à l’import du journal : absent du catalogue.',
          aliases: [],
          order: nextOrder(exerciseReg.all()),
        })).entity;
        matcher.add(exercise);
        newExercises++;
        issue('warning', 'Journal', row.line, `Exercice « ${name} » absent du catalogue : ajouté au catalogue.`);
      } else if (match.approximate) {
        issue('info', 'Journal', row.line, `« ${row.exercise} » rapproché de « ${exercise.name} ».`);
      }
      const block = row.block ? (blockReg.get(row.block) ?? null) : null;
      if (row.block && !block) issue('warning', 'Journal', row.line, `Bloc « ${row.block} » inconnu.`);
      const { values, invalid } = parseValues(row.values);
      if (invalid.length > 0) issue('warning', 'Journal', row.line, `Valeurs illisibles ignorées : ${invalid.map((v) => `« ${v} »`).join(', ')}.`);
      const count = values.length > 0 ? values.length : Math.max(1, row.setsDone ?? 1);
      if (values.length > 0 && row.setsDone !== null && row.setsDone !== values.length) {
        issue(
          'warning',
          'Journal',
          row.line,
          `${exercise.name} : « Séries faites » = ${row.setsDone} mais ${values.length} valeurs notées → ${values.length} séries importées.`,
        );
      }
      const band = bandFor(row.band, row.line);
      const counterKey = `${block?.id ?? ''}|${exercise.id}`;
      for (let i = 0; i < count; i++) {
        const setIndex = (setCounters.get(counterKey) ?? 0) + 1;
        setCounters.set(counterKey, setIndex);
        sets.push({
          id: newId(),
          sessionId: session.id,
          itemId: null,
          blockTypeId: block?.id ?? null,
          elementId: exercise.elementId,
          exerciseId: exercise.id,
          setIndex,
          value: values[i] ?? null,
          bandId: band?.id ?? null,
          rpe: row.rpe,
          quality: null,
          note: i === count - 1 ? row.notes : '',
          createdAt: noon + rowIndex * 1000 + i,
        });
      }
    });
  }

  const blockTypes = blockReg.all();
  const elements = elementReg.all();
  const volumeCheck = data.volume
    ? compareVolume(
        data.volume,
        { weekPlan: settings.weekPlan, templates: templatesById, elements, blocks: new Map(blockTypes.map((b) => [b.id, b])) },
        settings,
      )
    : null;
  if (volumeCheck && !volumeCheck.ok) {
    issue('warning', 'Volume hebdo', null, 'Le volume recalculé ne correspond pas à l’onglet Volume hebdo (détail ci-dessous).');
  }

  const exercises = exerciseReg.all();
  const objectives = objectiveReg.all();
  return {
    elements,
    blockTypes,
    sessionTypes,
    exercises,
    bands: bandReg.all(),
    templates,
    settings,
    objectives,
    sessions,
    sets,
    replacedSessionIds,
    report: {
      counts: {
        exercises: exercises.length,
        newExercises,
        templates: templates.length,
        objectives: objectives.length,
        sessions: sessions.length,
        sets: sets.length,
        skippedSessions,
      },
      issues: [...issueIndex.values()],
      volumeCheck,
    },
  };
}
