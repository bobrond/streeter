import { afterEach, describe, expect, it, vi } from 'vitest';
import { canShareFiles, shareFile } from './device';

const blob = new Blob(['{}'], { type: 'text/plain' });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('partage de fichier', () => {
  it('envoie le fichier avec son nom et son type', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share });
    await expect(shareFile('streeter-sauvegarde-2026-10-17.txt', blob, 'Sauvegarde Streeter')).resolves.toBe(true);
    const [file] = (share.mock.calls[0][0] as ShareData).files!;
    expect(file.name).toBe('streeter-sauvegarde-2026-10-17.txt');
    expect(file.type).toBe('text/plain');
  });

  it('ne dit rien si l’utilisateur annule', async () => {
    vi.stubGlobal('navigator', { share: vi.fn().mockRejectedValue(new DOMException('Share canceled', 'AbortError')) });
    await expect(shareFile('a.txt', blob, 'Titre')).resolves.toBe(false);
  });

  it('fait remonter un refus pour l’afficher', async () => {
    vi.stubGlobal('navigator', { share: vi.fn().mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError')) });
    await expect(shareFile('a.json', blob, 'Titre')).rejects.toThrow('Permission denied');
  });

  it('n’annonce le partage que si le navigateur sait partager des fichiers', () => {
    vi.stubGlobal('navigator', {});
    expect(canShareFiles()).toBe(false);
    const canShare = vi.fn().mockReturnValue(true);
    vi.stubGlobal('navigator', { canShare });
    expect(canShareFiles()).toBe(true);
    expect((canShare.mock.calls[0][0] as ShareData).files![0].type).toBe('text/plain');
  });
});
