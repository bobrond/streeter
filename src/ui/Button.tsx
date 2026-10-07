import type { ButtonHTMLAttributes, ChangeEvent, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink',
  secondary: 'bg-card-2 text-ink border border-line',
  danger: 'bg-card-2 text-danger border border-danger/60',
};

function classes(variant: Variant, extra = ''): string {
  return `inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl px-5 text-lg font-semibold transition-transform active:scale-[0.98] disabled:opacity-50 ${VARIANTS[variant]} ${extra}`;
}

export function Button({ variant = 'primary', className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type="button" className={classes(variant, className)} {...props} />;
}

/** Bouton qui ouvre le sélecteur de fichiers du téléphone. */
export function FileButton({
  accept,
  onFile,
  disabled,
  variant = 'primary',
  children,
}: {
  accept: string;
  onFile: (file: File) => void;
  disabled?: boolean;
  variant?: Variant;
  children: ReactNode;
}) {
  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) onFile(file);
  };
  return (
    <label className={`${classes(variant)} cursor-pointer ${disabled ? 'pointer-events-none opacity-50' : ''}`}>
      <input type="file" accept={accept} className="sr-only" onChange={onChange} disabled={disabled} />
      {children}
    </label>
  );
}
