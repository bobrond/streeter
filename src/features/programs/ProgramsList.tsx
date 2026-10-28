// Programmes datés : la liste (passés, en cours, à venir), renommer, dupliquer pour la suite, changer la date de début
// d'un programme à venir, le supprimer, l'exporter pour l'agent de programmation ; importer un programme. Un programme
// commence en S1 de son cycle et dure jusqu'au suivant.
import { useState } from 'react';
import { db } from '../../db/db';
import type { AppData } from '../../db/hooks';
import { InUseError, addProgram, deleteProgram, updateProgram } from '../../db/programStore';
import { dateOf } from '../../domain/cycle';
import { formatDateLong, formatDateShort } from '../../domain/labels';
import {
  duplicateProgram,
  nextProgramStartWeek,
  programNameFor,
  programPhase,
  programStartDate,
  startWeekError,
  templatesOf,
  type ProgramPhase,
} from '../../domain/programs';
import { cleanSpaces, nameKey } from '../../domain/text';
import type { Program } from '../../domain/types';
import { newId } from '../../lib/id';
import { goBack, navigate } from '../../lib/router';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Field, TextInput } from '../../ui/form';
import { CopyIcon, DotsIcon, PencilIcon, TrashIcon } from '../../ui/icons';
import { ValueStepper } from '../../ui/inputs';
import { MenuItem, MenuList } from '../../ui/Menu';
import { Screen } from '../../ui/Screen';
import { ConfirmSheet, Sheet } from '../../ui/Sheet';
import { showToast } from '../../ui/toastStore';
import { ExportProgramSheet } from './ProgramExchange';
import { currentWeekOf, programDates, withProgram } from './programContext';

const PHASE_BADGE: Record<ProgramPhase, string> = { past: 'passé', current: 'en cours', upcoming: 'à venir' };

function nameError(name: string, programId: string | null, programs: readonly Program[]): string | null {
  const key = nameKey(name);
  if (!key) return 'Le nom est obligatoire.';
  if (programs.some((p) => p.id !== programId && nameKey(p.name) === key)) return 'Un autre programme porte déjà ce nom.';
  return null;
}

export function RenameProgramSheet({ program, data, onClose }: { program: Program; data: AppData; onClose: () => void }) {
  const [name, setName] = useState(program.name);
  const error = nameError(name, program.id, data.programs);
  const save = async () => {
    if (error) return;
    await updateProgram(db, program.id, { name: cleanSpaces(name) });
    onClose();
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title="Renommer le programme"
      footer={
        <Button disabled={error !== null} onClick={() => void save()}>
          Enregistrer
        </Button>
      }
    >
      <Field label="Nom" error={error}>
        <TextInput value={name} onChange={setName} autoFocus />
      </Field>
    </Sheet>
  );
}

/** Semaine de début : de semaine en semaine, la date du J1 affichée. */
function StartWeekField({ week, onChange, data, error }: { week: number; onChange: (week: number) => void; data: AppData; error: string | null }) {
  const date = dateOf(week, 1, data.appSettings);
  return (
    <Field label="Début (un J1)" hint={`${formatDateLong(date)} · semaine ${week}`} error={error}>
      <ValueStepper size="md" value={week} unit={`· ${formatDateShort(date)}`} min={1} onChange={(v) => v !== null && onChange(Math.round(v))} />
    </Field>
  );
}

