// Programme de novembre de l'agent (docs/, exclu du dépôt), sur une base issue du vrai tableur : sauté sans les fichiers.
// Import de la version 1 (J1 = jeudi), puis de sa conversion en version 2 (séquence) après deux séances faites.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { sequenceDayInfo } from '../../domain/sequence';
import type { Program, SessionTemplate } from '../../domain/types';
import { plannedComponentVolume, programIssues } from '../../domain/volume';
import { appSettings, program, sessionLog } from '../../test/builders';
import { buildImport, emptyExisting } from '../xlsx/importWorkbook';
import { readWorkbook } from '../xlsx/readWorkbook';
import { readProgramFile, type ProgramImport, type ProgramImportContext } from './programFile';

const doc = (name: string) => fileURLToPath(new URL(`../../../docs/${name}`, import.meta.url));
const XLSX_FILE = doc('programme_planche_touch_fl_1.xlsx');
const V1 = doc('programme_2026-11_v1.json');
const V2 = doc('programme_2026-11_v2.json');

describe.skipIf(![XLSX_FILE, V1, V2].every((f) => existsSync(f)))('programme de novembre', () => {
  // J1 = jeudi : la semaine 1 commence le jeudi 1er octobre, la semaine 5 le jeudi 29.
  const app = appSettings({ cycleStartDate: '2026-10-01' });
  let n = 0;
  const newId = () => `id-${++n}`;

  function setup() {
    const base = buildImport(readWorkbook(XLSX, readFileSync(XLSX_FILE)), emptyExisting(), { newId, today: '2026-10-07' });
    const october = program({ id: 'oct', weekPlan: base.settings.weekPlan, objectiveIds: base.importedObjectiveIds });
    const ctx: ProgramImportContext = {
      app,
      programs: [october],
      templates: base.templates.map((t) => ({ ...t, programId: 'oct' })),
      elements: base.elements,
      blockTypes: base.blockTypes,
      sessionTypes: base.sessionTypes,
      exercises: base.exercises,
      objectives: base.objectives,
      usedTemplateIds: new Set(),
      today: '2026-10-28',
      currentWeek: 4,
      newId,
      now: 1,
    };
    return ctx;
  }

  function read(file: string, ctx: ProgramImportContext): ProgramImport {
    const result = readProgramFile(readFileSync(file, 'utf8'), ctx);
    if (!result.ok) throw new Error(result.errors.join('\n'));
    return result.value;
  }

  /** Base après l'import : nouveautés au catalogue, programme et modèles écrits. */
  function applied(ctx: ProgramImportContext, imported: ProgramImport): ProgramImportContext {
    const others = ctx.templates.filter((t) => t.programId !== imported.program.id);
    return {
      ...ctx,
      programs: [...ctx.programs.filter((p) => p.id !== imported.program.id), imported.program],
      templates: [...others, ...imported.templates],
      elements: [...ctx.elements, ...imported.newElements],
      blockTypes: imported.blockTypes,
      sessionTypes: [...ctx.sessionTypes, ...imported.newSessionTypes],
      exercises: [...ctx.exercises, ...imported.newExercises],
      objectives: [...ctx.objectives.map((o) => imported.updatedObjectives.find((u) => u.id === o.id) ?? o), ...imported.newObjectives],
    };
  }

  function issues(ctx: ProgramImportContext, p: Program, templates: SessionTemplate[]) {
    const plan = {
      weekPlan: p.weekPlan,
      templates: new Map(templates.map((t) => [t.id, t])),
      elements: ctx.elements,
      blocks: new Map(ctx.blockTypes.map((b) => [b.id, b])),
      exercises: new Map(ctx.exercises.map((e) => [e.id, e])),
    };
    const settings = { ...app, ...p };
    const name = (id: string) => ctx.elements.find((e) => e.id === id)?.name;
    return {
      issues: programIssues(plan, settings).map((i) => ('elementId' in i ? `${i.kind} ${name(i.elementId)} ${'status' in i ? i.status : ''}`.trim() : i.kind)),
      volume: Object.fromEntries(plannedComponentVolume(plan, settings).map((r) => [name(r.elementId), [r.eveningGuaranteed, r.totalMax]])),
    };
  }

  it('importe la version 1 sans refus, avec J1 = jeudi ; seuls avertissements : grand dentelé et rhomboïde à 14', () => {
    const ctx = setup();
    const v1 = read(V1, ctx);
    expect(v1.program).toMatchObject({ startWeek: 5, schedule: 'week', volumeMin: 4, volumeMax: 10, morningMaxMinutes: 20 });
    expect(v1.warnings).toEqual([]);
    expect([v1.newExercises.length, v1.newBlocks.length, v1.newSessionTypes.length]).toEqual([10, 5, 3]);
    expect(v1.blockTypes.map((b) => b.name).slice(0, 6)).toEqual(['Échauffement', 'Travail prioritaire', 'Travail principal', 'Assisté / progression', 'Renfo skill', 'Renfo composante']);
    const after = applied(ctx, v1);
    expect(issues(after, v1.program, v1.templates)).toEqual({
      issues: ['component_volume Grand dentelé over_max', 'component_volume Rhomboïde over_max'],
      volume: { Rhomboïde: [10, 14], 'Extension thoracique': [4, 6], 'Grand dentelé': [10, 14], 'Deltoïde ant': [4, 6] },
    });
    const items = v1.templates.flatMap((t) => t.items);
    expect(items.find((i) => i.targetText === '8-10 reps lentes')?.targets).toEqual([{ unit: 'reps', min: 8, max: 10 }]);
    expect(items.find((i) => i.targetText === 'Au choix')?.targets).toEqual([]);
    expect(items.find((i) => i.restText === '2-3 min')).toMatchObject({ restMinSec: 120, restMaxSec: 180 });
    expect(items.find((i) => i.intensityText === '—')?.intensity).toBeNull();
  });

  it('refuse la version 1 tant que J1 = lundi, en disant pourquoi', () => {
    const result = readProgramFile(readFileSync(V1, 'utf8'), { ...setup(), app: appSettings({ cycleStartDate: '2026-10-05' }) });
    expect(result.ok ? [] : result.errors).toEqual(['programme.debut : le jeudi 29 octobre est un J4 ; un programme commence un J1 (le lundi 26 octobre ou le lundi 2 novembre)']);
  });

  it('importe la version 2 le jour même ou en retard, sur le programme d’octobre, que J1 soit un lundi ou un jeudi', () => {
    const today = readFileSync(V2, 'utf8').replace('"debut": "2026-10-29"', '"debut": "2026-10-31"');
    for (const cycleStartDate of ['2026-10-05', '2026-10-01']) {
      const result = readProgramFile(today, { ...setup(), app: appSettings({ cycleStartDate }), today: '2026-10-31', currentWeek: 4 });
      expect(result.ok ? [] : result.errors).toEqual([]);
      if (result.ok) expect(result.value).toMatchObject({ replaces: null, program: { schedule: 'sequence', startDate: '2026-10-31' } });
    }
    // Le fichier d'origine (29/10) importé le 31/10 : le programme commence aujourd'hui.
    const late = read(V2, { ...setup(), today: '2026-10-31', currentWeek: 5 });
    expect(late.program).toMatchObject({ startDate: '2026-10-31', startWeek: 5 });
    expect(late.warnings).toEqual(["Le jeudi 29 octobre est passé : le programme commence aujourd'hui, le samedi 31 octobre."]);
  });

  it('la version 2 remplace la version 1 ; les séances déjà faites restent comptées dans la séquence', () => {
    const ctx = setup();
    const v1 = read(V1, ctx);
    const afterV1 = applied(ctx, v1);
    const byName = (name: string) => v1.templates.find((t) => t.name === name)!;
    const sessions = [
      sessionLog('2026-10-29', { moment: 'evening', templateId: byName('Séance type').id, startedAt: 1 }),
      sessionLog('2026-10-30', { moment: 'evening', templateId: byName('Combo libre').id, startedAt: 2 }),
      sessionLog('2026-10-31', { moment: 'morning', templateId: byName('Matin').id, startedAt: 3 }),
    ];
    const v2 = read(V2, { ...afterV1, today: '2026-10-31', currentWeek: 5, usedTemplateIds: new Set(sessions.map((s) => s.templateId!)) });
    expect(v2.replaces?.id).toBe(v1.program.id);
    expect(v2.program).toMatchObject({ id: v1.program.id, schedule: 'sequence', startDate: '2026-10-29', cycleLengthWeeks: 4, deloadWeek: 4 });
    expect(v2.templates.map((t) => t.id).sort()).toEqual(v1.templates.map((t) => t.id).sort());
    expect(v2.removedTemplates).toEqual([]);
    expect(v2.requests).toEqual([]);

    const afterV2 = applied(afterV1, v2);
    expect(issues(afterV2, v2.program, v2.templates).issues).toEqual(['component_volume Grand dentelé over_max', 'component_volume Rhomboïde over_max']);

    const info = sequenceDayInfo('2026-10-31', { ...app, ...v2.program, startDate: '2026-10-29' }, sessions);
    expect(info).toMatchObject({ seqDay: 3, cycleWeek: 1, isDeload: false });
    expect(info.sequence).toMatchObject({ index: 2, done: 2, length: 5, slot: { evening: byName('Séance type').id, morning: byName('Matin').id } });

    const st = v2.templates.find((t) => t.name === 'Séance type')!;
    const leanUp = st.items.find((i) => i.candidateExerciseIds.length === 1 && afterV2.exercises.find((e) => e.id === i.candidateExerciseIds[0])?.name === 'Planche lean-up')!;
    expect(leanUp).toMatchObject({ setsMin: 5, targetText: '2 s' });
    expect(leanUp.byTranche?.[4]).toMatchObject({ setsMin: 3, setsMax: 3, targetText: '4 s' });
    const combo = v2.templates.find((t) => t.name === 'Combo libre')!;
    expect(combo.items.filter((i) => i.setsMin === 0).map((i) => i.setsMax)).toEqual([8, 8]);
    expect(st.items.filter((i) => (i.lowerProgressionIds ?? []).length > 0)).toHaveLength(2);
  });
});
