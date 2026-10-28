// Tableau de la séance : blocs, paires planche / FL et supersets, un exercice par carte, une ligne par série
// (numéro ou type, précédent, valeur, ✓). Lignes de 56 px ; glisser une ligne à gauche révèle « Supprimer ».
import type { Lookups } from '../../db/lookups';
import { UNIT_SHORT, formatDateShort, formatIntensity, formatRest, formatSetValue, formatSets, formatTarget } from '../../domain/labels';
import { capReached, targetFor, type SessionPlan } from '../../domain/session';
import type { PendingRow, TableRow } from '../../domain/sessionTable';
import type { ID, Moment, SetKind } from '../../domain/types';
import { Badge } from '../../ui/Badge';
import { useLongPress, useSwipeReveal } from '../../ui/gestures';
import { CheckIcon, ChevronDownIcon, DotsIcon, PlusIcon, WarningIcon } from '../../ui/icons';
import { BandSwatch } from '../../ui/inputs';
import type { LineView, ProposedRow } from './useSessionController';

export interface TableHandlers {
  /** Toucher la valeur : le pavé de saisie. */
  openRow(line: LineView, row: TableRow): void;
  /** Toucher ✓ : valide une série à faire, décoche une série faite. */
  checkRow(line: LineView, row: TableRow): void;
  /** Toucher le numéro d'une série à faire : normale → échauffement → échec. */
  cycleKind(line: LineView, row: PendingRow, next: SetKind): void;
  /** Toucher « Précédent » : recopie la série de même rang de la dernière fois. */
  copyPrevious(line: LineView, row: PendingRow): void;
  removeRow(line: LineView, row: TableRow): void;
  addRow(line: LineView): void;
  openLine(line: LineView): void;
  reopenLine(line: LineView): void;
}

const NEXT_KIND: Record<SetKind, SetKind> = { normal: 'warmup', warmup: 'failure', failure: 'normal' };
const KIND_LABEL: Record<SetKind, string> = { normal: 'normale', warmup: 'échauffement', failure: 'à l’échec' };
const COLUMNS = 'grid grid-cols-[3rem_minmax(0,1fr)_5.5rem_3.5rem] items-center gap-2';

/** Rang de la série : numéro, « E » pour l'échauffement (pointillés), numéro sur fond rouge pour l'échec. */
function KindMark({ kind, label }: { kind: SetKind; label: string }) {
  if (kind === 'warmup') return <span className="flex size-10 items-center justify-center rounded-full border-2 border-dashed border-ink-3 font-bold text-ink-2">E</span>;
  if (kind === 'failure') return <span className="flex size-10 items-center justify-center rounded-full bg-danger font-bold text-page">{label}</span>;
  return <span className="text-xl font-bold">{label}</span>;
}

