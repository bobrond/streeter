import type { ReactNode } from 'react';
import { BackIcon } from './icons';

/**
 * Mise en page d'un écran : contenu défilant, actions principales fixées en bas (zone du pouce),
 * au-dessus de la barre d'onglets quand elle est là (`--tabbar-h`), marges des téléphones à encoche.
 * `onBack` : écran secondaire, avec un bouton retour devant le titre.
 */
export function Screen({
  title,
  subtitle,
  aside,
  actions,
  onBack,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  aside?: ReactNode;
  actions?: ReactNode;
  onBack?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-var(--tabbar-h,0px))] max-w-xl flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <header className="flex items-start gap-3 pb-4">
        {onBack && (
          <button type="button" aria-label="Retour" onClick={onBack} className="-ml-2 flex size-12 shrink-0 items-center justify-center rounded-2xl text-ink-2 active:bg-card-2">
            <BackIcon />
          </button>
        )}
        <div className="min-w-0 flex-1 self-center">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-base text-ink-2">{subtitle}</p>}
        </div>
        {aside}
      </header>
      <main className="flex flex-1 flex-col gap-3 pb-6">{children}</main>
      {actions && (
        <footer className="sticky bottom-[var(--tabbar-h,0px)] z-20 -mx-4 flex flex-col gap-2 border-t border-line bg-page/95 px-4 pt-3 pb-[var(--footer-pad,max(1rem,env(safe-area-inset-bottom)))] backdrop-blur">
          {actions}
        </footer>
      )}
    </div>
  );
}
