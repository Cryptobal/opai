const THREAD_HISTORY_MARKER = "correoThread";

/**
 * Abre un hilo sin acumular entradas al cambiar la selección del split view.
 * Si la vista actual vino de un deep-link, conserva la ausencia del marcador:
 * cerrar ese hilo debe limpiar la URL, no navegar fuera de Correos.
 */
export function openCorreoThreadInHistory(
  threadId: string,
  alreadyOpen: boolean,
  messageId?: string | null,
): void {
  // SSR / primer paint: no tocar window (rompe /crm/correos).
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("thread", threadId);
  url.searchParams.set("hilo", threadId);
  if (messageId) url.searchParams.set("mensaje", messageId);
  else url.searchParams.delete("mensaje");
  url.searchParams.delete("extract");
  if (alreadyOpen) {
    window.history.replaceState(window.history.state, "", url);
    return;
  }
  window.history.pushState(
    { ...(window.history.state ?? {}), [THREAD_HISTORY_MARKER]: true },
    "",
    url,
  );
}

export function closeCorreoThreadInHistory(): "back" | "replaced" {
  // SSR / primer paint: no tocar window (rompe /crm/correos).
  if (typeof window === "undefined") return "replaced";
  const url = new URL(window.location.href);
  url.searchParams.delete("thread");
  url.searchParams.delete("hilo");
  url.searchParams.delete("mensaje");
  url.searchParams.delete("extract");
  const state = window.history.state ?? {};
  const ownsThreadEntry =
    Boolean(state[THREAD_HISTORY_MARKER]) || Boolean(state.correoReader);
  // Siempre limpiar la URL al instante (la UI ya cerró el lector). Si la
  // apertura hizo pushState —o un overlay la reemplazó sin spread— consumimos
  // esa entrada con back() para que el gesto/atrás del sistema no deje ?hilo=.
  if (ownsThreadEntry) {
    const { [THREAD_HISTORY_MARKER]: _t, correoReader: _r, ...rest } = state as Record<
      string,
      unknown
    >;
    window.history.replaceState(rest, "", url);
    window.history.back();
    return "back";
  }
  window.history.replaceState(state, "", url);
  return "replaced";
}
