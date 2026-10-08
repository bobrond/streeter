import type { Lookups } from '../../db/lookups';
import type { Settings } from '../../domain/types';
import { programIssues, type Program } from '../../domain/volume';
import { CheckIcon, WarningIcon } from '../../ui/icons';
import { issueText } from './issueText';

/** Contrôles du programme, recalculés à chaque modification (éventuellement pas encore enregistrée). */
export function ProgramChecks({ program, settings, lookups, compact = false }: { program: Program; settings: Settings; lookups: Lookups; compact?: boolean }) {
  const issues = programIssues(program, settings);
  if (issues.length === 0) {
    return (
      <div className="flex items-start gap-2 rounded-2xl border border-ok/50 bg-ok/10 p-3 text-ok">
        <CheckIcon className="size-6" />
        <span>
          {compact
            ? 'Programme conforme.'
            : `Programme conforme : composantes entre ${settings.volumeMin} et ${settings.volumeMax} séries par semaine, planche et FL à chaque soir, matins sous ${settings.morningMaxMinutes} min.`}
        </span>
      </div>
    );
  }
  const names = { elements: lookups.elements, templates: program.templates };
  return (
    <div className="rounded-2xl border border-warn/60 bg-warn/10 p-3" role="alert">
      <div className="flex items-center gap-2 font-semibold text-warn">
        <WarningIcon className="size-6" />
        {issues.length} contrôle{issues.length > 1 ? 's' : ''} à revoir
      </div>
      <ul className="mt-1 flex flex-col gap-1 pl-8 text-ink">
        {issues.map((issue, i) => (
          <li key={i}>{issueText(issue, names, settings.morningMaxMinutes)}</li>
        ))}
      </ul>
    </div>
  );
}
