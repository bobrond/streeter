// Onglet Programmes : deux vues, « Programmes » (le programme actif, la semaine type J1-J7 avec la séance du jour mise
// en avant ; les autres modèles et les archivés) et « Exercices » (bibliothèque) ; l'éditeur de modèle, la fiche et
// l'éditeur d'exercice, l'éditeur des créneaux. Un seul programme, pas de rotation (décidé avec l'utilisateur).
import { useState } from 'react';
import { db } from '../../db/db';
import type { AppData } from '../../db/hooks';
import { useLookups, type Lookups } from '../../db/lookups';
import { saveTemplate, swapWeekSlotsOf } from '../../db/programStore';
import { dayInfo, localISODate } from '../../domain/cycle';
import { estimateDuration } from '../../domain/duration';
import { uniqueName } from '../../domain/editing';
import { MOMENT_LABEL, formatDurationRange, seqDayLabel } from '../../domain/labels';
import { MOMENTS, SEQ_DAYS, type SessionTemplate } from '../../domain/types';
import { weekProgress, type DayProgress, type SlotProgress } from '../../domain/week';
import { useNow } from '../../lib/device';
import { newId } from '../../lib/id';
import { navigate, queryParam } from '../../lib/router';
import { Badge } from '../../ui/Badge';
import { containingIndex, measureDropRects, useVerticalDrag, type DragHandleProps } from '../../ui/gestures';
import { ChevronDownIcon, DotsIcon, DragIcon, PlusIcon } from '../../ui/icons';
import { MenuItem, MenuList } from '../../ui/Menu';
import { Screen } from '../../ui/Screen';
import { Sheet } from '../../ui/Sheet';
import { showToast } from '../../ui/toastStore';
import { ExerciseDetail } from '../journal/ExerciseDetail';
import { ExerciseEditor } from './ExerciseEditor';
import { ExerciseLibrary } from './ExerciseLibrary';
import { ProgramChecks } from './ProgramChecks';
import { ProgramsNav, SettingsButton } from './ProgramsNav';
import { SlotPickerSheet, type Slot } from './SlotPickerSheet';
import { TemplateActions, type TemplateTarget } from './TemplateActions';
import { TemplateEditor } from './TemplateEditor';
import { WeekPlanEditor } from './WeekPlanEditor';

const SHORT_WEEKDAY = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' });
const byName = (a: SessionTemplate, b: SessionTemplate) => a.name.localeCompare(b.name);

/** #/programs (?vue=exercices), #/programs/template/:id, #/programs/exercise/:id(/edit), #/programs/exercise/new, #/programs/week. */
export function ProgramsScreen({ data, path }: { data: AppData; path: string }) {
  const parts = path.split('?')[0].split('/').filter(Boolean);
  if (parts[1] === 'template' && parts[2]) return <TemplateEditor key={parts[2]} data={data} templateId={parts[2]} />;
  if (parts[1] === 'exercise' && parts[2] === 'new') return <ExerciseEditor key="new" data={data} exerciseId="new" path={path} />;
  if (parts[1] === 'exercise' && parts[2] && parts[3] === 'edit') return <ExerciseEditor key={parts[2]} data={data} exerciseId={parts[2]} path={path} />;
  if (parts[1] === 'exercise' && parts[2]) return <ExerciseDetail key={parts[2]} data={data} exerciseId={parts[2]} backTo="/programs?vue=exercices" />;
  if (parts[1] === 'week') return <WeekPlanEditor data={data} />;
  if (queryParam(path, 'vue') === 'exercices') return <ExerciseLibrary data={data} path={path} />;
  return <ProgramView data={data} />;
}

async function createTemplate(data: AppData): Promise<void> {
  const type = data.sessionTypes.find((t) => t.moment === 'evening') ?? data.sessionTypes[0];
  const template: SessionTemplate = {
    id: newId(),
    name: uniqueName('Nouveau modèle', data.templates),
    sessionTypeId: type?.id ?? '',
    moment: 'evening',
    optional: false,
    notes: '',
    items: [],
    archived: false,
  };
  await saveTemplate(db, template);
  navigate(`/programs/template/${template.id}`);
}

