// Routage par hash (#/journal…) : fonctionne sur un hébergement statique et hors ligne.
// Chaque entrée d'historique de l'appli porte sa profondeur : « retour » remonte l'historique
// tant qu'on est dans l'appli, sans jamais la quitter par erreur.
import { useSyncExternalStore } from 'react';
import { historyDepth, unwindBackEntries } from './backStack';

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
    const url = `${window.location.pathname}${window.location.search}#${path}`;
    const depth = historyDepth();
    if (options.replace) window.history.replaceState({ depth }, '', url);
    else window.history.pushState({ depth: depth + 1 }, '', url);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

/** Retour à l'écran précédent de l'appli, ou à `fallback` si on y est arrivé directement. */
export function goBack(fallback: string): void {
  unwindBackEntries(() => {
    if (historyDepth() > 0) window.history.back();
    else navigate(fallback, { replace: true });
  });
}

/** Chemin et paramètres de requête : « /settings/templates/x?block=y ». */
export function queryParam(path: string, name: string): string | null {
  const query = path.split('?')[1];
  return query ? new URLSearchParams(query).get(name) : null;
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
