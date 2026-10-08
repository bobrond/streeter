// Routage par hash (#/journal…) : fonctionne sur un hébergement statique et hors ligne.
import { useSyncExternalStore } from 'react';
import { unwindBackEntries } from './backStack';

function currentPath(): string {
  return window.location.hash.replace(/^#/, '') || '/';
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

export function useRoute(): string {
  return useSyncExternalStore(subscribe, currentPath);
}

/** Va à `path` ; les feuilles ouvertes sont d'abord refermées (et retirées de l'historique). */
export function navigate(path: string, options: { replace?: boolean } = {}): void {
  unwindBackEntries(() => {
    if (currentPath() === path) return;
    if (options.replace) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${path}`);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } else {
      window.location.hash = path;
    }
  });
}

/** « /session/:id » et « /session/abc » → { id: 'abc' } ; `null` si le chemin ne correspond pas. */
export function matchRoute(pattern: string, path: string): Record<string, string> | null {
  const a = pattern.split('/').filter(Boolean);
  const b = path.split('?')[0].split('/').filter(Boolean);
  if (a.length !== b.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) params[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}
