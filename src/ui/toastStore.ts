// Messages brefs en bas de l'écran (état global, affiché par <ToastHost />).
export interface ToastMessage {
  id: number;
  message: string;
  tone: 'info' | 'error';
  action?: { label: string; run: () => void };
  /** Reste affiché jusqu'à l'action ou la fermeture. */
  sticky: boolean;
}

let current: ToastMessage | null = null;
let counter = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Message bref, avec une action facultative (« Annuler »). */
export function showToast(
  message: string,
  options: { tone?: 'info' | 'error'; action?: ToastMessage['action']; sticky?: boolean } = {},
): void {
  current = { id: ++counter, message, tone: options.tone ?? 'info', action: options.action, sticky: options.sticky ?? false };
  emit();
}

export function dismissToast(id: number): void {
  if (current?.id !== id) return;
  current = null;
  emit();
}

export function subscribeToast(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function currentToast(): ToastMessage | null {
  return current;
}
