// Écran du bilan d'un programme (#/programs/report?programme=:id) : aperçu structuré lisible sur téléphone, vue
// Markdown brute, et export (copie dans le presse-papiers, envoi .txt par le partage Android, téléchargement .md).
import { useMemo, useState, type ReactNode } from 'react';
import type { AppData } from '../../db/hooks';
import { localISODate } from '../../domain/cycle';
import {
  MOMENT_LABEL,
  OBJECTIVE_STATUS_LABEL,
  formatDateShort,
  formatDayMonth,
  formatDuration,
  formatSetValue,
  formatSets,
  formatValue,
  formatValueList,
  seqDayLabel,
  workLabel,
} from '../../domain/labels';
import type { ObjectiveStatus } from '../../domain/objectives';
import {
  buildProgramReport,
  type MarkedLineRow,
  type ObjectiveReportRow,
  type ProgramReport,
} from '../../domain/programReport';
import { rangeStatus } from '../../domain/volume';
import { formatProgramReportMarkdown, programReportFileName } from '../../io/program/programReport';
import { canShareFiles, downloadFile, shareFile, useNow } from '../../lib/device';
import { goBack } from '../../lib/router';
import { Badge, type Tone } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Screen } from '../../ui/Screen';
import { Segmented } from '../../ui/Segmented';
import { showToast } from '../../ui/toastStore';
import { programDates, withProgram } from './programContext';

type ViewMode = 'preview' | 'markdown';

const VIEW_OPTIONS: readonly { value: ViewMode; label: string }[] = [
  { value: 'preview', label: 'Aperçu' },
  { value: 'markdown', label: 'Markdown' },
];

