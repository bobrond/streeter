import type { AppData } from '../../db/hooks';
import type { Band, BlockType, Element, Exercise, ID, SessionLog, SessionTemplate, SessionType } from '../../domain/types';
import type { Program } from '../../domain/volume';

export interface Lookups {
  elements: Map<ID, Element>;
  blocks: Map<ID, BlockType>;
  exercises: Map<ID, Exercise>;
  bands: Map<ID, Band>;
  templates: Map<ID, SessionTemplate>;
  sessionTypes: Map<ID, SessionType>;
  sessions: Map<ID, SessionLog>;
  program: Program;
}

function byId<T extends { id: ID }>(list: readonly T[]): Map<ID, T> {
  return new Map(list.map((x) => [x.id, x]));
}

export function buildLookups(data: AppData): Lookups {
  const blocks = byId(data.blockTypes);
  const templates = byId(data.templates);
  return {
    elements: byId(data.elements),
    blocks,
    exercises: byId(data.exercises),
    bands: byId(data.bands),
    templates,
    sessionTypes: byId(data.sessionTypes),
    sessions: byId(data.sessions),
    program: { weekPlan: data.settings.weekPlan, templates, elements: data.elements, blocks },
  };
}
