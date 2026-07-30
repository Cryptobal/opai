"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ModuleSearchOperator } from "@/components/opai-ds";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  operators: ModuleSearchOperator[];
  onInsert: (token: string) => void;
  /** Ancla (la pastilla del buscador): el popover se posiciona debajo. */
  anchorRef: React.RefObject<HTMLElement | null>;
  /** Elemento excluido del cierre por clic afuera (botón embudo): sin esto
   *  el mousedown de documento cierra y el click reabre → el toggle muere. */
  excludeRef?: React.RefObject<HTMLElement | null>;
};

/**
 * Popover anclado con operadores insertables del módulo.
 * Portalizado a document.body: dentro del topbar (overflow-hidden, altura
 * fija) quedaba recortado a 0px visibles. Posición fija calculada desde el
 * rect del ancla; el topbar es fijo, así que solo se recalcula en resize.
 */
export function TopbarSearchOperators({
  open,
  onClose,
  operators,
  onInsert,
  anchorRef,
  excludeRef,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPos({
        top: rect.bottom + 6,
        left: rect.left,
        width: Math.min(rect.width, 360),
      });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (excludeRef?.current?.contains(target)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      // Cmd/Ctrl+K abre el command palette: no deben superponerse.
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        onClose();
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, onClose, excludeRef]);

  if (!open || operators.length === 0 || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      ref={panelRef}
      role="listbox"
      aria-label="Operadores de búsqueda"
      style={
        pos
          ? { top: pos.top, left: pos.left, width: pos.width }
          : undefined
      }
      className={cn(
        "fixed z-[60] rounded-2xl border border-ds-border-default bg-ds-surface-2 p-2 shadow-ds-lg",
        "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-150",
        "motion-reduce:animate-none",
        !pos && "invisible",
      )}
    >
      <p className="px-2 pb-1.5 text-[12px] text-ds-text-4">Operadores</p>
      <div className="flex max-h-64 flex-wrap gap-1 overflow-y-auto">
        {operators.map((op) => (
          <button
            key={op.token}
            type="button"
            role="option"
            aria-selected={false}
            title={op.hint}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onInsert(op.token);
              onClose();
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-ds-border-subtle bg-ds-surface-1 px-2.5 font-mono text-[12px] text-ds-text-2 ds-tap hover:border-ds-border-default hover:text-ds-text-1"
          >
            {op.token}
            {op.hint ? (
              <span className="font-sans text-ds-text-4">{op.hint}</span>
            ) : null}
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}
