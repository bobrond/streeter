import { useState } from 'react';
import type { Lookups } from '../../db/lookups';
import type { SessionTemplate, Settings } from '../../domain/types';
import { editorIssues, programIssues, type Program } from '../../domain/volume';
import { CheckIcon, ChevronDownIcon, WarningIcon } from '../../ui/icons';
import { issueText } from './issueText';

/**
 * Contrôles du programme, recalculés à chaque modification (éventuellement pas encore enregistrée).
 * `template` : modèle en cours d'édition, contrôlé même hors de la semaine type. `sticky` : bandeau compact qui reste
 * en haut de l'écran pendant le défilement, détail au toucher.
 */
export function ProgramChecks({
  program,
  settings,
  lookups,
  template,
  compact = false,
  sticky = false,
}: {
  program: Program;
  settings: Settings;
  lookups: Lookups;
  template?: SessionTemplate;
  compact?: boolean;
  sticky?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const issues = template ? editorIssues(program, settings, template) : programIssues(program, settings);
  const names = { elements: lookups.elements, templates: template ? new Map(program.templates).set(template.id, template) : program.templates };
  const texts = issues.map((issue) => issueText(issue, names, settings.morningMaxMinutes));
  const wrapper = sticky ? 'sticky top-[env(safe-area-inset-top)] z-10 -mx-4 bg-page/95 px-4 py-2 backdrop-blur' : '';

  if (issues.length === 0) {
    return (
      <div className={wrapper}>
        <div className="flex items-start gap-2 rounded-2xl border border-ok/50 bg-ok/10 p-3 text-ok" role="status">
          <CheckIcon className="size-6 shrink-0" />
          <span>
            {compact || sticky
              ? 'Programme conforme.'
              : `Programme conforme : composantes entre ${settings.volumeMin} et ${settings.volumeMax} séries par semaine, planche et FL à chaque soir, matins sous ${settings.morningMaxMinutes} min.`}
          </span>
        </div>
      </div>
    );
  }
  const title = `${issues.length} contrôle${issues.length > 1 ? 's' : ''} à revoir`;
  if (sticky) {
    return (
      <div className={wrapper}>
        <div className="rounded-2xl border border-warn/60 bg-warn/10" role="alert">
          <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex min-h-12 w-full items-center gap-2 px-3 text-left">
            <WarningIcon className="size-6 shrink-0 text-warn" />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-warn">{title}</span>
              {!open && <span className="block truncate text-sm text-ink">{texts[0]}</span>}
            </span>
            <ChevronDownIcon className={`size-5 shrink-0 text-ink-2 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
          {open && (
            <ul className="flex flex-col gap-1 px-3 pb-3 pl-11 text-ink">
              {texts.map((text, i) => (
                <li key={i}>{text}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-warn/60 bg-warn/10 p-3" role="alert">
      <div className="flex items-center gap-2 font-semibold text-warn">
        <WarningIcon className="size-6" />
        {title}
      </div>
      <ul className="mt-1 flex flex-col gap-1 pl-8 text-ink">
        {texts.map((text, i) => (
          <li key={i}>{text}</li>
        ))}
      </ul>
    </div>
  );
}
