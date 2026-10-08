import { formatIntensity, formatRest, formatSets, formatTarget } from '../../domain/labels';
import type { PrescriptionItem, SessionTemplate } from '../../domain/types';
import { Badge } from '../../ui/Badge';
import type { Lookups } from '../../db/lookups';

function ItemCard({ item, lookups }: { item: PrescriptionItem; lookups: Lookups }) {
  const element = lookups.elements.get(item.elementId);
  const candidates = item.candidateExerciseIds.map((id) => lookups.exercises.get(id)).filter((e) => e !== undefined);
  const details = [
    item.targets.length > 0 ? item.targets.map(formatTarget).join(' ou ') : item.targetText,
    item.intensity ? formatIntensity(item.intensity) : item.intensityText,
    `repos ${formatRest(item.restMinSec, item.restMaxSec)}`,
  ].filter((d) => d && d !== '—');
  return (
    <div className="rounded-xl border border-line bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="text-lg font-semibold">{element?.name ?? '?'}</span>
        <span className="shrink-0 text-lg font-semibold tabular-nums">
          {formatSets(item.setsMin, item.setsMax)} <span className="text-base font-normal text-ink-2">séries</span>
        </span>
      </div>
      <div className="mt-0.5 text-ink-2">{details.join(' · ')}</div>
      {(item.optional || item.superset) && (
        <div className="mt-2 flex gap-2">
          {item.optional && <Badge>optionnel</Badge>}
          {item.superset && <Badge tone="accent">superset</Badge>}
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {candidates.map((exercise) => (
          <span key={exercise.id} className="rounded-full border border-line px-3 py-1 text-ink">
            {exercise.name}
            {exercise.quick && <span className="text-accent"> ⚡</span>}
          </span>
        ))}
        {candidates.length === 0 && <span className="text-danger">Aucun exercice candidat</span>}
      </div>
      {item.notes && <p className="mt-2 text-ink-3">{item.notes}</p>}
    </div>
  );
}

/** Lignes d'un modèle, groupées par bloc dans leur ordre. */
export function TemplateItems({ template, lookups }: { template: SessionTemplate; lookups: Lookups }) {
  const groups: { blockId: string; items: PrescriptionItem[] }[] = [];
  for (const item of template.items) {
    const last = groups.at(-1);
    if (last && last.blockId === item.blockTypeId) last.items.push(item);
    else groups.push({ blockId: item.blockTypeId, items: [item] });
  }
  return (
    <div className="flex flex-col gap-4">
      {groups.map((group, i) => {
        const block = lookups.blocks.get(group.blockId);
        return (
          <section key={`${group.blockId}-${i}`} className="flex flex-col gap-2">
            <h4 className="text-sm text-ink-3">
              <span className="font-bold tracking-wide uppercase">{block?.name ?? '?'}</span>
              {block?.alternateSkills && <span> · planche et FL en alternance</span>}
            </h4>
            {group.items.map((item) => (
              <ItemCard key={item.id} item={item} lookups={lookups} />
            ))}
          </section>
        );
      })}
    </div>
  );
}
