// Retouche de novembre (v3, 02/11/2026) importée sur la vraie sauvegarde de l'utilisateur du 02/11 (docs/, exclues du
// dépôt) : sauté sans les fichiers. Avec STREETER_DUMP, écrit l'export du programme importé (catalogue compris) dans
// docs/, pour l'agent de programmation.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { slotComponentLines } from '../../domain/components';
import { weekOfDate } from '../../domain/programs';
import { sequenceDayInfo, sequenceIds } from '../../domain/sequence';
import type { AppSettings, Band, BlockType, Element, Exercise, Objective, Program, SessionLog, SessionTemplate, SessionType } from '../../domain/types';
import { plannedComponentVolume, programIssues } from '../../domain/volume';
import { parseBackup } from '../json/backup';
import { programToFile, readProgramFile, serializeProgramFile, type ProgramImport, type ProgramImportContext } from './programFile';

const doc = (name: string) => fileURLToPath(new URL(`../../../docs/${name}`, import.meta.url));
const BACKUP = doc('streeter_2026-11-02_sauvegarde.txt');
const V3 = doc('programme_2026-11_v3.json');
const TODAY = '2026-11-02';

describe.skipIf(![BACKUP, V3].every((f) => existsSync(f)))('retouche de novembre (v3) sur la sauvegarde du 02/11', () => {
  let n = 0;
  const newId = () => `id-${++n}`;
  const tables = existsSync(BACKUP) ? parseBackup(readFileSync(BACKUP, 'utf8'), 99, newId).tables : null;
  const app = tables?.settings[0] as AppSettings;
  const sessions = (tables?.sessions ?? []) as SessionLog[];
  const ctx = {
    app,
    programs: tables?.programs as Program[],
    templates: tables?.templates as SessionTemplate[],
    elements: tables?.elements as Element[],
    blockTypes: tables?.blockTypes as BlockType[],
    sessionTypes: tables?.sessionTypes as SessionType[],
    exercises: tables?.exercises as Exercise[],
    objectives: tables?.objectives as Objective[],
    usedTemplateIds: new Set(sessions.flatMap((s) => (s.templateId ? [s.templateId] : []))),
    today: TODAY,
    currentWeek: tables ? weekOfDate(app, TODAY) : 0,
    newId,
    now: 1,
  } satisfies ProgramImportContext;

  function read(): ProgramImport {
    const result = readProgramFile(readFileSync(V3, 'utf8'), ctx);
    if (!result.ok) throw new Error(result.errors.join('\n'));
    return result.value;
  }

  it('remplace novembre sans toucher à sa date ni aux séances faites : la prochaine séance est la 3 (Séance type)', () => {
    const v3 = read();
    const november = ctx.programs.find((p) => p.name === 'Novembre 2026')!;
    expect(v3.replaces?.id).toBe(november.id);
    expect(v3.program).toMatchObject({ id: november.id, startDate: '2026-10-31', startWeek: november.startWeek, schedule: 'sequence' });
    expect(v3.warnings).toEqual(["Les composantes sont écrites dans les séances du fichier : elles remplacent la répartition par l'appli, qui est retirée de ce programme."]);
    expect(v3.removedTemplates).toEqual([]);
    expect(v3.newExercises.map((e) => [e.name, e.equipment])).toEqual([
      ['FL PU adv tuck extrême', ['bar']],
      ['PU to touch adv tuck extrême', ['bar']],
    ]);
    expect(v3.newObjectives.map((o) => o.name)).toEqual(['Touch front lever hold adv tuck extrême', 'Adv tuck planche hold sol']);
    expect(v3.program.objectiveIds).not.toContain(ctx.objectives.find((o) => o.name === 'Touch front lever hold full')!.id);

    const all = new Map([...ctx.templates.filter((t) => t.programId !== november.id), ...v3.templates].map((t) => [t.id, t]));
    const name = (id: string) => all.get(id)?.name;
    expect(sequenceIds(v3.program.weekPlan, 'evening').map(name)).toEqual(['Séance type', 'Combo libre', 'Séance type', 'Combo libre', 'Séance type 5 (renfo en bonus)']);
    // Les séances faites gardent leur modèle (même identifiant, même nom).
    for (const s of sessions.filter((s) => s.date >= '2026-10-31')) expect(name(s.templateId!)).toBe(s.templateSnapshot!.name);
    // Séances de la période du programme, comme dans l'appli.
    const info = sequenceDayInfo('2026-11-03', { ...app, ...v3.program, startDate: '2026-10-31' }, sessions.filter((s) => s.date >= '2026-10-31'));
    expect(info.sequence).toMatchObject({ index: 2, done: 2, tranche: 0 });
    expect(name(info.sequence!.slot.evening!)).toBe('Séance type');
  });

  it('chaque séance garde ses composantes ; seuls avertissements : grand dentelé, rhomboïde et rota ext à 8', () => {
    const v3 = read();
    const elementName = (id: string) => ctx.elements.find((e) => e.id === id)?.name;
    const componentIds = new Set(ctx.elements.filter((e) => e.kind === 'component').map((e) => e.id));
    const components = (t: SessionTemplate) => t.items.filter((i) => componentIds.has(i.elementId)).map((i) => `${elementName(i.elementId)}${i.optional ? ' (option)' : ''}`);
    expect(Object.fromEntries(v3.templates.map((t) => [t.name, components(t)]))).toEqual({
      'Séance type': ['Deltoïde ant', 'Extension thoracique'],
      'Combo libre': ['Grand dentelé', 'Rhomboïde', 'Rota ext (composante)'],
      'Séance type 5 (renfo en bonus)': ['Deltoïde ant (option)', 'Extension thoracique (option)'],
      Matin: ['Grand dentelé (option)', 'Rhomboïde (option)', 'Rota ext (composante) (option)'],
    });
    // Plus de répartition par l'appli : aucune ligne ajoutée aux séances.
    const templates = new Map(v3.templates.map((t) => [t.id, t]));
    expect([1, 2, 3, 4, 5].flatMap((d) => slotComponentLines(v3.program, templates, d as 1, 'evening'))).toEqual([]);

    const plan = {
      weekPlan: v3.program.weekPlan,
      templates,
      elements: ctx.elements,
      blocks: new Map(v3.blockTypes.map((b) => [b.id, b])),
      exercises: new Map([...ctx.exercises, ...v3.newExercises].map((e) => [e.id, e])),
      sequence: true,
      componentPlan: v3.program,
    };
    const settings = { ...app, ...v3.program };
    expect(Object.fromEntries(plannedComponentVolume(plan, settings).map((r) => [elementName(r.elementId), [r.eveningGuaranteed, r.totalMax]]))).toEqual({
      'Grand dentelé': [4, 8],
      Rhomboïde: [4, 8],
      'Deltoïde ant': [4, 6],
      'Extension thoracique': [4, 6],
      'Rota ext (composante)': [4, 8],
    });
    expect(programIssues(plan, settings).map((i) => ('elementId' in i ? `${elementName(i.elementId)} ${'status' in i ? i.status : ''}` : i.kind))).toEqual([
      'Grand dentelé over_max',
      'Rhomboïde over_max',
      'Rota ext (composante) over_max',
    ]);
  });

  it('export du programme importé, catalogue compris : relu sans changement', () => {
    const v3 = read();
    const objectives = [...ctx.objectives.map((o) => v3.updatedObjectives.find((u) => u.id === o.id) ?? o), ...v3.newObjectives];
    const catalog = {
      elements: [...ctx.elements, ...v3.newElements],
      blockTypes: v3.blockTypes,
      sessionTypes: [...ctx.sessionTypes, ...v3.newSessionTypes],
      exercises: [...ctx.exercises, ...v3.newExercises],
      bands: (tables?.bands ?? []) as Band[],
      objectives,
    };
    const templates = [...ctx.templates.filter((t) => t.programId !== v3.program.id), ...v3.templates];
    const file = programToFile(v3.program, templates, catalog, app);
    expect(file.version).toBe(3);
    const text = serializeProgramFile(file);
    if (process.env.STREETER_DUMP) writeFileSync(doc('programme_2026-11_v3_export.json'), text);
    const again = readProgramFile(text, { ...ctx, ...catalog, programs: [...ctx.programs.filter((p) => p.id !== v3.program.id), v3.program], templates, objectives });
    if (!again.ok) throw new Error(again.errors.join('\n'));
    expect(again.value.warnings).toEqual([]);
    expect(again.value.program.weekPlan).toEqual(v3.program.weekPlan);
  });
});
