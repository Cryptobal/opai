"use client";

import { useEffect } from "react";
import type { AgendaViewMode } from "../agenda-calendar.types";

type Handlers = {
  onCreate: () => void;
  onFocusSearch: () => void;
  onToday: () => void;
  onViewChange: (view: AgendaViewMode) => void;
  onPrevious: () => void;
  onNext: () => void;
  /** Esc: cerrar panel abierto (quick-create/inspector). */
  onEscape: () => void;
};

/**
 * Atajos globales de la agenda desktop:
 * C crear · / buscar · T hoy · D/3/W/M vistas · ←/→ navegar · Esc cierra.
 * Se ignoran con el foco en inputs o dentro de diálogos (quick-create).
 */
export function useAgendaShortcuts(handlers: Handlers): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          'input, textarea, select, [contenteditable="true"], [role="dialog"]',
        )
      ) {
        return;
      }

      switch (event.key.toLowerCase()) {
        case "c":
          event.preventDefault();
          handlers.onCreate();
          break;
        case "/":
          event.preventDefault();
          handlers.onFocusSearch();
          break;
        case "t":
          event.preventDefault();
          handlers.onToday();
          break;
        case "d":
          handlers.onViewChange("day");
          break;
        case "3":
          handlers.onViewChange("multi");
          break;
        case "w":
          handlers.onViewChange("week");
          break;
        case "m":
          handlers.onViewChange("month");
          break;
        case "arrowleft":
          handlers.onPrevious();
          break;
        case "arrowright":
          handlers.onNext();
          break;
        case "escape":
          handlers.onEscape();
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    handlers.onCreate,
    handlers.onFocusSearch,
    handlers.onToday,
    handlers.onViewChange,
    handlers.onPrevious,
    handlers.onNext,
    handlers.onEscape,
  ]);
}
