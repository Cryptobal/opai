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
  if (window.history.state?.[THREAD_HISTORY_MARKER]) {
    window.history.back();
    return "back";
  }
  const url = new URL(window.location.href);
  url.searchParams.delete("thread");
  url.searchParams.delete("extract");
  window.history.replaceState(window.history.state, "", url);
  return "replaced";
}
