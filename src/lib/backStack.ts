// Bouton « retour » d'Android : chaque feuille ouverte ajoute une entrée d'historique (même adresse),
// que le retour referme. Une navigation lancée depuis une feuille retire d'abord ces entrées,
// pour que « retour » ne ramène pas sur une feuille fermée ou un écran quitté.

interface Entry {
  id: number;
  close: () => void;
}

interface HistoryState {
  /** Profondeur dans l'historique de l'appli (0 : premier écran ouvert). */
  depth?: number;
  /** Entrée ajoutée par une feuille ouverte. */
  backEntry?: number;
}

let stack: Entry[] = [];
let counter = 0;
/** Événements `popstate` provoqués par l'appli elle-même, à ignorer. */
let ownPops = 0;
let afterOwnPops: (() => void)[] = [];

function state(): HistoryState | null {
  return window.history.state as HistoryState | null;
}

function topId(): number | undefined {
  return state()?.backEntry;
}

export function historyDepth(): number {
  return state()?.depth ?? 0;
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (ownPops > 0) {
      ownPops--;
      if (ownPops === 0) {
        const callbacks = afterOwnPops;
        afterOwnPops = [];
        for (const callback of callbacks) callback();
      }
      return;
    }
    stack.pop()?.close();
  });
}

/** Ajoute une entrée d'historique ; le bouton retour appellera `close`. */
export function pushBackEntry(close: () => void): number {
  const id = ++counter;
  window.history.pushState({ backEntry: id, depth: historyDepth() } satisfies HistoryState, '');
  stack.push({ id, close });
  return id;
}

/** La feuille a été fermée depuis l'interface : retire son entrée si elle est encore au sommet. */
export function removeBackEntry(id: number): void {
  const index = stack.findIndex((e) => e.id === id);
  if (index < 0) return;
  stack.splice(index, 1);
  if (topId() === id) {
    ownPops++;
    window.history.back();
  }
}

/** Ferme les feuilles ouvertes et retire leurs entrées d'historique, puis exécute `then`. */
export function unwindBackEntries(then: () => void): void {
  const entries = stack;
  stack = [];
  for (const entry of [...entries].reverse()) entry.close();
  // Les entrées des feuilles sont au sommet de l'historique tant qu'on n'a pas navigué ailleurs.
  const onTop = topId() !== undefined ? entries.length : 0;
  if (onTop === 0) {
    if (ownPops > 0) afterOwnPops.push(then);
    else then();
    return;
  }
  ownPops++;
  afterOwnPops.push(then);
  window.history.go(-onTop);
}
