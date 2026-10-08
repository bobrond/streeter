import { useState } from 'react';
import type { AppData } from '../../db/hooks';
import { MEASURE_LABEL } from '../../domain/labels';
import { fold } from '../../domain/text';
import type { Exercise } from '../../domain/types';
import { goBack, navigate } from '../../lib/router';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { ListGroup, ListRow, TextInput } from '../../ui/form';
import { PlusIcon } from '../../ui/icons';
import { Screen } from '../../ui/Screen';

export function ExercisesScreen({ data }: { data: AppData }) {
  const [query, setQuery] = useState('');
  const q = fold(query);
  const categories = new Map<string, Exercise[]>();
  for (const exercise of data.exercises) {
    if (q && !fold(`${exercise.name} ${exercise.category} ${exercise.aliases.join(' ')}`).includes(q)) continue;
    if (!categories.has(exercise.category)) categories.set(exercise.category, []);
    categories.get(exercise.category)!.push(exercise);
  }
  return (
    <Screen
      title="Exercices"
      subtitle="⚡ = rapide (mis en avant le matin)"
      onBack={() => goBack('/settings')}
      actions={
        <Button onClick={() => navigate('/settings/exercises/new')}>
          <PlusIcon /> Nouvel exercice
        </Button>
      }
    >
      <TextInput value={query} onChange={setQuery} placeholder="Rechercher" />
      {[...categories].map(([category, list]) => (
        <ListGroup key={category} title={category || 'Sans catégorie'}>
          {list.map((exercise) => (
            <ListRow
              key={exercise.id}
              title={
                <>
                  {exercise.name}
                  {exercise.quick && <span className="text-accent"> ⚡</span>}
                </>
              }
              subtitle={MEASURE_LABEL[exercise.measure]}
              aside={exercise.active ? undefined : <Badge>désactivé</Badge>}
              onClick={() => navigate(`/settings/exercises/${exercise.id}`)}
            />
          ))}
        </ListGroup>
      ))}
      {categories.size === 0 && <p className="text-ink-2">Aucun exercice trouvé.</p>}
    </Screen>
  );
}
