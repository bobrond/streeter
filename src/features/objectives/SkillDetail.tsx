// Fiche d'un skill (Progression › Skills) : ses objectifs, la courbe d'un de ses exercices (une courbe par
// élastique, cible de l'objectif lié en pointillés) et les records par élastique de tous ses exercices.
import { useMemo } from 'react';
import type { AppData } from '../../db/hooks';
import { useLookups } from '../../db/lookups';
import { UNIT_SHORT, formatDateShort, formatValue } from '../../domain/labels';
import { objectivesBySkill, skillRecords } from '../../domain/skills';
import type { Element, TargetUnit } from '../../domain/types';
import { goBack, navigate, queryParam } from '../../lib/router';
import { NextIcon } from '../../ui/icons';
import { LineChart } from '../../ui/LineChart';
import { Screen } from '../../ui/Screen';
import { chipClass } from '../../ui/styles';
import { BandLadder } from './BandLadder';
import { bandSeries } from './bandSeries';
import { ObjectiveCard } from './ObjectiveCard';

const SECTION_TITLE = 'px-1 text-sm font-bold tracking-wide text-ink-3 uppercase';

export function SkillDetail({ data, skill, path }: { data: AppData; skill: Element; path: string }) {
  const lookups = useLookups(data);
  const objectives = useMemo(
    () => objectivesBySkill(data.objectives, lookups.exercises, [skill]).bySkill.get(skill.id) ?? [],
    [data.objectives, lookups.exercises, skill],
  );
  const rows = useMemo(
    () => skillRecords(skill.id, data.exercises, data.sets, lookups.sessions, objectives),
    [skill.id, data.exercises, data.sets, lookups.sessions, objectives],
  );
  const chosenId = queryParam(path, 'exercice');
  const selected = rows.find((r) => r.exercise.id === chosenId) ?? rows[0];
  const selectedId = selected?.exercise.id ?? null;
  const unit = selected?.exercise.measure as TargetUnit | undefined;
  const series = useMemo(
    () => (selectedId ? bandSeries(selectedId, data.sets, lookups.sessions, lookups.bands) : []),
    [selectedId, data.sets, lookups.sessions, lookups.bands],
  );
  const linked = objectives.find((o) => o.exerciseId === selectedId && o.unit === unit);
  const target = useMemo(
    () => (linked ? { value: linked.target, label: `objectif ${formatValue(linked.target, linked.unit)}` } : undefined),
    [linked],
  );

  return (
    <Screen title={skill.name} subtitle="Objectifs, records et courbes" onBack={() => goBack('/objectives')}>
      <section className="flex flex-col gap-2">
        <h2 className={SECTION_TITLE}>Objectifs</h2>
        {objectives.map((objective) => (
          <ObjectiveCard key={objective.id} objective={objective} data={data} lookups={lookups} />
        ))}
        {objectives.length === 0 && <p className="px-1 text-ink-2">Aucun objectif lié à un exercice de ce skill.</p>}
      </section>

      {selected && unit && (
        <section className="rounded-2xl border border-line bg-card p-3">
          <h2 className="text-lg font-semibold">Courbes</h2>
          <p className="text-sm text-ink-2">Meilleure série par séance, une courbe par élastique ; séries dégradées et d’échauffement exclues.</p>
          <div className="my-3 flex flex-wrap gap-2" role="group" aria-label="Exercice affiché">
            {rows.map((row) => (
              <button
                key={row.exercise.id}
                type="button"
                aria-pressed={row === selected}
                onClick={() => navigate(`/objectives/skill/${skill.id}?exercice=${row.exercise.id}`, { replace: true })}
                className={chipClass(row === selected, 'text-left', 'text-sm', 'min-h-11')}
              >
                {row.exercise.name}
              </button>
            ))}
          </div>
          <LineChart series={series} unit={UNIT_SHORT[unit]} target={target} ariaLabel={`Progression sur ${selected.exercise.name}`} />
        </section>
      )}

      <section className="flex flex-col gap-1.5">
        <h2 className={SECTION_TITLE}>Records par élastique</h2>
        <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
          {rows.map((row) => (
            <button
              key={row.exercise.id}
              type="button"
              onClick={() => navigate(`/journal/exercise/${row.exercise.id}`)}
              className="flex w-full flex-col gap-2 px-4 py-3 text-left active:bg-card-2"
            >
              <span className="flex items-center gap-2">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{row.exercise.name}</span>
                  <span className="block text-sm text-ink-3">dernière fois le {formatDateShort(row.lastDate)}</span>
                </span>
                <NextIcon className="size-5 shrink-0 text-ink-3" />
              </span>
              <BandLadder records={row.records} bands={data.bands} unit={row.exercise.measure as TargetUnit} dates />
            </button>
          ))}
          {rows.length === 0 && <p className="p-4 text-ink-2">Pas encore de série enregistrée sur ce skill.</p>}
        </div>
        <p className="px-1 text-sm text-ink-3">Record : pour chaque élastique, la meilleure série non dégradée, hors échauffement.</p>
      </section>
    </Screen>
  );
}
