import { navigate } from '../../lib/router';
import { writeLocal } from '../../lib/storage';
import { SettingsIcon } from '../../ui/icons';
import { Segmented } from '../../ui/Segmented';
import { PROGRAMS_EXERCISES_PATH, PROGRAMS_VIEW_KEY } from '../../ui/TabBar';

export type ProgramsView = 'programs' | 'exercises';

/** Roue crantée des réglages, en haut à droite de l'onglet Programmes. */
export function SettingsButton() {
  return (
    <button type="button" aria-label="Réglages" onClick={() => navigate('/settings')} className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-line text-ink-2 active:bg-card-2">
      <SettingsIcon className="size-6" />
    </button>
  );
}

/** Vues de l'onglet Programmes ; la dernière ouverte est retrouvée au prochain passage par l'onglet. */
export function ProgramsNav({ current }: { current: ProgramsView }) {
  return (
    <Segmented
      label="Vues des programmes"
      options={[
        { value: 'programs', label: 'Programmes' },
        { value: 'exercises', label: 'Exercices' },
      ]}
      value={current}
      onChange={(view) => {
        writeLocal(PROGRAMS_VIEW_KEY, view);
        navigate(view === 'exercises' ? PROGRAMS_EXERCISES_PATH : '/programs', { replace: true });
      }}
    />
  );
}
