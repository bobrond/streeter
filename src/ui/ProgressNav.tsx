import { navigate } from '../lib/router';
import { writeLocal } from '../lib/storage';
import { Segmented } from './Segmented';
import { PROGRESS_VIEW_KEY } from './TabBar';
import { PROGRESS_PATHS, type ProgressView } from './tabs';

const VIEWS: readonly { value: ProgressView; label: string }[] = [
  { value: 'skills', label: 'Skills' },
  { value: 'volume', label: 'Volume' },
  { value: 'history', label: 'Historique' },
];

/** Vues de l'onglet Progression ; la dernière ouverte est retrouvée au prochain passage par l'onglet. */
export function ProgressNav({ current }: { current: ProgressView }) {
  return (
    <Segmented
      label="Vues de la progression"
      options={VIEWS}
      value={current}
      onChange={(view) => {
        writeLocal(PROGRESS_VIEW_KEY, view);
        navigate(PROGRESS_PATHS[view], { replace: true });
      }}
    />
  );
}
