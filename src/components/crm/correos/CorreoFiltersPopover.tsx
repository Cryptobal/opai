"use client";

/**
 * Popover/sheet de Filtros de Correos con cabecera Limpiar, pie con recuento
 * y Listo. Extiende el patrón visual de FilterPopover sin tocar el primitive DS.
 */

import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CorreoFiltersPanel } from "./CorreoFiltersPanel";
import type { CorreoAssocKey, CorreoFilterFlag } from "./CorreosFilters";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  variant?: "popover" | "sheet";
  align?: "start" | "end";
  assoc: CorreoAssocKey;
  onAssoc: (next: CorreoAssocKey) => void;
  flags: ReadonlySet<CorreoFilterFlag>;
  onToggleFlag: (flag: CorreoFilterFlag) => void;
  onClear: () => void;
  shownCount: number;
  className?: string;
};

export function CorreoFiltersPopover({
  open,
  onOpenChange,
  trigger,
  variant = "popover",
  align = "start",
  assoc,
  onAssoc,
  flags,
  onToggleFlag,
  onClear,
  shownCount,
  className,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const isSheet = variant === "sheet";

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onOpenChange(false);
    }
    function onPointerDown(e: MouseEvent | TouchEvent) {
      const target = e.target as Node | null;
      if (target && rootRef.current && !rootRef.current.contains(target)) {
        onOpenChange(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={rootRef} className={cn("relative", isSheet && "static", className)}>
      <div aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? panelId : undefined}>
        {trigger}
      </div>

      {open && (
        <>
          {isSheet && (
            <div
              aria-hidden
              className="fixed inset-0 z-40 bg-background/60"
              onClick={() => onOpenChange(false)}
            />
          )}
          <div
            id={panelId}
            role="dialog"
            aria-label="Filtros"
            className={cn(
              "border border-ds-border-default bg-ds-surface-2 shadow-ds-lg",
              isSheet
                ? "fixed inset-x-0 bottom-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-ds-lg pb-[max(1rem,env(safe-area-inset-bottom))]"
                : cn(
                    "absolute top-[calc(100%+6px)] z-50 w-[300px] max-w-[92vw] rounded-ds-lg",
                    align === "end" ? "right-0" : "left-0",
                  ),
            )}
          >
            <div className="flex items-center justify-between border-b border-ds-border-subtle px-3 py-2">
              <span className="text-[13px] font-semibold text-ds-text-1">Filtros</span>
              <button
                type="button"
                onClick={onClear}
                className="text-[12px] text-ds-text-3 transition-colors hover:text-ds-text-1"
              >
                Limpiar
              </button>
            </div>

            <CorreoFiltersPanel
              assoc={assoc}
              onAssoc={onAssoc}
              flags={flags}
              onToggleFlag={onToggleFlag}
            />

            <div className="flex items-center justify-between gap-2 border-t border-ds-border-subtle px-3 py-2">
              <span className="text-[12px] tabular-nums text-ds-text-4">
                Mostrando {shownCount} hilo{shownCount === 1 ? "" : "s"}
              </span>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-[12px] font-medium text-primary-foreground ds-tap"
              >
                Listo
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
