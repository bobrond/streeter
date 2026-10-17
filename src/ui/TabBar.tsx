import type { ComponentType } from 'react';
import { navigate } from '../lib/router';
import { readLocal } from '../lib/storage';
import { ChartIcon, DumbbellIcon, HomeIcon, ProgramIcon } from './icons';
import { PROGRESS_PATHS, tabOf, type ProgressView, type TabKey } from './tabs';

/** Dernière vue de Progression ouverte (Skills, Volume, Historique), retrouvée en touchant l'onglet. */
export const PROGRESS_VIEW_KEY = 'streeter.progressView';

/** Dernière vue de Programmes ouverte (Programmes, Exercices). */
export const PROGRAMS_VIEW_KEY = 'streeter.programsView';

/** Adresse de la vue Exercices de Programmes. */
export const PROGRAMS_EXERCISES_PATH = '/programs?vue=exercices';

function progressPath(): string {
  const view = readLocal(PROGRESS_VIEW_KEY);
  return view && view in PROGRESS_PATHS ? PROGRESS_PATHS[view as ProgressView] : PROGRESS_PATHS.skills;
}

const TABS: readonly { key: TabKey; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { key: 'today', label: 'Aujourd’hui', icon: HomeIcon },
  { key: 'session', label: 'Séance', icon: DumbbellIcon },
  { key: 'programs', label: 'Programmes', icon: ProgramIcon },
  { key: 'progress', label: 'Progression', icon: ChartIcon },
];

/** Barre d'onglets ; l'onglet Séance rouvre la séance en cours s'il y en a une. */
export function TabBar({ path, activeSessionId }: { path: string; activeSessionId: string | null }) {
  const active = tabOf(path);
  const target = (key: TabKey): string => {
    switch (key) {
      case 'session':
        return activeSessionId ? `/session/${activeSessionId}` : '/session';
      case 'programs':
        return readLocal(PROGRAMS_VIEW_KEY) === 'exercises' ? PROGRAMS_EXERCISES_PATH : '/programs';
      case 'progress':
        return progressPath();
      default:
        return '/';
    }
  };
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bar pb-[env(safe-area-inset-bottom)]" aria-label="Navigation">
      <ul className="mx-auto flex max-w-xl">
        {TABS.map(({ key, label, icon: Icon }) => {
          const selected = active === key;
          return (
            <li key={key} className="flex-1">
              <button
                type="button"
                aria-current={selected ? 'page' : undefined}
                onClick={() => navigate(target(key))}
                className={`flex h-16 w-full flex-col items-center justify-center gap-1 text-xs font-semibold ${selected ? 'text-accent' : 'text-ink-2'}`}
              >
                <Icon className="size-6" />
                {label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
