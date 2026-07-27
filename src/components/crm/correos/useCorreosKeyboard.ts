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

import { useEffect, useRef } from "react";
import {
  normalizeShortcutKey,
  type CorreoShortcuts,
} from "./useCorreosViewPreferences";

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
  /** true cuando el lector está abierto: reply lo maneja CorreoReplyBox. */
  replyHandledExternally?: boolean;
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

function keysMatch(eventKey: string, bound: string): boolean {
  return normalizeShortcutKey(eventKey) === normalizeShortcutKey(bound);
}

export function useCorreosKeyboard(handlers: CorreoKeyboardHandlers): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const h = handlersRef.current;
      if (h.enabled === false) return;
      if (isEditableTarget(event.target)) return;

      const key = event.key;
      const run = (fn: () => void) => {
        event.preventDefault();
        fn();
      };

      // `?` (Shift+/) abre la ayuda — antes del guard de modificadores.
      if (key === "?") return run(h.onHelp);
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      // Flechas: navegación universal (además de las teclas configuradas).
      if (key === "ArrowDown") return run(h.onDown);
      if (key === "ArrowUp") return run(h.onUp);

      const sc = h.shortcuts;
      const map: Array<[string, () => void]> = [
        [sc.down, h.onDown],
        [sc.up, h.onUp],
        [sc.open, h.onOpen],
        [sc.toggleSelect, h.onToggleSelect],
        [sc.archive, h.onArchive],
        [sc.trash, h.onTrash],
        ...(h.replyHandledExternally ? [] : [[sc.reply, h.onReply] as [string, () => void]]),
        [sc.star, h.onStar],
        [sc.snooze, h.onSnooze],
        [sc.toggleRead, h.onToggleRead],
        [sc.focusSearch, h.onFocusSearch],
      ];
      for (const [bound, fn] of map) {
        if (keysMatch(key, bound)) return run(fn);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
