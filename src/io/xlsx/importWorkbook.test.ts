// Test d'acceptation sur le vrai tableur (docs/, exclu du dépôt) : sauté quand le fichier est absent (CI).
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { deloadTemplate } from '../../domain/deload';
import { estimateDuration } from '../../domain/duration';
import { VOLUME_STATUS_LABEL } from '../../domain/labels';
import { objectiveState } from '../../domain/objectives';
import type { ID, SeqDay, SessionTemplate, Settings } from '../../domain/types';
import { plannedComponentVolume, programIssues, skillTotals, type Program } from '../../domain/volume';
import { buildImport, emptyExisting, type ImportResult } from './importWorkbook';
import { readWorkbook } from './readWorkbook';

const FILE = fileURLToPath(new URL('../../../docs/programme_planche_touch_fl_1.xlsx', import.meta.url));

function runImport(existing = emptyExisting()): ImportResult {
  let n = 0;
  const data = readWorkbook(XLSX, readFileSync(FILE));
  return buildImport(data, existing, { newId: () => `id-${++n}-${Math.random().toString(36).slice(2, 8)}`, today: '2026-10-07' });
}

// Le corps d'un `describe` sauté est quand même exécuté pour recenser les tests :
// la lecture du fichier se fait donc dans `beforeAll`, qui ne tourne pas quand la suite est sautée.
describe.skipIf(!existsSync(FILE))('import du tableur programme_planche_touch_fl_1.xlsx', () => {
  let result: ImportResult;
  let settings: Settings;
  let byId: Map<ID, SessionTemplate>;
  let exerciseName: Map<ID, string>;
  let elementName: Map<ID, string>;
  let blockName: Map<ID, string>;
  let program: Program;
  const templateAt = (day: SeqDay, moment: 'morning' | 'evening') => byId.get(settings.weekPlan[day][moment] ?? '') ?? null;

  beforeAll(() => {
    result = runImport();
    settings = result.settings;
    byId = new Map(result.templates.map((t) => [t.id, t]));
    exerciseName = new Map(result.exercises.map((e) => [e.id, e.name]));
    elementName = new Map(result.elements.map((e) => [e.id, e.name]));
    blockName = new Map(result.blockTypes.map((b) => [b.id, b.name]));
    program = {
      weekPlan: settings.weekPlan,
      templates: byId,
      elements: result.elements,
      blocks: new Map(result.blockTypes.map((b) => [b.id, b])),
    };
  });

  it('se fait sans erreur', () => {
    expect(result.report.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(result.report.counts).toMatchObject({ exercises: 36, templates: 7, objectives: 4, sessions: 1, sets: 29, skippedSessions: 0 });
  });

  it('reconnaît tous les exercices candidats du Programme', () => {
    expect(result.report.issues.filter((i) => i.message.startsWith('Exercice candidat non reconnu'))).toEqual([]);
    for (const template of result.templates) {
      for (const item of template.items) expect(item.candidateExerciseIds.length, `${template.name} · ${item.candidatesText}`).toBeGreaterThan(0);
    }
  });

  it('redonne la semaine type', () => {
    const names = ([1, 2, 3, 4, 5, 6, 7] as SeqDay[]).map((d) => [templateAt(d, 'morning')?.name ?? null, templateAt(d, 'evening')?.name ?? null]);
    expect(names).toEqual([
      [null, 'Max + rhomboïde + extension thoracique'],
      [null, 'Combo'],
      [null, 'Technique'],
      ['Matin A', null],
      [null, 'Max'],
      ['Matin B', 'Combo'],
      [null, 'Technique léger'],
    ]);
    expect(settings.weekPlan[2].evening).toBe(settings.weekPlan[6].evening);
  });

  it('crée les modèles avec leurs lignes dans l’ordre et leurs options', () => {
    const optional = Object.fromEntries(result.templates.map((t) => [t.name, t.optional]));
    expect(optional).toEqual({
      'Max + rhomboïde + extension thoracique': false,
      Combo: false,
      Technique: false,
      'Matin A': true,
      Max: false,
      'Matin B': true,
      'Technique léger': true,
    });
    const j1 = templateAt(1, 'evening')!;
    expect(j1.items.map((i) => `${blockName.get(i.blockTypeId)} · ${elementName.get(i.elementId)}`)).toEqual([
      'Échauffement · Connexion (pousser)',
      'Échauffement · Connexion (tirer)',
      'Échauffement · Activation élastique',
      'Skill · Planche',
      'Skill · Planche',
      'Skill · Touch FL',
      'Skill · Touch FL',
      'Skill assisté · Planche',
      'Skill assisté · Touch FL',
      'Renfo spé skill · Planche',
      'Renfo spé skill · Touch FL',
      'Renfo composantes · Rhomboïde',
      'Renfo composantes · Extension thoracique',
    ]);
    expect(j1.items[3]).toMatchObject({
      setsMin: 4,
      setsMax: 5,
      targets: [{ unit: 'seconds', min: 3, max: 6 }],
      intensity: { kind: 'rpe', min: 8, max: 9 },
      restMinSec: 90,
      restMaxSec: 120,
      optional: false,
      notes: 'Arrêt dès que la protraction ou le verrouillage du coude lâche',
    });
    expect(j1.items[3].candidateExerciseIds.map((id) => exerciseName.get(id))).toEqual(['Planche Hold']);
    expect(j1.items[0]).toMatchObject({ restMinSec: null, restMaxSec: null, setsMin: 2, setsMax: 2 });

    const matinA = templateAt(4, 'morning')!;
    expect(matinA.items.map((i) => [elementName.get(i.elementId), i.superset, i.optional, i.restMinSec, i.restMaxSec])).toEqual([
      ['Connexion', false, true, null, null],
      ['Planche', false, false, 120, 120],
      ['Touch FL', false, false, 120, 120],
      ['Grand dentelé', true, true, 60, 90],
      ['Deltoïde ant', true, true, 60, 90],
    ]);

    const combo = templateAt(2, 'evening')!;
    const assisted = combo.items.find((i) => blockName.get(i.blockTypeId) === 'Skill assisté' && elementName.get(i.elementId) === 'Touch FL')!;
    expect(assisted.candidateExerciseIds.map((id) => exerciseName.get(id))).toEqual(['PU to touch full', 'PU to touch one leg', 'FL press']);
  });

  it('ordonne les blocs et règle alternance et allégement', () => {
    const blocks = [...result.blockTypes].sort((a, b) => a.order - b.order);
    expect(blocks.map((b) => [b.name, b.alternateSkills, b.reducedInDeload])).toEqual([
      ['Échauffement', false, false],
      ['Skill', true, true],
      ['Skill assisté', true, true],
      ['Renfo spé skill', false, true],
      ['Renfo composantes', false, true],
    ]);
  });

  it('distingue skills et composantes', () => {
    const kinds = Object.fromEntries(result.elements.map((e) => [e.name, e.kind]));
    expect(kinds).toMatchObject({
      Planche: 'skill',
      'Touch FL': 'skill',
      'Grand dentelé': 'component',
      Rhomboïde: 'component',
      'Deltoïde ant': 'component',
      'Extension thoracique': 'component',
      'Connexion (pousser)': 'other',
      'Activation élastique': 'other',
    });
  });

  it('importe le catalogue avec les exercices rapides et les types de mesure', () => {
    const quick = result.exercises.filter((e) => e.quick).map((e) => e.name);
    expect(quick).toContain('Uppercut');
    expect(quick).toContain('Extension thoracique contre banc');
    expect(quick).not.toContain('Lean planche scapula PU to press');
    expect(quick).not.toContain('CARs scapulaire tiré (sous barre)');
    expect(result.exercises.find((e) => e.name === 'PU to touch one leg')).toMatchObject({ measure: 'combos', category: 'Touch FL skill' });
    expect(result.exercises.find((e) => e.name === 'Activation élastique')).toMatchObject({ measure: 'none', order: 35 });
    expect(result.exercises.slice(0, 3).map((e) => [e.name, e.order])).toEqual([
      ['Planche Hold to press', 0],
      ['Planche Hold', 1],
      ['Lean to press', 2],
    ]);
  });

  it('crée les types de séance, Max étant le jour de test', () => {
    expect(result.sessionTypes.map((t) => [t.name, t.moment, t.isTestDay])).toEqual([
      ['Max', 'evening', true],
      ['Combo', 'evening', false],
      ['Technique', 'evening', false],
      ['Matin A', 'morning', false],
      ['Matin B', 'morning', false],
      ['Technique léger', 'evening', false],
    ]);
  });

  it('reprend les paramètres du tableur et la date de début déduite du Journal', () => {
    expect(settings).toMatchObject({ cycleStartDate: '2026-10-05', volumeMin: 4, volumeMax: 6, deloadReductionPct: 40, cycleLengthWeeks: 4, deloadWeek: 4 });
  });

  it('importe les 4 objectifs, reliés à leur exercice, « À tester »', () => {
    expect(result.objectives.map((o) => [o.name, o.target, o.unit, exerciseName.get(o.exerciseId ?? ''), objectiveState(o).status])).toEqual([
      ['Planche hold', 10, 'seconds', 'Planche Hold', 'to_test'],
      ['Planche press to négative (P/N)', 1, 'reps', 'P/N', 'to_test'],
      ['Touch front lever hold one leg', 15, 'seconds', 'Touch FL hold one leg', 'to_test'],
      ['Touch front lever hold full', 5, 'seconds', 'Touch FL hold full', 'to_test'],
    ]);
    expect(result.objectives[0].criterion).toBe('Bonne activation grand dentelé');
  });

  it('importe les élastiques dans l’ordre d’assistance', () => {
    expect([...result.bands].sort((a, b) => a.order - b.order).map((b) => b.name)).toEqual(['orange', 'jaune', 'vert', 'bleue']);
  });

  it('importe la séance du Journal et découpe les séries', () => {
    const [session] = result.sessions;
    expect(session).toMatchObject({ date: '2026-10-07', week: 1, cycleWeek: 1, seqDay: 3, moment: 'evening', sessionTypeName: 'Technique', source: 'xlsx', deload: false });
    expect(session.templateId).toBe(templateAt(3, 'evening')!.id);
    const bandName = new Map(result.bands.map((b) => [b.id, b.name]));
    const rows = new Map<string, string>();
    for (const set of result.sets) {
      const key = `${blockName.get(set.blockTypeId ?? '')} · ${exerciseName.get(set.exerciseId)}`;
      const value = `${set.value ?? '-'}${set.bandId ? ` (${bandName.get(set.bandId)})` : ''}`;
      rows.set(key, rows.has(key) ? `${rows.get(key)} ; ${value}` : value);
    }
    expect(Object.fromEntries(rows)).toEqual({
      'Échauffement · CARs scapulaire 90 élastique': '10 (vert) ; 10 (vert)',
      'Échauffement · CARs scapulaire tiré (sous barre)': '10 (vert) ; 10 (vert)',
      'Échauffement · Activation élastique': '- (vert)',
      'Skill · Lean to press': '3 ; 3 ; 2 ; 2',
      'Skill · Touch FL hold one leg': '7 ; 5 ; 4 ; 4',
      'Skill · Planche Hold': '3 ; 3 ; 3 ; 1',
      'Skill · FL PU one leg': '3 ; 3 ; 2 ; 2',
      'Skill assisté · Planche Hold': '14 (jaune) ; 11 (jaune)',
      'Skill assisté · Touch FL hold one leg': '2 (jaune) ; 4 (jaune)',
      'Renfo composantes · Rétraction élastique': '15 (vert) ; 15 (vert)',
      'Renfo composantes · Extension thoracique contre banc': '13 ; 13',
    });
    const lean = result.sets.filter((s) => exerciseName.get(s.exerciseId) === 'Lean to press');
    expect(lean.map((s) => s.setIndex)).toEqual([1, 2, 3, 4]);
    expect(lean.map((s) => s.rpe)).toEqual([7, 7, 7, 7]);
    expect(lean[3].note).toContain('3 reps c');
    expect(lean[0].note).toBe('');
    const retraction = result.sets.find((s) => exerciseName.get(s.exerciseId) === 'Rétraction élastique')!;
    expect(elementName.get(retraction.elementId ?? '')).toBe('Rhomboïde');
  });

  it('signale les lignes « 3 séries » avec 4 valeurs', () => {
    const inconsistent = result.report.issues.filter((i) => i.message.includes('« Séries faites » = 3 mais 4 valeurs'));
    expect(inconsistent.map((i) => i.lines)).toEqual([[5], [6]]);
  });

  it('redonne exactement les valeurs de l’onglet Volume hebdo', () => {
    const check = result.report.volumeCheck!;
    expect(check.lines.length).toBe(1 + 4 + 6);
    const mismatches = check.lines.flatMap((l) => l.fields.filter((f) => !f.match && !f.expectedDifference).map((f) => `${l.label} ${f.label}: ${f.sheet} ≠ ${f.app}`));
    expect(mismatches).toEqual([]);
    expect(check.ok).toBe(true);
  });

  it('calcule 4 / 2 / 6 « OK » pour chaque composante, et 2 en semaine allégée', () => {
    expect(plannedComponentVolume(program, settings).map((r) => [r.name, r.eveningGuaranteed, r.eveningMax, r.morningMax, r.totalMax, VOLUME_STATUS_LABEL[r.status], r.deloadEvening])).toEqual([
      ['Grand dentelé', 4, 4, 2, 6, 'OK', 2],
      ['Rhomboïde', 4, 4, 2, 6, 'OK', 2],
      ['Deltoïde ant', 4, 4, 2, 6, 'OK', 2],
      ['Extension thoracique', 4, 4, 2, 6, 'OK', 2],
    ]);
    expect([...result.elements].sort((a, b) => a.order - b.order).map((e) => e.name)).toEqual([
      'Planche',
      'Touch FL',
      'Grand dentelé',
      'Rhomboïde',
      'Deltoïde ant',
      'Extension thoracique',
      'Connexion (pousser)',
      'Connexion (tirer)',
      'Activation élastique',
      'Connexion',
    ]);
  });

  it('calcule les totaux par skill (allégée : somme réelle des séances allégées)', () => {
    expect(skillTotals(program, settings).map((t) => [blockName.get(t.blockTypeId), elementName.get(t.elementId), t.setsMin, t.setsMax, t.sessions, t.deloadMax])).toEqual([
      ['Skill', 'Planche', 28, 38, 5, 22],
      ['Skill', 'Touch FL', 28, 34, 5, 20],
      ['Skill assisté', 'Planche', 13, 18, 6, 12],
      ['Skill assisté', 'Touch FL', 13, 18, 6, 12],
      ['Renfo spé skill', 'Planche', 8, 12, 4, 4],
      ['Renfo spé skill', 'Touch FL', 8, 12, 4, 4],
    ]);
  });

  it('passe « Sous le min (soir) » si on retire une série du soir', () => {
    const j1 = templateAt(1, 'evening')!;
    const edited: SessionTemplate = {
      ...j1,
      items: j1.items.map((i) => (elementName.get(i.elementId) === 'Rhomboïde' ? { ...i, setsMin: 1, setsMax: 1 } : i)),
    };
    const rows = plannedComponentVolume({ ...program, templates: new Map(byId).set(j1.id, edited) }, settings);
    expect(rows.find((r) => r.name === 'Rhomboïde')).toMatchObject({ eveningGuaranteed: 3, status: 'under_min' });
    expect(rows.find((r) => r.name === 'Grand dentelé')?.status).toBe('ok');
  });

  it('allège les séances du soir de 40 % sans toucher l’échauffement', () => {
    const j1 = deloadTemplate(templateAt(1, 'evening')!, program.blocks, settings);
    expect(j1.items.map((i) => `${elementName.get(i.elementId)} ${i.setsMin}-${i.setsMax}`)).toEqual([
      'Connexion (pousser) 2-2',
      'Connexion (tirer) 2-2',
      'Activation élastique 1-2',
      'Planche 2-3',
      'Planche 2-3',
      'Touch FL 2-3',
      'Touch FL 2-2',
      'Planche 1-2',
      'Touch FL 1-2',
      'Planche 1-2',
      'Touch FL 1-2',
      'Rhomboïde 1-1',
      'Extension thoracique 1-1',
    ]);
  });

  it('estime les matins entre 17 et 25 min et ne relève aucun problème dans le programme', () => {
    for (const day of [4, 6] as SeqDay[]) {
      expect(estimateDuration(templateAt(day, 'morning')!, settings)).toEqual({ minSec: 17 * 60, maxSec: 25 * 60 });
    }
    expect(programIssues(program, settings)).toEqual([]);
  });

  it('se ré-importe sans doublon en gardant les identifiants', () => {
    const again = runImport({
      elements: result.elements,
      blockTypes: result.blockTypes,
      sessionTypes: result.sessionTypes,
      exercises: result.exercises,
      bands: result.bands,
      templates: result.templates,
      objectives: result.objectives,
      sessions: result.sessions,
      settings: result.settings,
    });
    expect(again.exercises.map((e) => e.id)).toEqual(result.exercises.map((e) => e.id));
    expect(again.templates.map((t) => t.id).sort()).toEqual(result.templates.map((t) => t.id).sort());
    expect(again.settings.weekPlan).toEqual(result.settings.weekPlan);
    expect(again.sessions.map((s) => s.id)).toEqual(result.sessions.map((s) => s.id));
    expect(again.replacedSessionIds).toEqual([result.sessions[0].id]);
    expect(again.report.counts.newExercises).toBe(0);
    expect(again.objectives.map((o) => o.id)).toEqual(result.objectives.map((o) => o.id));
  });

  it('n’écrase pas une séance déjà saisie dans l’appli', () => {
    const again = runImport({ ...emptyExisting(), sessions: [{ ...result.sessions[0], source: 'app' }] });
    expect(again.report.counts).toMatchObject({ sessions: 0, sets: 0, skippedSessions: 1 });
  });
});
