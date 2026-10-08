import { useMemo, useState } from 'react';
import type { AppData } from '../../db/hooks';
import { useLookups, type Lookups } from '../../db/lookups';
import { OBJECTIVE_STATUS_LABEL, UNIT_SHORT, formatDateShort, formatValue } from '../../domain/labels';
import { bestSessionPerformance, objectiveState, type ObjectiveStatus } from '../../domain/objectives';
import type { Objective, ObjectiveTest } from '../../domain/types';
import { goBack, navigate } from '../../lib/router';
import { Badge, type Tone } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { PlusIcon } from '../../ui/icons';
import { LineChart, type ChartSeries } from '../../ui/LineChart';
import { Screen } from '../../ui/Screen';
import { ObjectiveSheet, TestSheet } from './ObjectiveSheets';

const STATUS_TONE: Record<ObjectiveStatus, Tone> = { to_test: 'neutral', in_progress: 'warn', achieved: 'ok' };

/** Jauge du meilleur test vers la cible. */
function Meter({ value, target }: { value: number; target: number }) {
  const ratio = Math.max(0, Math.min(1, value / target));
  return (
    <div className="h-2 overflow-hidden rounded-full bg-line" role="meter" aria-valuemin={0} aria-valuemax={target} aria-valuenow={value}>
      <div className={`h-full rounded-full ${ratio >= 1 ? 'bg-ok' : 'bg-accent'}`} style={{ width: `${ratio * 100}%` }} />
    </div>
  );
}

