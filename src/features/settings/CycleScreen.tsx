import { db } from '../../db/db';
import type { AppData } from '../../db/hooks';
import { updateSettings } from '../../db/programStore';
import { dayInfo, localISODate } from '../../domain/cycle';
import { formatDateLong, seqDayLabel } from '../../domain/labels';
import type { Settings } from '../../domain/types';
import { useNow } from '../../lib/device';
import { goBack } from '../../lib/router';
import { Field, ListGroup, TextInput, Toggle } from '../../ui/form';
import { ValueStepper } from '../../ui/inputs';
import { Screen } from '../../ui/Screen';

const WEEKDAY = new Intl.DateTimeFormat('fr-FR', { weekday: 'long' });

function NumberSetting({
  label,
  hint,
  value,
  unit,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  unit?: string;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <Field label={label} hint={hint}>
      <ValueStepper
        size="md"
        value={value}
        unit={unit}
        min={min}
        step={step}
        onChange={(v) => {
          if (v === null) return;
          onChange(Math.min(max, Math.max(min, Math.round(v))));
        }}
      />
    </Field>
  );
}

export function CycleScreen({ data }: { data: AppData }) {
  const { settings } = data;
  const today = localISODate(new Date(useNow(60_000)));
  const info = dayInfo(today, settings);
  const save = (patch: Partial<Omit<Settings, 'id'>>) => void updateSettings(db, patch);
  return (
    <Screen title="Cycle, volume et durées" onBack={() => goBack('/settings')}>
      <ListGroup title="Calendrier">
        <div className="flex flex-col gap-4 p-4">
          <Field
            label="Date de début (un J1)"
            hint={
              info.beforeStart
                ? `Le programme commencera le ${formatDateLong(settings.cycleStartDate)}.`
                : `J1 = ${WEEKDAY.format(new Date(`${settings.cycleStartDate}T12:00:00`))} · aujourd’hui : ${seqDayLabel(info.seqDay)}, semaine ${info.week} (cycle ${info.cycle}, S${info.cycleWeek}).`
            }
          >
            <TextInput type="date" value={settings.cycleStartDate} onChange={(v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && save({ cycleStartDate: v })} />
          </Field>
          <NumberSetting
            label="Durée du cycle"
            unit="semaines"
            value={settings.cycleLengthWeeks}
            min={1}
            max={12}
            onChange={(v) => save({ cycleLengthWeeks: v, deloadWeek: Math.min(settings.deloadWeek, v) })}
          />
          <NumberSetting
            label="Semaine allégée"
            hint="Numéro de la semaine du cycle (0 : pas de semaine allégée)."
            unit={`/ ${settings.cycleLengthWeeks}`}
            value={settings.deloadWeek}
            min={0}
            max={settings.cycleLengthWeeks}
            onChange={(v) => save({ deloadWeek: v })}
          />
        </div>
      </ListGroup>

      <ListGroup title="Semaine allégée">
        <div className="flex flex-col gap-4 p-4">
          <NumberSetting
            label="Réduction des séries du soir"
            hint="Appliquée au min et au max de chaque ligne, arrondie, jamais sous 1 série. L’échauffement n’est pas réduit (réglage par bloc)."
            unit="%"
            value={settings.deloadReductionPct}
            min={0}
            max={90}
            step={5}
            onChange={(v) => save({ deloadReductionPct: v })}
          />
          <Toggle label="Masquer les matins" description="Les séances du matin ne sont pas proposées en semaine allégée." checked={settings.hideMorningsInDeload} onChange={(v) => save({ hideMorningsInDeload: v })} />
        </div>
      </ListGroup>

      <ListGroup title="Volume des composantes">
        <div className="flex flex-col gap-4 p-4">
          <NumberSetting
            label="Minimum par semaine"
            hint="Garanti par les séances du soir à elles seules."
            unit="séries"
            value={settings.volumeMin}
            min={0}
            max={settings.volumeMax}
            onChange={(v) => save({ volumeMin: v })}
          />
          <NumberSetting label="Maximum par semaine" hint="Soir + matins, optionnels compris." unit="séries" value={settings.volumeMax} min={settings.volumeMin} max={50} onChange={(v) => save({ volumeMax: v })} />
        </div>
      </ListGroup>

      <ListGroup title="Durée des matins">
        <div className="flex flex-col gap-4 p-4">
          <NumberSetting label="Durée maximum" unit="min" value={settings.morningMaxMinutes} min={5} max={120} step={5} onChange={(v) => save({ morningMaxMinutes: v })} />
          <NumberSetting
            label="Temps de travail moyen par série"
            hint="Sert à estimer la durée : séries × (travail + repos prescrit)."
            unit="s"
            value={settings.avgWorkSecPerSet}
            min={5}
            max={300}
            step={5}
            onChange={(v) => save({ avgWorkSecPerSet: v })}
          />
          <NumberSetting label="Repos « Libre » compté" unit="s" value={settings.freeRestSec} min={0} max={300} step={5} onChange={(v) => save({ freeRestSec: v })} />
        </div>
      </ListGroup>
    </Screen>
  );
}
