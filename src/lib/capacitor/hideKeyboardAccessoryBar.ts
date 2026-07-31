import { Capacitor } from "@capacitor/core";

/**
 * Oculta la barra accesoria nativa de iOS (◀ ▶ + ✓ Done) sobre el teclado.
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
