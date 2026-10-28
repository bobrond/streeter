import { describe, expect, it } from 'vitest';
import { diffPrograms, isEmptyDiff, objectiveChanges, slotChangeText } from '../../domain/programDiff';
import type { Objective, Program, SessionType } from '../../domain/types';
import { programIssues } from '../../domain/volume';
import { appSettings, block, element, exercise, item, program, template, weekPlan } from '../../test/builders';
import {
  extractJson,
  programFileName,
  programToFile,
  readProgramFile,
  serializeProgramFile,
  type ProgramFile,
  type ProgramImport,
  type ProgramImportContext,
} from './programFile';

const planche = element('Planche', 'skill', 0);
const fl = element('Touch FL', 'skill', 1);
const dentele = element('Grand dentelé', 'component', 2);
const elements = [planche, fl, dentele];
const warmup = block('Échauffement', 0, { reducedInDeload: false });
const skill = block('Skill', 1, { alternateSkills: true });
const renfo = block('Renfo composantes', 2);
const blockTypes = [warmup, skill, renfo];
const max: SessionType = { id: 'type-max', name: 'Max', moment: 'evening', description: '', color: '#ff5c5c', isTestDay: true };
const matinA: SessionType = { id: 'type-matin', name: 'Matin A', moment: 'morning', description: '', color: '#c084fc', isTestDay: false };
const sessionTypes = [max, matinA];
const hold = exercise('Planche Hold', planche.id, { measure: 'seconds' });
const flHold = exercise('Touch FL hold one leg', fl.id, { measure: 'seconds', aliases: ['Touch FL one leg'] });
const wallSlide = exercise('Wall slide', dentele.id);
const exercises = [hold, flHold, wallSlide];
const objective: Objective = { id: 'obj-1', name: 'Planche hold', criterion: 'Grand dentelé', target: 10, unit: 'seconds', exerciseId: hold.id, order: 0, tests: [{ id: 't', date: '2026-10-07', value: 6, note: '' }] };

const maxTpl = template(
  'Max J1',
  'evening',
  [
    item({ blockTypeId: skill.id, elementId: planche.id, candidateExerciseIds: [hold.id], setsMin: 4, setsMax: 5, targetText: '3-6 s', intensityText: 'RPE 8-9', restText: '90 s-2 min', restMinSec: 90, restMaxSec: 120 }),
    item({ blockTypeId: skill.id, elementId: fl.id, candidateExerciseIds: [flHold.id], setsMin: 4, setsMax: 5, targetText: '3-5 s', intensityText: 'RPE 8-9', restText: '90 s-2 min', restMinSec: 90, restMaxSec: 120 }),
    item({ blockTypeId: renfo.id, elementId: dentele.id, candidateExerciseIds: [wallSlide.id], setsMin: 4, setsMax: 4, targetText: '8-15 reps', intensityText: '1-2 reps en réserve', restText: '90 s', notes: 'Lent' }),
  ],
  { sessionTypeId: max.id },
);
const morningTpl = template('Matin A', 'morning', [item({ blockTypeId: renfo.id, elementId: dentele.id, candidateExerciseIds: [wallSlide.id], setsMin: 2, setsMax: 2, restText: 'Superset, 60-90 s', restMinSec: 60, restMaxSec: 90, superset: true })], {
  sessionTypeId: matinA.id,
  optional: true,
});
const october = program({ objectiveIds: [objective.id], weekPlan: weekPlan({ 1: { evening: maxTpl.id }, 4: { morning: morningTpl.id }, 5: { evening: maxTpl.id } }) });

let n = 0;
function context(overrides: Partial<ProgramImportContext> = {}): ProgramImportContext {
  return {
    app: appSettings(),
    programs: [october],
    templates: [maxTpl, morningTpl],
    elements,
    blockTypes,
    sessionTypes,
    exercises,
    objectives: [objective],
    usedTemplateIds: new Set(),
    today: '2026-10-28',
    currentWeek: 4,
    newId: () => `new-${++n}`,
    now: 1000,
    ...overrides,
  };
}

