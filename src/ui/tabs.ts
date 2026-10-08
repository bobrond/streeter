/** Onglet actif d'un chemin : « /journal/exercise/x » → « /journal ». */
export function tabOf(path: string): string {
  const first = path.split('/').filter(Boolean)[0];
  return first ? `/${first}` : '/';
}