/** « Soir · 9 lignes · 46 min à 1 h 06 ». */
function templateMeta(template: SessionTemplate, data: AppData, lookups: Lookups): string {
  const { minSec, maxSec } = estimateDuration(template, data.settings, lookups);
  const lines = template.items.length;
  return `${MOMENT_LABEL[template.moment]} · ${lines} ligne${lines > 1 ? 's' : ''} · ${formatDurationRange(minSec, maxSec)}`;
}

const SLOT_STATUS: Partial<Record<SlotProgress['status'], { label: string; className: string }>> = {
  done: { label: '✓ faite', className: 'text-ok' },
  in_progress: { label: 'en cours', className: 'text-accent' },
  hidden: { label: 'masquée (semaine allégée)', className: 'text-ink-3' },
};

function SlotRow({
  day,
  slot,
  data,
  lookups,
  dragging,
  dy,
  handleProps,
  onMenu,
  onPick,
}: {
  day: DayProgress;
  slot: SlotProgress;
  data: AppData;
  lookups: Lookups;
  dragging: boolean;
  dy: number;
  handleProps: DragHandleProps;
  onMenu: () => void;
  onPick: () => void;
}) {
  const template = slot.planned;
  if (!template) {
    return (
      <button type="button" onClick={onPick} className="flex min-h-12 w-full items-center rounded-xl pl-9 text-left text-ink-3 active:bg-card-2">
        {MOMENT_LABEL[slot.moment]} · {slot.moment === 'evening' ? 'Repos' : 'pas de séance'}
      </button>
    );
  }
  const type = lookups.sessionTypes.get(template.sessionTypeId);
  const status = SLOT_STATUS[slot.status];
  return (
    <div
      style={dragging ? { transform: `translateY(${dy}px)` } : undefined}
      className={`relative flex items-center rounded-xl ${dragging ? 'z-20 bg-card-2 shadow-2xl shadow-black ring-2 ring-accent' : ''}`}
    >
      <button
        type="button"
        aria-label={`Déplacer ${template.name} (glisser sur un autre jour)`}
        {...handleProps}
        className="flex h-14 w-9 shrink-0 cursor-grab items-center justify-center text-ink-3 active:text-accent"
      >
        <DragIcon className="size-5" />
      </button>
      <button type="button" onClick={() => navigate(`/programs/template/${template.id}`)} className="min-w-0 flex-1 rounded-xl py-1.5 pr-1 text-left active:bg-card-2">
        <span className="flex items-center gap-2">
          <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: type?.color }} aria-hidden />
          <span className="min-w-0 font-semibold leading-snug">{template.name}</span>
        </span>
        <span className="block text-sm text-ink-2">
          {templateMeta(template, data, lookups)}
          {template.optional ? ' · optionnelle' : ''}
        </span>
        {status && <span className={`block text-sm font-semibold ${status.className}`}>{status.label}</span>}
      </button>
      <button type="button" aria-label={`Options de ${template.name} (${seqDayLabel(day.seqDay)} ${MOMENT_LABEL[slot.moment].toLowerCase()})`} onClick={onMenu} className="flex size-12 shrink-0 items-center justify-center rounded-xl text-ink-2 active:bg-card-2">
        <DotsIcon className="size-6" />
      </button>
    </div>
  );
}

