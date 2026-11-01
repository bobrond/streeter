// Programme de novembre de l'agent (docs/, exclu du dépôt), sur une base issue du vrai tableur : sauté sans les fichiers.
// Import de la version 1 (J1 = jeudi), puis de sa conversion en version 2 (séquence) après deux séances faites.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { convertToComponents } from '../../domain/componentConversion';
import { distributeComponents, slotKey } from '../../domain/components';
import { practicedTemplate } from '../../domain/deload';
import { ensureFloorVictorianExercises } from '../../domain/equipment';
import { buildExpress } from '../../domain/express';
import { sequenceDayInfo, sequenceIds } from '../../domain/sequence';
import { defaultExerciseId } from '../../domain/session';
import type { Program, SessionTemplate } from '../../domain/types';
import { plannedComponentVolume, programIssues } from '../../domain/volume';
import { appSettings, program, sessionLog, setLog } from '../../test/builders';
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

  it('version 2 : les blocs recopiés d’une séance à l’autre deviennent communs', () => {
    const v2 = read(V2, { ...setup(), today: '2026-10-31', currentWeek: 5 });
    const blockName = (id: string) => v2.blockTypes.find((b) => b.id === id)?.name ?? '?';
    // Pour chaque séance, ses blocs communs et les séances qui les partagent.
    const sharing = Object.fromEntries(
      v2.templates.map((t) => [
        t.name,
        Object.fromEntries(Object.entries(t.sharedBlocks).map(([blockTypeId, link]) => [blockName(blockTypeId), v2.templates.filter((o) => o.sharedBlocks[blockTypeId] === link).length])),
      ]),
    );
    const evening = { Échauffement: 3, 'Travail prioritaire': 3, 'Renfo skill': 3 };
    expect(sharing).toEqual({
      'Séance type': { ...evening, 'Travail principal': 2, 'Assisté / progression': 2 },
      'Séance type 5 (force en bonus)': { ...evening, 'Travail principal': 2, 'Assisté / progression': 2 },
      'Combo libre': evening,
      Matin: {},
    });
    // Un bloc commun a les mêmes lignes, identifiants compris, dans chaque séance.
    const st = v2.templates.find((t) => t.name === 'Séance type')!;
    const combo = v2.templates.find((t) => t.name === 'Combo libre')!;
    const warmup = (t: SessionTemplate) => t.items.filter((i) => blockName(i.blockTypeId) === 'Échauffement');
    expect(warmup(combo)).toEqual(warmup(st));
    expect(warmup(st)).toHaveLength(4);
  });

  it('H2 : novembre converti en composantes réparties, avec la répartition décidée avec l’utilisateur', () => {
    const ctx = setup();
    const v2 = read(V2, { ...ctx, today: '2026-10-31', currentWeek: 5 });
    const after = applied(ctx, v2);
    const byName = (name: string) => v2.templates.find((t) => t.name === name)!;
    const st5 = byName('Séance type 5 (force en bonus)');
    const conversion = convertToComponents(v2.program, v2.templates, after.elements, { newId, usedTemplateIds: new Set([st5.id]) })!;
    const elementName = (id: string) => after.elements.find((e) => e.id === id)?.name;
    const p = conversion.program;
    expect(p.components.map((c) => [elementName(c.elementId), c.setsPerSession, c.restText])).toEqual([
      ['Grand dentelé', 2, '60 s'],
      ['Rhomboïde', 2, '60 s'],
      ['Deltoïde ant', 2, '2-3 min'],
      ['Extension thoracique', 2, '2-3 min'],
    ]);
    expect(after.blockTypes.find((b) => b.id === p.componentBlockTypeId)?.name).toBe('Renfo composante');
    const typeName = (id: string) => after.sessionTypes.find((t) => t.id === id)?.name;
    expect(Object.fromEntries(Object.entries(p.componentAcceptance).map(([id, a]) => [typeName(id), a]))).toEqual({ 'Séance type': 'all', 'Combo libre': 'endurance', Matin: 'endurance' });
    // « Séance type 5 » disparaît : elle a servi, elle est archivée.
    expect(conversion.merged.map((m) => [m.template.name, m.into.name, m.archive])).toEqual([['Séance type 5 (force en bonus)', 'Séance type', true]]);
    const templates = new Map([...v2.templates.filter((t) => t.id !== st5.id), ...conversion.templates].map((t) => [t.id, t]));
    expect(templates.get(st5.id)).toMatchObject({ archived: true, sharedBlocks: {} });
    const templateName = (id: string) => templates.get(id)?.name;
    expect(sequenceIds(p.weekPlan, 'evening').map(templateName)).toEqual(['Séance type', 'Combo libre', 'Séance type', 'Combo libre', 'Séance type']);
    expect(sequenceIds(p.weekPlan, 'morning').map(templateName)).toEqual(['Matin', 'Matin']);
    expect(conversion.removedLines).toBe(12);
    const components = new Set(p.components.map((c) => c.elementId));
    expect([...templates.values()].filter((t) => !t.archived).some((t) => t.items.some((i) => components.has(i.elementId)))).toBe(false);

    const d = distributeComponents({ ...app, ...p }, templates);
    const at = (day: 1 | 2 | 3 | 4 | 5, moment: 'evening' | 'morning' = 'evening') => (d.bySlot.get(slotKey(day, moment)) ?? []).map((c) => elementName(c.elementId));
    expect([at(1), at(2), at(3), at(4), at(5), at(1, 'morning'), at(2, 'morning')]).toEqual([
      ['Grand dentelé', 'Deltoïde ant', 'Extension thoracique'],
      ['Grand dentelé', 'Rhomboïde'],
      ['Rhomboïde', 'Deltoïde ant', 'Extension thoracique'],
      ['Grand dentelé', 'Rhomboïde'],
      ['Grand dentelé', 'Rhomboïde'],
      ['Grand dentelé'],
      ['Rhomboïde'],
    ]);
    // Volume prévu : 10, 10, 4, 4 ; plus aucun contrôle de volume (14 au lieu de 10 avant).
    const plan = {
      weekPlan: p.weekPlan,
      templates,
      elements: after.elements,
      blocks: new Map(after.blockTypes.map((b) => [b.id, b])),
      exercises: new Map(after.exercises.map((e) => [e.id, e])),
      sequence: true,
      componentPlan: p,
    };
    const settings = { ...app, ...p };
    expect(Object.fromEntries(plannedComponentVolume(plan, settings).map((r) => [elementName(r.elementId), [r.eveningGuaranteed, r.totalMax]]))).toEqual({
      'Grand dentelé': [8, 10],
      Rhomboïde: [8, 10],
      'Deltoïde ant': [4, 4],
      'Extension thoracique': [4, 4],
    });
    expect(programIssues(plan, settings).filter((i) => i.kind === 'component_volume')).toEqual([]);
    // Tranche allégée : 1 série par séance au lieu de 2.
    const st = templates.get(p.weekPlan[1].evening!)!;
    const lines = d.bySlot.get(slotKey(1, 'evening'))!.map((c) => c.id);
    const practiced = practicedTemplate({ ...st, items: [...st.items, ...lines.map((id) => ({ ...st.items[0], id, blockTypeId: p.componentBlockTypeId!, setsMin: 2, setsMax: 2 }))] }, { cycleWeek: 4, isDeload: true }, plan.blocks, settings);
    expect(practiced.items.filter((i) => lines.includes(i.id)).map((i) => i.setsMin)).toEqual([1, 1, 1]);
  });

  it('séance express sur le programme de novembre (Séance type et Combo libre) : remplace le Travail principal Planche par Straddle et Adv tuck au sol, jamais par planche surélevée', () => {
    const ctx = setup();
    const v2 = read(V2, { ...ctx, today: '2026-10-31', currentWeek: 5 });
    const after = applied(ctx, v2);
    const exercises = ensureFloorVictorianExercises(after.exercises, after.elements, newId);
    const exById = new Map(exercises.map((e) => [e.id, e]));
    const blockById = new Map(after.blockTypes.map((b) => [b.id, b]));
    const plan = {
      weekPlan: v2.program.weekPlan,
      templates: new Map(v2.templates.map((t) => [t.id, t])),
      elements: after.elements,
      blocks: blockById,
      exercises: exById,
      sequence: true,
    };
    const surEx = exercises.find((e) => e.name === 'Planche lean surélevé hold to press')!;
    const advEx = exercises.find((e) => e.name === 'Adv tuck planche hold sol')!;
    const renfoBlock = after.blockTypes.find((b) => b.name === 'Renfo skill')!;
    // Même si Planche lean surélevé a été faite plus récemment dans l'historique, elle ne doit jamais apparaître en Travail principal.
    const history = [
      setLog({ sessionId: 's-old', itemId: 'it-adv', blockTypeId: renfoBlock.id, elementId: advEx.elementId, exerciseId: advEx.id, value: 10 }),
      setLog({ sessionId: 's-recent', itemId: 'it-sur', blockTypeId: renfoBlock.id, elementId: surEx.elementId, exerciseId: surEx.id, value: 6 }),
    ];

    for (const templateName of ['Séance type', 'Combo libre']) {
      const replaced = v2.templates.find((t) => t.name === templateName)!;
      const express = buildExpress({
        minutes: 30,
        replaced,
        name: `Express 30 min · ${templateName}`,
        isDeload: false,
        cycleWeek: 1,
        program: plan,
        settings: { ...app, ...v2.program },
        needs: [],
        equipment: new Set(['floor', 'band', 'dumbbell']),
        newId,
      });
      const blockNames = express.template.items.map((i) => blockById.get(i.blockTypeId)?.name);
      expect(blockNames, templateName).not.toContain('Travail prioritaire');
      const mainItems = express.template.items.filter((i) => blockById.get(i.blockTypeId)?.name === 'Travail principal');
      expect(mainItems, templateName).toHaveLength(2);
      const flLine = mainItems.find((i) => after.elements.find((e) => e.id === i.elementId)?.name === 'Touch FL')!;
      expect(flLine.candidateExerciseIds.map((id) => exById.get(id)?.name), templateName).toEqual([
        'Victorienne au sol hold',
        'Victorienne au sol PU',
      ]);
      expect(flLine.targetText, templateName).toBe('8-15 s ou 8-10 reps');

      const plLine = mainItems.find((i) => after.elements.find((e) => e.id === i.elementId)?.name === 'Planche')!;
      const plNames = plLine.candidateExerciseIds.map((id) => exById.get(id)?.name);
      expect(plNames, templateName).toEqual(['Straddle planche hold', 'Adv tuck planche hold sol']);
      expect(plLine.targetText, templateName).toBe('3-6 s');
      const shownId = defaultExerciseId(plLine, plLine.candidateExerciseIds, [], history);
      expect(exById.get(shownId!)?.name, templateName).toBe('Adv tuck planche hold sol');
    }
  });
});
