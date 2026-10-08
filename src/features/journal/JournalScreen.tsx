import type { AppData } from '../../db/hooks';
import { useLookups } from '../../db/lookups';
import { Screen } from '../../ui/Screen';
import { JournalView } from './JournalView';

export function JournalScreen({ data }: { data: AppData }) {
  const lookups = useLookups(data);
  return (
    <Screen title="Journal">
      <JournalView data={data} lookups={lookups} />
    </Screen>
  );
}
