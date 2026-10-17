// Gestes de l'interface V2 : glisser à gauche = supprimer (le geste révèle un bouton, rien n'est supprimé d'office),
// appui long = options, glisser une poignée ⠿ = réordonner. Chacun a toujours un équivalent visible (menu ⋯, bouton de la feuille).
import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
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

/** Props de la poignée ⠿ d'un élément qu'on glisse (voir `useVerticalDrag`). */
export type DragHandleProps = ReturnType<ReturnType<typeof useVerticalDrag>['handleProps']>;

/** Position verticale d'une cible de dépôt, en coordonnées de la page (défilement compris). */
export interface DropRect {
  top: number;
  bottom: number;
}

export interface DragState<S> {
  source: S;
  /** Déplacement du doigt depuis le départ, défilement compris (px). */
  dy: number;
  /** Cible sous le doigt (rang d'insertion ou de la cible, selon `pick`) ; `null` : aucune. */
  target: number | null;
}

/** Rectangles de la page des éléments qui correspondent à `selector` dans `root`, et rang de celui qui contient `from`. */
export function measureDropRects(root: ParentNode, selector: string, from: Element): { rects: DropRect[]; sourceIndex: number } {
  const nodes = [...root.querySelectorAll(selector)];
  const rects = nodes.map((node) => {
    const r = node.getBoundingClientRect();
    return { top: r.top + window.scrollY, bottom: r.bottom + window.scrollY };
  });
  return { rects, sourceIndex: nodes.findIndex((node) => node.contains(from)) };
}

/** Rang d'insertion dans la liste sans l'élément déplacé : nombre d'autres éléments dont le milieu est au-dessus du doigt. */
export function insertionIndex(pageY: number, rects: readonly DropRect[], sourceIndex: number): number {
  return rects.filter((r, i) => i !== sourceIndex && (r.top + r.bottom) / 2 < pageY).length;
}

/** Cible qui contient le doigt, sinon la plus proche. */
export function containingIndex(pageY: number, rects: readonly DropRect[]): number | null {
  if (rects.length === 0) return null;
  let best = 0;
  let distance = Infinity;
  rects.forEach((r, i) => {
    const d = pageY < r.top ? r.top - pageY : pageY > r.bottom ? pageY - r.bottom : 0;
    if (d < distance) {
      best = i;
      distance = d;
    }
  });
  return best;
}

/**
 * Glisser-déposer vertical par une poignée (⠿) : l'élément suit le doigt, la page défile près des bords.
 * `measure` lit les cibles au départ ; `pick` donne la cible sous le doigt ; `onDrop` reçoit la source et la cible.
 * Le geste a toujours un équivalent visible (menu ⋯ : monter, descendre, changer de séance).
 */
export function useVerticalDrag<S>(options: {
  measure: (handle: HTMLElement) => { rects: DropRect[]; sourceIndex: number };
  pick: (pageY: number, rects: readonly DropRect[], sourceIndex: number) => number | null;
  onDrop: (source: S, target: number) => void;
}) {
  const [state, setState] = useState<DragState<S> | null>(null);
  const opts = useRef(options);
  useEffect(() => {
    opts.current = options;
  });
  const session = useRef<{
    source: S;
    pointerId: number;
    startPageY: number;
    clientY: number;
    rects: DropRect[];
    sourceIndex: number;
    target: number | null;
    frame: number;
  } | null>(null);

  const update = () => {
    const s = session.current;
    if (!s) return;
    const pageY = s.clientY + window.scrollY;
    s.target = opts.current.pick(pageY, s.rects, s.sourceIndex);
    setState({ source: s.source, dy: pageY - s.startPageY, target: s.target });
  };
  // Défilement près des bords : en haut de l'écran, et au-dessus des barres du bas.
  const scrollTick = () => {
    const s = session.current;
    if (!s) return;
    const top = 96;
    const bottom = window.innerHeight - 140;
    // Au plus 12 px par image (environ 700 px/s), plus vite à mesure qu'on s'approche du bord.
    const speed = s.clientY < top ? -Math.min(12, (top - s.clientY) / 6) : s.clientY > bottom ? Math.min(12, (s.clientY - bottom) / 6) : 0;
    if (speed !== 0) {
      window.scrollBy(0, Math.round(speed));
      update();
    }
    s.frame = requestAnimationFrame(scrollTick);
  };
  const finish = (drop: boolean) => {
    const s = session.current;
    session.current = null;
    if (!s) return;
    cancelAnimationFrame(s.frame);
    setState(null);
    if (drop && s.target !== null) opts.current.onDrop(s.source, s.target);
  };

  return {
    state,
    handleProps(source: S) {
      return {
        style: { touchAction: 'none' } as const,
        onPointerDown(e: PointerEvent<HTMLElement>) {
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          // La poignée ne déclenche ni défilement, ni appui long de l'élément qui la contient.
          e.preventDefault();
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          const { rects, sourceIndex } = opts.current.measure(e.currentTarget);
          session.current = { source, pointerId: e.pointerId, startPageY: e.clientY + window.scrollY, clientY: e.clientY, rects, sourceIndex, target: null, frame: 0 };
          session.current.frame = requestAnimationFrame(scrollTick);
          vibrate(20);
          update();
        },
        onPointerMove(e: PointerEvent<HTMLElement>) {
          const s = session.current;
          if (!s || e.pointerId !== s.pointerId) return;
          s.clientY = e.clientY;
          update();
        },
        onPointerUp: () => finish(true),
        onPointerCancel: () => finish(false),
        onLostPointerCapture: () => finish(true),
      };
    },
  };
}