function Row({ line, row, proposed, lookups, handlers }: { line: LineView; row: TableRow; proposed: boolean; lookups: Lookups; handlers: TableHandlers }) {
  const swipe = useSwipeReveal(104);
  const done = row.status === 'done';
  const values = done ? row.set : row.draft;
  // Série sur un autre exercice que celui de la ligne (autre candidat, progression inférieure) : son nom et sa mesure.
  const own = lookups.exercises.get(done ? row.set.exerciseId : (row.draft.exerciseId ?? '')) ?? line.exercise;
  const other = own && own.id !== line.exercise?.id ? own : null;
  const measure = own?.measure ?? 'reps';
  const band = values.bandId ? (lookups.bands.get(values.bandId) ?? null) : null;
  const previous = row.previous;
  const previousBand = previous?.bandId ? (lookups.bands.get(previous.bandId) ?? null) : null;
  const rowKey = done ? row.set.id : `p${row.index}`;
  return (
    <div role="row" data-row={`${line.item.id}:${rowKey}`} className="relative overflow-hidden">
      <button
        type="button"
        tabIndex={swipe.revealed ? 0 : -1}
        aria-hidden={!swipe.revealed}
        onClick={() => {
          swipe.close();
          handlers.removeRow(line, row);
        }}
        className="absolute inset-y-0 right-0 w-[104px] bg-danger text-lg font-bold text-page"
      >
        {done ? 'Supprimer' : 'Retirer'}
      </button>
      <div
        {...swipe.handlers}
        style={{ transform: `translateX(${swipe.offset}px)` }}
        className={`relative min-h-14 touch-pan-y px-3 py-1 transition-transform ${COLUMNS} ${proposed ? 'bg-card-2 shadow-[inset_4px_0_0_var(--color-accent)]' : 'bg-card'}`}
      >
        <button
          type="button"
          role="cell"
          onClick={() => (done ? handlers.openRow(line, row) : handlers.cycleKind(line, row, NEXT_KIND[row.draft.kind]))}
          aria-label={`Série ${row.label}, ${KIND_LABEL[values.kind]}${done ? '' : ' : toucher pour changer le type'}`}
          className="flex size-12 items-center justify-center rounded-xl tabular-nums active:bg-line"
        >
          <KindMark kind={values.kind} label={row.label} />
        </button>
        <button
          type="button"
          role="cell"
          disabled={done || !previous}
          onClick={() => !done && handlers.copyPrevious(line, row)}
          aria-label={previous ? `Précédent : ${formatSetValue(previous.value, measure)}${done ? '' : ', toucher pour recopier'}` : 'Pas de précédent'}
          className="flex min-h-12 min-w-0 items-center gap-1.5 rounded-xl text-left text-lg text-ink-2 tabular-nums enabled:active:bg-line"
        >
          {previous ? (
            <>
              <span className="truncate">{formatSetValue(previous.value, measure)}</span>
              {previousBand && <BandSwatch band={previousBand} />}
            </>
          ) : (
            <span className="text-ink-3">—</span>
          )}
        </button>
        <button
          type="button"
          role="cell"
          onClick={() => handlers.openRow(line, row)}
          aria-label={`Valeur : ${formatSetValue(values.value, measure)}, toucher pour modifier`}
          className={`flex min-h-12 flex-col items-center justify-center rounded-xl leading-tight active:scale-[0.97] ${done ? '' : 'border border-line bg-page'}`}
        >
          <span className={`text-xl font-bold tabular-nums ${values.value === null && measure !== 'none' ? 'text-ink-3' : ''}`}>
            {measure === 'none' ? (done ? 'fait' : '–') : (values.value ?? '–')}
          </span>
          {other && (
            <span className="max-w-full truncate text-xs text-accent">
              {other.measure !== line.exercise?.measure && other.measure !== 'none' ? `${UNIT_SHORT[other.measure]} · ` : ''}
              {other.name}
            </span>
          )}
          {(band || values.rpe !== null || values.quality === 'degraded') && (
            <span className="flex items-center gap-1 text-xs font-semibold text-ink-2">
              {band && <BandSwatch band={band} />}
              {values.rpe !== null && <span>@{values.rpe}</span>}
              {values.quality === 'degraded' && <WarningIcon className="size-3.5 text-warn" />}
            </span>
          )}
        </button>
        <button
          type="button"
          role="cell"
          aria-pressed={done}
          aria-label={done ? 'Décocher la série' : 'Valider la série'}
          onClick={() => handlers.checkRow(line, row)}
          className={`flex size-14 items-center justify-center rounded-xl border-2 active:scale-[0.95] ${
            done ? 'border-ok bg-ok text-page' : proposed ? 'border-action text-action' : 'border-line text-ink-3'
          }`}
        >
          <CheckIcon className="size-7" />
        </button>
      </div>
    </div>
  );
}

