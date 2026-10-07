import type { ReactNode } from 'react';

/**
 * Mise en page d'un écran : contenu défilant, actions principales fixées en bas (zone du pouce),
 * marges de sécurité des téléphones à encoche.
 */
export function Screen({ title, subtitle, actions, children }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <header className="pb-4">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-base text-ink-2">{subtitle}</p>}
      </header>
      <main className="flex flex-1 flex-col gap-3 pb-6">{children}</main>
      {actions && (
        <footer className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-line bg-page/95 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
          {actions}
        </footer>
      )}
    </div>
  );
}
