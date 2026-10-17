import type { AppData } from '../../db/hooks';
import type { Lookups } from '../../db/lookups';
import { OBJECTIVE_STATUS_LABEL, formatDateShort, formatValue } from '../../domain/labels';
import { bestSessionPerformance, objectiveState, type ObjectiveStatus, type SessionPerformance } from '../../domain/objectives';
import type { Objective } from '../../domain/types';
import { navigate } from '../../lib/router';
import { Badge, type Tone } from '../../ui/Badge';

const STATUS_TONE: Record<ObjectiveStatus, Tone> = { to_test: 'neutral', in_progress: 'warn', achieved: 'ok' };

export function ObjectiveStatusBadge({ status }: { status: ObjectiveStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{OBJECTIVE_STATUS_LABEL[status]}</Badge>;
}

/** Jauge du meilleur test vers la cible. */
export function Meter({ value, target }: { value: number; target: number }) {
  const ratio = Math.max(0, Math.min(1, value / target));
  return (
    <div className="h-2 overflow-hidden rounded-full bg-line" role="meter" aria-valuemin={0} aria-valuemax={target} aria-valuenow={value}>
      <div className={`h-full rounded-full ${ratio >= 1 ? 'bg-ok' : 'bg-accent'}`} style={{ width: `${ratio * 100}%` }} />
    </div>
  );
}

/** Objectif dans la carte d'un skill (sans action propre : la carte entière ouvre le skill). */
export function ObjectiveSummary({ objective, perf }: { objective: Objective; perf: SessionPerformance | null }) {
  const state = objectiveState(objective);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <span className="text-lg leading-snug font-semibold">{objective.name}</span>
        <ObjectiveStatusBadge status={state.status} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-sm text-ink-2">Meilleur test</div>
          <div className="flex items-baseline gap-1.5">
            <span className={`font-display text-4xl leading-none tracking-wide tabular-nums ${state.best ? 'text-accent' : 'text-ink-3'}`}>
              {state.best ? formatValue(state.best.value, objective.unit) : '—'}
            </span>
            <span className="text-ink-2">/ {formatValue(objective.target, objective.unit)}</span>
          </div>
        </div>
        <div>
          <div className="text-sm text-ink-2">En séance</div>
          <div className="text-lg font-semibold tabular-nums">{perf ? formatValue(perf.value, objective.unit) : '—'}</div>
          <div className="text-sm text-ink-3">{perf ? `le ${formatDateShort(perf.date)}` : 'sans élastique, propre'}</div>
        </div>
      </div>
      {state.best && <Meter value={state.best.value} target={objective.target} />}
    </div>
  );
}

/** Carte d'un objectif : toucher ouvre son détail (tests, courbe). */
export function ObjectiveCard({ objective, data, lookups }: { objective: Objective; data: AppData; lookups: Lookups }) {
  const state = objectiveState(objective);
  const perf = objective.exerciseId ? bestSessionPerformance(objective.exerciseId, data.sets, lookups.sessions) : null;
  return (
    <button type="button" onClick={() => navigate(`/objectives/${objective.id}`)} className="flex flex-col gap-2 rounded-2xl border border-line bg-card p-4 text-left active:scale-[0.99]">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xl font-bold">{objective.name}</span>
        <ObjectiveStatusBadge status={state.status} />
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-ink-2">
          {state.best ? (
            <>
              Meilleur test <b className="text-ink">{formatValue(state.best.value, objective.unit)}</b>
              {state.gap !== null && state.gap > 0 ? ` · encore ${formatValue(state.gap, objective.unit)}` : ''}
            </>
          ) : (
            'Pas encore testé'
          )}
        </span>
        <span className="shrink-0 font-semibold">cible {formatValue(objective.target, objective.unit)}</span>
      </div>
      {state.best && <Meter value={state.best.value} target={objective.target} />}
      {perf && (
        <span className="text-sm text-ink-3">
          En séance : {formatValue(perf.value, objective.unit)} le {formatDateShort(perf.date)} (sans élastique, propre)
        </span>
      )}
    </button>
  );
}
