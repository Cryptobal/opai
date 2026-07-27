/**
 * Feedback háptico unificado: Capacitor en apps nativas, Vibration API en web.
 * Los fallos se silencian — el gesto nunca debe romper si el dispositivo no vibra.
 */
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

export type HapticKind = "light" | "medium" | "heavy" | "success" | "selection";

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
