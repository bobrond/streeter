import type { ReactNode } from 'react';

export type Tone = 'ok' | 'warn' | 'danger' | 'neutral' | 'accent';

const TONES: Record<Tone, string> = {
  ok: 'bg-ok/15 text-ok border-ok/40',
  warn: 'bg-warn/15 text-warn border-warn/40',
  danger: 'bg-danger/15 text-danger border-danger/40',
  neutral: 'bg-card-2 text-ink-2 border-line',
  accent: 'bg-accent/15 text-accent border-accent/40',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-sm font-semibold whitespace-nowrap ${TONES[tone]}`}>
      {children}
    </span>
  );
}
