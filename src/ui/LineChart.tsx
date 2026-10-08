// Courbe d'évolution (uPlot) : traits de 2 px, points de 8 px cerclés de la couleur du fond,
// grille fine, ligne de cible pointillée, infobulle au toucher, étiquette en bout de série.
import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

export interface ChartPoint {
  /** Date calendaire YYYY-MM-DD. */
  date: string;
  value: number;
}

export interface ChartSeries {
  id: string;
  label: string;
  /** Étiquette en bout de courbe (par défaut, `label`). */
  shortLabel?: string;
  color: string;
  points: ChartPoint[];
}

const DAY_FORMAT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const LONG_FORMAT = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });

function toSeconds(date: string): number {
  return new Date(`${date}T12:00:00`).getTime() / 1000;
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Données alignées sur l'union des dates ; `null` là où une série n'a pas de point. */
function alignedData(series: readonly ChartSeries[]): uPlot.AlignedData {
  const xs = [...new Set(series.flatMap((s) => s.points.map((p) => p.date)))].sort();
  const columns = series.map((s) => {
    const byDate = new Map(s.points.map((p) => [p.date, p.value]));
    return xs.map((d) => byDate.get(d) ?? null);
  });
  return [xs.map(toSeconds), ...columns] as uPlot.AlignedData;
}

export function LineChart({
  series,
  unit,
  target,
  height = 220,
  ariaLabel,
}: {
  series: readonly ChartSeries[];
  /** Unité affichée dans l'infobulle (« s », « reps »). */
  unit: string;
  target?: { value: number; label: string };
  height?: number;
  ariaLabel: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const tooltip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = container.current;
    const tip = tooltip.current;
    if (!root || !tip) return;
    const ink = cssVar('--color-ink');
    const ink2 = cssVar('--color-ink-2');
    const ink3 = cssVar('--color-ink-3');
    const line = cssVar('--color-line');
    const surface = cssVar('--color-card');
    const font = `12px ${cssVar('--font-sans') || 'system-ui'}`;
    const data = alignedData(series);
    const values = series.flatMap((s) => s.points.map((p) => p.value));
    const top = Math.max(target?.value ?? 0, ...values, 1);
    const xs = data[0] as number[];
    // Échelle des dates fixée sur les données (une seule date : trois jours de part et d'autre).
    const xMin = xs.length > 0 ? xs[0] : Date.now() / 1000;
    const xMax = xs.length > 0 ? xs[xs.length - 1] : xMin;
    const xPad = xMin === xMax ? 3 * 86_400 : Math.max(43_200, (xMax - xMin) * 0.04);

    const updateTooltip = (u: uPlot) => {
      const idx = u.cursor.idx;
      if (idx === null || idx === undefined || u.cursor.left === undefined || u.cursor.left < 0) {
        tip.style.display = 'none';
        return;
      }
      tip.replaceChildren();
      const title = document.createElement('div');
      title.className = 'text-xs text-ink-3';
      title.textContent = LONG_FORMAT.format(new Date((data[0][idx] as number) * 1000));
      tip.append(title);
      series.forEach((s, i) => {
        const v = data[i + 1][idx];
        if (v === null || v === undefined) return;
        const row = document.createElement('div');
        row.className = 'flex items-center gap-2 whitespace-nowrap';
        const key = document.createElement('span');
        key.className = 'inline-block h-0.5 w-3 rounded';
        key.style.backgroundColor = s.color;
        const value = document.createElement('b');
        value.className = 'text-ink';
        value.textContent = `${String(v).replace('.', ',')} ${unit}`;
        const name = document.createElement('span');
        name.className = 'text-ink-2';
        name.textContent = s.label;
        row.append(key, value, name);
        tip.append(row);
      });
      tip.style.display = 'block';
      const x = u.cursor.left + u.over.offsetLeft;
      const maxLeft = root.clientWidth - tip.offsetWidth;
      tip.style.left = `${Math.max(0, Math.min(maxLeft, x - tip.offsetWidth / 2))}px`;
    };

    /** Cible en pointillés et nom de chaque série à son dernier point. */
    const drawOverlay = (u: uPlot) => {
      const ctx = u.ctx;
      const ratio = uPlot.pxRatio;
      ctx.save();
      ctx.font = `${12 * ratio}px ${cssVar('--font-sans') || 'system-ui'}`;
      if (target) {
        const y = Math.round(u.valToPos(target.value, 'y', true));
        ctx.strokeStyle = ink2;
        ctx.lineWidth = ratio;
        ctx.setLineDash([6 * ratio, 4 * ratio]);
        ctx.beginPath();
        ctx.moveTo(u.bbox.left, y);
        ctx.lineTo(u.bbox.left + u.bbox.width, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = ink2;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(target.label, u.bbox.left + u.bbox.width, y - 3 * ratio);
      }
      if (series.length > 1) {
        const placed: number[] = [];
        ctx.textBaseline = 'middle';
        ctx.fillStyle = ink;
        series.forEach((s, i) => {
          const column = data[i + 1];
          let last = column.length - 1;
          while (last >= 0 && (column[last] === null || column[last] === undefined)) last--;
          if (last < 0) return;
          const x = u.valToPos(data[0][last] as number, 'x', true);
          const y = u.valToPos(column[last] as number, 'y', true);
          // Étiquettes trop proches : la légende et l'infobulle prennent le relais.
          if (placed.some((p) => Math.abs(p - y) < 14 * ratio)) return;
          placed.push(y);
          // Du côté où il reste de la place : à droite du point dans la moitié gauche, à gauche sinon.
          const leftHalf = x < u.bbox.left + u.bbox.width / 2;
          ctx.textAlign = leftHalf ? 'left' : 'right';
          ctx.fillText(s.shortLabel ?? s.label, x + (leftHalf ? 9 : -9) * ratio, y - 12 * ratio);
        });
      }
      ctx.restore();
    };

    const opts: uPlot.Options = {
      width: root.clientWidth,
      height,
      padding: [16, 12, 0, 4],
      legend: { show: false },
      cursor: {
        y: false,
        drag: { x: false, y: false, setScale: false },
        points: { size: 12, width: 2, stroke: surface },
        // Le réticule s'aimante sur la date la plus proche.
        move: (u, left, top) => {
          if (left < 0) return [left, top];
          const idx = u.posToIdx(left);
          return [Math.round(u.valToPos(u.data[0][idx], 'x')), top];
        },
      },
      scales: {
        x: { time: true, range: () => [xMin - xPad, xMax + xPad] },
        y: { range: () => [0, Math.ceil(top * 1.15)] },
      },
      axes: [
        {
          stroke: ink3,
          font,
          grid: { stroke: line, width: 1 },
          ticks: { show: false },
          space: 64,
          // Graduations sur des jours entiers : jamais deux fois la même date.
          incrs: [1, 2, 3, 7, 14, 28, 56, 91, 182, 365].map((d) => d * 86_400),
          values: (_u, splits) => splits.map((s) => DAY_FORMAT.format(new Date(s * 1000))),
        },
        { stroke: ink3, font, grid: { stroke: line, width: 1 }, ticks: { show: false }, size: 36, space: 32 },
      ],
      series: [
        {},
        ...series.map((s) => ({
          label: s.label,
          stroke: s.color,
          width: 2,
          spanGaps: true,
          points: { show: true, size: 8, fill: s.color, stroke: surface, width: 2 },
        })),
      ],
      hooks: { setCursor: [updateTooltip], draw: [drawOverlay] },
    };
    const chart = new uPlot(opts, data, root);

    // Au doigt : le curseur suit le toucher (uPlot ne gère que la souris).
    const onTouch = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      const rect = chart.over.getBoundingClientRect();
      chart.setCursor({ left: touch.clientX - rect.left, top: touch.clientY - rect.top });
    };
    chart.over.addEventListener('touchstart', onTouch, { passive: true });
    chart.over.addEventListener('touchmove', onTouch, { passive: true });

    const resize = new ResizeObserver(() => chart.setSize({ width: root.clientWidth, height }));
    resize.observe(root);
    return () => {
      resize.disconnect();
      chart.destroy();
    };
  }, [series, unit, target, height]);

  return (
    <figure className="relative" aria-label={ariaLabel}>
      <div ref={container} className="w-full" />
      <div
        ref={tooltip}
        className="pointer-events-none absolute top-0 z-10 hidden rounded-xl border border-line bg-card-2 px-3 py-2 text-sm shadow-lg shadow-black"
        role="status"
      />
      {series.length > 1 && (
        <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2">
          {series.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded" style={{ backgroundColor: s.color }} aria-hidden />
              {s.label}
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}
