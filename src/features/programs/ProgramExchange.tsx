// Échange avec l'agent de programmation (format programme JSON, version 1 de la consigne) : export d'un programme
// (copie, partage, téléchargement) et import d'un fichier ou d'un texte collé, avec l'aperçu des changements et les
// contrôles du programme avant de valider.
import { useState, type ReactNode } from 'react';
import { db } from '../../db/db';
import type { AppData } from '../../db/hooks';
import { useLookups } from '../../db/lookups';
import { InUseError, applyProgramImport } from '../../db/programStore';
import { localISODate } from '../../domain/cycle';
import { formatDateLong, formatSets } from '../../domain/labels';
import { diffPrograms, objectiveChanges, slotChangeText, type ObjectiveChange } from '../../domain/programDiff';
import { effectiveSettings, programAtWeek, programPhase, programStartDate, templatesOf } from '../../domain/programs';
import type { Program } from '../../domain/types';
import {
  PROGRAM_FILE_ACCEPT,
  programFileName,
  programToFile,
  readProgramFile,
  serializeProgramFile,
  type ProgramImport,
} from '../../io/program/programFile';
import { canShareFiles, downloadFile, shareFile, useNow } from '../../lib/device';
import { newId } from '../../lib/id';
import { goBack, navigate } from '../../lib/router';
import { Badge, type Tone } from '../../ui/Badge';
import { Button, FileButton } from '../../ui/Button';
import { Field, TextArea } from '../../ui/form';
import { WarningIcon } from '../../ui/icons';
import { Screen } from '../../ui/Screen';
import { ConfirmSheet, Sheet } from '../../ui/Sheet';
import { showToast } from '../../ui/toastStore';
import { currentWeekOf } from './programContext';
import { ProgramChecks } from './ProgramChecks';

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function copyText(text: string, done: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    showToast(done);
  } catch (e) {
    showToast(`Copie impossible : ${errorText(e)}`, { tone: 'error' });
  }
}

/** Consigne de l'agent (docs/), chargée à la demande. */
async function agentInstructions(): Promise<string> {
  return (await import('../../../docs/consigne_agent_programmation.md?raw')).default;
}

/** Export d'un programme pour l'agent : copier le texte, l'envoyer (.txt) ou l'enregistrer (.json). */
export function ExportProgramSheet({ program, data, onClose }: { program: Program; data: AppData; onClose: () => void }) {
  const [canShare] = useState(canShareFiles);
  const text = () => serializeProgramFile(programToFile(program, data.templates, data, data.appSettings));
  const share = async () => {
    try {
      if (await shareFile(programFileName(program.name, 'txt'), new Blob([text()], { type: 'text/plain' }), `Programme ${program.name}`)) onClose();
    } catch (e) {
      showToast(`Envoi impossible : ${errorText(e)}. Enregistre-le plutôt.`, { tone: 'error' });
    }
  };
  return (
    <Sheet open onClose={onClose} title={`Exporter « ${program.name} »`}>
      <div className="flex flex-col gap-3">
        <p className="text-ink-2">
          Le programme complet et le catalogue de l’appli (exercices, éléments, blocs, types de séance, élastiques, objectifs), au format que ton agent de programmation connaît.
        </p>
        <Button onClick={() => void copyText(text(), 'Programme copié : colle-le dans la conversation avec ton agent.')}>Copier le programme</Button>
        {canShare && (
          <Button variant="secondary" onClick={() => void share()}>
            Envoyer le fichier
          </Button>
        )}
        <Button
          variant="secondary"
          onClick={() => {
            downloadFile(programFileName(program.name), new Blob([text()], { type: 'application/json' }));
            showToast('Programme enregistré dans les téléchargements.');
          }}
        >
          Enregistrer le fichier (.json)
        </Button>
        <p className="mt-2 text-ink-2">La consigne explique à l’agent le format et les principes de l’appli : à lui donner une fois, puis à chaque nouvelle version.</p>
        <Button variant="secondary" onClick={() => void agentInstructions().then((t) => copyText(t, 'Consigne copiée.'))}>
          Copier la consigne de l’agent
        </Button>
      </div>
    </Sheet>
  );
}

