// Onglet Programmes : le programme actif (semaine type J1-J7), les modèles et les exercices ;
// les réglages sont derrière la roue crantée. Les éditeurs restent ceux de la phase 2 (refonte en phase D).
import type { AppData } from '../../db/hooks';
import { useLookups, type Lookups } from '../../db/lookups';
import { dateOf, dayInfo, localISODate } from '../../domain/cycle';
import { MOMENT_LABEL, seqDayLabel } from '../../domain/labels';
import { SEQ_DAYS, type Moment, type SeqDay } from '../../domain/types';
import { useNow } from '../../lib/device';
import { navigate } from '../../lib/router';
import { Badge } from '../../ui/Badge';
import { ListGroup, ListRow } from '../../ui/form';
import { PencilIcon, SettingsIcon } from '../../ui/icons';
import { Screen } from '../../ui/Screen';
import { ProgramChecks } from '../settings/ProgramChecks';

const SHORT_WEEKDAY = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' });

function SlotButton({ day, moment, data, lookups }: { day: SeqDay; moment: Moment; data: AppData; lookups: Lookups }) {
  const template = lookups.templates.get(data.settings.weekPlan[day][moment] ?? '');
  if (!template) {
    return moment === 'evening' ? <div className="flex min-h-11 items-center px-3 text-ink-3">Soir · Repos</div> : null;
  }
  const type = lookups.sessionTypes.get(template.sessionTypeId);
  return (
    <button
      type="button"
      onClick={() => navigate(`/settings/templates/${template.id}`)}
      className="flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 text-left active:bg-card-2"
    >
      <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: type?.color }} aria-hidden />
      <span className="w-12 shrink-0 text-sm text-ink-3">{MOMENT_LABEL[moment]}</span>
      <span className="min-w-0 flex-1 truncate font-semibold">{template.name}</span>
      {template.optional && <Badge>optionnel</Badge>}
    </button>
  );
}

export function ProgramsScreen({ data }: { data: AppData }) {
  const lookups = useLookups(data);
  const { settings } = data;
  const info = dayInfo(localISODate(new Date(useNow(60_000))), settings);
  const inWeek = new Set(SEQ_DAYS.flatMap((day) => [settings.weekPlan[day].morning, settings.weekPlan[day].evening]));
  const outside = data.templates.filter((t) => !inWeek.has(t.id)).length;

  return (
    <Screen
      title="Programmes"
      aside={
        <button type="button" aria-label="Réglages" onClick={() => navigate('/settings')} className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-line text-ink-2 active:bg-card-2">
          <SettingsIcon className="size-6" />
        </button>
      }
    >
      <ProgramChecks program={lookups.program} settings={settings} lookups={lookups} compact />

      <section className="flex flex-col gap-2">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="font-display text-lg leading-none tracking-wider text-accent">Programme actif</div>
            <h2 className="font-display text-3xl leading-tight tracking-wide">Semaine type J1-J7</h2>
          </div>
          <button
            type="button"
            onClick={() => navigate('/settings/week')}
            className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-line px-3 font-semibold text-ink-2 active:bg-card-2"
          >
            <PencilIcon className="size-5" /> Modifier
          </button>
        </div>
        <p className="flex flex-wrap items-center gap-2 text-ink-2">
          {info.beforeStart ? 'Pas encore commencé' : `Cycle ${info.cycle} · semaine ${info.cycleWeek}/${settings.cycleLengthWeeks}`}
          {info.isDeload && <Badge tone="accent">Semaine allégée</Badge>}
        </p>
        <ul className="flex flex-col gap-1.5">
          {SEQ_DAYS.map((day) => {
            const isToday = !info.beforeStart && day === info.seqDay;
            return (
              <li key={day} className={`flex items-start gap-1 rounded-2xl border bg-card p-1.5 ${isToday ? 'border-accent' : 'border-line'}`}>
                <div className="flex w-14 shrink-0 flex-col items-center pt-1.5">
                  <span className="text-lg leading-none font-bold">{seqDayLabel(day)}</span>
                  <span className="mt-0.5 text-sm text-ink-3">{SHORT_WEEKDAY.format(new Date(`${dateOf(Math.max(1, info.week), day, settings)}T12:00:00`))}</span>
                  {isToday && <span className="mt-0.5 text-xs font-semibold text-accent">auj.</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <SlotButton day={day} moment="morning" data={data} lookups={lookups} />
                  <SlotButton day={day} moment="evening" data={data} lookups={lookups} />
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <ListGroup title="Construire">
        <ListRow
          title="Modèles de séance"
          subtitle={outside > 0 ? `Lignes de prescription · ${outside} hors semaine type` : 'Lignes de prescription, exercices candidats'}
          aside={<span className="text-lg text-ink-2 tabular-nums">{data.templates.length}</span>}
          onClick={() => navigate('/settings/templates')}
        />
        <ListRow title="Exercices" subtitle="Catalogue, mesure, exercices rapides" aside={<span className="text-lg text-ink-2 tabular-nums">{data.exercises.length}</span>} onClick={() => navigate('/settings/exercises')} />
      </ListGroup>
    </Screen>
  );
}