function ObjectiveCard({ objective, data, lookups }: { objective: Objective; data: AppData; lookups: Lookups }) {
  const state = objectiveState(objective);
  const perf = objective.exerciseId ? bestSessionPerformance(objective.exerciseId, data.sets, lookups.sessions) : null;
  return (
    <button type="button" onClick={() => navigate(`/objectives/${objective.id}`)} className="flex flex-col gap-2 rounded-2xl border border-line bg-card p-4 text-left active:scale-[0.99]">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xl font-bold">{objective.name}</span>
        <Badge tone={STATUS_TONE[state.status]}>{OBJECTIVE_STATUS_LABEL[state.status]}</Badge>
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

function ObjectivesList({ data }: { data: AppData }) {
  const lookups = useLookups(data);
  const [creating, setCreating] = useState(false);
  return (
    <Screen
      title="Objectifs"
      subtitle="Statut sur le meilleur test. Tests en début de cycle, sur un jour Max."
      actions={
        <Button variant="secondary" onClick={() => setCreating(true)}>
          <PlusIcon /> Nouvel objectif
        </Button>
      }
    >
      {data.objectives.map((objective) => (
        <ObjectiveCard key={objective.id} objective={objective} data={data} lookups={lookups} />
      ))}
      {data.objectives.length === 0 && <p className="text-ink-2">Aucun objectif.</p>}
      <ObjectiveSheet
        data={data}
        objective={null}
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={(id) => {
          setCreating(false);
          navigate(`/objectives/${id}`);
        }}
        onDeleted={() => setCreating(false)}
      />
    </Screen>
  );
}

function ObjectiveDetail({ data, objective }: { data: AppData; objective: Objective }) {
  const lookups = useLookups(data);
  const [testing, setTesting] = useState<ObjectiveTest | 'new' | null>(null);
  const [editing, setEditing] = useState(false);
  const state = objectiveState(objective);
  const exercise = objective.exerciseId ? lookups.exercises.get(objective.exerciseId) : undefined;
  const perf = exercise ? bestSessionPerformance(exercise.id, data.sets, lookups.sessions) : null;
  const tests = [...objective.tests].sort((a, b) => b.date.localeCompare(a.date));
  const series = useMemo(
    (): ChartSeries[] => [
      {
        id: 'tests',
        label: 'tests',
        color: '#d4ff3a',
        points: [...objective.tests].sort((a, b) => a.date.localeCompare(b.date)).map((t) => ({ date: t.date, value: t.value })),
      },
    ],
    [objective.tests],
  );
  const target = useMemo(() => ({ value: objective.target, label: `cible ${formatValue(objective.target, objective.unit)}` }), [objective.target, objective.unit]);

  return (
    <Screen
      title={objective.name}
      subtitle={objective.criterion}
      onBack={() => goBack('/objectives')}
      actions={
        <>
          <Button onClick={() => setTesting('new')}>Saisir un test</Button>
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Modifier l’objectif
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-card p-3">
          <div className="text-sm text-ink-2">Cible</div>
          <div className="text-3xl font-bold">{formatValue(objective.target, objective.unit)}</div>
          <div className="mt-1">
            <Badge tone={STATUS_TONE[state.status]}>{OBJECTIVE_STATUS_LABEL[state.status]}</Badge>
          </div>
        </div>
        <div className="rounded-2xl bg-card p-3">
          <div className="text-sm text-ink-2">Meilleur test</div>
          <div className="text-3xl font-bold">{state.best ? formatValue(state.best.value, objective.unit) : '—'}</div>
          <div className="text-sm text-ink-3">
            {state.best ? `le ${formatDateShort(state.best.date)}${state.gap !== null && state.gap > 0 ? ` · écart ${formatValue(state.gap, objective.unit)}` : ''}` : 'pas encore testé'}
          </div>
        </div>
      </div>
      {state.best && <Meter value={state.best.value} target={objective.target} />}

      {exercise && (
        <button type="button" onClick={() => navigate(`/journal/exercise/${exercise.id}`)} className="rounded-2xl border border-line bg-card p-3 text-left active:bg-card-2">
          <div className="text-sm text-ink-2">En séance · {exercise.name}</div>
          <div className="text-lg font-semibold">
            {perf ? `${formatValue(perf.value, objective.unit)} le ${formatDateShort(perf.date)}` : 'pas encore de série sans élastique'}
          </div>
          <div className="text-sm text-ink-3">Meilleure série sans élastique et non dégradée · voir la fiche</div>
        </button>
      )}

      {objective.tests.length > 0 && (
        <section className="rounded-2xl border border-line bg-card p-3">
          <h2 className="mb-2 text-lg font-semibold">Tests successifs</h2>
          <LineChart series={series} unit={UNIT_SHORT[objective.unit]} target={target} height={200} ariaLabel={`Tests de l’objectif ${objective.name}`} />
        </section>
      )}

      <section className="flex flex-col gap-1.5">
        <h2 className="px-1 text-sm font-bold tracking-wide text-ink-3 uppercase">Historique des tests</h2>
        <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
          {tests.map((test) => (
            <button key={test.id} type="button" onClick={() => setTesting(test)} className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left active:bg-card-2">
              <span className="min-w-0 flex-1">
                <span className="block">{formatDateShort(test.date)}</span>
                {test.note && <span className="block text-sm text-ink-2">{test.note}</span>}
              </span>
              <span className={`text-lg font-bold tabular-nums ${test.value >= objective.target ? 'text-ok' : ''}`}>{formatValue(test.value, objective.unit)}</span>
            </button>
          ))}
          {tests.length === 0 && <p className="p-4 text-ink-2">Aucun test pour l’instant.</p>}
        </div>
      </section>

      <TestSheet
        objective={objective}
        test={testing === 'new' ? null : testing}
        initialValue={tests[0]?.value ?? perf?.value ?? null}
        open={testing !== null}
        onClose={() => setTesting(null)}
      />
      <ObjectiveSheet
        data={data}
        objective={objective}
        open={editing}
        onClose={() => setEditing(false)}
        onSaved={() => setEditing(false)}
        onDeleted={() => {
          setEditing(false);
          goBack('/objectives');
        }}
      />
    </Screen>
  );
}

/** Objectifs : #/objectives et #/objectives/:id. */
export function ObjectivesScreen({ data, path }: { data: AppData; path: string }) {
  const id = path.split('?')[0].split('/').filter(Boolean)[1];
  const objective = id ? data.objectives.find((o) => o.id === id) : undefined;
  if (id && !objective) {
    return (
      <Screen title="Objectif introuvable" onBack={() => goBack('/objectives')}>
        <p className="text-ink-2">Cet objectif n’existe plus.</p>
      </Screen>
    );
  }
  return objective ? <ObjectiveDetail key={objective.id} data={data} objective={objective} /> : <ObjectivesList data={data} />;
}
