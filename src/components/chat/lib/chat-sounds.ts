let audioCtx: AudioContext | null = null;

/**
 * Play a short, gentle "ding" notification sound using the Web Audio API.
 * Respects the user's mute preference stored in localStorage under "chat-sound-enabled".
 * Default is enabled (true).
 */
export function playChatNotificationSound() {
  const enabled = localStorage.getItem("chat-sound-enabled") !== "false";
  if (!enabled) return;

  try {
    if (!audioCtx) audioCtx = new AudioContext();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
    oscillator.frequency.setValueAtTime(600, audioCtx.currentTime + 0.1);
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.3);
  } catch {
    // AudioContext may not be available
  }
}
