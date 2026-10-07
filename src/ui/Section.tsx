import type { ReactNode } from 'react';

/** Section repliable (balise <details>, sans JavaScript). */
export function Section({
  title,
  aside,
  defaultOpen = false,
  children,
}: {
  title: ReactNode;
  aside?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="group/section rounded-2xl border border-line bg-card" open={defaultOpen}>
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3">
        <span className="flex-1 text-lg font-semibold">{title}</span>
        {aside}
        <svg aria-hidden viewBox="0 0 20 20" className="size-5 shrink-0 text-ink-3 transition-transform group-open/section:rotate-180">
          <path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="border-t border-line px-4 py-3">{children}</div>
    </details>
  );
}
