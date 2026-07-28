/**
 * Feedback háptico unificado: Capacitor en apps nativas, Vibration API en web.
 * Los fallos se silencian — el gesto nunca debe romper si el dispositivo no vibra.
 *
 * Safari iOS / PWA iOS: `navigator.vibrate` no existe → sin háptica (limitación
 * de plataforma). App Capacitor iOS: Taptic Engine real.
 */
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

export type HapticKind = "light" | "medium" | "heavy" | "success" | "selection";

let supportedCache: boolean | null = null;

/** Capacitor nativo, o Vibration API en web. Cacheado en módulo. */
export function hapticsSupported(): boolean {
  if (supportedCache != null) return supportedCache;
  try {
    if (Capacitor.isNativePlatform()) {
      supportedCache = true;
      return true;
    }
  } catch {
    /* fall through */
  }
  supportedCache =
    typeof navigator !== "undefined" && "vibrate" in navigator;
  return supportedCache;
}

function vibrateFallback(ms: number) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(ms);
    }
  } catch {
    /* ignore */
  }
}

export async function triggerHaptic(kind: HapticKind = "light"): Promise<void> {
  if (!hapticsSupported()) return;
  try {
    if (Capacitor.isNativePlatform()) {
      if (kind === "selection") {
        await Haptics.selectionChanged();
        return;
      }
      if (kind === "success") {
        await Haptics.notification({ type: NotificationType.Success });
        return;
      }
      const style =
        kind === "heavy"
          ? ImpactStyle.Heavy
          : kind === "medium"
            ? ImpactStyle.Medium
            : ImpactStyle.Light;
      await Haptics.impact({ style });
      return;
    }
  } catch {
    /* fallback web */
  }

  const ms = kind === "heavy" ? 24 : kind === "medium" || kind === "success" ? 14 : 8;
  vibrateFallback(ms);
}
