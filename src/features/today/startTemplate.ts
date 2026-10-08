import { db } from '../../db/db';
import type { AppData } from '../../db/hooks';
import type { Lookups } from '../../db/lookups';
import { SessionInProgressError, startSession } from '../../db/sessionStore';
import type { DayInfo } from '../../domain/cycle';
import { newSessionLog } from '../../domain/session';
import type { SessionTemplate } from '../../domain/types';
import { unlockAudio } from '../../lib/audio';
import { newId } from '../../lib/id';
import { navigate } from '../../lib/router';
import { showToast } from '../../ui/toastStore';

/** Commence une séance à partir d'un modèle et ouvre le mode séance. */
export async function startTemplate(template: SessionTemplate, info: DayInfo, data: AppData, lookups: Lookups): Promise<void> {
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
  try {
    await startSession(db, session);
    navigate(`/session/${session.id}`);
  } catch (e) {
    if (e instanceof SessionInProgressError) {
      showToast('Une séance est déjà en cours : la voici.');
      navigate(`/session/${e.session.id}`);
    } else {
      showToast(`Impossible de commencer : ${e instanceof Error ? e.message : String(e)}`, { tone: 'error' });
    }
  }
}
