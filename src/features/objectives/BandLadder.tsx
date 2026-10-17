import { formatDayMonth, formatValue } from '../../domain/labels';
import type { SessionPerformance } from '../../domain/objectives';
import type { Band, ID, TargetUnit } from '../../domain/types';
import { NO_BAND_COLOR } from './bandSeries';

/**
 * Records d'un exercice, un par élastique, du plus assistant à « sans élastique », comme des paliers
 * (les élastiques sans record restent pâles). Un exercice jamais fait avec un élastique n'a que sa ligne
 * « sans élastique ». `dates` : date de chaque record.
 */
export function BandLadder({
  records,
  bands,
  unit,
  dates = false,
}: {
  records: ReadonlyMap<ID | null, SessionPerformance>;
  bands: readonly Band[];
  unit: TargetUnit;
  dates?: boolean;
}) {
  const noBand = records.get(null);
  if (![...records.keys()].some((id) => id !== null)) {
    return (
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-ink-2">sans élastique</span>
        <span className="font-semibold tabular-nums">
          {noBand ? formatValue(noBand.value, unit) : '—'}
          {dates && noBand && <span className="text-sm font-normal text-ink-3"> · {formatDayMonth(noBand.date)}</span>}
        </span>
      </div>
    );
  }
  const steps: { id: ID | null; name: string; color: string }[] = [
    ...[...bands].filter((b) => b.active || records.has(b.id)).sort((a, b) => a.order - b.order),
    { id: null, name: 'sans', color: NO_BAND_COLOR },
  ];
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
      {steps.map((step) => {
        const record = records.get(step.id);
        return (
          <div key={step.id ?? 'none'} className="flex min-w-0 flex-col gap-1">
            <div className="h-1.5 rounded-[1px]" style={{ backgroundColor: step.color, opacity: record ? 1 : 0.25 }} />
            <span className="truncate text-xs text-ink-3">{step.name}</span>
            <span className={`text-sm leading-tight font-semibold break-words tabular-nums ${record ? '' : 'text-ink-3'}`}>{record ? formatValue(record.value, unit) : '—'}</span>
            {dates && record && <span className="text-xs text-ink-3 tabular-nums">{formatDayMonth(record.date)}</span>}
          </div>
        );
      })}
    </div>
  );
}
