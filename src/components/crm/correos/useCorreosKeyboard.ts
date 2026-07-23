"use client";

/**
 * Atajos de teclado de la bandeja (C20, PR-14) — triage completo sin mouse:
 *   j / k   → navegar filas (↓ / ↑)
 *   Enter   → abrir la fila enfocada
 *   x       → seleccionar/deseleccionar la fila enfocada (bulk)
 *   e       → archivar
 *   r       → responder (abre el hilo y salta al composer)
 *   #       → papelera
 *   s       → posponer
 *   u       → alternar leído/no leído
 *   /       → foco en la búsqueda
 *
 * No captura nada cuando el foco está en un input/textarea/contenteditable
 * (incluye el command palette y el composer Tiptap) ni con modificadores —
 * así no colisiona con los atajos globales (⌘K etc.).
 */

import { useEffect } from "react";

export type CorreoKeyboardHandlers = {
  onDown: () => void;
  onUp: () => void;
  onOpen: () => void;
  onToggleSelect: () => void;
  onArchive: () => void;
  onReply: () => void;
  onTrash: () => void;
  onSnooze: () => void;
  onToggleRead: () => void;
  onFocusSearch: () => void;
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
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;

      const key = event.key;
      const run = (fn: () => void) => {
        event.preventDefault();
        fn();
      };
      if (key === "j") return run(handlers.onDown);
      if (key === "k") return run(handlers.onUp);
      if (key === "Enter") return run(handlers.onOpen);
      if (key === "x") return run(handlers.onToggleSelect);
      if (key === "e") return run(handlers.onArchive);
      if (key === "r") return run(handlers.onReply);
      if (key === "#") return run(handlers.onTrash);
      if (key === "s") return run(handlers.onSnooze);
      if (key === "u") return run(handlers.onToggleRead);
      if (key === "/") return run(handlers.onFocusSearch);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handlers]);
}
