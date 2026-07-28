/**
 * Sincroniza `?compose=1` con el estado del composer de mensaje nuevo.
 * El deep-link (command palette / productividad) abre el sheet; al cerrar o
 * descartar DEBE salir de la URL — si no, un refresh reabre el composer.
 * Usa replaceState (no empuja historial): compose no es una "página".
 */
export function setCorreoComposeInHistory(open: boolean): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const current = url.searchParams.get("compose") === "1";
  if (open === current) return;
  if (open) url.searchParams.set("compose", "1");
  else url.searchParams.delete("compose");
  window.history.replaceState(window.history.state, "", url);
}