/** #/programs/import */
export function ProgramImportScreen({ data }: { data: AppData }) {
  const today = localISODate(new Date(useNow(60_000)));
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<string[] | null>(null);
  const [preview, setPreview] = useState<ProgramImport | null>(null);

  const read = (content: string) => {
    const result = readProgramFile(content, {
      app: data.appSettings,
      programs: data.programs,
      templates: data.templates,
      elements: data.elements,
      blockTypes: data.blockTypes,
      sessionTypes: data.sessionTypes,
      exercises: data.exercises,
      objectives: data.objectives,
      usedTemplateIds: new Set(data.sessions.flatMap((s) => (s.templateId ? [s.templateId] : []))),
      currentWeek: currentWeekOf(data, today),
      newId,
      now: Date.now(),
    });
    if (result.ok) {
      setErrors(null);
      setPreview(result.value);
    } else setErrors(result.errors);
  };
  const paste = async () => {
    try {
      const content = await navigator.clipboard.readText();
      setText(content);
      if (content.trim()) read(content);
    } catch {
      showToast('Le téléphone refuse l’accès au presse-papiers : colle le texte dans le cadre (appui long).');
    }
  };

  if (preview) return <ImportPreview data={data} today={today} imported={preview} onCancel={() => setPreview(null)} />;
  return (
    <Screen title="Importer" subtitle="Un programme conçu par ton agent de programmation : fichier ou texte collé." onBack={() => goBack('/programs/all')}>
      <FileButton accept={PROGRAM_FILE_ACCEPT} onFile={(file) => void file.text().then(read)}>
        Choisir un fichier
      </FileButton>
      <p className="px-1 text-sm text-ink-3">Le .json enregistré ou le .txt reçu par partage.</p>
      <Field label="Ou colle la réponse de l’agent" hint="Sa réponse entière convient : l’appli y trouve le bloc JSON.">
        <TextArea value={text} onChange={setText} rows={6} placeholder="{ &quot;format&quot;: &quot;streeter-programme&quot;, … }" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => void paste()}>
          Coller
        </Button>
        <Button disabled={!text.trim()} onClick={() => read(text)}>
          Lire le texte
        </Button>
      </div>
      {errors && (
        <div className="rounded-2xl border border-danger/60 bg-danger/10 p-3" role="alert">
          <div className="flex items-center gap-2 font-semibold text-danger">
            <WarningIcon className="size-6" />
            Programme refusé : {errors.length} erreur{errors.length > 1 ? 's' : ''}
          </div>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-6 text-ink">
            {errors.map((error, i) => (
              <li key={i}>{error}</li>
            ))}
          </ul>
          <p className="mt-2 text-ink-2">Rien n’a été modifié. Renvoie ces messages à ton agent : il corrigera son fichier.</p>
          <Button variant="secondary" className="mt-2" onClick={() => void copyText(errors.join('\n'), 'Erreurs copiées.')}>
            Copier les erreurs
          </Button>
        </div>
      )}
    </Screen>
  );
}