const catalog = { elements, blockTypes, sessionTypes, exercises, bands: [], objectives: [objective] };

/** Fichier exporté depuis octobre, à retoucher : nouveau programme qui commence en semaine 5 (lundi 2 novembre). */
function novemberFile(): ProgramFile {
  const file = programToFile(october, [maxTpl, morningTpl], catalog, appSettings());
  delete file.catalogue;
  file.programme.nom = 'Novembre 2026';
  file.programme.debut = '2026-11-02';
  return file;
}

function read(file: unknown, ctx = context()): ProgramImport {
  const result = readProgramFile(JSON.stringify(file), ctx);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result.value;
}

function errorsOf(file: unknown, ctx = context()): string[] {
  const result = readProgramFile(typeof file === 'string' ? file : JSON.stringify(file), ctx);
  return result.ok ? [] : result.errors;
}

const names = {
  elements: new Map(elements.map((e) => [e.id, e])),
  blocks: new Map(blockTypes.map((b) => [b.id, b])),
  exercises: new Map(exercises.map((e) => [e.id, e])),
  sessionTypes: new Map(sessionTypes.map((t) => [t.id, t])),
};

describe('export d’un programme', () => {
  it('écrit le programme par noms, avec le catalogue', () => {
    const file = programToFile(october, [maxTpl, morningTpl], catalog, appSettings());
    expect(file.programme).toMatchObject({ nom: 'Octobre 2026', debut: '2026-10-05', cycle: { semaines: 4, semaineAllegee: 4, reductionAllegeePct: 40, masquerMatinsAllegee: true } });
    expect(file.semaineType!.J1).toEqual({ matin: null, soir: 'Max J1' });
    expect(file.semaineType!.J4).toEqual({ matin: 'Matin A', soir: null });
    expect(file.seances.map((s) => s.nom)).toEqual(['Max J1', 'Matin A']);
    expect(file.seances[0].lignes[0]).toEqual({
      bloc: 'Skill',
      element: 'Planche',
      exercices: ['Planche Hold'],
      series: { min: 4, max: 5 },
      cible: '3-6 s',
      intensite: 'RPE 8-9',
      repos: '90 s-2 min',
      superset: false,
      optionnelle: false,
      notes: '',
      parTranche: {},
      progressionsInferieures: [],
    });
    expect(file.seances[1].lignes[0]).toMatchObject({ cible: '—', intensite: '—', superset: true });
    expect(file.objectifs).toEqual([{ nom: 'Planche hold', critere: 'Grand dentelé', cible: 10, unite: 's', exercice: 'Planche Hold' }]);
    expect(file.catalogue?.exercices.find((e) => e.nom === 'Planche Hold')).toMatchObject({ element: 'Planche', mesure: 'secondes' });
    expect(file.catalogue?.elements).toContainEqual({ nom: 'Grand dentelé', nature: 'composante' });
  });

  it('nomme le fichier d’après le programme', () => {
    expect(programFileName('Novembre 2026')).toBe('streeter-programme-novembre-2026.json');
    expect(programFileName('Été / force', 'txt')).toBe('streeter-programme-ete-force.txt');
  });
});

