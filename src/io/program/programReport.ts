// Sérialisation Markdown et nom de fichier du bilan d'un programme (phase G3), destiné à la fois à l'utilisateur
// (second cerveau / Obsidian) et à son agent de programmation.
import {
  MOMENT_LABEL,
  OBJECTIVE_STATUS_LABEL,
  formatDateShort,
  formatDayMonth,
  formatDuration,
  formatSetValue,
  formatSets,
  formatValue,
  formatValueList,
  seqDayLabel,
  workLabel,
} from '../../domain/labels';
import type {
  MarkedLineRow,
  ObjectiveReportRow,
  ProgramReport,
  ReportPeriod,
} from '../../domain/programReport';
import { fold } from '../../domain/text';
import type { TargetUnit } from '../../domain/types';

/** « streeter-bilan-novembre-2026.md » (`.txt` pour le menu de partage Android). */
export function programReportFileName(name: string, extension: 'md' | 'txt' = 'md'): string {
  const slug = fold(name)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `streeter-bilan-${slug || 'programme'}.${extension}`;
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function formatSignedDelta(delta: number, unit: TargetUnit): string {
  if (delta === 0) return '= précédent';
  const sign = delta > 0 ? '+' : '−';
  return `${sign}${formatValue(Math.abs(delta), unit)}`;
}

function periodHeader(p: ReportPeriod): string {
  const tags: string[] = [];
  if (p.isDeload) tags.push('allégée');
  if (p.partial) tags.push(`${p.eveningDone}/${p.eveningPlanned}`);
  return tags.length > 0 ? `${p.label} (${tags.join(', ')})` : p.label;
}

function formatMarkedLine(line: MarkedLineRow): string {
  const count = line.markedSets.length;
  const details = line.markedSets
    .map((s) => {
      const parts = [`#${s.label} : ${formatSetValue(s.value, line.measure)}`];
      if (s.bandName) parts.push(`élastique ${s.bandName}`);
      if (s.rpe !== null) parts.push(`RPE ${String(s.rpe).replace('.', ',')}`);
      if (s.note) parts.push(`« ${s.note} »`);
      return parts.join(', ');
    })
    .join(' ; ');
  const blockPart = line.blockName ? ` (${line.blockName})` : '';
  const where = line.periodLabel ? `${formatDateShort(line.date)} · ${line.periodLabel}` : formatDateShort(line.date);
  return `- **${where} — ${line.sessionName}** · ${line.exerciseName}${blockPart} : ${count}/${line.workSetCount} série${count > 1 ? 's' : ''} (${details})`;
}

function formatObjective(row: ObjectiveReportRow): string[] {
  const lines: string[] = [];
  const exPart = row.exerciseName ? ` · exercice : ${row.exerciseName}` : '';
  lines.push(
    `- **${row.name}** — cible : **${formatValue(row.target, row.unit)}** · statut : **${OBJECTIVE_STATUS_LABEL[row.status]}**${exPart}`,
  );
  if (row.criterion) lines.push(`  - Critère : ${row.criterion}`);
  lines.push(
    `  - Avant le programme : ${row.bestBefore ? `${formatValue(row.bestBefore.value, row.unit)} (${formatDateShort(row.bestBefore.date)})` : 'aucun test'}`,
  );
  if (row.tests.length === 0) {
    lines.push('  - Tests sur la période : aucun');
  } else {
    for (const test of row.tests) {
      const delta = test.deltaFromBefore !== null ? ` (${formatSignedDelta(test.deltaFromBefore, row.unit)})` : '';
      const note = test.note ? ` — _${test.note}_` : '';
      lines.push(`  - Test du ${formatDateShort(test.date)} : **${formatValue(test.value, row.unit)}**${delta}${note}`);
    }
  }
  if (row.bestSessionInPeriod) {
    lines.push(
      `  - Meilleure série propre sans élastique sur la période : ${formatValue(row.bestSessionInPeriod.value, row.unit)} (${formatDateShort(row.bestSessionInPeriod.date)})`,
    );
  }
  return lines;
}

export function formatProgramReportMarkdown(report: ProgramReport): string {
  const out: string[] = [];
  const perWord = report.schedule === 'sequence' ? 'tranche' : 'semaine';
  const perPlural = report.schedule === 'sequence' ? 'tranches' : 'semaines';

  // 1. En-tête & synthèse
  out.push(`# Bilan — ${report.programName}`);
  out.push('');
  if (report.phase === 'upcoming') {
    out.push(`- **Statut** : à venir (commence le ${formatDateShort(report.startDate)})`);
    out.push('');
    out.push('Aucune séance : le programme n’a pas encore commencé.');
    return out.join('\n') + '\n';
  }

  const statusText =
    report.phase === 'past'
      ? `terminé (du ${formatDateShort(report.startDate)} au ${formatDateShort(report.endDate)})`
      : `en cours (du ${formatDateShort(report.startDate)} au ${formatDateShort(report.endDate)})`;
  out.push(`- **Statut** : ${statusText}`);

  const deloadInfo =
    report.deloadWeek > 0
      ? `, ${perWord} ${report.deloadWeek} allégée (−${report.deloadReductionPct} %)`
      : ', sans allègement';
  const scheduleText =
    report.schedule === 'sequence'
      ? `séquence de ${report.sequenceLength} séance${report.sequenceLength > 1 ? 's' : ''} du soir par tranche${report.morningPlannedCount > 0 ? ` (+ jusqu’à ${report.morningPlannedCount} matin${report.morningPlannedCount > 1 ? 's' : ''})` : ''} · cycle de ${report.cycleLength} ${perPlural}${deloadInfo}`
      : `semaine type J1-J7 (${report.sequenceLength} soir${report.sequenceLength > 1 ? 's' : ''}${report.morningPlannedCount > 0 ? `, ${report.morningPlannedCount} matin${report.morningPlannedCount > 1 ? 's' : ''}` : ''}) · cycle de ${report.cycleLength} ${perPlural}${deloadInfo}`;
  out.push(`- **Déroulé** : ${scheduleText}`);

  const totalDone = report.counts.eveningDone + report.counts.morningDone;
  const sessionParts = [
    `${report.counts.eveningDone} soir${report.counts.eveningDone > 1 ? 's' : ''}`,
    `${report.counts.morningDone} matin${report.counts.morningDone > 1 ? 's' : ''}`,
  ];
  if (report.counts.expressDone > 0) {
    sessionParts.push(`dont ${report.counts.expressDone} express`);
  }
  const abandonedPart =
    report.counts.abandoned > 0
      ? ` · ${report.counts.abandoned} abandonnée${report.counts.abandoned > 1 ? 's' : ''}`
      : '';
  out.push(`- **Séances validées** : ${totalDone} (${sessionParts.join(', ')})${abandonedPart}`);
  if (report.counts.inProgress > 0) {
    out.push('- _Note : une séance en cours n’est pas comptée dans ce bilan._');
  }
  if (report.notes) {
    out.push(`- **Notes du programme** : ${report.notes.replace(/\r?\n/g, ' ')}`);
  }

  // 2. Volume réalisé vs prévu
  out.push('');
  out.push(`## Volume réalisé vs prévu (par ${perWord})`);
  out.push('');
  out.push('_Séries hors échauffement (`réalisé / prévu`). Pour les composantes : `s` = soir, `m` = matin._');

  if (report.periods.length > 0 && report.componentVolume.length > 0) {
    out.push('');
    out.push('### Composantes');
    out.push('');
    const headers = ['Composante', 'Travail', ...report.periods.map(periodHeader)];
    out.push(`| ${headers.map(escapeCell).join(' | ')} |`);
    out.push(`| ${headers.map(() => '---').join(' | ')} |`);
    for (const row of report.componentVolume) {
      const cells = row.periods.map((cell) => {
        const planned = formatSets(cell.plannedMin, cell.plannedMax);
        const split = cell.total > 0 ? ` (${cell.evening}s+${cell.morning}m)` : '';
        return `${cell.total} / ${planned}${split}`;
      });
      out.push(`| ${[escapeCell(row.name), escapeCell(workLabel(row.work)), ...cells].join(' | ')} |`);
    }
  }

  if (report.periods.length > 0 && report.skillVolume.length > 0) {
    out.push('');
    out.push('### Skills par bloc');
    out.push('');
    const headers = ['Skill · Bloc', ...report.periods.map(periodHeader)];
    out.push(`| ${headers.map(escapeCell).join(' | ')} |`);
    out.push(`| ${headers.map(() => '---').join(' | ')} |`);
    for (const row of report.skillVolume) {
      const cells = row.periods.map((cell) => {
        const planned = cell.plannedMax > 0 ? formatSets(cell.plannedMin, cell.plannedMax) : '0';
        return `${cell.done} / ${planned}`;
      });
      out.push(`| ${[escapeCell(`${row.skillName} · ${row.blockName}`), ...cells].join(' | ')} |`);
    }
  }

  // 3. Tests des objectifs
  out.push('');
  out.push('## Tests des objectifs');
  out.push('');
  if (report.objectives.length === 0) {
    out.push('Aucun objectif suivi sur ce programme.');
  } else {
    for (const obj of report.objectives) {
      out.push(...formatObjective(obj));
    }
  }
  if (report.formerObjectivesTested.length > 0) {
    out.push('');
    out.push('### Anciens objectifs testés sur la période');
    out.push('');
    for (const obj of report.formerObjectivesTested) {
      out.push(...formatObjective(obj));
    }
  }

  // 4. Records all-time battus & progressions inférieures
  out.push('');
  out.push('## Records battus (all-time)');
  out.push('');
  if (report.beatenRecords.length === 0) {
    out.push('Aucun record all-time battu sur la période.');
  } else {
    for (const rec of report.beatenRecords) {
      const bandText = rec.bandName ? `élastique ${rec.bandName}` : 'sans élastique';
      const delta = formatSignedDelta(rec.value - rec.previousValue, rec.measure);
      const originLabel = rec.previousOrigin === 'before_program' ? 'précédent' : '1re séance';
      out.push(
        `- **${rec.exerciseName}** (${bandText}) : **${formatValue(rec.value, rec.measure)}** le ${formatDateShort(rec.date)} (${delta}, ${originLabel} : ${formatValue(rec.previousValue, rec.measure)} le ${formatDateShort(rec.previousDate)})`,
      );
    }
  }

  out.push('');
  out.push('### Séries en progression inférieure');
  out.push('');
  if (report.lowerProgressions.length === 0) {
    out.push('Aucune série faite en progression inférieure.');
  } else {
    for (const lp of report.lowerProgressions) {
      const bestText =
        lp.bestCleanValue !== null && lp.measure !== 'none'
          ? `, meilleure série propre : ${formatValue(lp.bestCleanValue, lp.measure)}`
          : '';
      const bySession = lp.sessions
        .map((s) => `${formatDayMonth(s.date)} (${formatValueList(s.values, lp.measure)})`)
        .join(', ');
      out.push(
        `- **${lp.exerciseName}** (à la place de _${lp.replacedLabel}_) : ${lp.totalSets} série${lp.totalSets > 1 ? 's' : ''}${bestText} — ${bySession}`,
      );
    }
  }

  // 5. Écarts / séances sautées, abandonnées, express, séries dégradées
  out.push('');
  out.push(
    report.schedule === 'sequence'
      ? '## Écarts de rythme, séances abandonnées, express et séries dégradées'
      : '## Séances sautées, abandonnées, express et séries dégradées',
  );

  out.push('');
  if (report.schedule === 'sequence') {
    out.push('### Rythme et écarts');
    out.push('');
    for (const tr of report.trancheRhythms) {
      const tag = tr.isDeload ? ' (allégée)' : '';
      if (tr.fromDate && tr.toDate && tr.spanDays !== null) {
        const range = tr.fromDate === tr.toDate ? `le ${formatDateShort(tr.fromDate)}` : `du ${formatDateShort(tr.fromDate)} au ${formatDateShort(tr.toDate)}, ${tr.spanDays} j`;
        const morningPart = tr.morningDone > 0 ? `, +${tr.morningDone} matin${tr.morningDone > 1 ? 's' : ''}` : '';
        out.push(
          `- **${tr.label}${tag}** : ${tr.eveningDone}/${tr.eveningPlanned} soir${tr.eveningPlanned > 1 ? 's' : ''}${morningPart} (${range}${tr.partial ? ', en cours' : ''})`,
        );
      } else {
        out.push(`- **${tr.label}${tag}** : aucune séance enregistrée`);
      }
    }
    if (report.trainingGaps.length === 0) {
      out.push('- **Pauses > 2 jours sans séance** : aucune.');
    } else {
      for (const gap of report.trainingGaps) {
        out.push(
          `- **Pause de ${gap.daysWithoutSession} jours sans séance** : du ${formatDateShort(gap.fromDate)} au ${formatDateShort(gap.toDate)}`,
        );
      }
    }
  } else {
    out.push('### Séances sautées');
    out.push('');
    const mandatoryMissed = report.missedSlots.filter((m) => !m.optional);
    const optionalSkipped = report.missedSlots.filter((m) => m.optional);
    if (mandatoryMissed.length === 0 && optionalSkipped.length === 0) {
      out.push('Aucune séance prévue non faite.');
    } else {
      if (mandatoryMissed.length === 0) {
        out.push('- **Séances obligatoires manquées** : aucune.');
      } else {
        for (const m of mandatoryMissed) {
          out.push(
            `- **Manquée** · ${formatDateShort(m.date)} (${m.periodLabel} · ${seqDayLabel(m.seqDay)} ${MOMENT_LABEL[m.moment].toLowerCase()}) : ${m.templateName}`,
          );
        }
      }
      if (optionalSkipped.length > 0) {
        const list = optionalSkipped
          .map((m) => `${formatDayMonth(m.date)} ${seqDayLabel(m.seqDay)} (${m.templateName})`)
          .join(', ');
        out.push(`- **Séances optionnelles non faites (${optionalSkipped.length})** : ${list}`);
      }
    }
  }

  if (report.replacedSlots.length > 0) {
    for (const r of report.replacedSlots) {
      out.push(
        `- **Séance remplacée** · ${formatDateShort(r.date)} (${r.periodLabel} · ${r.slotLabel}) : « ${r.doneName} » faite à la place de « ${r.plannedName} »`,
      );
    }
  }

  out.push('');
  out.push('### Séances abandonnées');
  out.push('');
  if (report.abandonedSessions.length === 0) {
    out.push('Aucune séance abandonnée.');
  } else {
    for (const s of report.abandonedSessions) {
      const dur = s.durationSec !== null ? `, ${formatDuration(s.durationSec)}` : '';
      const note = s.note ? ` — « ${s.note} »` : '';
      out.push(
        `- **${formatDateShort(s.date)}** (${s.periodLabel} · ${MOMENT_LABEL[s.moment].toLowerCase()}) — ${s.name} : ${s.setsDone} série${s.setsDone > 1 ? 's' : ''} validée${s.setsDone > 1 ? 's' : ''} avant arrêt${dur}${note}`,
      );
    }
  }

  out.push('');
  out.push('### Séances express');
  out.push('');
  if (report.expressSessions.length === 0) {
    out.push('Aucune séance express.');
  } else {
    for (const s of report.expressSessions) {
      const repl = s.replacedName ? `, à la place de « ${s.replacedName} »` : '';
      const dur = s.durationSec !== null ? `, durée réelle ${formatDuration(s.durationSec)}` : '';
      const ab = s.abandoned ? ' (abandonnée)' : '';
      out.push(
        `- **${formatDateShort(s.date)}** (${s.periodLabel} · ${MOMENT_LABEL[s.moment].toLowerCase()}) — format **${s.expressMinutes} min**${repl} : ${s.setsDone} série${s.setsDone > 1 ? 's' : ''}${dur}${ab}`,
      );
    }
  }

  out.push('');
  out.push('### Séries dégradées');
  out.push('');
  if (report.degradedLines.length === 0) {
    out.push('Aucune série marquée dégradée.');
  } else {
    for (const line of report.degradedLines) {
      out.push(formatMarkedLine(line));
    }
  }

  if (report.failureLines.length > 0) {
    out.push('');
    out.push('### Séries à l’échec');
    out.push('');
    for (const line of report.failureLines) {
      out.push(formatMarkedLine(line));
    }
  }

  // 6. Notes
  out.push('');
  out.push('## Notes');
  out.push('');
  if (report.sessionNotes.length === 0) {
    out.push('Aucune note enregistrée sur la période.');
  } else {
    for (const n of report.sessionNotes) {
      const where = n.periodLabel ? `${formatDateShort(n.date)} · ${n.periodLabel}` : formatDateShort(n.date);
      if (n.kind === 'session') {
        out.push(`- **${where} — ${n.sessionName}** : ${n.text}`);
      } else {
        const val = n.measure !== null ? formatSetValue(n.value, n.measure) : '';
        const band = n.bandName ? `, élastique ${n.bandName}` : '';
        const setInfo = [n.setLabel ? `#${n.setLabel}` : '', val].filter(Boolean).join(' · ');
        out.push(`- **${where} — ${n.sessionName}** · ${n.exerciseName ?? '?'} (${setInfo}${band}) : ${n.text}`);
      }
    }
  }

  return out.join('\n') + '\n';
}
