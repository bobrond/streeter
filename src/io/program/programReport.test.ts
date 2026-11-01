import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { convertToComponents } from '../../domain/componentConversion';
import { buildProgramReport } from '../../domain/programReport';
import { sequenceWeekPlan } from '../../domain/sequence';
import {
  appSettings,
  block,
  element,
  exercise,
  item,
  program,
  sessionLog,
  setLog,
  template,
} from '../../test/builders';
import { buildImport, emptyExisting } from '../xlsx/importWorkbook';
import { readWorkbook } from '../xlsx/readWorkbook';
import { readProgramFile } from './programFile';
import { formatProgramReportMarkdown, programReportFileName } from './programReport';

const doc = (name: string) => fileURLToPath(new URL(`../../../docs/${name}`, import.meta.url));
const XLSX_FILE = doc('programme_planche_touch_fl_1.xlsx');
const V2 = doc('programme_2026-11_v2.json');

describe('programReportFileName', () => {
  it('produit un nom de fichier propre en .md ou .txt', () => {
    expect(programReportFileName('Novembre 2026')).toBe('streeter-bilan-novembre-2026.md');
    expect(programReportFileName('Décembre — Cycle 3 !', 'txt')).toBe('streeter-bilan-decembre-cycle-3.txt');
    expect(programReportFileName('   ')).toBe('streeter-bilan-programme.md');
  });
});

describe('formatProgramReportMarkdown', () => {
  const planche = element('Planche', 'skill', 0);
  const dentele = element('Grand dentelé', 'component', 1);
  const main = block('Travail principal', 0, { alternateSkills: true });
  const comp = block('Renfo composante', 1);
  const exHold = exercise('Planche Hold', planche.id, { measure: 'seconds' });
  const exScap = exercise('Pompes scapulaires', dentele.id, { measure: 'reps' });
  const holdLine = item({ blockTypeId: main.id, elementId: planche.id, candidateExerciseIds: [exHold.id], setsMin: 3, setsMax: 4 });
  const scapLine = item({ blockTypeId: comp.id, elementId: dentele.id, candidateExerciseIds: [exScap.id], setsMin: 2, setsMax: 2 });
  const soir = template('Séance type', 'evening', [holdLine, scapLine], { id: 't1', programId: 'p1' });

  const prog = program({
    id: 'p1',
    name: 'Novembre 2026',
    schedule: 'sequence',
    startDate: '2026-11-01',
    startWeek: 4,
    cycleLengthWeeks: 4,
    deloadWeek: 4,
    componentVolumes: [{ elementId: dentele.id, work: 'endurance', min: 4, max: 6 }],
    weekPlan: sequenceWeekPlan([soir.id, soir.id], []),
  });

  it('génère toutes les sections du bilan en Markdown lisible', () => {
    const s1 = sessionLog('2026-11-01', { id: 's1', templateId: soir.id, templateSnapshot: soir, note: 'RAS' });
    const s2 = sessionLog('2026-11-06', { id: 's2', templateId: soir.id, templateSnapshot: soir });
    const sets = [
      setLog({ sessionId: s1.id, itemId: holdLine.id, blockTypeId: main.id, elementId: planche.id, exerciseId: exHold.id, value: 6.5, quality: 'clean' }),
      setLog({ sessionId: s2.id, itemId: holdLine.id, blockTypeId: main.id, elementId: planche.id, exerciseId: exHold.id, value: 8, quality: 'clean', note: 'Très propre' }),
      setLog({ sessionId: s2.id, itemId: scapLine.id, blockTypeId: comp.id, elementId: dentele.id, exerciseId: exScap.id, value: 15 }),
    ];

    const report = buildProgramReport({
      program: prog,
      app: appSettings({ cycleStartDate: '2026-10-05' }),
      programs: [prog],
      templates: [soir],
      elements: [planche, dentele],
      blockTypes: [main, comp],
      sessionTypes: [],
      exercises: [exHold, exScap],
      bands: [],
      objectives: [],
      sessions: [s1, s2],
      sets,
      today: '2026-11-06',
    });

    const md = formatProgramReportMarkdown(report);
    expect(md).toContain('# Bilan — Novembre 2026');
    expect(md).toContain('## Volume réalisé vs prévu (par tranche)');
    expect(md).toContain('| Grand dentelé | Endurance | 1 / 4-6 (1s+0m) |');
    expect(md).toContain('| Planche · Travail principal | 2 / 6-8 |');
    expect(md).toContain('## Tests des objectifs');
    expect(md).toContain('## Records battus (all-time)');
    // Virgule française sur les décimales (6,5 s → 8 s, +1,5 s).
    expect(md).toContain('**Planche Hold** (sans élastique) : **8 s** le 06/11/2026 (+1,5 s, 1re séance : 6,5 s le 01/11/2026)');
    expect(md).toContain('Pause de 4 jours sans séance');
    expect(md).toContain('## Notes');
    expect(md).toContain('Très propre');
  });

  it.skipIf(![XLSX_FILE, V2].every((f) => existsSync(f)))('produit un bilan cohérent sur le vrai programme de novembre converti en composantes réparties (H2)', () => {
    let n = 0;
    const newId = () => `id-${++n}`;
    const app = appSettings({ cycleStartDate: '2026-10-01' });
    const wb = buildImport(readWorkbook(XLSX, readFileSync(XLSX_FILE)), emptyExisting(), { newId, today: '2026-10-07' });
    const oct = program({ id: 'oct', weekPlan: wb.settings.weekPlan, objectiveIds: wb.importedObjectiveIds });
    const parsed = readProgramFile(readFileSync(V2, 'utf8'), {
      app,
      programs: [oct],
      templates: wb.templates.map((t) => ({ ...t, programId: 'oct' })),
      elements: wb.elements,
      blockTypes: wb.blockTypes,
      sessionTypes: wb.sessionTypes,
      exercises: wb.exercises,
      objectives: wb.objectives,
      usedTemplateIds: new Set(),
      today: '2026-10-28',
      currentWeek: 4,
      newId,
      now: 1,
    });
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    const imp = parsed.value;
    const elements = [...wb.elements, ...imp.newElements];
    const exercises = [...wb.exercises, ...imp.newExercises];
    const conv = convertToComponents(imp.program, imp.templates, elements, { newId, usedTemplateIds: new Set() });
    expect(conv).not.toBeNull();

    const report = buildProgramReport({
      program: conv!.program,
      app,
      programs: [oct, conv!.program],
      templates: conv!.templates,
      elements,
      blockTypes: imp.blockTypes,
      sessionTypes: [...wb.sessionTypes, ...imp.newSessionTypes],
      exercises,
      bands: wb.bands,
      objectives: [...wb.objectives.map((o) => imp.updatedObjectives.find((u) => u.id === o.id) ?? o), ...imp.newObjectives],
      sessions: wb.sessions,
      sets: wb.sets,
      today: '2026-11-02',
    });

    const md = formatProgramReportMarkdown(report);
    expect(md).toContain('# Bilan —');
    expect(md).toContain('Grand dentelé | Endurance | 0 / 8-10');
    expect(md).toContain('Deltoïde ant | Force | 0 / 4-6');
  });
});
