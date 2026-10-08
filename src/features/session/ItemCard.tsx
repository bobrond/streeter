import type { Lookups } from '../../db/lookups';
import { formatDateShort, formatIntensity, formatRest, formatSetValue, formatSets, formatTarget, formatValueList } from '../../domain/labels';
import { itemStatus, targetFor, type ItemProgress, type SessionPlan } from '../../domain/session';
import type { ID, Moment, SetLog } from '../../domain/types';
import { Badge } from '../../ui/Badge';
import { CheckIcon, WarningIcon } from '../../ui/icons';
import { BandSwatch } from '../../ui/inputs';
import { chipClass } from '../../ui/styles';
import type { ItemView } from './useSessionController';

function distinct<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function LastPerformanceBox({ view, lookups }: { view: ItemView; lookups: Lookups }) {
  const { last, exercise } = view;
  if (!exercise) return null;
  if (!last) {
    return <div className="rounded-2xl border border-dashed border-line p-3 text-ink-2">Première fois sur cet exercice.</div>;
  }
  const bands = distinct(last.sets.map((s) => s.bandId));
  const rpes = distinct(last.sets.map((s) => s.rpe).filter((r) => r !== null));
  const degraded = last.sets.filter((s) => s.quality === 'degraded').length;
  return (
    <div className="rounded-2xl bg-card-2 p-3">
      <div className="text-sm text-ink-3">
        Dernière fois · {formatDateShort(last.date)}
        {!last.sameBlock && last.blockTypeId && ` · bloc ${lookups.blocks.get(last.blockTypeId)?.name ?? '?'}`}
      </div>
      <div className="mt-0.5 text-2xl font-bold tabular-nums">
        {formatValueList(
          last.sets.map((s) => s.value),
          exercise.measure,
        )}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-ink-2">
        {bands.map((id) => {
          const band = id ? lookups.bands.get(id) : null;
          return (
            <span key={id ?? 'none'} className="inline-flex items-center gap-1.5">
              <BandSwatch band={band ?? null} />
              {band ? `élastique ${band.name}` : 'sans élastique'}
            </span>
          );
        })}
        {rpes.length > 0 && <span>RPE {rpes.join(' ; ')}</span>}
        {degraded > 0 && <span className="text-warn">{degraded} dégradée{degraded > 1 ? 's' : ''}</span>}
      </div>
    </div>
  );
}