/** Copie d'un programme pour la suite : mêmes réglages, objectifs et modèles, à une nouvelle date de début. */
export function DuplicateProgramSheet({ source, data, today, onClose }: { source: Program; data: AppData; today: string; onClose: () => void }) {
  const currentWeek = currentWeekOf(data, today);
  const [week, setWeek] = useState(() => nextProgramStartWeek(data.programs, currentWeek));
  const [name, setName] = useState(() => programNameFor(dateOf(week, 1, data.appSettings)));
  const [nameTouched, setNameTouched] = useState(false);
  const weekError = startWeekError(data.programs, null, week, currentWeek);
  const error = nameError(name, null, data.programs);
  const changeWeek = (next: number) => {
    setWeek(next);
    if (!nameTouched) setName(programNameFor(dateOf(next, 1, data.appSettings)));
  };
  const save = async () => {
    if (error || weekError) return;
    const { program, templates } = duplicateProgram(source, data.templates, { newId, name: cleanSpaces(name), startWeek: week, now: Date.now() });
    await addProgram(db, program, templates);
    onClose();
    showToast(`« ${program.name} » créé : il commence le ${formatDateLong(programStartDate(data.appSettings, program))}.`);
    navigate(`/programs?programme=${encodeURIComponent(program.id)}`);
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={`Dupliquer « ${source.name} »`}
      footer={
        <Button disabled={error !== null || weekError !== null} onClick={() => void save()}>
          Créer le programme
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-ink-2">
          Copie de sa semaine type, de ses {templatesOf(data.templates, source.id).length} modèles, de ses objectifs et de ses réglages. Le nouveau programme commence en S1 de son cycle.
        </p>
        <StartWeekField week={week} onChange={changeWeek} data={data} error={weekError} />
        <Field label="Nom" error={error}>
          <TextInput
            value={name}
            onChange={(v) => {
              setName(v);
              setNameTouched(true);
            }}
          />
        </Field>
      </div>
    </Sheet>
  );
}

function StartWeekSheet({ program, data, today, onClose }: { program: Program; data: AppData; today: string; onClose: () => void }) {
  const currentWeek = currentWeekOf(data, today);
  const [week, setWeek] = useState(program.startWeek);
  const error = startWeekError(data.programs, program.id, week, currentWeek);
  const save = async () => {
    if (error) return;
    await updateProgram(db, program.id, { startWeek: week });
    onClose();
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title="Date de début"
      footer={
        <Button disabled={error !== null} onClick={() => void save()}>
          Enregistrer
        </Button>
      }
    >
      <StartWeekField week={week} onChange={setWeek} data={data} error={error} />
    </Sheet>
  );
}

type Action = { kind: 'menu' | 'rename' | 'duplicate' | 'start' | 'delete' | 'export'; program: Program };

/** #/programs/all */
export function ProgramsList({ data, today }: { data: AppData; today: string }) {
  const currentWeek = currentWeekOf(data, today);
  const [action, setAction] = useState<Action | null>(null);
  const close = () => setAction(null);
  const open = (program: Program) => navigate(withProgram('/programs', data, program.id));

  return (
    <Screen title="Programmes" subtitle="Un programme commence en S1 de son cycle et dure jusqu’au début du suivant." onBack={() => goBack('/programs')}>
      <ul className="flex flex-col gap-2">
        {[...data.programs].reverse().map((program) => {
          const phase = programPhase(data.programs, program, currentWeek);
          const count = templatesOf(data.templates, program.id).filter((t) => !t.archived).length;
          return (
            <li key={program.id} className={`flex items-center rounded-2xl border bg-card pl-1 ${phase === 'current' ? 'border-accent' : 'border-line'}`}>
              <button type="button" onClick={() => open(program)} className="min-w-0 flex-1 rounded-xl px-3 py-3 text-left active:bg-card-2">
                <span className="flex items-center gap-2">
                  <span className="min-w-0 text-lg font-semibold">{program.name}</span>
                  <Badge tone={phase === 'current' ? 'accent' : 'neutral'}>{PHASE_BADGE[phase]}</Badge>
                </span>
                <span className="block text-sm text-ink-2">
                  {programDates(data, program)} · {count} modèle{count > 1 ? 's' : ''}
                </span>
              </button>
              <button type="button" aria-label={`Options de ${program.name}`} onClick={() => setAction({ kind: 'menu', program })} className="flex size-12 shrink-0 items-center justify-center rounded-xl text-ink-2 active:bg-card-2">
                <DotsIcon className="size-6" />
              </button>
            </li>
          );
        })}
      </ul>
      <Button variant="secondary" onClick={() => setAction({ kind: 'duplicate', program: data.programs[data.programs.length - 1] })}>
        Préparer le programme suivant
      </Button>
      <p className="px-1 text-sm text-ink-3">Copie du dernier programme, à modifier ensuite.</p>
      <Button variant="secondary" onClick={() => navigate('/programs/import')}>
        Importer un programme
      </Button>
      <p className="px-1 text-sm text-ink-3">Conçu par ton agent de programmation : fichier ou texte collé, avec l’aperçu des changements avant de valider.</p>

      <Sheet open={action?.kind === 'menu'} onClose={close} title={action?.program.name ?? ''}>
        {action && (
          <MenuList>
            <MenuItem label="Afficher" onClick={() => open(action.program)} />
            <MenuItem icon={<PencilIcon />} label="Renommer" onClick={() => setAction({ ...action, kind: 'rename' })} />
            <MenuItem label="Exporter pour l’agent" hint="Le programme et le catalogue, au format de la consigne." onClick={() => setAction({ ...action, kind: 'export' })} />
            <MenuItem icon={<CopyIcon />} label="Dupliquer pour la suite" hint="Nouveau programme après le dernier, avec la même semaine type." onClick={() => setAction({ ...action, kind: 'duplicate' })} />
            {action.program.startWeek > currentWeek && (
              <>
                <MenuItem label="Date de début" hint={programDates(data, action.program)} onClick={() => setAction({ ...action, kind: 'start' })} />
                <MenuItem icon={<TrashIcon />} danger label="Supprimer" hint="Le programme et ses modèles." onClick={() => setAction({ ...action, kind: 'delete' })} />
              </>
            )}
          </MenuList>
        )}
      </Sheet>
      {action?.kind === 'rename' && <RenameProgramSheet program={action.program} data={data} onClose={close} />}
      {action?.kind === 'duplicate' && <DuplicateProgramSheet source={action.program} data={data} today={today} onClose={close} />}
      {action?.kind === 'export' && <ExportProgramSheet program={action.program} data={data} onClose={close} />}
      {action?.kind === 'start' && <StartWeekSheet program={action.program} data={data} today={today} onClose={close} />}
      <ConfirmSheet
        open={action?.kind === 'delete'}
        title={`Supprimer « ${action?.program.name ?? ''} » ?`}
        message="Ses modèles de séance sont supprimés avec lui. Il n’a pas encore commencé : aucune séance n’est perdue."
        confirmLabel="Supprimer"
        danger
        onClose={close}
        onConfirm={() => {
          if (!action) return;
          const { program } = action;
          close();
          deleteProgram(db, program.id, currentWeek)
            .then(() => showToast('Programme supprimé.'))
            .catch((e: unknown) => showToast(e instanceof InUseError ? e.message : 'Suppression impossible.'));
        }}
      />
    </Screen>
  );
}
