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

/** PANIC: Long alarming siren tone — unmistakable emergency */
export function soundPanic() {
  try {
    const ctx = getAudioContext();
    // First tone - high urgency
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.frequency.value = 1200;
    gain1.gain.value = 0.5;
    osc1.start();
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc1.stop(ctx.currentTime + 0.4);
    // Second tone - lower
    setTimeout(() => {
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.frequency.value = 800;
      gain2.gain.value = 0.5;
      osc2.start();
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc2.stop(ctx.currentTime + 0.4);
    }, 450);
    // Third tone - high again
    setTimeout(() => {
      const osc3 = ctx.createOscillator();
      const gain3 = ctx.createGain();
      osc3.connect(gain3);
      gain3.connect(ctx.destination);
      osc3.frequency.value = 1200;
      gain3.gain.value = 0.5;
      osc3.start();
      gain3.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc3.stop(ctx.currentTime + 0.6);
    }, 900);
  } catch {
    // Audio not available
  }
}