function DoneSets({ sets, lookups, onEdit }: { sets: SetLog[]; lookups: Lookups; onEdit: (set: SetLog) => void }) {
  if (sets.length === 0) return null;
  return (
    <div>
      <h3 className="mb-1.5 text-sm font-semibold text-ink-3">Faites aujourd’hui · toucher pour corriger</h3>
      <div className="flex flex-wrap gap-1.5">
        {sets.map((set, i) => {
          const exercise = lookups.exercises.get(set.exerciseId);
          const band = set.bandId ? lookups.bands.get(set.bandId) : null;
          return (
            <button
              key={set.id}
              type="button"
              onClick={() => onEdit(set)}
              className="flex min-h-14 items-center gap-2 rounded-2xl border border-line bg-card-2 px-3 text-lg active:scale-[0.97]"
            >
              <span className="text-sm text-ink-3">{i + 1}</span>
              <span className="font-semibold tabular-nums">{formatSetValue(set.value, exercise?.measure ?? 'reps')}</span>
              {band && <BandSwatch band={band} />}
              {set.rpe !== null && <span className="text-sm text-ink-2">@{set.rpe}</span>}
              {set.quality === 'degraded' && <WarningIcon className="size-5 text-warn" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ItemCard({
  view,
  plan,
  progress,
  lookups,
  moment,
  onChooseExercise,
  onEditSet,
  onClose,
  onReopen,
  onGoTo,
}: {
  view: ItemView;
  plan: SessionPlan;
  progress: ReadonlyMap<ID, ItemProgress>;
  lookups: Lookups;
  moment: Moment;
  onChooseExercise: (exerciseId: ID) => void;
  onEditSet: (set: SetLog) => void;
  onClose: () => void;
  onReopen: () => void;
  onGoTo: (itemId: ID) => void;
}) {
  const { item, exercise, sets, status } = view;
  const block = lookups.blocks.get(item.blockTypeId);
  const element = lookups.elements.get(item.elementId);
  const unit = plan.unitOf.get(item.id);
  const partners = (unit?.itemIds ?? []).filter((id) => id !== item.id).map((id) => plan.itemsById.get(id)!);
  const done = sets.length;
  const target = exercise ? targetFor(item, exercise.measure) : null;
  const details = [
    target ? formatTarget(target) : item.targets.length > 0 ? item.targets.map(formatTarget).join(' ou ') : item.targetText,
    item.intensity ? formatIntensity(item.intensity) : item.intensityText,
    `repos ${formatRest(item.restMinSec, item.restMaxSec)}`,
  ].filter((d) => d && d !== '—');
  const closed = view.progress?.closed ?? false;

  return (
    <article className="flex flex-col gap-4 pb-4">
      <header>
        <div className="text-sm font-bold tracking-wide text-ink-3 uppercase">{block?.name ?? '?'}</div>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-3xl leading-tight font-bold">{element?.name ?? '?'}</h2>
          <div className="shrink-0 text-right tabular-nums">
            {status === 'done' ? (
              <span className="inline-flex items-center gap-1 text-xl font-bold text-ok">
                <CheckIcon className="size-6" /> {done}
              </span>
            ) : (
              <span className="text-xl font-bold">Série {done + 1}</span>
            )}
            <span className="text-lg text-ink-2"> / {formatSets(item.setsMin, item.setsMax)}</span>
          </div>
        </div>
        <p className="mt-1 text-lg text-ink-2">{details.join(' · ')}</p>
        {(item.optional || partners.length > 0) && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {item.optional && <Badge>optionnel</Badge>}
            {partners.map((partner) => {
              const p = progress.get(partner.id);
              const partnerStatus = itemStatus(partner, p);
              return (
                <button
                  key={partner.id}
                  type="button"
                  onClick={() => onGoTo(partner.id)}
                  className="min-h-11 rounded-full border border-line px-3 text-ink-2 active:bg-card-2"
                >
                  {unit?.mode === 'superset' ? 'superset avec ' : 'en alternance avec '}
                  <span className="font-semibold text-ink">{lookups.elements.get(partner.elementId)?.name}</span> ({p?.done ?? 0}/
                  {formatSets(partner.setsMin, partner.setsMax)}
                  {partnerStatus === 'done' ? ' ✓' : ''})
                </button>
              );
            })}
          </div>
        )}
      </header>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Exercice">
        {view.candidates.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            aria-pressed={candidate.id === exercise?.id}
            onClick={() => onChooseExercise(candidate.id)}
            className={chipClass(candidate.id === exercise?.id, 'text-left')}
          >
            {candidate.name}
            {moment === 'morning' && candidate.quick && <span aria-label="rapide">⚡</span>}
          </button>
        ))}
        {view.candidates.length === 0 && <p className="text-danger">Aucun exercice candidat : ajoute-en un dans Réglages.</p>}
      </div>

      <LastPerformanceBox view={view} lookups={lookups} />
      <DoneSets sets={sets} lookups={lookups} onEdit={onEditSet} />
      {item.notes && <p className="text-lg text-ink-2 italic">{item.notes}</p>}

      {closed ? (
        <button type="button" onClick={onReopen} className="min-h-14 rounded-2xl border border-line px-4 text-lg font-semibold text-ink-2 active:bg-card-2">
          Rouvrir cet exercice
        </button>
      ) : (
        status !== 'done' && (
          <button type="button" onClick={onClose} className="min-h-14 rounded-2xl border border-line px-4 text-lg font-semibold text-ink-2 active:bg-card-2">
            {done === 0 ? 'Passer cet exercice' : done >= item.setsMin ? 'Terminer cet exercice' : `Terminer à ${done} série${done > 1 ? 's' : ''}`}
          </button>
        )
      )}
    </article>
  );
}