describe('import d’un fichier programme', () => {
  it('relit un programme exporté sans aucun changement (aller-retour)', () => {
    const imported = read(novemberFile());
    expect(imported.replaces).toBeNull();
    expect(imported.warnings).toEqual([]);
    expect(imported.program).toMatchObject({ name: 'Novembre 2026', startWeek: 5, objectiveIds: [objective.id], cycleLengthWeeks: 4 });
    const diff = diffPrograms({ program: october, templates: [maxTpl, morningTpl] }, { program: imported.program, templates: imported.templates }, names);
    expect(isEmptyDiff(diff)).toBe(true);
    expect(diff.unchanged).toEqual(['Max J1', 'Matin A']);
    // Les lignes sont lues comme à l'import du tableur.
    expect(imported.templates[0].items[0]).toMatchObject({ targets: [{ unit: 'seconds', min: 3, max: 6 }], intensity: { kind: 'rpe', min: 8, max: 9 }, restMinSec: 90, restMaxSec: 120 });
    expect(imported.templates[1].items[0]).toMatchObject({ superset: true, restMinSec: 60, restMaxSec: 90, targets: [], intensity: null });
  });

  it('accepte le texte collé d’une réponse de l’agent, avec son bloc ```json', () => {
    const text = `Voici les changements : moins de volume.\n\n\`\`\`json\n${serializeProgramFile(novemberFile())}\n\`\`\`\nBonne séance !`;
    expect(JSON.parse(extractJson(text)).programme.nom).toBe('Novembre 2026');
    expect(readProgramFile(text, context()).ok).toBe(true);
  });

  it('montre les changements de réglages, de semaine type, de séances et de lignes', () => {
    const file = novemberFile();
    file.programme.volume.max = 7;
    file.semaineType!.J5.soir = null;
    const ligne = file.seances[0].lignes[0];
    ligne.series = { min: 3, max: 4 };
    ligne.cible = '4-8 s';
    file.seances[0].lignes.push({ ...file.seances[0].lignes[2], exercices: ['Wall slide'], notes: '' });
    file.seances[1].lignes = [];
    file.seances.push({ ...file.seances[1], nom: 'Matin B' });
    const imported = read(file);
    const diff = diffPrograms({ program: october, templates: [maxTpl, morningTpl] }, { program: imported.program, templates: imported.templates }, names);
    expect(diff.settings).toEqual([{ label: 'Volume par composante', before: '4 à 6 séries', after: '4 à 7 séries' }]);
    expect(diff.weekPlan.map(slotChangeText)).toEqual(['J5 soir : Max J1 → Repos']);
    expect(diff.added.map((t) => t.name)).toEqual(['Matin B']);
    expect(diff.changed).toEqual([
      {
        name: 'Max J1',
        changes: ['Skill · Planche : séries 4-5 → 3-4 ; cible 3-6 s → 4-8 s', 'Ligne ajoutée : Renfo composantes · Grand dentelé (Wall slide, 4 séries)'],
      },
      { name: 'Matin A', changes: ['Ligne retirée : Renfo composantes · Grand dentelé (Wall slide)'] },
    ]);
  });

  it('refuse un fichier hors format, avec l’endroit et le nom fautif', () => {
    const file = novemberFile() as unknown as Record<string, unknown> & ProgramFile;
    file.seances[0].lignes[0].exercices = ['Planche hold court'];
    (file.seances[0].lignes[1] as unknown as Record<string, unknown>).tempo = '3-1-1';
    file.seances[0].lignes[2].series = { min: '4', max: 4 } as unknown as { min: number; max: number };
    file.semaineType!.J4.matin = 'Max J1';
    expect(errorsOf(file)).toEqual([
      'séance « Max J1 », ligne 1 › exercices : Exercice « Planche hold court » introuvable',
      'séance « Max J1 », ligne 2 : clé inconnue « tempo »',
      'séance « Max J1 », ligne 3 › series.min : un nombre est attendu (sans guillemets)',
      'semaineType.J4.matin : « Max J1 » est une séance du soir',
    ]);
    expect(errorsOf('Voici le programme : à venir')[0]).toMatch(/^Ce n'est pas du JSON valide/);
    expect(errorsOf({ ...novemberFile(), version: 3 })).toEqual(["Fichier au format version 3, plus récent que celui de l'appli (version 2) : mets l'appli à jour."]);
  });

  it('refuse une date qui n’est pas un J1, ou un nouveau programme qui commencerait cette semaine', () => {
    const file = novemberFile();
    file.programme.debut = '2026-11-03';
    expect(errorsOf(file)).toEqual(['programme.debut : le mardi 3 novembre est un J2 ; un programme commence un J1 (le lundi 2 novembre ou le lundi 9 novembre)']);
    file.programme.debut = '2026-10-26';
    expect(errorsOf(file)).toEqual(['programme.debut : un nouveau programme commence au plus tôt la semaine prochaine (le lundi 2 novembre)']);
  });

  it('lit les noms sans accents ni majuscules, et les autres noms d’un exercice, en le signalant', () => {
    const file = novemberFile();
    file.seances[0].lignes[1].exercices = ['Touch FL one leg'];
    file.seances[0].lignes[2].element = 'grand dentele';
    const imported = read(file);
    expect(imported.templates[0].items[1].candidateExerciseIds).toEqual([flHold.id]);
    expect(imported.templates[0].items[2].elementId).toBe(dentele.id);
    expect(imported.warnings).toEqual(['Exercice « Touch FL one leg » lu comme « Touch FL hold one leg ».', 'Élément « grand dentele » lu comme « Grand dentelé ».']);
  });

  it('signale un repos illisible, compté comme libre', () => {
    const file = novemberFile();
    file.seances[0].lignes[0].repos = 'le temps qu’il faut';
    file.seances[0].lignes[1].cible = 'Au choix';
    const imported = read(file);
    expect(imported.warnings).toEqual(['séance « Max J1 », ligne 1 : repos « le temps qu’il faut » non lu, compté comme libre.']);
    expect(imported.templates[0].items[1]).toMatchObject({ targetText: 'Au choix', targets: [] });
  });

  it('crée les nouveautés du catalogue et les utilise dans les lignes', () => {
    const file = novemberFile();
    file.nouveautes = {
      elements: [{ nom: 'Rotateurs externes', nature: 'autre' }],
      exercices: [{ nom: 'Face pull', element: 'Rotateurs externes', mesure: 'reps', categorie: 'Coiffe', rapide: true, tempsParSerieSec: 40, autresNoms: [], notes: '' }],
      blocs: [{ nom: 'Coiffe', alternance: false, reduitEnAllegee: true, apres: 'Skill' }],
      typesSeance: [{ nom: 'Combo libre', moment: 'soir', description: 'Au feeling', couleur: '#F59E0B', jourDeTest: false }],
    };
    file.seances[0].type = 'Combo libre';
    file.seances[0].lignes.push({ ...file.seances[0].lignes[2], bloc: 'Coiffe', element: 'Rotateurs externes', exercices: ['Face pull'] });
    const imported = read(file);
    expect(imported.newElements).toMatchObject([{ name: 'Rotateurs externes', kind: 'other', order: 3 }]);
    expect(imported.newExercises).toMatchObject([{ name: 'Face pull', elementId: imported.newElements[0].id, quick: true, workSecPerSet: 40, active: true }]);
    expect(imported.newSessionTypes).toMatchObject([{ name: 'Combo libre', moment: 'evening', color: '#f59e0b' }]);
    expect(imported.blockTypes.map((b) => [b.name, b.order])).toEqual([
      ['Échauffement', 0],
      ['Skill', 1],
      ['Coiffe', 2],
      ['Renfo composantes', 3],
    ]);
    // La ligne de coiffe, ajoutée en dernier, se range dans l'ordre des blocs.
    const items = imported.templates[0].items;
    expect(items.map((i) => imported.blockTypes.find((b) => b.id === i.blockTypeId)?.name)).toEqual(['Skill', 'Skill', 'Coiffe', 'Renfo composantes']);
    expect(imported.templates[0].sessionTypeId).toBe(imported.newSessionTypes[0].id);
  });

  it('garde ce qui existe déjà quand une nouveauté le répète', () => {
    const file = novemberFile();
    file.nouveautes.elements = [{ nom: 'Grand dentelé', nature: 'composante' }];
    const imported = read(file);
    expect(imported.newElements).toEqual([]);
    expect(imported.warnings).toEqual(['Élément « Grand dentelé » existe déjà : l\'appli garde le sien.']);
  });

  it('reprend un objectif par son nom avec ses tests, en crée un nouveau, et l’absent devient ancien', () => {
    const file = novemberFile();
    file.objectifs = [
      { nom: 'Planche hold', critere: 'Grand dentelé', cible: 12, unite: 's', exercice: 'Planche Hold' },
      { nom: 'Touch FL one leg', critere: '', cible: 15, unite: 's', exercice: 'Touch FL hold one leg' },
    ];
    const imported = read(file);
    expect(imported.updatedObjectives).toEqual([{ ...objective, target: 12 }]);
    expect(imported.newObjectives).toMatchObject([{ name: 'Touch FL one leg', target: 15, unit: 'seconds', exerciseId: flHold.id, order: 1, tests: [] }]);
    expect(imported.program.objectiveIds).toEqual([objective.id, imported.newObjectives[0].id]);
    const existing = new Map([[objective.id, objective]]);
    const changes = objectiveChanges(october.objectiveIds, [...imported.updatedObjectives, ...imported.newObjectives], existing, names.exercises);
    expect(changes).toEqual([
      { name: 'Planche hold', status: 'changed', changes: ['cible 10 s → 12 s'] },
      { name: 'Touch FL one leg', status: 'new', changes: ['cible 15 s'] },
    ]);
    expect(objectiveChanges(october.objectiveIds, [], existing, names.exercises)).toEqual([{ name: 'Planche hold', status: 'dropped', changes: [] }]);
  });

  it('remplace un programme qui commence la même semaine : mêmes identifiants, modèles absents archivés s’ils ont servi', () => {
    const november: Program = program({ id: 'nov', name: 'Novembre 2026', startWeek: 5, createdAt: 50 });
    const copy = { ...maxTpl, id: 'nov-max', programId: 'nov' };
    const unused = { ...morningTpl, id: 'nov-matin', programId: 'nov' };
    const used = template('Technique', 'evening', [], { id: 'nov-tech', programId: 'nov' });
    const ctx = context({ programs: [october, november], templates: [maxTpl, morningTpl, copy, unused, used], usedTemplateIds: new Set(['nov-tech']) });
    const file = novemberFile();
    file.seances = file.seances.filter((s) => s.nom === 'Max J1');
    file.semaineType!.J4.matin = null;
    const imported = read(file, ctx);
    expect(imported.replaces?.id).toBe('nov');
    expect(imported.program).toMatchObject({ id: 'nov', startWeek: 5, createdAt: 50, name: 'Novembre 2026' });
    expect(imported.templates.map((t) => [t.id, t.programId])).toEqual([['nov-max', 'nov']]);
    expect(imported.removedTemplates.map((r) => [r.template.id, r.archive])).toEqual([
      ['nov-matin', false],
      ['nov-tech', true],
    ]);
  });

  it('remplace le programme en cours (retouche), jamais un programme terminé', () => {
    const file = novemberFile();
    file.programme.nom = 'Octobre 2026';
    file.programme.debut = '2026-10-05';
    expect(read(file).replaces?.id).toBe('prog');
    const november = program({ id: 'nov', name: 'Novembre 2026', startWeek: 5 });
    expect(errorsOf(file, context({ programs: [october, november], currentWeek: 6, today: '2026-11-09' }))).toEqual([
      'programme.debut : le programme « Octobre 2026 » commence déjà le lundi 5 octobre et il est terminé',
    ]);
  });

  it('renomme un programme dont le nom est déjà pris par un autre', () => {
    const file = novemberFile();
    file.programme.nom = 'Octobre 2026';
    const imported = read(file);
    expect(imported.program.name).toBe('Octobre 2026 2');
    expect(imported.warnings).toEqual(["Un autre programme s'appelle déjà « Octobre 2026 » : celui-ci s'appellera « Octobre 2026 2 »."]);
  });

  it('passe les contrôles du programme sur le programme importé', () => {
    const file = novemberFile();
    file.seances[0].lignes = file.seances[0].lignes.filter((l) => l.element !== 'Touch FL');
    const imported = read(file);
    const issues = programIssues(
      { weekPlan: imported.program.weekPlan, templates: new Map(imported.templates.map((t) => [t.id, t])), elements, blocks: names.blocks, exercises: names.exercises },
      { ...appSettings(), ...imported.program },
    );
    expect(issues).toContainEqual({ kind: 'evening_missing_skill', templateId: imported.templates[0].id, elementId: fl.id });
  });

  it('garde les demandes à l’appli pour les montrer', () => {
    const file = novemberFile();
    file.demandesAppli = [{ sujet: 'Volume force / endurance', besoin: 'Bornes 8-10 en endurance.', exemple: '' }];
    expect(read(file).requests).toEqual(file.demandesAppli);
  });
});


describe('format version 2', () => {
  /** Programme en séquence qui commence un jeudi, demain : deux fois Max J1, un matin par tranche. */
  function sequenceFile(): ProgramFile {
    const file = novemberFile();
    delete file.semaineType;
    file.programme.debut = '2026-10-29';
    file.programme.cycle = { tranches: 4, trancheAllegee: 4, reductionAllegeePct: 40, masquerMatinsAllegee: true };
    file.programme.matins = { dureeMaxMin: 20, seances: ['Matin A'] };
    file.sequence = ['Max J1', 'Max J1'];
    return file;
  }

  it('lit un programme en séquence : date libre, séances du soir dans l’ordre, matins à part', () => {
    const imported = read(sequenceFile());
    const max = imported.templates.find((t) => t.name === 'Max J1')!;
    const morning = imported.templates.find((t) => t.name === 'Matin A')!;
    expect(imported.program).toMatchObject({ schedule: 'sequence', startDate: '2026-10-29', startWeek: 4, cycleLengthWeeks: 4, deloadWeek: 4, morningMaxMinutes: 20 });
    expect(imported.program.weekPlan[1]).toEqual({ evening: max.id, morning: morning.id });
    expect(imported.program.weekPlan[2]).toEqual({ evening: max.id, morning: null });
    expect(imported.program.weekPlan[3]).toEqual({ evening: null, morning: null });
  });

  it('refuse une séquence mal écrite', () => {
    const today = sequenceFile();
    today.programme.debut = '2026-10-28';
    expect(errorsOf(today)).toEqual(['programme.debut : un nouveau programme commence au plus tôt demain']);
    const both = { ...sequenceFile(), semaineType: novemberFile().semaineType };
    expect(errorsOf(both)).toEqual(['« sequence » et « semaineType » ensemble : un seul des deux']);
    const wrong = sequenceFile();
    wrong.sequence = ['Matin A'];
    wrong.programme.matins.seances = ['Max J1'];
    expect(errorsOf(wrong)).toEqual(['sequence[1] : « Matin A » est une séance du matin', 'programme.matins.seances[1] : « Max J1 » est une séance du soir']);
    const weeks = sequenceFile();
    weeks.programme.cycle = { semaines: 4, semaineAllegee: 4, reductionAllegeePct: 40, masquerMatinsAllegee: true };
    expect(errorsOf(weeks)).toEqual([
      'programme.cycle : clé inconnue « semaines »',
      'programme.cycle : clé inconnue « semaineAllegee »',
      'programme.cycle : clé « tranches » absente',
      'programme.cycle : clé « trancheAllegee » absente',
    ]);
  });

  it('remplace le programme qui commence le même jour, refuse un autre programme la même semaine', () => {
    const november = program({ id: 'nov', name: 'Novembre 2026', startWeek: 4, schedule: 'sequence', startDate: '2026-10-29' });
    const ctx = context({ programs: [october, november] });
    expect(read(sequenceFile(), ctx).replaces?.id).toBe('nov');
    const friday = sequenceFile();
    friday.programme.debut = '2026-10-30';
    expect(errorsOf(friday, ctx)).toEqual([
      'programme.debut : le programme « Novembre 2026 » commence la même semaine (le jeudi 29 octobre) : un seul programme par semaine',
    ]);
    // Un programme en semaine type qui commence ce jour-là (J1 = jeudi) est remplacé aussi : conversion en séquence.
    const weekly = program({ id: 'nov', name: 'Novembre 2026', startWeek: 5 });
    expect(read(sequenceFile(), context({ app: appSettings({ cycleStartDate: '2026-10-01' }), programs: [october, weekly] })).replaces?.id).toBe('nov');
  });

  it('lit les volumes par type de travail, refusés pour un élément qui n’est pas une composante', () => {
    const file = sequenceFile();
    file.programme.volumes = [{ element: 'Grand dentelé', travail: 'endurance', min: 8, max: 10 }];
    expect(read(file).program.componentVolumes).toEqual([{ elementId: dentele.id, work: 'endurance', min: 8, max: 10 }]);
    file.programme.volumes.push({ element: 'Planche', travail: 'force', min: 4, max: 6 });
    expect(errorsOf(file)).toEqual(['programme.volumes[2].element : « Planche » n\'est pas une composante (seules les composantes ont un volume)']);
  });

  it('lit les séries sans minimum, les repères par tranche et les progressions inférieures', () => {
    const file = sequenceFile();
    const line = file.seances[0].lignes[0];
    line.series = { min: 0, max: 8 };
    line.parTranche = { '2': { cible: '3 s' }, '4': { series: { min: 3, max: 3 }, cible: '4 s', intensite: 'RPE 7' } };
    line.progressionsInferieures = ['Touch FL one leg'];
    const item = read(file).templates.find((t) => t.name === 'Max J1')!.items.find((i) => i.blockTypeId === skill.id)!;
    expect(item).toMatchObject({ setsMin: 0, setsMax: 8, lowerProgressionIds: [flHold.id] });
    expect(item.byTranche).toEqual({
      2: { targetText: '3 s', targets: [{ unit: 'seconds', min: 3, max: 3 }] },
      4: { setsMin: 3, setsMax: 3, targetText: '4 s', targets: [{ unit: 'seconds', min: 4, max: 4 }], intensityText: 'RPE 7', intensity: { kind: 'rpe', min: 7, max: 7 } },
    });
    line.parTranche = { '5': { cible: '3 s' } };
    expect(errorsOf(file)).toEqual(['séance « Max J1 », ligne 1 › parTranche : « 5 » : un numéro de tranche de 1 à 4 est attendu']);
    const v1 = { ...novemberFile(), version: 1 };
    v1.seances[0].lignes[0].series = { min: 0, max: 8 };
    // La version 1 ne connaît ni le minimum à 0, ni les clés de la version 2.
    expect(errorsOf(v1)).toContain('séance « Max J1 », ligne 1 › series.min : au moins 1');
    expect(errorsOf(v1)).toContain('programme : clé inconnue « volumes »');
  });

  it('exporte un programme en séquence et le relit à l’identique', () => {
    const imported = read(sequenceFile());
    const exported = programToFile(imported.program, imported.templates, { ...catalog }, appSettings());
    expect(exported.version).toBe(2);
    expect(exported.semaineType).toBeUndefined();
    expect(exported.sequence).toEqual(['Max J1', 'Max J1']);
    expect(exported.programme.matins).toEqual({ dureeMaxMin: 20, seances: ['Matin A'] });
    expect(exported.programme.cycle).toEqual({ tranches: 4, trancheAllegee: 4, reductionAllegeePct: 40, masquerMatinsAllegee: true });
    delete exported.catalogue;
    const again = read(exported, context({ programs: [october, imported.program], templates: [maxTpl, morningTpl, ...imported.templates] }));
    expect(again.replaces?.id).toBe(imported.program.id);
    expect(again.program.weekPlan).toEqual(imported.program.weekPlan);
    expect(diffPrograms({ program: imported.program, templates: imported.templates }, { program: again.program, templates: again.templates }, names)).toMatchObject({
      settings: [],
      weekPlan: [],
      changed: [],
    });
  });
});
