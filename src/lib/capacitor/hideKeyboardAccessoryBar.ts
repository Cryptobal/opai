import { Capacitor } from "@capacitor/core";

/**
 * Oculta la barra accesoria nativa de iOS (◀ ▶ + ✓) sobre el teclado.
 * Solo aplica en Capacitor iOS; en Safari/PWA el sistema no lo permite.
 * No-op si el plugin no está disponible.
 */
export async function hideKeyboardAccessoryBar(): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "ios") return;
  try {
    const { Keyboard } = await import("@capacitor/keyboard");
    await Keyboard.setAccessoryBarVisible({ isVisible: false });
  } catch {
    // Plugin ausente o no soportado en este build nativo.
  }
}

/**
 * Mantiene la barra accesoria oculta mientras el composer está montado.
 * iOS la vuelve a mostrar al enfocar inputs / contenteditable; hay que
 * re-ocultarla en `keyboardWillShow` y al enfocar campos.
 */
export function subscribeHideKeyboardAccessoryBar(): () => void {
  if (typeof window === "undefined") return () => {};
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "ios") {
    return () => {};
  }

  let cancelled = false;
  let removeListener: (() => void) | null = null;

  void (async () => {
    try {
      const { Keyboard } = await import("@capacitor/keyboard");
      if (cancelled) return;
      await Keyboard.setAccessoryBarVisible({ isVisible: false });
      const handle = await Keyboard.addListener("keyboardWillShow", () => {
        void Keyboard.setAccessoryBarVisible({ isVisible: false });
      });
      if (cancelled) {
        void handle.remove();
        return;
      }
      removeListener = () => {
        void handle.remove();
      };
    } catch {
      // Plugin ausente.
    }
  })();

  return () => {
    cancelled = true;
    removeListener?.();
    removeListener = null;
  };
}
