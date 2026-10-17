import type { ReactNode } from 'react';

/** Entrée d'un menu ⋯ (dans une feuille) : grande cible au pouce, icône facultative, précision en gris. */
export function MenuItem({
  icon,
  label,
  hint,
  danger = false,
  disabled = false,
  onClick,
}: {
  icon?: ReactNode;
  label: ReactNode;
  hint?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex min-h-14 w-full items-center gap-3 rounded-2xl px-4 py-2 text-left text-lg font-semibold active:bg-card-2 disabled:opacity-35 ${danger ? 'text-danger' : ''}`}
    >
      {icon && <span className={`flex size-6 shrink-0 items-center justify-center ${danger ? '' : 'text-ink-2'}`}>{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block">{label}</span>
        {hint && <span className="block text-sm font-normal text-ink-2">{hint}</span>}
      </span>
    </button>
  );
}

export function MenuList({ children }: { children: ReactNode }) {
  return <div className="-mx-2 flex flex-col gap-0.5">{children}</div>;
}