function TemplateRow({ template, data, lookups, onMenu }: { template: SessionTemplate; data: AppData; lookups: Lookups; onMenu: () => void }) {
  const type = lookups.sessionTypes.get(template.sessionTypeId);
  return (
    <div className="flex items-center rounded-2xl border border-line bg-card pl-1">
      <button type="button" onClick={() => navigate(`/programs/template/${template.id}`)} className="min-w-0 flex-1 rounded-xl px-3 py-2.5 text-left active:bg-card-2">
        <span className="flex items-center gap-2">
          <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: type?.color }} aria-hidden />
          <span className="min-w-0 font-semibold">{template.name}</span>
        </span>
        <span className="block text-sm text-ink-2">{templateMeta(template, data, lookups)}</span>
      </button>
      <button type="button" aria-label={`Options de ${template.name}`} onClick={onMenu} className="flex size-12 shrink-0 items-center justify-center rounded-xl text-ink-2 active:bg-card-2">
        <DotsIcon className="size-6" />
      </button>
    </div>
  );
}

function ProgramView({ data }: { data: AppData }) {
  const lookups = useLookups(data);
  const { settings } = data;
  const today = localISODate(new Date(useNow(60_000)));
  const info = dayInfo(today, settings);
  const days = weekProgress(Math.max(1, info.week), today, settings, lookups.templates, data.sessions);
  const [menu, setMenu] = useState<TemplateTarget | null>(null);
  const [picker, setPicker] = useState<Slot | null>(null);
  const [programMenu, setProgramMenu] = useState(false);
  const inWeek = new Set(SEQ_DAYS.flatMap((day) => [settings.weekPlan[day].morning, settings.weekPlan[day].evening]));
  const others = data.templates.filter((t) => !t.archived && !inWeek.has(t.id)).sort(byName);
  const archived = data.templates.filter((t) => t.archived).sort(byName);

  // Glisser une séance sur un autre jour : les deux jours échangent leur séance de ce moment.
  const drag = useVerticalDrag<Slot>({
    measure: (handle) => measureDropRects(document, '[data-drop-day]', handle),
    pick: (pageY, rects) => containingIndex(pageY, rects),
    onDrop: (slot, index) => {
      const to = SEQ_DAYS[index];
      if (!to || to === slot.day) return;
      const label = `${MOMENT_LABEL[slot.moment]} de ${seqDayLabel(slot.day)} et ${seqDayLabel(to)} échangés.`;
      void swapWeekSlotsOf(db, slot.moment, slot.day, to).then(() =>
        showToast(label, { action: { label: 'Annuler', run: () => void swapWeekSlotsOf(db, slot.moment, slot.day, to) } }),
      );
    },
  });
  const dragState = drag.state;
  const dropDay = dragState && dragState.target !== null ? SEQ_DAYS[dragState.target] : null;

  return (
    <Screen title="Programmes" aside={<SettingsButton />} nav={<ProgramsNav current="programs" />}>
      <ProgramChecks program={lookups.program} settings={settings} lookups={lookups} sticky />

      <section className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-display text-lg leading-none tracking-wider text-accent">Programme actif</div>
            <h2 className="font-display text-3xl leading-tight tracking-wide">Semaine type J1-J7</h2>
          </div>
          <button type="button" aria-label="Options du programme" onClick={() => setProgramMenu(true)} className="flex size-12 shrink-0 items-center justify-center rounded-2xl text-ink-2 active:bg-card-2">
            <DotsIcon className="size-7" />
          </button>
        </div>
        <p className="flex flex-wrap items-center gap-2 text-ink-2">
          {info.beforeStart ? 'Pas encore commencé' : `Cycle ${info.cycle} · semaine ${info.cycleWeek}/${settings.cycleLengthWeeks} · aujourd’hui ${seqDayLabel(info.seqDay)}`}
          {info.isDeload && <Badge tone="accent">Semaine allégée</Badge>}
        </p>
        <ul className="flex flex-col gap-2">
          {days.map((day) => {
            const isToday = day.isToday && !info.beforeStart;
            const isDropTarget = dropDay === day.seqDay && dragState?.source.day !== day.seqDay;
            const slots = MOMENTS.map((moment) => day.slots[moment]).filter((slot) => slot.planned || slot.moment === 'evening');
            return (
              <li
                key={day.seqDay}
                data-drop-day={day.seqDay}
                aria-current={isToday ? 'date' : undefined}
                className={`flex items-start gap-1.5 rounded-2xl border bg-card p-1.5 ${isToday ? 'border-accent' : 'border-line'} ${isDropTarget ? 'outline-2 outline-offset-2 outline-accent outline-dashed' : ''}`}
              >
                <div className="flex w-12 shrink-0 flex-col items-center gap-1 pt-1">
                  <span className={`flex size-11 items-center justify-center rounded-xl pt-0.5 font-display text-2xl leading-none ${isToday ? 'bg-accent text-accent-ink' : 'bg-page text-ink'}`}>
                    {seqDayLabel(day.seqDay)}
                  </span>
                  <span className={`text-sm ${isToday ? 'font-semibold text-accent' : 'text-ink-3'}`}>{isToday ? 'auj.' : SHORT_WEEKDAY.format(new Date(`${day.date}T12:00:00`))}</span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  {slots.map((slot) => {
                    const source: Slot = { day: day.seqDay, moment: slot.moment };
                    return (
                      <SlotRow
                        key={slot.moment}
                        day={day}
                        slot={slot}
                        data={data}
                        lookups={lookups}
                        dragging={dragState?.source.day === day.seqDay && dragState.source.moment === slot.moment}
                        dy={dragState?.dy ?? 0}
                        handleProps={drag.handleProps(source)}
                        onMenu={() => slot.planned && setMenu({ template: slot.planned, slot: source })}
                        onPick={() => setPicker(source)}
                      />
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="px-1 text-sm text-ink-3">⠿ : glisser une séance sur un autre jour pour échanger les deux jours.</p>
        <button
          type="button"
          onClick={() => void createTemplate(data)}
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line font-semibold text-ink-2 active:bg-card-2"
        >
          <PlusIcon className="size-5" /> Nouveau modèle
        </button>
      </section>

      {others.length > 0 && (
        <section className="mt-2 flex flex-col gap-2">
          <h2 className="font-display text-2xl leading-none tracking-wider text-ink-3">Autres modèles</h2>
          <p className="text-sm text-ink-3">Hors de la semaine type : à choisir pour une séance ponctuelle ou à placer dans un créneau.</p>
          {others.map((template) => (
            <TemplateRow key={template.id} template={template} data={data} lookups={lookups} onMenu={() => setMenu({ template })} />
          ))}
        </section>
      )}

      {archived.length > 0 && (
        <details className="group/archived mt-2">
          <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 font-display text-2xl leading-none tracking-wider text-ink-3">
            Archivés ({archived.length}) <ChevronDownIcon className="size-5 transition-transform group-open/archived:rotate-180" />
          </summary>
          <div className="flex flex-col gap-2 pt-1">
            {archived.map((template) => (
              <TemplateRow key={template.id} template={template} data={data} lookups={lookups} onMenu={() => setMenu({ template })} />
            ))}
          </div>
        </details>
      )}

      <Sheet open={programMenu} onClose={() => setProgramMenu(false)} title="Programme actif">
        <MenuList>
          <MenuItem label="Créneaux matin et soir" hint="Les 14 créneaux de J1 à J7 et le volume prévu des composantes." onClick={() => navigate('/programs/week')} />
          <MenuItem label="Cycle et semaine allégée" hint="Date de début (un J1), longueur du cycle, volume, durée des matins." onClick={() => navigate('/settings/cycle')} />
          <MenuItem
            icon={<PlusIcon />}
            label="Nouveau modèle"
            onClick={() => {
              setProgramMenu(false);
              void createTemplate(data);
            }}
          />
        </MenuList>
      </Sheet>
      <TemplateActions key={menu?.template.id ?? 'aucun'} target={menu} onClose={() => setMenu(null)} data={data} lookups={lookups} />
      <SlotPickerSheet slot={picker} onClose={() => setPicker(null)} data={data} lookups={lookups} />
    </Screen>
  );
}
