import { useEffect, useSyncExternalStore } from 'react';
import { CloseIcon } from './icons';
import { currentToast, dismissToast, subscribeToast } from './toastStore';

/** Affiche les messages brefs ; en haut de l'écran en séance, pour ne pas cacher « Valider ». */
export function ToastHost({ position = 'bottom' }: { position?: 'top' | 'bottom' }) {
  const toast = useSyncExternalStore(subscribeToast, currentToast);
  useEffect(() => {
    if (!toast || toast.sticky) return;
    const id = window.setTimeout(() => dismissToast(toast.id), toast.action ? 8000 : 4000);
    return () => window.clearTimeout(id);
  }, [toast]);
  if (!toast) return null;
  const place = position === 'top' ? 'top-[calc(env(safe-area-inset-top)+4rem)]' : 'bottom-[calc(var(--tabbar-h,0px)+1rem)]';
  return (
    <div className={`pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4 ${place}`} role="status">
      <div
        className={`pointer-events-auto flex min-h-14 w-full max-w-xl items-center gap-2 rounded-2xl border py-1.5 pr-1.5 pl-4 shadow-lg shadow-black ${toast.tone === 'error' ? 'border-danger/60 bg-[#2a1214] text-danger' : 'border-line bg-card-2 text-ink'}`}
      >
        <span className="flex-1 text-base">{toast.message}</span>
        {toast.action && (
          <button
            type="button"
            className="min-h-12 shrink-0 rounded-xl px-3 font-semibold text-accent active:bg-card"
            onClick={() => {
              toast.action!.run();
              dismissToast(toast.id);
            }}
          >
            {toast.action.label}
          </button>
        )}
        {toast.sticky && (
          <button
            type="button"
            aria-label="Fermer"
            className="flex size-12 shrink-0 items-center justify-center rounded-xl text-ink-3 active:bg-card"
            onClick={() => dismissToast(toast.id)}
          >
            <CloseIcon className="size-5" />
          </button>
        )}
      </div>
    </div>
  );
}
