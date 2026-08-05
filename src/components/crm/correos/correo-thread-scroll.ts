/**
 * Scroll de apertura del lector (estilo Gmail).
 *
 * Al abrir un hilo el viewport debe anclarse en el último correo: se ve la
 * primera línea del penúltimo (peek) y debajo el último expandido. El
 * deep-link `?mensaje=` a un mensaje que no es el último sí prioriza ese id.
 */

/** Id del nodo al que scrollear al abrir el hilo. */
export function resolveThreadOpenScrollId(
  messageIds: string[],
  deepLinkId?: string | null,
): string | null {
  const n = messageIds.length;
  if (n === 0) return null;

  if (
    deepLinkId &&
    messageIds.includes(deepLinkId) &&
    deepLinkId !== messageIds[n - 1]
  ) {
    return deepLinkId;
  }

  // 1 mensaje → él mismo. ≥2 → penúltimo (peek de 1 línea sobre el último).
  if (n === 1) return messageIds[0];
  return messageIds[n - 2] ?? messageIds[n - 1] ?? null;
}

/**
 * Desplaza el scroller del lector para poner el mensaje en el tope visible.
 * `auto` (default) al abrir el hilo — sin animación, como Gmail.
 */
export function scrollCorreoMessageIntoView(
  messageId: string,
  behavior: ScrollBehavior = "auto",
): boolean {
  const el = document.querySelector<HTMLElement>(
    `[data-correo-message-id="${messageId}"]`,
  );
  if (!el) return false;

  const scroller = el.closest<HTMLElement>("[data-correo-reader-scroller]");
  if (!scroller) {
    el.scrollIntoView({ behavior, block: "start" });
    return true;
  }

  const elRect = el.getBoundingClientRect();
  const scRect = scroller.getBoundingClientRect();
  const nextTop = scroller.scrollTop + (elRect.top - scRect.top) - 8;
  scroller.scrollTo({ top: Math.max(0, nextTop), behavior });
  return true;
}

/**
 * Programa el scroll de apertura tras el paint (y un retry corto por hidratación).
 * Devuelve cleanup para cancelar si el hilo cambia.
 */
export function scheduleThreadOpenScroll(
  messageId: string,
  onDone?: () => void,
): () => void {
  let cancelled = false;
  let done = false;

  const run = () => {
    if (cancelled || done) return;
    if (scrollCorreoMessageIntoView(messageId, "auto")) {
      done = true;
      onDone?.();
    }
  };

  const raf = window.requestAnimationFrame(() =>
    window.requestAnimationFrame(run),
  );
  const t1 = window.setTimeout(run, 50);
  const t2 = window.setTimeout(run, 200);

  return () => {
    cancelled = true;
    window.cancelAnimationFrame(raf);
    window.clearTimeout(t1);
    window.clearTimeout(t2);
  };
}
