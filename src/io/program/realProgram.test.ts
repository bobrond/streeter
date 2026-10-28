// Aller-retour sur le vrai tableur (docs/, exclu du dépôt) : le programme importé, exporté au format programme puis
// relu, ne change pas. Sauté quand le fichier est absent (CI).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { programFromLegacySettings } from '../../domain/programs';
import { diffPrograms, isEmptyDiff } from '../../domain/programDiff';
import type { Program, SessionTemplate } from '../../domain/types';
import { buildImport, emptyExisting, type ImportResult } from '../xlsx/importWorkbook';
import { readWorkbook } from '../xlsx/readWorkbook';
import { programToFile, readProgramFile, serializeProgramFile } from './programFile';

const FILE = fileURLToPath(new URL('../../../docs/programme_planche_touch_fl_1.xlsx', import.meta.url));

describe.skipIf(!existsSync(FILE))('fichier programme du vrai tableur', () => {
  let result: ImportResult;
  let program: Program;
  let templates: SessionTemplate[];

  beforeAll(() => {
    let n = 0;
    const newId = () => `id-${++n}`;
    result = buildImport(readWorkbook(XLSX, readFileSync(FILE)), emptyExisting(), { newId, today: '2026-10-07' });
    program = programFromLegacySettings(result.settings as unknown as Record<string, unknown>, { id: 'prog', objectiveIds: result.importedObjectiveIds, now: 0 }).program;
    templates = result.templates.map((t) => ({ ...t, programId: 'prog' }));
  });

  it('se relit sans erreur ni remarque, et sans aucun changement', () => {
    const file = programToFile(program, templates, result, result.settings);
    const text = serializeProgramFile(file);
    if (process.env.STREETER_DUMP) writeFileSync(join(tmpdir(), 'streeter-programme-octobre.json'), text);
    let n = 0;
    const read = readProgramFile(text, {
      app: { id: 'settings', cycleStartDate: result.settings.cycleStartDate, avgWorkSecPerSet: 30, freeRestSec: 30, lastBackupAt: null },
      programs: [program],
      templates,
      elements: result.elements,
      blockTypes: result.blockTypes,
      sessionTypes: result.sessionTypes,
      exercises: result.exercises,
      objectives: result.objectives,
      usedTemplateIds: new Set(),
      currentWeek: 1,
      newId: () => `new-${++n}`,
      now: 0,
    });
    if (!read.ok) throw new Error(read.errors.join('\n'));
    expect(read.value.warnings).toEqual([]);
    expect(read.value.replaces?.id).toBe('prog');
    expect(file.seances).toHaveLength(7);
    const names = {
      elements: new Map(result.elements.map((e) => [e.id, e])),
      blocks: new Map(result.blockTypes.map((b) => [b.id, b])),
      exercises: new Map(result.exercises.map((e) => [e.id, e])),
      sessionTypes: new Map(result.sessionTypes.map((t) => [t.id, t])),
    };
    const diff = diffPrograms({ program, templates }, { program: read.value.program, templates: read.value.templates }, names);
    expect(diff, JSON.stringify(diff.changed, null, 1)).toSatisfy(isEmptyDiff);
    // Mêmes lignes, valeurs lues comprises ; le texte d'origine des candidats (« Au choix (skill FL) ») devient leur liste.
    const strip = (list: readonly SessionTemplate[]) => list.map((t) => ({ ...t, id: '', items: t.items.map((i) => ({ ...i, id: '', candidatesText: '' })) }));
    const byName = (a: SessionTemplate, b: SessionTemplate) => a.name.localeCompare(b.name);
    expect(strip([...read.value.templates].sort(byName))).toEqual(strip([...templates].sort(byName)));
  });
});
