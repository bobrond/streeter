import { describe, expect, it } from 'vitest';
import { backupFileName, daysSince, isBackupDue } from './backup';

const DAY = 86_400_000;

describe('rappel de sauvegarde', () => {
  it('rappelle au-delà de 7 jours', () => {
    expect(isBackupDue(0, 7 * DAY, 3)).toBe(false);
    expect(isBackupDue(0, 7 * DAY + 1, 3)).toBe(true);
    expect(daysSince(0, 9.5 * DAY)).toBe(9);
  });

  it('rappelle une première sauvegarde dès qu’une séance a été faite dans l’appli', () => {
    expect(isBackupDue(null, 0, 0)).toBe(false);
    expect(isBackupDue(null, 0, 1)).toBe(true);
  });

  it('nomme le fichier avec la date', () => {
    expect(backupFileName('2026-10-08')).toBe('streeter-sauvegarde-2026-10-08.json');
  });
});
