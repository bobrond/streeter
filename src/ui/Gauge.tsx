// Jauges de volume (maquette « Volume de la semaine ») : séries faites en plein, séries encore prévues
// en pointillés, zone cible plus claire. Couleur : gris sous le minimum, orange dans la cible, jaune au-delà.
import { GAUGE_FILL, type GaugeTone } from './gaugeStyles';

/**
 * Une case par série, de 1 au maximum (plus s'il est dépassé) ; les cases de la zone cible sont plus claires.
 * `zone` absente : pas de cible (semaine allégée).
 */
export function CellGauge({
  done,
  planned,
  max,
  zone,
  tone,
  label,
}: {
  done: number;
  planned: number;
  max: number;
  zone: { min: number; max: number } | null;
  tone: GaugeTone;
  label: string;
}) {
  const count = Math.max(max, done + planned);
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={done}
      className="grid gap-[3px]"
      style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: count }, (_, i) => {
        const n = i + 1;
        const inZone = zone !== null && n >= zone.min && n <= zone.max;
        const cls =
          n <= done
            ? GAUGE_FILL[tone]
            : n <= done + planned
              ? 'border-2 border-dashed border-ink-3'
              : inZone
                ? 'bg-line'
                : 'bg-card-2';
        return <div key={n} className={`h-3 rounded-[2px] ${cls}`} />;
      })}
    </div>
  );
}

/** Jauge continue, pour les totaux de skill (plusieurs dizaines de séries) : même code que les cases. */
export function BarGauge({
  done,
  planned,
  zone,
  tone,
  label,
}: {
  done: number;
  planned: number;
  zone: { min: number; max: number } | null;
  tone: GaugeTone;
  label: string;
}) {
  const scale = Math.max(1, zone?.max ?? 0, done + planned);
  const pct = (n: number) => `${(Math.min(n, scale) / scale) * 100}%`;
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={scale} aria-valuenow={done} className="relative h-3 overflow-hidden rounded-[2px] bg-card-2">
      {zone && <div className="absolute inset-y-0 bg-line" style={{ left: pct(zone.min), width: pct(zone.max - zone.min) }} />}
      {planned > 0 && (
        <div className="absolute inset-y-0 rounded-[2px] border-2 border-dashed border-ink-3" style={{ left: pct(done), width: pct(planned) }} />
      )}
      <div className={`absolute inset-y-0 left-0 ${GAUGE_FILL[tone]}`} style={{ width: pct(done) }} />
    </div>
  );
}
