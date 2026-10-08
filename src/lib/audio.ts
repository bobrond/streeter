// Bips des minuteurs (Web Audio). Le navigateur n'autorise le son qu'après un geste de l'utilisateur :
// `unlockAudio()` est appelé à chaque toucher.

let context: AudioContext | null = null;

export function unlockAudio(): void {
  try {
    context ??= new AudioContext();
    if (context.state === 'suspended') void context.resume();
  } catch {
    context = null;
  }
}

export function audioUnlocked(): boolean {
  return context?.state === 'running';
}

export interface Tone {
  /** Hertz. */
  freq: number;
  ms: number;
  /** Décalage depuis maintenant, en ms. */
  at?: number;
  gain?: number;
}

export function playTones(tones: readonly Tone[]): void {
  if (!context || context.state !== 'running') return;
  const start = context.currentTime + 0.01;
  for (const tone of tones) {
    const t0 = start + (tone.at ?? 0) / 1000;
    const t1 = t0 + tone.ms / 1000;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = 'square';
    osc.frequency.value = tone.freq;
    // Attaque et relâche courtes : pas de « clic ».
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(tone.gain ?? 0.25, t0 + 0.005);
    gain.gain.setValueAtTime(tone.gain ?? 0.25, t1 - 0.01);
    gain.gain.linearRampToValueAtTime(0, t1);
    osc.connect(gain).connect(context.destination);
    osc.start(t0);
    osc.stop(t1 + 0.02);
  }
}
