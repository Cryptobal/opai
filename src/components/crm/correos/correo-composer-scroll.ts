/**
 * Al abrir Responder / A todos / Reenviar, muestra el composer al final del
 * último mail (tope de la caja de escribir), no el historial citado.
 *
 * - Fullscreen / modal: resetea scroll interno de la superficie.
 * - Inline en el scroller del lector: alinea el tope del composer.
 */
export function scrollComposerIntoView() {
  const run = () => {
    const surface = document.querySelector<HTMLElement>(
      "[data-correo-composer-surface]",
    );
    if (surface) {
      const presentation = surface.dataset.composerPresentation;
      if (
        presentation === "fullscreen" ||
        presentation === "modal" ||
        presentation === "inline"
      ) {
        if (surface.scrollTop > 0) {
          surface.scrollTo({ top: 0, behavior: "smooth" });
        }
        const scroller = document.querySelector<HTMLElement>(
          "[data-correo-reader-scroller]",
        );
        if (!scroller || !scroller.contains(surface)) return;

        const elRect = surface.getBoundingClientRect();
        const scRect = scroller.getBoundingClientRect();
        const nextTop = scroller.scrollTop + (elRect.top - scRect.top) - 8;
        scroller.scrollTo({ top: Math.max(0, nextTop), behavior: "smooth" });
        return;
      }
    }

    const el = document.querySelector<HTMLElement>("[data-correo-reply-anchor]");
    if (!el) return;
    const scroller = document.querySelector<HTMLElement>(
      "[data-correo-reader-scroller]",
    );
    if (!scroller || !scroller.contains(el)) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const elRect = el.getBoundingClientRect();
    const scRect = scroller.getBoundingClientRect();
    const nextTop = scroller.scrollTop + (elRect.top - scRect.top) - 8;
    scroller.scrollTo({ top: Math.max(0, nextTop), behavior: "smooth" });
  };
  window.requestAnimationFrame(() => window.requestAnimationFrame(run));
  window.setTimeout(run, 80);
}
