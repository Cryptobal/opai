/**
 * Notification sound preferences — stored in localStorage.
 *
 * Two categories:
 *   - chat: played when a chat toast appears (InAppNotificationProvider)
 *   - system: played when a system/bell notification arrives (NotificationPopover)
 */

export interface SoundOption {
  id: string;
  label: string;
  file: string;
}

export const SOUND_OPTIONS: SoundOption[] = [
  { id: "pop-up", label: "Pop Up", file: "/sounds/pop-up.mp3" },
  { id: "tap", label: "Tap", file: "/sounds/tap.mp3" },
  { id: "soft-alert", label: "Soft Alert", file: "/sounds/soft-alert.mp3" },
  { id: "none", label: "Sin sonido", file: "" },
];

export type SoundCategory = "chat" | "system";

const STORAGE_KEY = "opai-notification-sounds";

interface SoundPrefs {
  chat: string; // SoundOption.id
  system: string;
}

const DEFAULTS: SoundPrefs = {
  chat: "pop-up",
  system: "soft-alert",
};

export function getSoundPrefs(): SoundPrefs {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<SoundPrefs>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

export function setSoundPref(category: SoundCategory, soundId: string) {
  const prefs = getSoundPrefs();
  prefs[category] = soundId;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

/** Get the file path for a category, or empty string if "none". */
export function getSoundFile(category: SoundCategory): string {
  const prefs = getSoundPrefs();
  const id = prefs[category];
  const option = SOUND_OPTIONS.find((o) => o.id === id);
  return option?.file ?? SOUND_OPTIONS[0].file;
}

/**
 * Play the notification sound for a category.
 * Returns silently if sound is disabled or playback fails.
 */
let lastPlayTime = 0;

export function playNotificationSound(category: SoundCategory, debounceMs = 2000) {
  const now = Date.now();
  if (now - lastPlayTime < debounceMs) return;

  const file = getSoundFile(category);
  if (!file) return;

  lastPlayTime = now;
  try {
    const audio = new Audio(file);
    audio.volume = 0.3;
    audio.play().catch(() => {});
  } catch {
    // Sound not available or blocked
  }
}
