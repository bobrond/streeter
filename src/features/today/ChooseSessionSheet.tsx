import type { AppData } from '../../db/hooks';
import type { Lookups } from '../../db/lookups';
import { MOMENT_LABEL } from '../../domain/labels';
import type { SessionTemplate } from '../../domain/types';
import { Badge } from '../../ui/Badge';
import { Sheet } from '../../ui/Sheet';

/** « Choisir une autre séance » : pour aujourd'hui seulement, la séquence ne change pas. */
export function ChooseSessionSheet({
  open,
  onClose,
  data,
  lookups,
  onChoose,
}: {
  open: boolean;
  onClose: () => void;
  data: AppData;
  lookups: Lookups;
  onChoose: (template: SessionTemplate) => void;
}) {
  const templates = data.templates.filter((t) => !t.archived).sort((a, b) => (a.moment === b.moment ? a.name.localeCompare(b.name) : a.moment === 'evening' ? -1 : 1));
  return (
    <Sheet open={open} onClose={onClose} title="Choisir une séance">
      <p className="mb-3 text-ink-2">Pour aujourd’hui seulement : la séquence ne change pas.</p>
      <ul className="flex flex-col gap-1">
        {templates.map((template) => {
          const type = lookups.sessionTypes.get(template.sessionTypeId);
          return (
            <li key={template.id}>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onChoose(template);
                }}
                className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 py-2 text-left active:bg-card-2"
              >
                <span className="size-3.5 shrink-0 rounded-full" style={{ backgroundColor: type?.color }} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{template.name}</span>
                  <span className="block text-ink-2">{MOMENT_LABEL[template.moment]}</span>
                </span>
                {template.optional && <Badge>optionnel</Badge>}
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
