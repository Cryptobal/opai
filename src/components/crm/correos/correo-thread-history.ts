const THREAD_HISTORY_MARKER = "correoThread";

/**
 * Abre un hilo sin acumular entradas al cambiar la selección del split view.
 * Si la vista actual vino de un deep-link, conserva la ausencia del marcador:
 * cerrar ese hilo debe limpiar la URL, no navegar fuera de Correos.
 */
export function openCorreoThreadInHistory(
  threadId: string,
  alreadyOpen: boolean,
): void {
  const url = new URL(window.location.href);
  url.searchParams.set("thread", threadId);
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
  const url = new URL(window.location.href);
  url.searchParams.delete("thread");
  url.searchParams.delete("extract");
  // Siempre limpiar la URL al instante (la UI ya cerró el lector). Si la
  // apertura hizo pushState, además consumimos esa entrada con back() para
  // que el gesto/atrás del sistema no deje una URL fantasma con ?thread=.
  if (window.history.state?.[THREAD_HISTORY_MARKER]) {
    window.history.replaceState(window.history.state, "", url);
    window.history.back();
    return "back";
  }
  window.history.replaceState(window.history.state, "", url);
  return "replaced";
}
