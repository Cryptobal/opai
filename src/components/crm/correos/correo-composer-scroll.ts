/**
 * Al abrir Responder / A todos / Reenviar, deja el composer al inicio
 * (Para / Asunto / cuerpo / casilla IA), no al final del historial citado.
 *
 * - Fullscreen / modal: scrollea la superficie del composer.
 * - Inline en el dock (fuera del lector): igual, solo la superficie.
 * - Inline dentro del scroller del lector: alinea el tope del composer.
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
        // Composer en dock (sticky): no desplazar el hilo.
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
