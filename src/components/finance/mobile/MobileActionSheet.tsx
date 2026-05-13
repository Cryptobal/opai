"use client";

/**
 * MobileActionSheet — bottom sheet de acciones para reemplazar
 * `DropdownMenu` en celulares. Cada item es un botón de min-h-48px
 * con icono opcional, label y descripción opcional.
 *
 * Pensado para acciones por fila (DTE emitido, movimiento bancario,
 * conciliación) donde los DropdownMenu pequeños tienen target táctil
 * incómodo y se cortan en pantallas estrechas.
 */

import { type ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export interface MobileActionSheetItem {
  key: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  /** Si está deshabilitado, no se renderiza onClick y se baja opacidad. */
  disabled?: boolean;
  /** Tono visual. `danger` colorea el label en rojo. */
  tone?: "default" | "danger";
  onSelect: () => void;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Encabezado del sheet (ej: "DTE #1234"). */
  title: ReactNode;
  /** Texto secundario opcional bajo el título. */
  description?: ReactNode;
  items: MobileActionSheetItem[];
  /** Acción pinned al fondo (ej: "Cancelar"). Si se omite, se renderiza un Cancelar default. */
  footer?: ReactNode;
}

export function MobileActionSheet({
  open,
  onOpenChange,
  title,
  description,
  items,
  footer,
}: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl max-h-[85vh] overflow-y-auto p-0 gap-0"
      >
        <div
          className="mx-auto mt-2 h-1 w-10 rounded-full bg-border/80"
          aria-hidden="true"
        />
        <SheetHeader className="px-5 pt-4 pb-3 text-left">
          <SheetTitle className="text-base">{title}</SheetTitle>
          {description ? (
            <SheetDescription className="text-xs">
              {description}
            </SheetDescription>
          ) : null}
        </SheetHeader>
        <div className="border-t border-border/60 divide-y divide-border/60">
          {items.map((it) => (
            <button
              key={it.key}
              type="button"
              disabled={it.disabled}
              onClick={() => {
                if (it.disabled) return;
                onOpenChange(false);
                it.onSelect();
              }}
              className={cn(
                "w-full flex items-center gap-3 px-5 py-3 min-h-[52px] text-left active:bg-muted/50",
                it.disabled && "opacity-40 pointer-events-none",
              )}
            >
              {it.icon ? (
                <span className="shrink-0 flex items-center justify-center h-9 w-9 rounded-full bg-muted/40 text-ds-text-2">
                  {it.icon}
                </span>
              ) : null}
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block text-[14px] font-medium",
                    it.tone === "danger"
                      ? "text-status-danger-fg"
                      : "text-ds-text-1",
                  )}
                >
                  {it.label}
                </span>
                {it.description ? (
                  <span className="block text-[12px] text-ds-text-3 truncate">
                    {it.description}
                  </span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
        <div className="border-t border-border/60 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {footer ?? (
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="w-full h-11 rounded-ds-md bg-muted/40 text-[14px] font-medium text-ds-text-1 active:bg-muted/60"
            >
              Cancelar
            </button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
