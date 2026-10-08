import type { AppData } from '../../db/hooks';
import { useLookups } from '../../db/lookups';
import { localISODate } from '../../domain/cycle';
import { useNow } from '../../lib/device';
import { Screen } from '../../ui/Screen';
import { Section } from '../../ui/Section';
import { VolumeView } from './VolumeView';
import { WeekPlanView } from './WeekPlanView';

export function WeekScreen({ data }: { data: AppData }) {
  const lookups = useLookups(data);
  const today = localISODate(new Date(useNow(60_000)));
  return (
    <Screen title="Semaine">
      <Section title="Semaine type" defaultOpen>
        <WeekPlanView settings={data.settings} lookups={lookups} today={today} />
      </Section>
      <Section title="Volume hebdo">
        <VolumeView data={data} lookups={lookups} today={today} />
      </Section>
    </Screen>
  );
}
