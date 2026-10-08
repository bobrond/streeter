import type { AppData } from '../../db/hooks';
import { useLookups } from '../../db/lookups';
import { Screen } from '../../ui/Screen';
import { ObjectivesView } from './ObjectivesView';

export function ObjectivesScreen({ data }: { data: AppData }) {
  const lookups = useLookups(data);
  return (
    <Screen title="Objectifs">
      <ObjectivesView data={data} lookups={lookups} />
    </Screen>
  );
}