const OBJECTIVE_TONE: Record<ObjectiveStatus, Tone> = {
  achieved: 'ok',
  in_progress: 'accent',
  to_test: 'neutral',
};

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function Card({ title, subtitle, children }: { title: ReactNode; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 rounded-2xl border border-line bg-card p-4">
      <div>
        <h2 className="font-display text-2xl leading-none tracking-wider">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-ink-3">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function MarkedLineList({ lines }: { lines: readonly MarkedLineRow[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {lines.map((line, i) => {
        const count = line.markedSets.length;
        const details = line.markedSets
          .map((s) => {
            const parts = [`#${s.label} : ${formatSetValue(s.value, line.measure)}`];
            if (s.bandName) parts.push(`élastique ${s.bandName}`);
            if (s.rpe !== null) parts.push(`RPE ${String(s.rpe).replace('.', ',')}`);
            if (s.note) parts.push(`« ${s.note} »`);
            return parts.join(', ');
          })
          .join(' ; ');
        return (
          <li key={i} className="rounded-xl bg-card-2 px-3 py-2 text-sm">
            <div className="font-semibold text-ink">
              {formatDateShort(line.date)}
              {line.periodLabel ? ` · ${line.periodLabel}` : ''} — {line.sessionName}
            </div>
            <div className="text-ink-2">
              <b className="text-ink">{line.exerciseName}</b>
              {line.blockName ? ` (${line.blockName})` : ''} · {count}/{line.workSetCount} série{count > 1 ? 's' : ''} : {details}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function ObjectiveItem({ row }: { row: ObjectiveReportRow }) {
  return (
    <li className="flex flex-col gap-1 rounded-xl bg-card-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">{row.name}</span>
        <Badge tone={OBJECTIVE_TONE[row.status]}>{OBJECTIVE_STATUS_LABEL[row.status]}</Badge>
      </div>
      <div className="text-sm text-ink-2">
        Cible : <b className="text-ink">{formatValue(row.target, row.unit)}</b>
        {row.exerciseName ? ` · ${row.exerciseName}` : ''}
      </div>
      {row.criterion && <div className="text-sm text-ink-3">{row.criterion}</div>}
      <div className="mt-1 flex flex-col gap-0.5 text-sm text-ink-2">
        <div>
          Avant le programme :{' '}
          {row.bestBefore ? (
            <span className="text-ink">
              {formatValue(row.bestBefore.value, row.unit)} ({formatDateShort(row.bestBefore.date)})
            </span>
          ) : (
            <span className="text-ink-3">aucun test</span>
          )}
        </div>
        {row.tests.length === 0 ? (
          <div>
            Tests sur la période : <span className="text-ink-3">aucun</span>
          </div>
        ) : (
          row.tests.map((t, i) => {
            const sign = t.deltaFromBefore === null ? '' : t.deltaFromBefore > 0 ? '+' : t.deltaFromBefore < 0 ? '−' : '=';
            const deltaText =
              t.deltaFromBefore === null
                ? ''
                : t.deltaFromBefore === 0
                  ? ' (= précédent)'
                  : ` (${sign}${formatValue(Math.abs(t.deltaFromBefore), row.unit)})`;
            return (
              <div key={i}>
                Test du {formatDateShort(t.date)} : <b className="text-ink">{formatValue(t.value, row.unit)}</b>
                {deltaText}
                {t.note ? <span className="text-ink-3"> — {t.note}</span> : null}
              </div>
            );
          })
        )}
        {row.bestSessionInPeriod && (
          <div>
            Meilleure série propre sans élastique :{' '}
            <span className="text-ink">
              {formatValue(row.bestSessionInPeriod.value, row.unit)} ({formatDateShort(row.bestSessionInPeriod.date)})
            </span>
          </div>
        )}
      </div>
    </li>
  );
}

function ReportPreview({ report }: { report: ProgramReport }) {
  const perWord = report.schedule === 'sequence' ? 'tranche' : 'semaine';
  const totalDone = report.counts.eveningDone + report.counts.morningDone;
  const mandatoryMissed = report.missedSlots.filter((m) => !m.optional);
  const optionalSkipped = report.missedSlots.filter((m) => m.optional);

  return (
    <div className="flex flex-col gap-3">
      <section className="flex flex-col gap-1.5 rounded-2xl border border-accent bg-card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
          <span className="font-display text-lg leading-none tracking-wider text-accent">
            {report.phase === 'past' ? 'Programme terminé' : 'Bilan en cours'}
          </span>
          <span className="shrink-0 text-sm tabular-nums text-ink-2">
            {formatDateShort(report.startDate)} → {formatDateShort(report.endDate)}
          </span>
        </div>
        <h2 className="font-display text-3xl leading-tight tracking-wide">{report.programName}</h2>
        <p className="text-sm text-ink-2">
          {report.schedule === 'sequence'
            ? `Séquence de ${report.sequenceLength} soirs par tranche${report.morningPlannedCount > 0 ? ` (+ ${report.morningPlannedCount} matin${report.morningPlannedCount > 1 ? 's' : ''})` : ''} · cycle de ${report.cycleLength} tranches`
            : `Semaine type J1-J7 · cycle de ${report.cycleLength} semaines`}
          {report.deloadWeek > 0 ? ` · ${perWord} ${report.deloadWeek} allégée (−${report.deloadReductionPct} %)` : ''}
        </p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <Badge tone="accent">
            {totalDone} séance{totalDone > 1 ? 's' : ''} ({report.counts.eveningDone} soir{report.counts.eveningDone > 1 ? 's' : ''},{' '}
            {report.counts.morningDone} matin{report.counts.morningDone > 1 ? 's' : ''})
          </Badge>
          {report.counts.expressDone > 0 && <Badge>{report.counts.expressDone} express</Badge>}
          {report.counts.abandoned > 0 && (
            <Badge tone="warn">
              {report.counts.abandoned} abandonnée{report.counts.abandoned > 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        {report.counts.inProgress > 0 && (
          <p className="mt-1 text-sm text-ink-3">Une séance en cours n’est pas comptée dans ce bilan.</p>
        )}
        {report.notes && <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{report.notes}</p>}
      </section>

      {report.periods.length > 0 && (
        <Card
          title="Volume réalisé vs prévu"
          subtitle={`Séries hors échauffement, par ${perWord} (réalisé / prévu, allégé compris).`}
        >
          {report.componentVolume.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <h3 className="text-sm font-bold tracking-wide text-ink-3 uppercase">Composantes</h3>
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full min-w-[300px] text-center text-sm tabular-nums">
                  <thead className="bg-card-2 text-ink-2">
                    <tr>
                      <th className="px-2.5 py-2 text-left font-semibold">Composante</th>
                      {report.periods.map((p) => (
                        <th key={p.label} className="px-2 py-2 font-semibold whitespace-nowrap">
                          <div>{p.label}</div>
                          {p.isDeload && <div className="text-xs font-normal text-accent">allégée</div>}
                          {!p.isDeload && p.partial && (
                            <div className="text-xs font-normal text-ink-3">
                              {p.eveningDone}/{p.eveningPlanned}
                            </div>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.componentVolume.map((row) => (
                      <tr key={row.elementId} className="border-t border-line">
                        <th scope="row" className="px-2.5 py-2 text-left font-normal">
                          <span className="block font-semibold text-ink">{row.name}</span>
                          <span className="block text-xs text-ink-3">{workLabel(row.work)}</span>
                        </th>
                        {row.periods.map((cell, idx) => {
                          const status = rangeStatus(cell.total, cell.plannedMin, cell.plannedMax);
                          const color = cell.isDeload
                            ? 'text-ink'
                            : status === 'within'
                              ? 'text-accent'
                              : status === 'above'
                                ? 'text-warn'
                                : 'text-ink-2';
                          return (
                            <td key={idx} className="px-2 py-2 whitespace-nowrap">
                              <div className={`font-semibold ${color}`}>
                                {cell.total}{' '}
                                <span className="font-normal text-ink-3">/ {formatSets(cell.plannedMin, cell.plannedMax)}</span>
                              </div>
                              {cell.total > 0 && (
                                <div className="text-xs text-ink-3">
                                  {cell.evening}s+{cell.morning}m
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {report.skillVolume.length > 0 && (
            <div className="mt-1 flex flex-col gap-1.5">
              <h3 className="text-sm font-bold tracking-wide text-ink-3 uppercase">Skills par bloc</h3>
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full min-w-[300px] text-center text-sm tabular-nums">
                  <thead className="bg-card-2 text-ink-2">
                    <tr>
                      <th className="px-2.5 py-2 text-left font-semibold">Skill · Bloc</th>
                      {report.periods.map((p) => (
                        <th key={p.label} className="px-2 py-2 font-semibold whitespace-nowrap">
                          <div>{p.label}</div>
                          {p.isDeload && <div className="text-xs font-normal text-accent">allégée</div>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.skillVolume.map((row) => (
                      <tr key={`${row.blockTypeId}|${row.elementId}`} className="border-t border-line">
                        <th scope="row" className="px-2.5 py-2 text-left font-normal">
                          <span className="block font-semibold text-ink">{row.skillName}</span>
                          <span className="block text-xs text-ink-3">{row.blockName}</span>
                        </th>
                        {row.periods.map((cell, idx) => (
                          <td key={idx} className="px-2 py-2 whitespace-nowrap">
                            <b className="text-ink">{cell.done}</b>{' '}
                            <span className="text-ink-3">/ {cell.plannedMax > 0 ? formatSets(cell.plannedMin, cell.plannedMax) : '0'}</span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Card>
      )}

      <Card title="Tests des objectifs" subtitle="Tests datés dans la période du programme, comparés au meilleur test d’avant.">
        {report.objectives.length === 0 ? (
          <p className="text-sm text-ink-3">Aucun objectif suivi sur ce programme.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {report.objectives.map((obj) => (
              <ObjectiveItem key={obj.objectiveId} row={obj} />
            ))}
          </ul>
        )}
        {report.formerObjectivesTested.length > 0 && (
          <div className="flex flex-col gap-2 pt-1">
            <h3 className="text-sm font-bold tracking-wide text-ink-3 uppercase">Anciens objectifs testés</h3>
            <ul className="flex flex-col gap-2">
              {report.formerObjectivesTested.map((obj) => (
                <ObjectiveItem key={obj.objectiveId} row={obj} />
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card title="Records battus" subtitle="Records all-time battus sur tout exercice mesuré (sans élastique et par élastique).">
        {report.beatenRecords.length === 0 ? (
          <p className="text-sm text-ink-3">Aucun record all-time battu sur la période.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {report.beatenRecords.map((rec, i) => {
              const delta = rec.value - rec.previousValue;
              const origin = rec.previousOrigin === 'before_program' ? 'précédent' : '1re séance';
              return (
                <li key={i} className="flex flex-col gap-0.5 rounded-xl bg-card-2 px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold text-ink">
                      {rec.exerciseName}{' '}
                      <span className="font-normal text-ink-2">({rec.bandName ? `élastique ${rec.bandName}` : 'sans élastique'})</span>
                    </span>
                    <span className="font-bold text-accent tabular-nums">{formatValue(rec.value, rec.measure)}</span>
                  </div>
                  <div className="text-ink-3">
                    Le {formatDateShort(rec.date)} (+{formatValue(delta, rec.measure)}, {origin} :{' '}
                    {formatValue(rec.previousValue, rec.measure)} le {formatDateShort(rec.previousDate)})
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex flex-col gap-1.5 border-t border-line pt-2.5">
          <h3 className="text-sm font-bold tracking-wide text-ink-3 uppercase">Séries en progression inférieure</h3>
          {report.lowerProgressions.length === 0 ? (
            <p className="text-sm text-ink-3">Aucune série faite en progression inférieure.</p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-sm">
              {report.lowerProgressions.map((lp, i) => (
                <li key={i} className="rounded-xl bg-card-2 px-3 py-2">
                  <div className="font-semibold text-ink">
                    {lp.exerciseName} <span className="font-normal text-ink-3">(à la place de {lp.replacedLabel})</span>
                  </div>
                  <div className="text-ink-2">
                    {lp.totalSets} série{lp.totalSets > 1 ? 's' : ''}
                    {lp.bestCleanValue !== null && lp.measure !== 'none'
                      ? ` · meilleure : ${formatValue(lp.bestCleanValue, lp.measure)}`
                      : ''}{' '}
                    — {lp.sessions.map((s) => `${formatDayMonth(s.date)} (${formatValueList(s.values, lp.measure)})`).join(', ')}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card title={report.schedule === 'sequence' ? 'Écarts, séances et séries dégradées' : 'Séances sautées, express et séries dégradées'}>
        <div className="flex flex-col gap-1.5">
          <h3 className="text-sm font-bold tracking-wide text-ink-3 uppercase">
            {report.schedule === 'sequence' ? 'Rythme et écarts' : 'Séances sautées'}
          </h3>
          {report.schedule === 'sequence' ? (
            <ul className="flex flex-col gap-1 text-sm text-ink-2">
              {report.trancheRhythms.map((tr) => (
                <li key={tr.label}>
                  <b className="text-ink">
                    {tr.label}
                    {tr.isDeload ? ' (allégée)' : ''}
                  </b>{' '}
                  : {tr.eveningDone}/{tr.eveningPlanned} soirs
                  {tr.morningDone > 0 ? `, +${tr.morningDone} matin${tr.morningDone > 1 ? 's' : ''}` : ''}
                  {tr.fromDate && tr.toDate && tr.spanDays !== null
                    ? ` (${tr.fromDate === tr.toDate ? `le ${formatDateShort(tr.fromDate)}` : `${formatDayMonth(tr.fromDate)} → ${formatDayMonth(tr.toDate)}, ${tr.spanDays} j`}${tr.partial ? ', en cours' : ''})`
                    : ' (aucune séance)'}
                </li>
              ))}
              {report.trainingGaps.length === 0 ? (
                <li className="text-ink-3">Aucune pause de plus de 2 jours sans séance.</li>
              ) : (
                report.trainingGaps.map((gap, i) => (
                  <li key={i} className="text-warn">
                    <b>{gap.daysWithoutSession} jours sans séance</b> : du {formatDateShort(gap.fromDate)} au {formatDateShort(gap.toDate)}
                  </li>
                ))
              )}
            </ul>
          ) : mandatoryMissed.length === 0 && optionalSkipped.length === 0 ? (
            <p className="text-sm text-ink-3">Aucune séance prévue non faite.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm text-ink-2">
              {mandatoryMissed.length === 0 ? (
                <li className="text-ink-3">Aucune séance obligatoire manquée.</li>
              ) : (
                mandatoryMissed.map((m, i) => (
                  <li key={i} className="text-danger">
                    <b>Manquée</b> · {formatDateShort(m.date)} ({m.periodLabel} · {seqDayLabel(m.seqDay)}{' '}
                    {MOMENT_LABEL[m.moment].toLowerCase()}) : {m.templateName}
                  </li>
                ))
              )}
              {optionalSkipped.length > 0 && (
                <li className="text-ink-3">
                  Optionnelles non faites ({optionalSkipped.length}) :{' '}
                  {optionalSkipped.map((m) => `${formatDayMonth(m.date)} ${seqDayLabel(m.seqDay)} (${m.templateName})`).join(', ')}
                </li>
              )}
            </ul>
          )}

          {report.replacedSlots.length > 0 && (
            <ul className="flex flex-col gap-1 pt-1 text-sm text-ink-2">
              {report.replacedSlots.map((r, i) => (
                <li key={i}>
                  <b className="text-ink">{formatDateShort(r.date)}</b> ({r.periodLabel} · {r.slotLabel}) : « {r.doneName} » à la place de «{' '}
                  {r.plannedName} »
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-1.5 border-t border-line pt-2.5">
          <h3 className="text-sm font-bold tracking-wide text-ink-3 uppercase">Séances abandonnées</h3>
          {report.abandonedSessions.length === 0 ? (
            <p className="text-sm text-ink-3">Aucune séance abandonnée.</p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-sm">
              {report.abandonedSessions.map((s) => (
                <li key={s.sessionId} className="rounded-xl bg-card-2 px-3 py-2">
                  <div className="font-semibold text-warn">
                    {formatDateShort(s.date)} ({s.periodLabel} · {MOMENT_LABEL[s.moment].toLowerCase()}) — {s.name}
                  </div>
                  <div className="text-ink-2">
                    {s.setsDone} série{s.setsDone > 1 ? 's' : ''} validée{s.setsDone > 1 ? 's' : ''} avant arrêt
                    {s.durationSec !== null ? ` · ${formatDuration(s.durationSec)}` : ''}
                    {s.note ? ` — « ${s.note} »` : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-1.5 border-t border-line pt-2.5">
          <h3 className="text-sm font-bold tracking-wide text-ink-3 uppercase">Séances express</h3>
          {report.expressSessions.length === 0 ? (
            <p className="text-sm text-ink-3">Aucune séance express.</p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-sm">
              {report.expressSessions.map((s) => (
                <li key={s.sessionId} className="rounded-xl bg-card-2 px-3 py-2">
                  <div className="font-semibold text-ink">
                    {formatDateShort(s.date)} ({s.periodLabel} · {MOMENT_LABEL[s.moment].toLowerCase()}) — Express {s.expressMinutes} min
                    {s.abandoned ? ' (abandonnée)' : ''}
                  </div>
                  <div className="text-ink-2">
                    {s.replacedName ? `À la place de « ${s.replacedName} » · ` : ''}
                    {s.setsDone} série{s.setsDone > 1 ? 's' : ''}
                    {s.durationSec !== null ? ` · ${formatDuration(s.durationSec)}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-1.5 border-t border-line pt-2.5">
          <h3 className="text-sm font-bold tracking-wide text-ink-3 uppercase">Séries dégradées</h3>
          {report.degradedLines.length === 0 ? (
            <p className="text-sm text-ink-3">Aucune série marquée dégradée.</p>
          ) : (
            <MarkedLineList lines={report.degradedLines} />
          )}
        </div>

        {report.failureLines.length > 0 && (
          <div className="flex flex-col gap-1.5 border-t border-line pt-2.5">
            <h3 className="text-sm font-bold tracking-wide text-ink-3 uppercase">Séries à l’échec</h3>
            <MarkedLineList lines={report.failureLines} />
          </div>
        )}
      </Card>

      <Card title="Notes" subtitle="Notes de séance et de série sur la période.">
        {report.sessionNotes.length === 0 ? (
          <p className="text-sm text-ink-3">Aucune note enregistrée sur la période.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {report.sessionNotes.map((n, i) => (
              <li key={i} className="rounded-xl bg-card-2 px-3 py-2">
                <div className="text-xs text-ink-3">
                  {formatDateShort(n.date)}
                  {n.periodLabel ? ` · ${n.periodLabel}` : ''} — {n.sessionName}
                  {n.kind === 'set' && n.exerciseName
                    ? ` · ${n.exerciseName} (${[
                        n.setLabel ? `#${n.setLabel}` : '',
                        n.measure !== null ? formatSetValue(n.value, n.measure) : '',
                        n.bandName ? `élastique ${n.bandName}` : '',
                      ]
                        .filter(Boolean)
                        .join(', ')})`
                    : ''}
                </div>
                <div className="mt-0.5 text-ink">{n.text}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/** #/programs/report (?programme=:id) */
export function ProgramReportScreen({ data, programId }: { data: AppData; programId: string | null }) {
  const today = localISODate(new Date(useNow(60_000)));
  const [view, setView] = useState<ViewMode>('preview');
  const [canShare] = useState(canShareFiles);
  const program = data.programs.find((p) => p.id === programId) ?? data.program;

  const report = useMemo(
    () =>
      buildProgramReport({
        program,
        app: data.appSettings,
        programs: data.programs,
        templates: data.templates,
        elements: data.elements,
        blockTypes: data.blockTypes,
        sessionTypes: data.sessionTypes,
        exercises: data.exercises,
        bands: data.bands,
        objectives: data.objectives,
        sessions: data.sessions,
        sets: data.sets,
        today,
      }),
    [program, data, today],
  );

  const markdown = useMemo(() => formatProgramReportMarkdown(report), [report]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      showToast('Bilan copié : colle-le dans tes notes ou dans la conversation avec ton agent.');
    } catch (e) {
      showToast(`Copie impossible : ${errorText(e)}`, { tone: 'error' });
    }
  };

  const share = async () => {
    try {
      await shareFile(
        programReportFileName(program.name, 'txt'),
        new Blob([markdown], { type: 'text/plain' }),
        `Bilan ${program.name}`,
      );
    } catch (e) {
      showToast(`Envoi impossible : ${errorText(e)}. Enregistre-le plutôt.`, { tone: 'error' });
    }
  };

  const download = () => {
    downloadFile(
      programReportFileName(program.name, 'md'),
      new Blob([markdown], { type: 'text/markdown;charset=utf-8' }),
    );
    showToast('Bilan enregistré dans les téléchargements.');
  };

  const fallbackBack = withProgram('/programs', data, program.id);

  if (report.phase === 'upcoming') {
    return (
      <Screen title="Bilan" subtitle={`${program.name} · ${programDates(data, program)}`} onBack={() => goBack(fallbackBack)}>
        <section className="rounded-2xl border border-line bg-card p-4 text-ink-2">
          Ce programme commence le {formatDateShort(report.startDate)} : son bilan sera disponible dès qu’il aura commencé.
        </section>
      </Screen>
    );
  }

  return (
    <Screen title="Bilan" subtitle={`${program.name} · ${programDates(data, program)}`} onBack={() => goBack(fallbackBack)}>
      <section className="flex flex-col gap-2 rounded-2xl border border-line bg-card p-3">
        <Button onClick={() => void copy()}>Copier le bilan</Button>
        <div className={canShare ? 'grid grid-cols-2 gap-2' : 'flex flex-col'}>
          {canShare && (
            <Button variant="secondary" className="!px-3 !text-base whitespace-nowrap" onClick={() => void share()}>
              Envoyer (.txt)
            </Button>
          )}
          <Button variant="secondary" className="!px-3 !text-base whitespace-nowrap" onClick={download}>
            Enregistrer (.md)
          </Button>
        </div>
      </section>

      <Segmented options={VIEW_OPTIONS} value={view} onChange={setView} label="Affichage du bilan" />

      {view === 'preview' ? (
        <ReportPreview report={report} />
      ) : (
        <pre className="overflow-x-auto rounded-2xl border border-line bg-card p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-ink">
          {markdown}
        </pre>
      )}
    </Screen>
  );
}
