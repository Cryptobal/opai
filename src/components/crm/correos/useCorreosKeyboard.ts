"use client";

/**
 * Atajos de teclado de la bandeja (C20) — triage completo sin mouse, con
 * teclas CONFIGURABLES (opai.crm.correos.view.v1 → shortcuts). Además de las
 * teclas configuradas, las flechas ↑/↓ siempre navegan (memoria muscular
 * universal) y funcionan también con el lector abierto (saltan al hilo
 * anterior/siguiente sin volver a la lista).
 *
 * No captura nada cuando el foco está en un input/textarea/contenteditable
 * (incluye el command palette, el composer Tiptap y widgets con Shadow DOM
 * como `gmp-place-autocomplete` del plan de acciones) ni con modificadores —
 * así no colisiona con los atajos globales (⌘K etc.). Excepción: `?` abre la
 * ayuda de atajos aunque venga con Shift.
 */

import { useEffect, useRef } from "react";
import {
  COMPOSE_SHORTCUT_ACTIONS,
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
  onReplyAll: () => void;
  onForward: () => void;
  onTrash: () => void;
  onStar: () => void;
  onSnooze: () => void;
  onToggleRead: () => void;
  onFocusSearch: () => void;
  /** Abre el menú de Acciones IA sobre la fila enfocada. */
  onAiMenu: () => void;
  /** Abre el overlay de ayuda de atajos (tecla fija `?`). */
  onHelp: () => void;
  /** Teclas configuradas por el usuario. */
  shortcuts: CorreoShortcuts;
  /** false desactiva todo (p.ej. composer abierto). */
  enabled?: boolean;
  /**
   * true cuando el lector está abierto: prioriza atajos de compose ante
   * colisiones con acciones de bandeja. Los atajos R/A/F siguen
   * despachándose por onReply/onReplyAll/onForward.
   */
  replyHandledExternally?: boolean;
};

const EDITABLE_SCOPE_SELECTOR = [
  "input",
  "textarea",
  "select",
  '[contenteditable="true"]',
  '[contenteditable=""]',
  '[role="textbox"]',
  '[role="searchbox"]',
  '[role="combobox"]',
  '[role="listbox"]',
  "[data-email-composer]",
  "[data-recipient-field]",
  // PlaceAutocompleteElement: el input vive en Shadow DOM; el keydown llega
  // retargeteado al host y sin esto `e`/`r`/`a` archivaban el correo.
  "gmp-place-autocomplete",
].join(", ");

function asHtmlElement(node: EventTarget | null | undefined): HTMLElement | null {
  return node instanceof HTMLElement ? node : null;
}

/** Baja por shadow roots hasta el elemento realmente enfocado. */
function deepActiveElement(
  root: Document | ShadowRoot = document,
): Element | null {
  let el: Element | null = root.activeElement;
  while (el?.shadowRoot?.activeElement) {
    el = el.shadowRoot.activeElement;
  }
  return el;
}

function isEditableElement(el: HTMLElement | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  ) {
    return true;
  }
  const role = el.getAttribute("role");
  if (role === "textbox" || role === "searchbox") return true;
  if (tag === "GMP-PLACE-AUTOCOMPLETE") return true;
  return Boolean(el.closest?.(EDITABLE_SCOPE_SELECTOR));
}

/**
 * True si el keydown no debe disparar atajos de bandeja (usuario escribiendo).
 * Exportado para tests unitarios.
 */
export function isEditableKeyboardTarget(event: KeyboardEvent): boolean {
  const path =
    typeof event.composedPath === "function" ? event.composedPath() : [];
  for (const node of path) {
    if (isEditableElement(asHtmlElement(node))) return true;
  }
  if (isEditableElement(asHtmlElement(event.target))) return true;
  return isEditableElement(asHtmlElement(deepActiveElement()));
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
      if (isEditableKeyboardTarget(event)) return;

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
      const composeKeys = new Set(
        COMPOSE_SHORTCUT_ACTIONS.map((action) => normalizeShortcutKey(sc[action])),
      );

      const map: Array<[string, () => void]> = [
        [sc.down, h.onDown],
        [sc.up, h.onUp],
        [sc.open, h.onOpen],
        [sc.toggleSelect, h.onToggleSelect],
        [sc.archive, h.onArchive],
        [sc.trash, h.onTrash],
        [sc.star, h.onStar],
        [sc.snooze, h.onSnooze],
        [sc.toggleRead, h.onToggleRead],
        [sc.focusSearch, h.onFocusSearch],
        [sc.aiMenu, h.onAiMenu],
      ];

      // Con lector abierto: si una acción de bandeja choca con un atajo de
      // compose (p.ej. Archivar=A y Responder a todos=A), no dispares la de
      // bandeja. Los atajos de lector se manejan SIEMPRE aquí (vía onReply/…)
      // — no depender de CorreoReplyBox, que puede no estar montado aún o
      // perder el evento cuando el foco está en el iframe del cuerpo.
      if (h.replyHandledExternally) {
        for (let i = map.length - 1; i >= 0; i--) {
          const bound = map[i]?.[0];
          if (bound && composeKeys.has(normalizeShortcutKey(bound))) {
            map.splice(i, 1);
          }
        }
      }

      map.push(
        [sc.reply, h.onReply],
        [sc.replyAll, h.onReplyAll],
        [sc.forward, h.onForward],
      );

      for (const [bound, fn] of map) {
        if (keysMatch(key, bound)) return run(fn);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
