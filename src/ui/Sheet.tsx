import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { pushBackEntry, removeBackEntry } from '../lib/backStack';
import { CloseIcon } from './icons';

/**
 * Feuille modale qui monte du bas de l'écran (zone du pouce).
 * Le bouton « retour » d'Android la ferme au lieu de quitter l'écran.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const entry = pushBackEntry(() => onCloseRef.current());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      removeBackEntry(entry);
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-40 flex flex-col justify-end" role="dialog" aria-modal="true">
      <button type="button" aria-label="Fermer" className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative mx-auto flex max-h-[88dvh] w-full max-w-xl flex-col rounded-t-3xl border-t border-line bg-card">
        <header className="flex min-h-16 items-center gap-2 border-b border-line py-2 pr-2 pl-5">
          <h2 className="flex-1 text-xl font-bold">{title}</h2>
          <button type="button" aria-label="Fermer" onClick={onClose} className="flex size-12 items-center justify-center rounded-full text-ink-2 active:bg-card-2">
            <CloseIcon />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex flex-col gap-2 border-t border-line px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</footer>
        )}
        {!footer && <div className="pb-[env(safe-area-inset-bottom)]" />}
      </div>
    </div>,
    document.body,
  );
}

/** Demande de confirmation. */
export function ConfirmSheet({
  open,
  title,
  message,
  confirmLabel,
  danger = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: ReactNode;
  message?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button
            type="button"
            className={`min-h-14 rounded-2xl px-5 text-lg font-semibold active:scale-[0.98] ${danger ? 'border border-danger/60 bg-card-2 text-danger' : 'bg-accent text-accent-ink'}`}
            onClick={() => {
              onClose();
              onConfirm();
            }}
          >
            {confirmLabel}
          </button>
          <button type="button" className="min-h-14 rounded-2xl border border-line bg-card-2 px-5 text-lg font-semibold active:scale-[0.98]" onClick={onClose}>
            Annuler
          </button>
        </>
      }
    >
      {message && <div className="text-lg leading-relaxed text-ink-2">{message}</div>}
    </Sheet>
  );
}
