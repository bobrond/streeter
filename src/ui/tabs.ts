// Onglets de l'interface V2 : Aujourd'hui, Séance, Programmes, Progression.

export type TabKey = 'today' | 'session' | 'programs' | 'progress';

/** Vues de Progression et leurs écrans : Skills (objectifs), Volume (semaine), Historique (journal). */
export type ProgressView = 'skills' | 'volume' | 'history';

export const PROGRESS_PATHS: Record<ProgressView, string> = { skills: '/objectives', volume: '/week', history: '/journal' };

function firstSegment(path: string): string {
  return path.split('?')[0].split('/').filter(Boolean)[0] ?? '';
}

/**
 * Onglet d'un chemin. Les réglages (roue crantée) et les éditeurs du programme sont sous Programmes ;
 * le journal, les objectifs et la semaine sont les vues de Progression.
 */
export function tabOf(path: string): TabKey {
  switch (firstSegment(path)) {
    case 'session':
      return 'session';
    case 'programs':
    case 'settings':
      return 'programs';
    case 'progress':
    case 'journal':
    case 'objectives':
    case 'week':
      return 'progress';
    default:
      return 'today';
  }
}

/** Vue de Progression d'un chemin (« /journal/session/x » → Historique) ; `null` hors de Progression. */
export function progressViewOf(path: string): ProgressView | null {
  switch (firstSegment(path)) {
    case 'objectives':
      return 'skills';
    case 'week':
      return 'volume';
    case 'journal':
      return 'history';
    default:
      return null;
  }
}
