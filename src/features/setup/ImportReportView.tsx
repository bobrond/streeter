import type { ImportIssue, ImportReport, IssueLevel } from '../../io/xlsx/importWorkbook';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Screen } from '../../ui/Screen';

const LEVEL_TITLE: Record<IssueLevel, string> = {
  error: 'Erreurs',
  warning: 'À vérifier',
  info: 'Pour information',
};

const LEVEL_STYLE: Record<IssueLevel, string> = {
  error: 'border-danger/60 text-danger',
  warning: 'border-warn/60 text-warn',
  info: 'border-line text-ink-2',
};

function where(issue: ImportIssue): string {
  if (issue.lines.length === 0) return issue.sheet;
  return `${issue.sheet}, ligne${issue.lines.length > 1 ? 's' : ''} ${issue.lines.join(', ')}`;
}

function Count({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl bg-card-2 p-3">
      <div className="text-3xl font-bold tabular-nums">{value}</div>
      <div className="text-ink-2">{label}</div>
    </div>
  );
}

export function ImportReportView({ report }: { report: ImportReport }) {
  const { counts, volumeCheck } = report;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <Count value={counts.templates} label="modèles de séance" />
        <Count value={counts.exercises} label="exercices" />
        <Count value={counts.objectives} label="objectifs" />
        <Count value={counts.sessions} label={`séance${counts.sessions > 1 ? 's' : ''} du journal`} />
        <Count value={counts.sets} label="séries importées" />
        <Count value={counts.newExercises} label="nouveaux exercices" />
      </div>

      {volumeCheck && (
        <div className="rounded-2xl border border-line bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-lg font-semibold">Onglet Volume hebdo</h3>
            <Badge tone={volumeCheck.ok ? 'ok' : 'danger'}>{volumeCheck.ok ? 'Identique' : 'Écarts'}</Badge>
          </div>
          <p className="mt-1 text-ink-2">
            {volumeCheck.ok
              ? 'Le volume recalculé redonne exactement les valeurs du tableur.'
              : 'Le volume recalculé diffère du tableur sur les valeurs en rouge.'}{' '}
            Seule la colonne « Allégée » des skills diffère volontairement : l’appli additionne les séances allégées réelles.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {volumeCheck.lines.map((line) => (
              <li key={line.label} className="rounded-xl bg-card-2 p-3">
                <div className="font-semibold">{line.label}</div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-ink-2">
                  {line.fields.map((f) => (
                    <span key={f.label} className={f.match ? '' : f.expectedDifference ? 'text-ink-3' : 'font-semibold text-danger'}>
                      {f.label} {f.match ? f.app : `${f.sheet} → ${f.app}`}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(['error', 'warning', 'info'] as IssueLevel[]).map((level) => {
        const issues = report.issues.filter((i) => i.level === level);
        if (issues.length === 0) return null;
        return (
          <div key={level} className={`rounded-2xl border bg-card p-4 ${LEVEL_STYLE[level]}`}>
            <h3 className="text-lg font-semibold">
              {LEVEL_TITLE[level]} ({issues.length})
            </h3>
            <ul className="mt-2 flex flex-col gap-2 text-ink">
              {issues.map((issue) => (
                <li key={`${issue.sheet}-${issue.message}`}>
                  <div>{issue.message}</div>
                  <div className="text-sm text-ink-3">{where(issue)}</div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export function ImportReportScreen({ report, onDone }: { report: ImportReport; onDone: () => void }) {
  const errors = report.issues.filter((i) => i.level === 'error').length;
  return (
    <Screen
      title={errors > 0 ? 'Import incomplet' : 'Import terminé'}
      subtitle={errors > 0 ? 'Certaines parties du fichier n’ont pas pu être lues.' : 'Ton tableur est dans l’appli.'}
      actions={<Button onClick={onDone}>Voir mes données</Button>}
    >
      <ImportReportView report={report} />
    </Screen>
  );
}
