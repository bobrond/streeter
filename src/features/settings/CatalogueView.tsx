import { MEASURE_LABEL } from '../../domain/labels';
import type { Exercise } from '../../domain/types';

export function CatalogueView({ exercises }: { exercises: Exercise[] }) {
  const categories = new Map<string, Exercise[]>();
  for (const exercise of [...exercises].sort((a, b) => a.order - b.order)) {
    if (!categories.has(exercise.category)) categories.set(exercise.category, []);
    categories.get(exercise.category)!.push(exercise);
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-ink-2">
        <span className="text-accent">⚡</span> = rapide (matin). La mesure (reps, secondes, combos) a été déduite du nom : elle sera
        modifiable dans Réglages.
      </p>
      {[...categories].map(([category, list]) => (
        <section key={category}>
          <h4 className="mb-1 text-sm font-bold tracking-wide text-ink-3 uppercase">{category}</h4>
          <ul className="divide-y divide-line rounded-xl bg-card-2">
            {list.map((exercise) => (
              <li key={exercise.id} className="flex min-h-12 items-center justify-between gap-3 px-3 py-2">
                <span>
                  {exercise.name}
                  {exercise.quick && <span className="text-accent"> ⚡</span>}
                </span>
                <span className="shrink-0 text-ink-3">{MEASURE_LABEL[exercise.measure]}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
