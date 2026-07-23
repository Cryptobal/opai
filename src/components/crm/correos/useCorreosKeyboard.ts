"use client";

/**
 * Atajos de teclado de la bandeja (C20) — triage completo sin mouse, con
 * teclas CONFIGURABLES (opai.crm.correos.view.v1 → shortcuts). Además de las
 * teclas configuradas, las flechas ↑/↓ siempre navegan (memoria muscular
 * universal) y funcionan también con el lector abierto (saltan al hilo
 * anterior/siguiente sin volver a la lista).
 *
 * No captura nada cuando el foco está en un input/textarea/contenteditable
 * (incluye el command palette y el composer Tiptap) ni con modificadores —
 * así no colisiona con los atajos globales (⌘K etc.). Excepción: `?` abre la
 * ayuda de atajos aunque venga con Shift.
 */

import { useEffect } from "react";
import type { CorreoShortcuts } from "./useCorreosViewPreferences";

export type CorreoKeyboardHandlers = {
  onDown: () => void;
  onUp: () => void;
  onOpen: () => void;
  onToggleSelect: () => void;
  onArchive: () => void;
  onReply: () => void;
  onTrash: () => void;
  onStar: () => void;
  onSnooze: () => void;
  onToggleRead: () => void;
  onFocusSearch: () => void;
  /** Abre el overlay de ayuda de atajos (tecla fija `?`). */
  onHelp: () => void;
  /** Teclas configuradas por el usuario. */
  shortcuts: CorreoShortcuts;
  /** false desactiva todo (p.ej. composer abierto). */
  enabled?: boolean;
};

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  );
}

export function useCorreosKeyboard(handlers: CorreoKeyboardHandlers): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (handlers.enabled === false) return;
      if (isEditableTarget(event.target)) return;

      const key = event.key;
      const run = (fn: () => void) => {
        event.preventDefault();
        fn();
      };

      // `?` (Shift+/) abre la ayuda — antes del guard de modificadores.
      if (key === "?") return run(handlers.onHelp);
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      // Flechas: navegación universal (además de las teclas configuradas).
      if (key === "ArrowDown") return run(handlers.onDown);
      if (key === "ArrowUp") return run(handlers.onUp);

      const sc = handlers.shortcuts;
      const map: Array<[string, () => void]> = [
        [sc.down, handlers.onDown],
        [sc.up, handlers.onUp],
        [sc.open, handlers.onOpen],
        [sc.toggleSelect, handlers.onToggleSelect],
        [sc.archive, handlers.onArchive],
        [sc.trash, handlers.onTrash],
        [sc.reply, handlers.onReply],
        [sc.star, handlers.onStar],
        [sc.snooze, handlers.onSnooze],
        [sc.toggleRead, handlers.onToggleRead],
        [sc.focusSearch, handlers.onFocusSearch],
      ];
      for (const [bound, fn] of map) {
        if (key === bound) return run(fn);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handlers]);
}
