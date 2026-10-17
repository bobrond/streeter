import { VOLUME_STATUS_LABEL, formatDuration } from '../../domain/labels';
import type { Element, ID, SessionTemplate } from '../../domain/types';
import type { ProgramIssue } from '../../domain/volume';

/** Message d'un contrôle du programme. */
export function issueText(
  issue: ProgramIssue,
  names: { elements: ReadonlyMap<ID, Element>; templates: ReadonlyMap<ID, SessionTemplate> },
  morningMaxMinutes: number,
): string {
  switch (issue.kind) {
    case 'component_volume':
      return `${names.elements.get(issue.elementId)?.name ?? '?'} : ${VOLUME_STATUS_LABEL[issue.status]}`;
    case 'evening_missing_skill':
      return `${names.templates.get(issue.templateId)?.name ?? '?'} : pas de ${names.elements.get(issue.elementId)?.name ?? '?'} (planche et FL à chaque soir)`;
    case 'morning_too_long':
      return `${names.templates.get(issue.templateId)?.name ?? '?'} : jusqu’à ${formatDuration(issue.maxSec)} (max ${morningMaxMinutes} min)`;
  }
}
