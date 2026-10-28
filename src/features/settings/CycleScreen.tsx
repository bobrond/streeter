import { db } from '../../db/db';
import type { AppData } from '../../db/hooks';
import { updateEffectiveSettings } from '../../db/programStore';
import { dayInfo, localISODate } from '../../domain/cycle';
import { formatDateLong, seqDayLabel } from '../../domain/labels';
import { effectiveSettings, programStartDate } from '../../domain/programs';
import { sequenceIds, sequenceWeekPlan } from '../../domain/sequence';
import type { ComponentVolume, Element, Settings } from '../../domain/types';
import { componentElements } from '../../domain/volume';
import { useNow } from '../../lib/device';
import { goBack } from '../../lib/router';
import { Field, ListGroup, TextInput, Toggle } from '../../ui/form';
import { ValueStepper } from '../../ui/inputs';
import { Screen } from '../../ui/Screen';
import { Segmented } from '../../ui/Segmented';

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

/** Bornes propres d'une composante (type de travail) ; sans type de travail, les bornes par défaut. */
function ComponentVolumeRow({ element, settings, onChange }: { element: Element; settings: Settings; onChange: (next: ComponentVolume | null) => void }) {
  const own = settings.componentVolumes.find((v) => v.elementId === element.id) ?? null;
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      <Field label={element.name} hint={own ? undefined : `Bornes par défaut : ${settings.volumeMin} à ${settings.volumeMax}.`}>
        <TextInput
          value={own?.work ?? ''}
          placeholder="Type de travail (force, endurance…)"
          onChange={(work) => onChange(work.trim() ? { elementId: element.id, work, min: own?.min ?? settings.volumeMin, max: own?.max ?? settings.volumeMax } : null)}
        />
      </Field>
      {own && (
        <div className="grid grid-cols-2 gap-2">
          <NumberSetting label="Min" unit="séries" value={own.min} min={0} max={own.max} onChange={(v) => onChange({ ...own, min: v })} />
          <NumberSetting label="Max" unit="séries" value={own.max} min={own.min} max={50} onChange={(v) => onChange({ ...own, max: v })} />
        </div>
      )}
    </div>
  );
}

