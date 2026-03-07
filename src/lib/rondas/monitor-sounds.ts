/**
 * Web Audio API beeps for monitoreo real-time events.
 * Lightweight — no audio files needed.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

function beep(frequency: number, durationMs: number, volume = 0.3) {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = frequency;
    gain.gain.value = volume;
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);
    osc.stop(ctx.currentTime + durationMs / 1000);
  } catch {
    // Audio not available (SSR, permission denied, etc.)
  }
}

/** Short high-pitched beep — checkpoint marked */
export function soundCheckpointMarked() {
  beep(880, 120, 0.2);
}

/** Double beep — ronda completed */
export function soundRondaCompleted() {
  beep(660, 150, 0.25);
  setTimeout(() => beep(880, 150, 0.25), 180);
}

/** Low ascending tone — ronda started */
export function soundRondaStarted() {
  beep(440, 200, 0.2);
}

/** Urgent triple beep — alert created */
export function soundAlert() {
  beep(1000, 100, 0.35);
  setTimeout(() => beep(1000, 100, 0.35), 150);
  setTimeout(() => beep(1000, 100, 0.35), 300);
}
