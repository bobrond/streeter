// Gestes de l'interface V2 : glisser à gauche = supprimer (le geste révèle un bouton, rien n'est supprimé d'office),
// appui long = options. Chacun a toujours un équivalent visible (menu ⋯, bouton de la feuille).
import { useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { vibrate } from '../lib/device';

const SLOP = 10;

/** Ligne qu'on glisse vers la gauche pour révéler une action de largeur `width` (px). */
export function useSwipeReveal(width: number) {
  const [offset, setOffset] = useState(0);
  const start = useRef<{ x: number; y: number; base: number; dragging: boolean } | null>(null);
  const dragged = useRef(false);

  const end = () => {
    const s = start.current;
    start.current = null;
    if (!s?.dragging) return;
    setOffset((o) => (o < -width / 2 ? -width : 0));
  };

  return {
    offset,
    revealed: offset === -width,
    close: () => setOffset(0),
    handlers: {
      onPointerDown(e: PointerEvent<HTMLElement>) {
        dragged.current = false;
        start.current = { x: e.clientX, y: e.clientY, base: offset, dragging: false };
      },
      onPointerMove(e: PointerEvent<HTMLElement>) {
        const s = start.current;
        if (!s) return;
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
        if (!s.dragging) {
          if (Math.abs(dy) > SLOP && Math.abs(dy) > Math.abs(dx)) {
            start.current = null;
            return;
          }
          if (Math.abs(dx) <= SLOP) return;
          s.dragging = true;
          dragged.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
        }
        setOffset(Math.max(-width, Math.min(0, s.base + dx)));
      },
      onPointerUp: end,
      onPointerCancel: end,
      /** Un glissement ne déclenche pas le bouton sous le doigt. */
      onClickCapture(e: MouseEvent<HTMLElement>) {
        if (!dragged.current) return;
        dragged.current = false;
        e.preventDefault();
        e.stopPropagation();
      },
    },
  };
}

/** Appui long (500 ms) : options. Le toucher qui suit ne déclenche pas de clic. */
export function useLongPress(onLongPress: () => void, ms = 500) {
  const timer = useRef<number | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  return {
    onPointerDown(e: PointerEvent<HTMLElement>) {
      fired.current = false;
      origin.current = { x: e.clientX, y: e.clientY };
      clear();
      timer.current = window.setTimeout(() => {
        fired.current = true;
        vibrate(30);
        onLongPress();
      }, ms);
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      const o = origin.current;
      if (o && Math.hypot(e.clientX - o.x, e.clientY - o.y) > SLOP) clear();
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
    onClickCapture(e: MouseEvent<HTMLElement>) {
      if (!fired.current) return;
      fired.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
    onContextMenu(e: MouseEvent<HTMLElement>) {
      e.preventDefault();
    },
  };
}