/** Réglages du programme affiché (`programId`, le programme en cours par défaut) ; la séquence est commune. */
export function CycleScreen({ data, programId }: { data: AppData; programId: string | null }) {
  const program = data.programs.find((p) => p.id === programId) ?? data.program;
  const settings = effectiveSettings(data.appSettings, program);
  const today = localISODate(new Date(useNow(60_000)));
  const info = dayInfo(today, data.settings);
  const save = (patch: Partial<Omit<Settings, 'id'>>) => void updateEffectiveSettings(db, program.id, patch);
  const sequence = settings.schedule === 'sequence';
  const period = sequence ? 'tranche' : 'semaine';
  const setVolume = (elementId: string, next: ComponentVolume | null) =>
    save({ componentVolumes: [...settings.componentVolumes.filter((v) => v.elementId !== elementId), ...(next ? [next] : [])] });
  // Changer de déroulé : les soirs de la semaine type deviennent la séquence (dans l'ordre J1…J7) et ses matins les
  // matins disponibles, ou l'inverse. Le programme garde sa date de début (le J1 de sa semaine en semaine type).
  const switchSchedule = (to: 'week' | 'sequence') => {
    const plan = sequenceWeekPlan(sequenceIds(settings.weekPlan, 'evening'), sequenceIds(settings.weekPlan, 'morning'));
    save(to === 'sequence' ? { schedule: 'sequence', startDate: programStartDate(data.appSettings, program), weekPlan: plan } : { schedule: 'week', startDate: null });
  };
  return (
    <Screen title="Cycle, volume et durées" subtitle={program.name} onBack={() => goBack('/settings')}>
      <ListGroup title="Séquence (tous les programmes)">
        <div className="flex flex-col gap-4 p-4">
          <Field
            label="Début de la semaine 1 (un J1)"
            hint={
              info.beforeStart
                ? `Le premier programme commencera le ${formatDateLong(settings.cycleStartDate)}.`
                : `J1 = ${WEEKDAY.format(new Date(`${settings.cycleStartDate}T12:00:00`))} · aujourd’hui : ${seqDayLabel(info.seqDay)}, semaine ${info.week} (cycle ${info.cycle}, S${info.cycleWeek}). Déplacer cette date déplace aussi le début de chaque programme.`
            }
          >
            <TextInput type="date" value={settings.cycleStartDate} onChange={(v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && save({ cycleStartDate: v })} />
          </Field>
        </div>
      </ListGroup>

      <ListGroup title={`Déroulé de « ${program.name} »`}>
        <div className="flex flex-col gap-3 p-4">
          <Segmented
            label="Déroulé"
            options={[
              { value: 'sequence', label: 'Séquence de séances' },
              { value: 'week', label: 'Semaine type J1-J7' },
            ]}
            value={settings.schedule}
            onChange={(v) => v !== settings.schedule && switchSchedule(v)}
          />
          <p className="text-sm text-ink-2">
            {sequence
              ? 'Les séances du soir se font dans l’ordre, quel que soit le jour ; une séance ratée se fait à la reprise. Les matins sont hors séquence. Volume et allégement comptent par tranche.'
              : 'Chaque séance a son jour (J1 à J7) ; un jour raté est perdu, sauf décalage de la séquence.'}
          </p>
        </div>
      </ListGroup>

      <ListGroup title={`Cycle de « ${program.name} »`}>
        <div className="flex flex-col gap-4 p-4">
          <p className="text-ink-2">Commence le {formatDateLong(programStartDate(data.appSettings, program))}, en {sequence ? 'T1' : 'S1'} de son cycle.</p>
          <NumberSetting
            label="Durée du cycle"
            unit={sequence ? 'tranches' : 'semaines'}
            value={settings.cycleLengthWeeks}
            min={1}
            max={12}
            onChange={(v) => save({ cycleLengthWeeks: v, deloadWeek: Math.min(settings.deloadWeek, v) })}
          />
          <NumberSetting
            label={sequence ? 'Tranche allégée' : 'Semaine allégée'}
            hint={`Numéro de la ${period} du cycle (0 : pas de ${period} allégée).`}
            unit={`/ ${settings.cycleLengthWeeks}`}
            value={settings.deloadWeek}
            min={0}
            max={settings.cycleLengthWeeks}
            onChange={(v) => save({ deloadWeek: v })}
          />
        </div>
      </ListGroup>

      <ListGroup title={sequence ? 'Tranche allégée' : 'Semaine allégée'}>
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
          <Toggle label="Masquer les matins" description={`Les séances du matin ne sont pas proposées en ${period} allégée.`} checked={settings.hideMorningsInDeload} onChange={(v) => save({ hideMorningsInDeload: v })} />
        </div>
      </ListGroup>

      <ListGroup title="Volume des composantes">
        <div className="flex flex-col gap-4 p-4">
          <NumberSetting
            label={`Minimum par ${period}`}
            hint="Garanti par les séances du soir à elles seules ; bornes par défaut."
            unit="séries"
            value={settings.volumeMin}
            min={0}
            max={settings.volumeMax}
            onChange={(v) => save({ volumeMin: v })}
          />
          <NumberSetting label={`Maximum par ${period}`} hint="Soir + matins, optionnels compris." unit="séries" value={settings.volumeMax} min={settings.volumeMin} max={50} onChange={(v) => save({ volumeMax: v })} />
          <p className="text-sm text-ink-2">Type de travail d’une composante : ses propres bornes pour ce programme (endurance 8-10, force 4-6…).</p>
          {componentElements(data.elements).map((element) => (
            <ComponentVolumeRow key={element.id} element={element} settings={settings} onChange={(next) => setVolume(element.id, next)} />
          ))}
        </div>
      </ListGroup>

      <ListGroup title="Durée des matins">
        <div className="flex flex-col gap-4 p-4">
          <NumberSetting label="Durée maximum" unit="min" value={settings.morningMaxMinutes} min={5} max={120} step={5} onChange={(v) => save({ morningMaxMinutes: v })} />
          <NumberSetting
            label="Temps de travail par série (général)"
            hint="Pour les exercices sans temps propre (fiche exercice › Plus d’options). Durée estimée : séries × (travail + repos prescrit)."
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
