"use client";

import { useEffect, useRef } from "react";

/** Pila LIFO de overlays abiertos: un "atrás" solo cierra el de más arriba. */
const overlayStack: Array<object> = [];
/** Marca los history.back() que disparamos nosotros (limpieza), no el usuario. */
let suppressNextPop = false;

/**
 * Cierra el lector/visor con el gesto/botón atrás. Antes cada instancia añadía
 * su propio listener global de `popstate`, así que un solo "atrás" cerraba TODOS
 * los overlays a la vez (abrir adjunto → cerrar → caías al hub). Ahora una pila
 * LIFO asegura que el back cierre solo el overlay superior; el resto queda.
 */
export function useCloseOnBack(open: boolean, onClose: () => void): void {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const entry = {};
    overlayStack.push(entry);
    window.history.pushState({ correoReader: true }, "");
    let handledByPop = false;

    const onPop = () => {
      // history.back() propio (limpieza) → ignorar una vez, sin cerrar nada.
      if (suppressNextPop) {
        suppressNextPop = false;
        return;
      }
      // Solo el overlay de más arriba reacciona a este back del usuario.
      if (overlayStack[overlayStack.length - 1] !== entry) return;
      handledByPop = true;
      overlayStack.pop();
      closeRef.current();
    };
    window.addEventListener("popstate", onPop);

    return () => {
      window.removeEventListener("popstate", onPop);
      const idx = overlayStack.lastIndexOf(entry);
      if (idx >= 0) overlayStack.splice(idx, 1);
      // Cierre manual (X/Escape): consumir el state propio sin que otro overlay
      // lo interprete como un back del usuario.
      if (!handledByPop && window.history.state?.correoReader) {
        suppressNextPop = true;
        window.history.back();
      }
    };
  }, [open]);
}
