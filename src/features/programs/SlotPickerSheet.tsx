import { db } from '../../db/db';
import type { Lookups } from '../../db/lookups';
import { setWeekSlot } from '../../db/programStore';
import { MOMENT_LABEL, seqDayLabel } from '../../domain/labels';
import type { ID, Moment, SeqDay } from '../../domain/types';
import { Badge } from '../../ui/Badge';
import { CheckIcon } from '../../ui/icons';
import { Sheet } from '../../ui/Sheet';
import type { ProgramContext } from './programContext';

export interface Slot {
  day: SeqDay;
  moment: Moment;
}

/**
 * Séance d'un créneau de la semaine type d'un programme : un de ses modèles du même moment (hors archivés), Repos ou
 * pas de séance.
 */
export function SlotPickerSheet({ slot, onClose, context, lookups }: { slot: Slot | null; onClose: () => void; context: ProgramContext; lookups: Lookups }) {
  const choices = slot ? context.templates.filter((t) => t.moment === slot.moment && !t.archived).sort((a, b) => a.name.localeCompare(b.name)) : [];
  const current = slot ? context.program.weekPlan[slot.day][slot.moment] : null;
  const choose = (templateId: ID | null) => {
    if (slot) void setWeekSlot(db, context.program.id, slot.day, slot.moment, templateId);
    onClose();
  };
  const options = [
    { id: null as ID | null, name: slot?.moment === 'evening' ? 'Repos' : 'Pas de séance', color: undefined as string | undefined, optional: false },
    ...choices.map((t) => ({ id: t.id as ID | null, name: t.name, color: lookups.sessionTypes.get(t.sessionTypeId)?.color, optional: t.optional })),
  ];
  return (
    <Sheet open={slot !== null} onClose={onClose} title={slot ? `${seqDayLabel(slot.day)} · ${MOMENT_LABEL[slot.moment].toLowerCase()}` : ''}>
      <ul className="flex flex-col gap-1">
        {options.map((choice) => (
          <li key={choice.id ?? 'none'}>
            <button
              type="button"
              onClick={() => choose(choice.id)}
              className={`flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 text-left active:bg-card-2 ${choice.id === current ? 'bg-card-2' : ''}`}
            >
              <span className="size-3.5 shrink-0 rounded-full" style={{ backgroundColor: choice.color ?? 'transparent' }} aria-hidden />
              <span className={`flex-1 text-lg ${choice.id ? 'font-semibold' : 'text-ink-2'}`}>{choice.name}</span>
              {choice.optional && <Badge>optionnel</Badge>}
              {choice.id === current && <CheckIcon className="size-6 text-accent" />}
            </button>
          </li>
        ))}
      </ul>
      {choices.length === 0 && <p className="mt-3 text-ink-2">Aucun modèle de séance du {slot?.moment === 'morning' ? 'matin' : 'soir'}.</p>}
    </Sheet>
  );
}
