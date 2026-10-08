import type { ComponentType } from 'react';
import { navigate } from '../lib/router';
import { JournalIcon, SettingsIcon, TargetIcon, TodayIcon, WeekIcon } from './icons';
import { tabOf } from './tabs';

const TABS: readonly { path: string; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { path: '/', label: 'Aujourd’hui', icon: TodayIcon },
  { path: '/week', label: 'Semaine', icon: WeekIcon },
  { path: '/journal', label: 'Journal', icon: JournalIcon },
  { path: '/objectives', label: 'Objectifs', icon: TargetIcon },
  { path: '/settings', label: 'Réglages', icon: SettingsIcon },
];

export function TabBar({ path }: { path: string }) {
  const active = tabOf(path);
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-page/95 pb-[env(safe-area-inset-bottom)] backdrop-blur" aria-label="Navigation">
      <ul className="mx-auto flex max-w-xl">
        {TABS.map(({ path: tabPath, label, icon: Icon }) => {
          const selected = active === tabPath;
          return (
            <li key={tabPath} className="flex-1">
              <button
                type="button"
                aria-current={selected ? 'page' : undefined}
                onClick={() => navigate(tabPath)}
                className={`flex h-16 w-full flex-col items-center justify-center gap-0.5 text-xs font-semibold ${selected ? 'text-accent' : 'text-ink-3'}`}
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
