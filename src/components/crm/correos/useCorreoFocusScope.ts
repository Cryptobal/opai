"use client";

import { useEffect } from "react";

/**
 * Marca <body> con data-correo-scope mientras haya una superficie de Correos
 * montada. Necesario porque los sheets/paneles del módulo se montan por
 * portal en document.body y quedarían fuera de un scope anclado al workspace.
 * Refcount: soporta varias superficies montadas a la vez (bandeja + lector).
 *
 * @param enabled Si es false, no participa del refcount (p.ej. lector de ficha
 *   montado pero sin hilo abierto).
 */
let mounted = 0;

export function useCorreoFocusScope(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    mounted += 1;
    document.body.setAttribute("data-correo-scope", "");
    return () => {
      mounted -= 1;
      if (mounted <= 0) {
        mounted = 0;
        document.body.removeAttribute("data-correo-scope");
      }
    };
  }, [enabled]);
}