function Line({ line, lookups, proposed, moment, handlers }: { line: LineView; lookups: Lookups; proposed: ProposedRow | null; moment: Moment; handlers: TableHandlers }) {
  const { item, exercise, rows, closed } = line;
  const element = lookups.elements.get(item.elementId);
  const target = exercise ? targetFor(item, exercise.measure) : null;
  const details = [
    `${formatSets(item.setsMin, item.setsMax)} séries`,
    target ? formatTarget(target) : item.targets.length > 0 ? item.targets.map(formatTarget).join(' ou ') : item.targetText,
    item.intensity ? formatIntensity(item.intensity) : item.intensityText,
    `repos ${formatRest(item.restMinSec, item.restMaxSec)}`,
  ].filter((d) => d && d !== '—');
  const done = line.progress?.done ?? 0;
  const longPress = useLongPress(() => handlers.openLine(line));
  const unit = exercise && exercise.measure !== 'none' ? UNIT_SHORT[exercise.measure] : 'fait';
  const otherBlock = line.last && !line.last.sameBlock && line.last.blockTypeId ? lookups.blocks.get(line.last.blockTypeId)?.name : undefined;
  const proposedKey = proposed?.line.item.id === item.id ? proposed.row.index : null;
  const workRows = rows.filter((r) => (r.status === 'done' ? r.set.kind : r.draft.kind) !== 'warmup').length;

  return (
    <article className="overflow-hidden rounded-2xl border border-line bg-card" aria-label={element?.name}>
      <header {...longPress} className="flex items-start gap-1 px-3 pt-3 select-none">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h3 className="text-xl font-bold">{element?.name ?? '?'}</h3>
            <span className={`tabular-nums ${line.status === 'done' ? 'text-ok' : 'text-ink-2'}`}>
              {done}/{formatSets(item.setsMin, item.setsMax)}
            </span>
            {item.optional && <Badge>optionnel</Badge>}
          </div>
          <button
            type="button"
            onClick={() => handlers.openLine(line)}
            className="mt-1 flex min-h-11 max-w-full items-center gap-1.5 rounded-xl border border-line bg-card-2 px-3 font-semibold active:bg-line"
          >
            <span className="truncate">{exercise?.name ?? 'Choisir un exercice'}</span>
            {moment === 'morning' && exercise?.quick && <span aria-label="rapide">⚡</span>}
            {line.candidates.length > 1 && <ChevronDownIcon className="size-5 shrink-0 text-ink-2" />}
          </button>
          <p className="mt-1.5 text-sm text-ink-2">{details.join(' · ')}</p>
          {line.last && (
            <p className="text-sm text-ink-3">
              Dernière fois : {formatDateShort(line.last.date)}
              {otherBlock ? ` · bloc ${otherBlock}` : ''}
            </p>
          )}
        </div>
        <button type="button" aria-label="Options de l’exercice" onClick={() => handlers.openLine(line)} className="flex size-12 shrink-0 items-center justify-center rounded-xl text-ink-2 active:bg-card-2">
          <DotsIcon className="size-7" />
        </button>
      </header>
      {item.notes && (
        <details className="group/note px-3">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-ink-2">
            Note de la ligne <ChevronDownIcon className="size-4 transition-transform group-open/note:rotate-180" />
          </summary>
          <p className="pb-2 text-ink-2">{item.notes}</p>
        </details>
      )}

      {exercise ? (
        <div role="table" aria-label={`Séries de ${element?.name ?? 'l’exercice'}`} className="mt-2">
          <div role="row" className={`px-3 pb-1 text-xs font-semibold tracking-wide text-ink-3 uppercase ${COLUMNS}`}>
            <span role="columnheader" className="text-center">Série</span>
            <span role="columnheader">Précédent</span>
            <span role="columnheader" className="text-center">{unit}</span>
            <span role="columnheader" className="text-center">✓</span>
          </div>
          {rows.map((row) => (
            <Row key={row.status === 'done' ? row.set.id : `p${row.index}`} line={line} row={row} proposed={row.status === 'pending' && row.index === proposedKey} lookups={lookups} handlers={handlers} />
          ))}
        </div>
      ) : (
        <p className="px-3 pt-2 pb-3 text-danger">Aucun exercice candidat : ajoute-en un dans Programmes.</p>
      )}

      {exercise &&
        (closed ? (
          <div className="flex min-h-14 items-center justify-between gap-2 px-3">
            <span className="text-ink-2">Exercice terminé</span>
            <button type="button" onClick={() => handlers.reopenLine(line)} className="min-h-11 rounded-xl border border-line px-3 font-semibold active:bg-card-2">
              Rouvrir
            </button>
          </div>
        ) : (
          <div className="p-3 pt-1">
            {capReached(item, done) && (
              <p className="mb-2 rounded-xl border border-warn/70 bg-warn/10 px-3 py-2 font-semibold text-warn">
                Plafond atteint : {item.setsMax} série{item.setsMax > 1 ? 's' : ''}.
              </p>
            )}
            <button
              type="button"
              onClick={() => handlers.addRow(line)}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line font-semibold text-ink-2 active:bg-card-2"
            >
              <PlusIcon className="size-5" /> {capReached(item, done) ? 'Une série au-delà du plafond' : 'Ajouter une série'}
              {workRows < item.setsMax && <span className="font-normal text-ink-3">({item.setsMin === 0 ? 'plafond' : 'jusqu’à'} {item.setsMax})</span>}
            </button>
          </div>
        ))}
    </article>
  );
}

export function SessionTable({
  plan,
  lines,
  lookups,
  proposed,
  moment,
  handlers,
}: {
  plan: SessionPlan;
  lines: ReadonlyMap<ID, LineView>;
  lookups: Lookups;
  proposed: ProposedRow | null;
  moment: Moment;
  handlers: TableHandlers;
}) {
  return (
    <div className="flex flex-col gap-5">
      {plan.blocks.map((block, i) => (
        <section key={`${block.blockTypeId}-${i}`} className="flex flex-col gap-3" aria-label={lookups.blocks.get(block.blockTypeId)?.name}>
          <h2 className="font-display text-2xl leading-none tracking-wider text-ink-3">{lookups.blocks.get(block.blockTypeId)?.name ?? '?'}</h2>
          {block.units.map((unit) => {
            const unitLines = unit.itemIds.map((id) => lines.get(id)).filter((l) => l !== undefined);
            if (unit.mode === 'single') {
              return unitLines.map((line) => <Line key={line.item.id} line={line} lookups={lookups} proposed={proposed} moment={moment} handlers={handlers} />);
            }
            return (
              <div key={unit.itemIds.join('|')} className="flex flex-col gap-2 border-l-4 border-accent pl-2.5">
                <div className="text-sm font-semibold text-accent">{unit.mode === 'alternate' ? 'En alternance · repos après la paire' : 'Superset · repos après chaque série'}</div>
                {unitLines.map((line) => (
                  <Line key={line.item.id} line={line} lookups={lookups} proposed={proposed} moment={moment} handlers={handlers} />
                ))}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
