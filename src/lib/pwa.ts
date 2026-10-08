// Service worker : fonctionnement hors ligne et mise à jour proposée à l'utilisateur.
import { registerSW } from 'virtual:pwa-register';
import { showToast } from '../ui/toastStore';

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  const updateSW = registerSW({
    onNeedRefresh() {
      showToast('Nouvelle version de l’appli disponible.', {
        action: { label: 'Mettre à jour', run: () => void updateSW(true) },
        sticky: true,
      });
    },
    onOfflineReady() {
      showToast('L’appli fonctionne maintenant hors ligne.');
    },
  });
}
