/** Onglet actif d'un chemin : « /journal/exercise/x » ou « /journal?vue=exercices » → « /journal ». */
export function tabOf(path: string): string {
  const first = path.split('?')[0].split('/').filter(Boolean)[0];
  return first ? `/${first}` : '/';
}
