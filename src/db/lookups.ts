import { useMemo } from 'react';
import type { Band, BlockType, Element, Exercise, ID, Objective, SessionLog, SessionTemplate, SessionType } from '../domain/types';
import type { PlanContext } from '../domain/volume';
import type { AppData } from './hooks';

/** Index par identifiant des données de l'appli. */
export interface Lookups {
  elements: Map<ID, Element>;
  blocks: Map<ID, BlockType>;
  exercises: Map<ID, Exercise>;
  bands: Map<ID, Band>;
  templates: Map<ID, SessionTemplate>;
  sessionTypes: Map<ID, SessionType>;
  sessions: Map<ID, SessionLog>;
  objectives: Map<ID, Objective>;
  program: PlanContext;
}

function byId<T extends { id: ID }>(list: readonly T[]): Map<ID, T> {
  return new Map(list.map((x) => [x.id, x]));
}

export function buildLookups(data: AppData): Lookups {
  const blocks = byId(data.blockTypes);
  const templates = byId(data.templates);
  const exercises = byId(data.exercises);
  return {
    elements: byId(data.elements),
    blocks,
    exercises,
    bands: byId(data.bands),
    templates,
    sessionTypes: byId(data.sessionTypes),
    sessions: byId(data.sessions),
    objectives: byId(data.objectives),
    program: { weekPlan: data.settings.weekPlan, templates, elements: data.elements, blocks, exercises, sequence: data.settings.schedule === 'sequence' },
  };
}

export function useLookups(data: AppData): Lookups {
  return useMemo(() => buildLookups(data), [data]);
}
