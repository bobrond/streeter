// Options d'un exercice de la séance (bouton ⋯ ou appui long) : changer d'exercice parmi les candidats
// de la ligne (règle 4), ajouter une série, terminer ou rouvrir l'exercice, relire la note de la ligne.
import type { Lookups } from '../../db/lookups';
import type { ID, Moment } from '../../domain/types';
import { Button } from '../../ui/Button';
import { Sheet } from '../../ui/Sheet';
import { chipClass } from '../../ui/styles';
import type { LineView } from './useSessionController';

export function LineSheet({
  line,
  lookups,
  moment,
  onClose,
  onChoose,
  onAddRow,
  onCloseLine,
  onReopen,
}: {
  line: LineView | null;
  lookups: Lookups;
  moment: Moment;
  onClose: () => void;
  onChoose: (exerciseId: ID) => void;
  onAddRow: () => void;
  onCloseLine: () => void;
  onReopen: () => void;
}) {
  const element = line ? lookups.elements.get(line.item.elementId) : undefined;
  const done = line?.progress?.done ?? 0;
  return (
    <Sheet open={line !== null} onClose={onClose} title={element?.name}>
      {line && (
        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-1.5">
            <h3 className="text-sm font-bold tracking-wide text-ink-3 uppercase">Exercice</h3>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Exercice">
              {line.candidates.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  aria-pressed={candidate.id === line.exercise?.id}
                  onClick={() => {
                    onChoose(candidate.id);
                    onClose();
                  }}
                  className={chipClass(candidate.id === line.exercise?.id, 'text-left', 'text-base')}
                >
                  {candidate.name}
                  {moment === 'morning' && candidate.quick && <span aria-label="rapide">⚡</span>}
                </button>
              ))}
            </div>
            {line.candidates.length === 0 && <p className="text-danger">Aucun exercice candidat : ajoute-en un dans Programmes.</p>}
            <p className="text-sm text-ink-2">Les séries à faire repartent des valeurs du nouvel exercice ; les séries faites gardent le leur.</p>
          </section>
          {line.item.notes && (
            <section>
              <h3 className="text-sm font-bold tracking-wide text-ink-3 uppercase">Note de la ligne</h3>
              <p className="mt-1 text-ink-2">{line.item.notes}</p>
            </section>
          )}
          <div className="flex flex-col gap-2">
            {line.closed ? (
              <Button
                variant="secondary"
                onClick={() => {
                  onReopen();
                  onClose();
                }}
              >
                Rouvrir cet exercice
              </Button>
            ) : (
              <>
                <Button
                  variant="secondary"
                  onClick={() => {
                    onAddRow();
                    onClose();
                  }}
                >
                  Ajouter une série
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    onCloseLine();
                    onClose();
                  }}
                >
                  {done === 0 ? 'Passer cet exercice' : `Terminer l’exercice à ${done} série${done > 1 ? 's' : ''}`}
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}