function Card({ title, aside, children }: { title: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-line bg-card p-4">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 font-display text-2xl leading-none tracking-wider">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Lines({ items }: { items: readonly ReactNode[] }) {
  return (
    <ul className="flex list-disc flex-col gap-1 pl-5">
      {items.map((line, i) => (
        <li key={i}>{line}</li>
      ))}
    </ul>
  );
}

const OBJECTIVE_BADGE: Record<ObjectiveChange['status'], { label: string; tone: Tone }> = {
  new: { label: 'nouveau', tone: 'accent' },
  kept: { label: 'repris', tone: 'neutral' },
  changed: { label: 'modifié', tone: 'warn' },
  dropped: { label: 'devient ancien', tone: 'neutral' },
};

function ImportPreview({ data, today, imported, onCancel }: { data: AppData; today: string; imported: ProgramImport; onCancel: () => void }) {
  const lookups = useLookups(data);
  const [confirm, setConfirm] = useState(false);
  const { program, replaces } = imported;
  const elements = [...data.elements, ...imported.newElements];
  const exercises = new Map([...data.exercises, ...imported.newExercises].map((e) => [e.id, e]));
  const names = {
    elements: new Map(elements.map((e) => [e.id, e])),
    blocks: new Map(imported.blockTypes.map((b) => [b.id, b])),
    exercises,
    sessionTypes: new Map([...data.sessionTypes, ...imported.newSessionTypes].map((t) => [t.id, t])),
  };
  const plan = { weekPlan: program.weekPlan, templates: new Map(imported.templates.map((t) => [t.id, t])), elements, blocks: names.blocks, exercises };
  const settings = effectiveSettings(data.appSettings, program);

  // Référence : le programme remplacé, sinon celui en vigueur la semaine d'avant.
  const base = replaces ?? programAtWeek(data.programs, program.startWeek - 1) ?? null;
  const diff = diffPrograms(base && { program: base, templates: templatesOf(data.templates, base.id) }, { program, templates: imported.templates }, names);
  const objectives = objectiveChanges(
    base?.objectiveIds ?? [],
    program.objectiveIds.map((id) => [...imported.updatedObjectives, ...imported.newObjectives].find((o) => o.id === id)!),
    lookups.objectives,
    exercises,
  );
  const currentWeek = currentWeekOf(data, today);
  const replacesCurrent = replaces !== null && programPhase(data.programs, replaces, currentWeek) === 'current';
  const removed = new Map(imported.removedTemplates.map((r) => [r.template.id, r.archive]));
  const catalogue = [
    ...imported.newElements.map((e) => `Élément : ${e.name}`),
    ...imported.newBlocks.map((b) => `Bloc : ${b.name}`),
    ...imported.newSessionTypes.map((t) => `Type de séance : ${t.name}`),
    ...imported.newExercises.map((e) => `Exercice : ${e.name}${e.elementId ? ` (${names.elements.get(e.elementId)?.name ?? '?'})` : ''}`),
  ];

  const apply = async () => {
    try {
      await applyProgramImport(db, imported);
      showToast(replaces ? `« ${program.name} » remplacé.` : `« ${program.name} » importé : il commence le ${formatDateLong(programStartDate(data.appSettings, program))}.`);
      navigate(program.id === data.program.id ? '/programs' : `/programs?programme=${encodeURIComponent(program.id)}`, { replace: true });
    } catch (e) {
      showToast(e instanceof InUseError ? e.message : `Import impossible : ${errorText(e)}`, { tone: 'error' });
    }
  };

  return (
    <Screen
      title="Aperçu"
      subtitle="Rien n’est modifié avant de valider."
      onBack={onCancel}
      actions={
        <>
          <Button onClick={() => (replaces ? setConfirm(true) : void apply())}>{replaces ? `Remplacer « ${replaces.name} »` : 'Créer le programme'}</Button>
          <Button variant="secondary" onClick={onCancel}>
            Annuler
          </Button>
        </>
      }
    >
      <section className="flex flex-col gap-1 rounded-2xl border border-accent bg-card p-4">
        <div className="font-display text-lg leading-none tracking-wider text-accent">{replaces ? 'Remplace un programme' : 'Nouveau programme'}</div>
        <h2 className="font-display text-3xl leading-tight tracking-wide">{program.name}</h2>
        <p className="text-ink-2">
          Commence le {formatDateLong(programStartDate(data.appSettings, program))} (semaine {program.startWeek}), en S1 de son cycle de {program.cycleLengthWeeks} semaines.
        </p>
        {replaces && (
          <p className="text-ink-2">
            {replacesCurrent
              ? `Remplace le programme en cours « ${replaces.name} » : les séances déjà faites gardent leur copie.`
              : `Remplace « ${replaces.name} », qui n’a pas commencé.`}
          </p>
        )}
        {program.notes && <p className="mt-1 whitespace-pre-wrap text-ink">{program.notes}</p>}
      </section>

      {imported.warnings.length > 0 && (
        <Card title="Remarques de lecture">
          <Lines items={imported.warnings} />
        </Card>
      )}

      <ProgramChecks program={plan} settings={settings} lookups={{ ...lookups, elements: names.elements }} />

      <Card title="Changements" aside={base && <span className="text-sm text-ink-3">par rapport à « {base.name} »</span>}>
        {diff.settings.length > 0 && <Lines items={diff.settings.map((s) => `${s.label} : ${s.before} → ${s.after}`)} />}
        {diff.weekPlan.length > 0 && (
          <>
            <h3 className="mt-1 font-semibold text-ink-2">Semaine type</h3>
            <Lines items={diff.weekPlan.map(slotChangeText)} />
          </>
        )}
        {diff.added.length > 0 && (
          <>
            <h3 className="mt-1 font-semibold text-ink-2">{base ? 'Nouvelles séances' : 'Séances'}</h3>
            <Lines items={diff.added.map((t) => `${t.name} (${t.items.length} ligne${t.items.length > 1 ? 's' : ''}, ${formatSets(...setsRange(t.items))} séries)`)} />
          </>
        )}
        {diff.removed.length > 0 && (
          <>
            <h3 className="mt-1 font-semibold text-ink-2">Séances retirées</h3>
            <Lines
              items={diff.removed.map((t) => (removed.has(t.id) ? `${t.name} (${removed.get(t.id) ? 'archivée : elle a déjà servi' : 'supprimée'})` : t.name))}
            />
          </>
        )}
        {diff.changed.map((change) => (
          <details key={change.name} className="group/change rounded-xl bg-card-2 px-3 py-2" open={diff.changed.length === 1}>
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-semibold">
              <span className="flex-1">{change.name}</span>
              <Badge tone="warn">
                {change.changes.length} changement{change.changes.length > 1 ? 's' : ''}
              </Badge>
            </summary>
            <Lines items={change.changes} />
          </details>
        ))}
        {diff.unchanged.length > 0 && <p className="text-ink-2">Sans changement : {diff.unchanged.join(', ')}.</p>}
        {base && diff.settings.length + diff.weekPlan.length + diff.added.length + diff.removed.length + diff.changed.length === 0 && (
          <p className="text-ink-2">Aucun changement de programme.</p>
        )}
      </Card>

      <Card title="Objectifs">
        {objectives.length === 0 ? (
          <p className="text-ink-2">Aucun objectif suivi.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {objectives.map((o) => (
              <li key={o.name} className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{o.name}</span>
                <Badge tone={OBJECTIVE_BADGE[o.status].tone}>{OBJECTIVE_BADGE[o.status].label}</Badge>
                {o.changes.length > 0 && <span className="w-full text-sm text-ink-2">{o.changes.join(' ; ')}</span>}
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm text-ink-3">Un objectif repris garde ses tests ; un ancien objectif reste dans Skills avec ses tests.</p>
      </Card>

      {catalogue.length > 0 && (
        <Card title="Ajouts au catalogue">
          <Lines items={catalogue} />
        </Card>
      )}

      {imported.requests.length > 0 && (
        <Card title="Demandes à l’appli">
          <p className="text-ink-2">Ce que l’agent voudrait exprimer et que le format ne permet pas encore : à transmettre au développement de l’appli.</p>
          <ul className="flex flex-col gap-2">
            {imported.requests.map((request, i) => (
              <li key={i} className="rounded-xl bg-card-2 p-3">
                <div className="font-semibold">{request.sujet}</div>
                <div className="text-ink">{request.besoin}</div>
                {request.exemple && <div className="text-sm text-ink-2">Exemple : {request.exemple}</div>}
              </li>
            ))}
          </ul>
          <Button
            variant="secondary"
            onClick={() => void copyText(imported.requests.map((r) => `- ${r.sujet} : ${r.besoin}${r.exemple ? ` (exemple : ${r.exemple})` : ''}`).join('\n'), 'Demandes copiées.')}
          >
            Copier les demandes
          </Button>
        </Card>
      )}

      <ConfirmSheet
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`Remplacer « ${replaces?.name ?? ''} » ?`}
        message={
          replacesCurrent
            ? 'Ses réglages, sa semaine type et ses séances sont remplacés par ceux du fichier. Les séances déjà faites gardent leur copie ; une séance retirée qui a déjà servi est archivée.'
            : 'Ses réglages, sa semaine type et ses séances sont remplacés par ceux du fichier.'
        }
        confirmLabel="Remplacer"
        onConfirm={() => {
          setConfirm(false);
          void apply();
        }}
      />
    </Screen>
  );
}

/** Séries min et max de toutes les lignes d'une séance. */
function setsRange(items: readonly { setsMin: number; setsMax: number }[]): [number, number] {
  return [items.reduce((sum, i) => sum + i.setsMin, 0), items.reduce((sum, i) => sum + i.setsMax, 0)];
}
