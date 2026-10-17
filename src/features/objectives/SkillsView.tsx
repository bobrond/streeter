// Progression › Skills : une carte par skill (objectifs, records par élastique), puis les objectifs hors skill.
import { useMemo, useState } from 'react';
import type { AppData } from '../../db/hooks';
import { useLookups, type Lookups } from '../../db/lookups';
import { firstTestSeqDay, localISODate, nextObjectiveTestDate } from '../../domain/cycle';
import { formatDateLong } from '../../domain/labels';
import { bestSessionPerformance } from '../../domain/objectives';
import { objectivesBySkill, skillRecords } from '../../domain/skills';
import type { Element, Objective, TargetUnit } from '../../domain/types';
import { useNow } from '../../lib/device';
import { navigate } from '../../lib/router';
import { NextIcon, PlusIcon } from '../../ui/icons';
import { ProgressNav } from '../../ui/ProgressNav';
import { Screen } from '../../ui/Screen';
import { BandLadder } from './BandLadder';
import { ObjectiveCard, ObjectiveSummary } from './ObjectiveCard';
import { ObjectiveSheet } from './ObjectiveSheets';

/** Exercices dont les records figurent sur la carte ; les autres sont dans la fiche du skill. */
const CARD_RECORDS = 2;

function SkillCard({ skill, objectives, data, lookups }: { skill: Element; objectives: Objective[]; data: AppData; lookups: Lookups }) {
  const rows = useMemo(
    () => skillRecords(skill.id, data.exercises, data.sets, lookups.sessions, objectives),
    [skill.id, data.exercises, data.sets, lookups.sessions, objectives],
  );
  const shown = rows.slice(0, CARD_RECORDS);
  const more = rows.length - shown.length;
  return (
    <button
      type="button"
      onClick={() => navigate(`/objectives/skill/${skill.id}`)}
      className="flex flex-col gap-4 rounded-2xl border border-line bg-card p-4 text-left active:scale-[0.99]"
    >
      <span className="flex items-center justify-between gap-2">
        <span className="font-display text-3xl leading-none tracking-wide">{skill.name}</span>
        <NextIcon className="size-6 shrink-0 text-ink-3" />
      </span>
      {objectives.map((objective) => (
        <ObjectiveSummary
          key={objective.id}
          objective={objective}
          perf={objective.exerciseId ? bestSessionPerformance(objective.exerciseId, data.sets, lookups.sessions) : null}
        />
      ))}
      <span className="flex flex-col gap-3 border-t border-line pt-3">
        <span className="text-sm font-bold tracking-wide text-ink-3 uppercase">Records par élastique</span>
        {shown.map((row) => (
          <span key={row.exercise.id} className="flex flex-col gap-1.5">
            <span className="font-semibold">{row.exercise.name}</span>
            <BandLadder records={row.records} bands={data.bands} unit={row.exercise.measure as TargetUnit} />
          </span>
        ))}
        {rows.length === 0 && <span className="text-ink-2">Pas encore de série enregistrée.</span>}
        <span className="font-semibold text-action">
          {more > 0 ? `Courbes et ${more} autre${more > 1 ? 's' : ''} exercice${more > 1 ? 's' : ''}` : 'Courbes et détails'}
        </span>
      </span>
    </button>
  );
}

/** Prochain test des objectifs (début de cycle, premier jour Max). */
function NextTest({ data, lookups, today }: { data: AppData; lookups: Lookups; today: string }) {
  const next = nextObjectiveTestDate(today, data.settings, firstTestSeqDay(data.settings.weekPlan, lookups.templates, lookups.sessionTypes));
  if (!next) return null;
  if (next.date === today) {
    return (
      <p className="rounded-2xl border border-warn/70 bg-warn/10 px-4 py-3 font-semibold text-warn">
        Jour de test des objectifs : touche un skill, puis l’objectif, pour noter le résultat.
      </p>
    );
  }
  return (
    <p className="text-ink-2">
      Prochain test des objectifs : <b className="text-ink">{formatDateLong(next.date)}</b> (semaine {next.week}).
    </p>
  );
}

export function SkillsView({ data }: { data: AppData }) {
  const lookups = useLookups(data);
  const today = localISODate(new Date(useNow(60_000)));
  const [creating, setCreating] = useState(false);
  const skills = useMemo(() => data.elements.filter((e) => e.kind === 'skill'), [data.elements]);
  const { bySkill, others } = useMemo(() => objectivesBySkill(data.objectives, lookups.exercises, skills), [data.objectives, lookups.exercises, skills]);

  return (
    <Screen title="Progression" nav={<ProgressNav current="skills" />}>
      <NextTest data={data} lookups={lookups} today={today} />
      {skills.map((skill) => (
        <SkillCard key={skill.id} skill={skill} objectives={bySkill.get(skill.id) ?? []} data={data} lookups={lookups} />
      ))}
      {skills.length === 0 && <p className="text-ink-2">Aucun skill : ajoute un élément de nature « skill » dans les réglages.</p>}
      {others.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-sm font-bold tracking-wide text-ink-3 uppercase">Autres objectifs</h2>
          {others.map((objective) => (
            <ObjectiveCard key={objective.id} objective={objective} data={data} lookups={lookups} />
          ))}
        </section>
      )}
      <button
        type="button"
        onClick={() => setCreating(true)}
        className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-dashed border-line font-semibold text-ink active:bg-card-2"
      >
        <PlusIcon /> Nouvel objectif
      </button>
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
