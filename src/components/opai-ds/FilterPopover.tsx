"use client";

/**
 * OPAI DS v3 — FilterPopover
 *
 * Contenedor de filtros agrupados. En desktop/iPad se ancla al trigger como
 * popover; con `variant="sheet"` se presenta como bottom-sheet móvil
 * respetando `env(safe-area-inset-bottom)`.
 *
 * Cierra por click-outside y por Escape. El estado de los filtros vive en el
 * consumidor: cada opción trae su propio `onToggle`, igual que `FilterChipsBar`.
 */

import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface FilterOption {
  id: string;
  label: string;
  count?: number | null;
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

export interface FilterGroup {
  title: string;
  options: FilterOption[];
}

export interface FilterPopoverProps {
  groups: FilterGroup[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Botón que abre el panel. Se envuelve para anclar el popover. */
  trigger: ReactNode;
  variant?: "popover" | "sheet";
  align?: "start" | "end";
  /** Título del panel (obligatorio visualmente en la variante sheet). */
  title?: string;
  onClear?: () => void;
  className?: string;
}

export function FilterPopover({
  groups,
  open,
  onOpenChange,
  trigger,
  variant = "popover",
  align = "start",
  title = "Filtros",
  onClear,
  className,
}: FilterPopoverProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

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

  const isSheet = variant === "sheet";

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
            aria-label={title}
            className={cn(
              "border border-ds-border-default bg-ds-surface-2 shadow-ds-lg",
              isSheet
                ? "fixed inset-x-0 bottom-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-ds-lg pb-[max(1rem,env(safe-area-inset-bottom))]"
                : cn(
                    "absolute top-[calc(100%+6px)] z-50 w-[280px] max-w-[92vw] rounded-ds-lg",
                    align === "end" ? "right-0" : "left-0",
                  ),
            )}
          >
            <div className="flex items-center justify-between border-b border-ds-border-subtle px-3 py-2">
              <span className="text-[13px] font-semibold text-ds-text-1">{title}</span>
              {onClear && (
                <button
                  type="button"
                  onClick={onClear}
                  className="text-[12px] text-ds-text-3 transition-colors hover:text-ds-text-1"
                >
                  Limpiar
                </button>
              )}
            </div>

            <div className="space-y-3 p-3">
              {groups.map((group) => (
                <div key={group.title} className="space-y-1">
                  <p className="px-1 text-xs uppercase tracking-wide text-ds-text-4">
                    {group.title}
                  </p>
                  {group.options.map((opt) => (
                    <label
                      key={opt.id}
                      className={cn(
                        "flex min-h-[44px] cursor-pointer items-center gap-2 rounded-ds-md px-2 text-[13px] text-ds-text-2 sm:min-h-[36px]",
                        "transition-colors hover:bg-ds-surface-3",
                        opt.disabled && "cursor-not-allowed opacity-40",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={opt.checked}
                        disabled={opt.disabled}
                        onChange={opt.onToggle}
                        className="h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
                      />
                      <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                      {typeof opt.count === "number" && (
                        <span className="shrink-0 text-[12px] tabular-nums text-ds-text-4">
                          {opt.count}
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
