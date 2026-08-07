/**
 * Errores típicos cuando iOS/iPad Safari (u otros) matan el fetch al ir a
 * background / suspender la PWA. El mensaje literal en WebKit suele ser
 * "Load failed".
 */
export function isTransientNetworkError(error: unknown): boolean {
  const msg = String((error as Error)?.message || error || "").toLowerCase();
  const name = String((error as Error)?.name || "").toLowerCase();
  if (name === "aborterror") return false;
  return (
    msg.includes("load failed") ||
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network connection was lost") ||
    msg.includes("the internet connection appears to be offline") ||
    msg.includes("fetch failed") ||
    msg.includes("connection reset") ||
    name === "typeerror"
  );
}
