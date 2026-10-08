import type { AppData } from '../../db/hooks';
import { OBJECTIVE_STATUS_LABEL, formatDateShort, formatValue } from '../../domain/labels';
import { bestSessionPerformance, objectiveState, type ObjectiveStatus } from '../../domain/objectives';
import { Badge, type Tone } from '../../ui/Badge';
import type { Lookups } from '../../db/lookups';

const STATUS_TONE: Record<ObjectiveStatus, Tone> = { to_test: 'neutral', in_progress: 'warn', achieved: 'ok' };

export function ObjectivesView({ data, lookups }: { data: AppData; lookups: Lookups }) {
  return (
    <div className="flex flex-col gap-2">
      {data.objectives.map((objective) => {
        const state = objectiveState(objective);
        const exercise = objective.exerciseId ? lookups.exercises.get(objective.exerciseId) : undefined;
        const perf = exercise ? bestSessionPerformance(exercise.id, data.sets, lookups.sessions) : null;
        return (
          <div key={objective.id} className="rounded-xl bg-card-2 p-3">
            <div className="flex items-start justify-between gap-2">
              <span className="text-lg font-semibold">{objective.name}</span>
              <Badge tone={STATUS_TONE[state.status]}>{OBJECTIVE_STATUS_LABEL[state.status]}</Badge>
            </div>
            <p className="text-ink-2">{objective.criterion}</p>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <dt className="text-ink-3">Cible</dt>
              <dd className="font-semibold">{formatValue(objective.target, objective.unit)}</dd>
              <dt className="text-ink-3">Meilleur test</dt>
              <dd>
                {state.best
                  ? `${formatValue(state.best.value, objective.unit)} le ${formatDateShort(state.best.date)} (écart ${state.gap})`
                  : 'aucun test'}
              </dd>
              <dt className="text-ink-3">Exercice lié</dt>
              <dd>{exercise?.name ?? 'aucun'}</dd>
              {exercise && (
                <>
                  <dt className="text-ink-3">En séance</dt>
                  <dd>
                    {perf
                      ? `${formatValue(perf.value, objective.unit)} le ${formatDateShort(perf.date)} (sans élastique)`
                      : 'pas encore de série sans élastique'}
                  </dd>
                </>
              )}
            </dl>
          </div>
        );
      })}
    </div>
  );
}
