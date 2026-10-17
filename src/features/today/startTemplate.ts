import { db } from '../../db/db';
import type { AppData } from '../../db/hooks';
import type { Lookups } from '../../db/lookups';
import { SessionInProgressError, startSession } from '../../db/sessionStore';
import type { DayInfo } from '../../domain/cycle';
import { newSessionLog } from '../../domain/session';
import type { SessionLog, SessionTemplate } from '../../domain/types';
import { unlockAudio } from '../../lib/audio';
import { newId } from '../../lib/id';
import { navigate } from '../../lib/router';
import { showToast } from '../../ui/toastStore';

type StartOptions = { replace?: boolean };

/** Enregistre la séance et ouvre le mode séance ; une séance déjà en cours s'ouvre à la place. */
async function launch(session: SessionLog, options: StartOptions): Promise<void> {
  try {
    await startSession(db, session);
    navigate(`/session/${session.id}`, options);
  } catch (e) {
    if (e instanceof SessionInProgressError) {
      showToast('Une séance est déjà en cours : la voici.');
      navigate(`/session/${e.session.id}`, options);
    } else {
      showToast(`Impossible de commencer : ${e instanceof Error ? e.message : String(e)}`, { tone: 'error' });
    }
  }
}

/**
 * Commence une séance à partir d'un modèle et ouvre le mode séance. `replace` : la séance remplace l'écran
 * courant dans l'historique (onglet Séance, qui rouvrirait sinon la séance en boucle au retour).
 */
export async function startTemplate(template: SessionTemplate, info: DayInfo, data: AppData, lookups: Lookups, options: StartOptions = {}): Promise<void> {
  unlockAudio();
  const session = newSessionLog({
    id: newId(),
    template,
    sessionType: lookups.sessionTypes.get(template.sessionTypeId),
    info,
    blocksById: lookups.blocks,
    settings: data.settings,
    now: Date.now(),
  });
  await launch(session, options);
}

/** Commence une séance express générée (déjà allégée en semaine allégée), à la place de la séance `replaced`. */
export async function startExpress(
  express: SessionTemplate,
  minutes: number,
  replaced: SessionTemplate,
  info: DayInfo,
  data: AppData,
  lookups: Lookups,
): Promise<void> {
  unlockAudio();
  const session = newSessionLog({
    id: newId(),
    template: express,
    sessionType: lookups.sessionTypes.get(replaced.sessionTypeId),
    info,
    blocksById: lookups.blocks,
    settings: data.settings,
    now: Date.now(),
    express: { minutes, replacedId: replaced.id },
  });
  await launch(session, {});
}
