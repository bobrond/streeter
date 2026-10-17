import { useMemo, useState } from 'react';
import type { AppData } from '../../db/hooks';
import { useLookups } from '../../db/lookups';
import { UNIT_SHORT, formatDateShort, formatValue } from '../../domain/labels';
import { bandRecords, objectiveState } from '../../domain/objectives';
import type { Objective, ObjectiveTest } from '../../domain/types';
import { goBack, matchRoute, navigate } from '../../lib/router';
import { Button } from '../../ui/Button';
import { LineChart, type ChartSeries } from '../../ui/LineChart';
import { Screen } from '../../ui/Screen';
import { BandLadder } from './BandLadder';
import { Meter, ObjectiveStatusBadge } from './ObjectiveCard';
import { ObjectiveSheet, TestSheet } from './ObjectiveSheets';
import { SkillDetail } from './SkillDetail';
import { SkillsView } from './SkillsView';

function ObjectiveDetail({ data, objective }: { data: AppData; objective: Objective }) {
  const lookups = useLookups(data);
  const [testing, setTesting] = useState<ObjectiveTest | 'new' | null>(null);
  const [editing, setEditing] = useState(false);
  const state = objectiveState(objective);
  const exercise = objective.exerciseId ? lookups.exercises.get(objective.exerciseId) : undefined;
  const records = useMemo(() => (exercise ? bandRecords(exercise.id, data.sets, lookups.sessions) : null), [exercise, data.sets, lookups.sessions]);
  const perf = records?.get(null) ?? null;
  const tests = [...objective.tests].sort((a, b) => b.date.localeCompare(a.date));
  const series = useMemo(
    (): ChartSeries[] => [
      {
        id: 'tests',
        label: 'tests',
        color: '#ff6a36',
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
            <ObjectiveStatusBadge status={state.status} />
          </div>
        </div>
        <div className="rounded-2xl bg-card p-3">
          <div className="text-sm text-ink-2">Meilleur test</div>
          <div className="text-3xl font-bold">{state.best ? formatValue(state.best.value, objective.unit) : '—'}</div>
          <div className="text-sm text-ink-3">
            {state.best ? (
              <>
                le {formatDateShort(state.best.date)}
                {state.gap !== null && state.gap > 0 && <span className="whitespace-nowrap"> · écart {formatValue(state.gap, objective.unit)}</span>}
              </>
            ) : (
              'pas encore testé'
            )}
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
          {records && [...records.keys()].some((id) => id !== null) && (
            <div className="mt-3">
              <BandLadder records={records} bands={data.bands} unit={objective.unit} dates />
            </div>
          )}
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

/** Progression › Skills : #/objectives, #/objectives/skill/:id (fiche d'un skill) et #/objectives/:id (objectif). */
export function ObjectivesScreen({ data, path }: { data: AppData; path: string }) {
  const skillRoute = matchRoute('/objectives/skill/:id', path);
  if (skillRoute) {
    const skill = data.elements.find((e) => e.id === skillRoute.id && e.kind === 'skill');
    if (!skill) {
      return (
        <Screen title="Skill introuvable" onBack={() => goBack('/objectives')}>
          <p className="text-ink-2">Ce skill n’existe plus.</p>
        </Screen>
      );
    }
    return <SkillDetail key={skill.id} data={data} skill={skill} path={path} />;
  }
  const id = path.split('?')[0].split('/').filter(Boolean)[1];
  const objective = id ? data.objectives.find((o) => o.id === id) : undefined;
  if (id && !objective) {
    return (
      <Screen title="Objectif introuvable" onBack={() => goBack('/objectives')}>
        <p className="text-ink-2">Cet objectif n’existe plus.</p>
      </Screen>
    );
  }
  return objective ? <ObjectiveDetail key={objective.id} data={data} objective={objective} /> : <SkillsView data={data} />;
}
