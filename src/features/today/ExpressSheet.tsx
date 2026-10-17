// Séance express : aperçu de la séance générée, modifiable avant de démarrer (séries par ligne, ligne retirée).
import { Fragment, useState } from 'react';
import type { AppData } from '../../db/hooks';
import type { Lookups } from '../../db/lookups';
import type { DayInfo } from '../../domain/cycle';
import { estimateDuration } from '../../domain/duration';
import { EXPRESS_MINUTES, buildExpress, componentNeeds, expressToStart, setExpressSets, type ExpressComponent, type ExpressPlan } from '../../domain/express';
import { MOMENT_LABEL, expressName, formatDurationRange, formatTarget, restParts } from '../../domain/labels';
import type { Moment, PrescriptionItem, SessionTemplate } from '../../domain/types';
import { weekProgress } from '../../domain/week';
import { newId } from '../../lib/id';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { MinusIcon, PlayIcon, PlusIcon } from '../../ui/icons';
import { Segmented } from '../../ui/Segmented';
import { Sheet } from '../../ui/Sheet';
import { lineExerciseName } from './lineNames';
import type { Planned } from './planned';

/** Séance express générée pour aujourd'hui à la place de `planned`. */
function generate(minutes: number, planned: Planned, info: DayInfo, data: AppData, lookups: Lookups): ExpressPlan {
  const days = weekProgress(info.week, info.date, data.settings, lookups.templates, data.sessions);
  const needs = componentNeeds({
    program: lookups.program,
    settings: data.settings,
    week: info.week,
    isDeload: info.isDeload,
    days,
    sets: data.sets,
    sessions: lookups.sessions,
    replaced: { date: info.date, moment: planned.moment },
  });
  const label = lookups.sessionTypes.get(planned.template.sessionTypeId)?.name ?? planned.template.name;
  return buildExpress({
    minutes,
    replaced: planned.template,
    name: expressName(minutes, label),
    isDeload: info.isDeload,
    program: lookups.program,
    settings: data.settings,
    needs,
    newId,
  });
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n > 1 ? 's' : ''}`;
}

/** Pourquoi une composante est là : retard sur le minimum, puis bonus jusqu'au maximum. */
function componentWhy(component: ExpressComponent): string {
  const state = `${plural(component.done, 'faite')}${component.remaining > 0 ? `, encore ${component.remaining} prévue${component.remaining > 1 ? 's' : ''} le soir` : ''}`;
  const parts = [component.deficitSets > 0 && `retard ${component.deficit}`, component.bonusSets > 0 && `bonus ${component.bonusSets}`].filter(Boolean);
  return `${parts.join(' + ')} · ${state}`;
}

function SetsStepper({ value, onChange, label }: { value: number; onChange: (value: number) => void; label: string }) {
  const button = 'flex size-11 items-center justify-center rounded-xl border border-line bg-card-2 active:scale-[0.95] active:bg-line disabled:opacity-40';
  return (
    <div className="flex shrink-0 items-center gap-1.5" role="group" aria-label={`Séries de ${label}`}>
      <button type="button" aria-label={`Une série de moins : ${label}`} disabled={value <= 0} onClick={() => onChange(value - 1)} className={button}>
        <MinusIcon className="size-5" />
      </button>
      <span className="w-7 text-center text-xl font-bold tabular-nums">{value}</span>
      <button type="button" aria-label={`Une série de plus : ${label}`} onClick={() => onChange(value + 1)} className={button}>
        <PlusIcon className="size-5" />
      </button>
    </div>
  );
}

function LineRow({
  item,
  plan,
  moment,
  data,
  lookups,
  onSets,
}: {
  item: PrescriptionItem;
  plan: ExpressPlan;
  moment: Moment;
  data: AppData;
  lookups: Lookups;
  onSets: (sets: number) => void;
}) {
  const name = lineExerciseName(item, moment, data, lookups);
  const element = lookups.elements.get(item.elementId)?.name;
  const target = item.targets.length > 0 ? item.targets.map(formatTarget).join(' ou ') : item.targetText;
  const component = plan.components.find((c) => c.itemId === item.id);
  const removed = item.setsMin === 0;
  return (
    <li className={`flex items-center gap-3 py-2.5 ${removed ? 'opacity-50' : ''}`}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold leading-snug">{name}</span>
          {component && <Badge tone={component.deficitSets > 0 ? 'accent' : 'neutral'}>{component.deficitSets > 0 ? 'retard' : 'bonus'}</Badge>}
          {removed && <Badge>retirée</Badge>}
        </div>
        <div className="text-sm text-ink-2">
          {[element !== name ? element : null, target && target !== '—' ? target : null, `repos ${restParts(item.restMinSec, item.restMaxSec).join(' à ')}`]
            .filter(Boolean)
            .map((part, i) => (
              <Fragment key={i}>
                {i > 0 && ' · '}
                <span className="whitespace-nowrap">{part}</span>
              </Fragment>
            ))}
        </div>
        {component && <div className="text-sm text-ink-3">{componentWhy(component)}</div>}
      </div>
      <SetsStepper value={item.setsMin} onChange={onSets} label={name} />
    </li>
  );
}

/** Lignes laissées de côté, et pourquoi. */
function LeftOut({ plan, minutes, moment, data, lookups }: { plan: ExpressPlan; minutes: number; moment: Moment; data: AppData; lookups: Lookups }) {
  const time = [...new Set(plan.leftOut.filter((l) => l.why === 'time').map((l) => lineExerciseName(l.item, moment, data, lookups)))];
  const assisted = [...new Set(plan.leftOut.filter((l) => l.why === 'assisted').map((l) => lookups.blocks.get(l.item.blockTypeId)?.name ?? '?'))];
  const components = plan.components.filter((c) => c.deficit > c.deficitSets);
  if (assisted.length + time.length + components.length === 0) return null;
  return (
    <section className="mt-4 flex flex-col gap-2 rounded-xl border border-line p-3 text-ink-2">
      <h3 className="font-semibold text-ink">Pas repris</h3>
      {time.length > 0 && (
        <p>
          Faute de place en {minutes} min
          <span className="block text-ink">{time.join(', ')}</span>
        </p>
      )}
      {assisted.length > 0 && <p>{assisted.join(', ')} : jamais repris en séance express.</p>}
      {components.length > 0 && (
        <p>
          Composantes encore en retard
          <span className="block text-ink">{components.map((c) => `${c.name} (${c.deficit - c.deficitSets})`).join(', ')}</span>
        </p>
      )}
    </section>
  );
}

function groupsOf(template: SessionTemplate): { blockId: string; items: PrescriptionItem[] }[] {
  const groups: { blockId: string; items: PrescriptionItem[] }[] = [];
  for (const item of template.items) {
    const last = groups.at(-1);
    if (last && last.blockId === item.blockTypeId) last.items.push(item);
    else groups.push({ blockId: item.blockTypeId, items: [item] });
  }
  return groups;
}

interface Draft {
  key: string;
  plan: ExpressPlan;
  /** Séance générée, avec les séries changées avant de démarrer. */
  template: SessionTemplate;
}

export function ExpressSheet({
  open,
  onClose,
  minutes,
  onMinutes,
  replaceable,
  moment,
  onMoment,
  info,
  data,
  lookups,
  onStart,
}: {
  open: boolean;
  onClose: () => void;
  minutes: number;
  onMinutes: (minutes: number) => void;
  replaceable: readonly Planned[];
  moment: Moment;
  onMoment: (moment: Moment) => void;
  info: DayInfo;
  data: AppData;
  lookups: Lookups;
  onStart: (template: SessionTemplate, planned: Planned) => void;
}) {
  const planned = replaceable.find((p) => p.moment === moment) ?? replaceable[0];
  const key = planned ? `${minutes}-${planned.moment}` : '';
  // Générée à l'ouverture et à chaque changement de durée ou de séance remplacée, pas à chaque écriture en base :
  // les séries changées tiennent tant que la feuille reste ouverte.
  const [draft, setDraft] = useState<Draft | null>(null);
  if (!open || !planned) {
    if (draft) setDraft(null);
  } else if (draft?.key !== key) {
    const plan = generate(minutes, planned, info, data, lookups);
    setDraft({ key, plan, template: plan.template });
  }
  const current = draft?.key === key ? draft : null;
  const estimate = current ? estimateDuration(current.template, data.settings, lookups) : null;
  const toStart = current ? expressToStart(current.template) : null;
  const over = estimate !== null && estimate.maxSec > minutes * 60;

  return (
    <Sheet
      open={open && planned !== undefined}
      onClose={onClose}
      title={`Séance express · ${minutes} min`}
      footer={
        planned &&
        toStart && (
          <Button disabled={toStart.items.length === 0} onClick={() => onStart(toStart, planned)}>
            <PlayIcon className="size-5" /> Démarrer · {minutes} min
          </Button>
        )
      }
    >
      {planned && current && estimate && (
        <>
          <div className="flex flex-col gap-2">
            <Segmented
              label="Durée"
              options={EXPRESS_MINUTES.map((m) => ({ value: String(m), label: `${m} min` }))}
              value={String(minutes)}
              onChange={(value) => onMinutes(Number(value))}
            />
            {replaceable.length > 1 && (
              <Segmented
                label="Séance remplacée"
                options={replaceable.map((p) => ({ value: p.moment, label: `${MOMENT_LABEL[p.moment]} · ${p.template.name}` }))}
                value={planned.moment}
                onChange={onMoment}
              />
            )}
          </div>
          <p className="mt-3 text-ink-2">
            Remplace <b className="text-ink">{planned.template.name}</b> ({MOMENT_LABEL[planned.moment].toLowerCase()}){info.isDeload ? ', semaine allégée' : ''}.
          </p>
          <p className={`mt-1 text-lg font-semibold ${over ? 'text-warn' : 'text-ink'}`}>
            {formatDurationRange(estimate.minSec, estimate.maxSec)}
            {over && <span className="block text-base font-normal">Plus de {minutes} min si tu prends tout le repos.</span>}
          </p>
          <div className="mt-3 flex flex-col gap-3">
            {groupsOf(current.template).map((group, i) => {
              const block = lookups.blocks.get(group.blockId);
              return (
                <section key={`${group.blockId}-${i}`}>
                  <h3 className="font-display text-xl leading-none tracking-wide text-accent">
                    {block?.name ?? '?'}
                    {block?.alternateSkills && <span className="ml-2 font-sans text-sm tracking-normal text-ink-3">planche et FL en alternance</span>}
                  </h3>
                  <ul className="divide-y divide-line">
                    {group.items.map((item) => (
                      <LineRow
                        key={item.id}
                        item={item}
                        plan={current.plan}
                        moment={planned.moment}
                        data={data}
                        lookups={lookups}
                        onSets={(sets) => setDraft((d) => (d ? { ...d, template: setExpressSets(d.template, item.id, sets) } : d))}
                      />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
          <LeftOut plan={current.plan} minutes={minutes} moment={planned.moment} data={data} lookups={lookups} />
        </>
      )}
    </Sheet>
  );
}
