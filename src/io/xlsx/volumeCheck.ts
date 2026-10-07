// Comparaison du volume calculé par l'appli avec les valeurs de l'onglet Volume hebdo du tableur.
import { VOLUME_STATUS_LABEL } from '../../domain/labels';
import { nameKey } from '../../domain/text';
import type { Settings } from '../../domain/types';
import { plannedComponentVolume, skillTotals, type Program, type VolumeSettings } from '../../domain/volume';
import type { VolumeSheet } from './readWorkbook';

export interface VolumeCheckField {
  label: string;
  sheet: string;
  app: string;
  match: boolean;
  /** Écart voulu (règle décidée avec l'utilisateur) : ne compte pas comme une erreur. */
  expectedDifference: boolean;
}

export interface VolumeCheckLine {
  label: string;
  fields: VolumeCheckField[];
}

export interface VolumeCheck {
  /** Toutes les valeurs correspondent, hors écarts voulus. */
  ok: boolean;
  lines: VolumeCheckLine[];
}

function field(label: string, sheet: string | number | null, app: string | number, expectedDifference = false): VolumeCheckField {
  const s = sheet === null ? '—' : String(sheet);
  return { label, sheet: s, app: String(app), match: s === String(app), expectedDifference };
}

export function compareVolume(
  sheet: VolumeSheet,
  program: Program,
  settings: VolumeSettings & Pick<Settings, 'volumeMin' | 'volumeMax' | 'deloadReductionPct'>,
): VolumeCheck {
  const lines: VolumeCheckLine[] = [
    {
      label: 'Paramètres',
      fields: [
        field('Min', sheet.min, settings.volumeMin),
        field('Max', sheet.max, settings.volumeMax),
        field('Réduction %', sheet.deloadPct, settings.deloadReductionPct),
      ],
    },
  ];

  const components = plannedComponentVolume(program, settings);
  for (const row of sheet.components) {
    const app = components.find((c) => nameKey(c.name) === nameKey(row.element));
    lines.push({
      label: row.element,
      fields: app
        ? [
            field('Soir', row.evening, app.eveningMax),
            field('Matin', row.morning, app.morningMax),
            field('Total', row.total, app.totalMax),
            field('Contrôle', row.status, VOLUME_STATUS_LABEL[app.status]),
            field('Allégée', row.deload, app.deloadEvening),
          ]
        : [field('Composante', row.element, 'absente')],
    });
  }

  const skills = skillTotals(program, settings);
  const blockName = (id: string) => program.blocks.get(id)?.name ?? '';
  const elementName = (id: string) => program.elements.find((e) => e.id === id)?.name ?? '';
  for (const row of sheet.skills) {
    const app = skills.find(
      (s) => nameKey(blockName(s.blockTypeId)) === nameKey(row.block) && nameKey(elementName(s.elementId)) === nameKey(row.element),
    );
    lines.push({
      label: `${row.block} · ${row.element}`,
      fields: app
        ? [
            field('Min', row.setsMin, app.setsMin),
            field('Max', row.setsMax, app.setsMax),
            field('Séances', row.sessions, app.sessions),
            // Le tableur arrondit le total hebdo, matins compris ; l'appli somme les séances allégées réelles.
            field('Allégée', row.deloadMax, app.deloadMax, true),
          ]
        : [field('Ligne', row.element, 'absente')],
    });
  }

  const ok = lines.every((line) => line.fields.every((f) => f.match || f.expectedDifference));
  return { ok, lines };
}
