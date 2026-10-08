// Service worker (hors ligne, mise à jour proposée) et installation sur l'écran d'accueil.
import { useSyncExternalStore } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { showToast } from '../ui/toastStore';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let installEvent: BeforeInstallPromptEvent | null = null;
let registration: ServiceWorkerRegistration | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export function registerServiceWorker(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    // L'appli propose elle-même l'installation (Aujourd'hui, Réglages).
    event.preventDefault();
    installEvent = event as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    installEvent = null;
    emit();
    showToast('Streeter est installée sur l’écran d’accueil.');
  });
  if (!('serviceWorker' in navigator)) return;
  const updateSW = registerSW({
    onRegisteredSW(_url, reg) {
      registration = reg;
    },
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

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Installation proposée par le navigateur ; `null` si déjà installée ou pas proposée. */
export function useInstallPrompt(): (() => Promise<void>) | null {
  const event = useSyncExternalStore(subscribe, () => installEvent);
  if (!event) return null;
  return async () => {
    await event.prompt();
    await event.userChoice;
    installEvent = null;
    emit();
  };
}

/** Lancée depuis l'écran d'accueil (appli installée). */
export function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches ?? false;
}

/** Demande au service worker de vérifier s'il existe une nouvelle version. */
export async function checkForUpdate(): Promise<boolean> {
  if (!registration) return false;
  await registration.update();
  return true;
}
