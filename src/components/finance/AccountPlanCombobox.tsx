"use client";

/**
 * AccountPlanCombobox — selector de cuenta contable con búsqueda inline.
 *
 * Reemplaza al `<Select>` viejo en flujos donde el usuario tiene 10+ cuentas
 * por tipo y filtrar por scroll es tedioso. Permite escribir parte del
 * código (`6.1.02`) o del nombre (`combustible`) y matchea ambos.
 *
 * Desktop: `<Popover>` anclado al trigger.
 * Mobile: bottom sheet en portal con search sticky y scroll dedicado, para
 * evitar el bug de touch-scroll dentro de un Sheet padre.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useIsMobileViewport } from "@/hooks/useIsMobileViewport";
import { cn } from "@/lib/utils";

export interface AccountPlanItem {
  id: string;
  code: string;
  name: string;
}

interface Props {
  items: AccountPlanItem[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Texto cuando no se seleccionó nada y el combo está habilitado. */
  emptyLabel?: string;
  triggerClassName?: string;
}

export function AccountPlanCombobox({
  items,
  value,
  onChange,
  placeholder = "Buscar cuenta…",
  disabled,
  emptyLabel = "Seleccionar cuenta",
  triggerClassName,
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isMobile = useIsMobileViewport();

  // Reset query al cerrar (siguiente apertura empieza limpio).
  useEffect(() => {
    if (!open) {
      setQ("");
      return;
    }
    // Desktop: enfoque diferido para que el popover esté montado.
    // Mobile: el input del portal usa autoFocus directamente.
    if (!isMobile) {
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open, isMobile]);

  const selected = items.find((i) => i.id === value) ?? null;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((i) => {
      const hay = `${i.code} ${i.name}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [items, q]);

  const triggerLabel = selected
    ? `${selected.code} ${selected.name}`
    : disabled
      ? "Elegí un tipo primero"
      : emptyLabel;

  const renderList = (itemClassName?: string) => (
    <ul className="flex-1 overflow-y-auto overscroll-contain py-1">
      {filtered.length === 0 ? (
        <li className="px-3 py-6 text-center text-xs text-muted-foreground">
          Sin coincidencias
        </li>
      ) : (
        filtered.map((it) => {
          const isSelected = it.id === value;
          return (
            <li key={it.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(it.id);
                  setOpen(false);
                }}
                className={cn(
                  "w-full text-left text-sm hover:bg-muted/50 flex items-center gap-2",
                  itemClassName ?? "px-3 py-1.5",
                  isSelected && "bg-muted/30",
                )}
              >
                <Check
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    isSelected ? "opacity-100" : "opacity-0",
                  )}
                />
                <span className="font-mono text-xs text-muted-foreground shrink-0">
                  {it.code}
                </span>
                <span className="truncate">{it.name}</span>
              </button>
            </li>
          );
        })
      )}
    </ul>
  );

  // Mobile: bottom sheet en portal. NO usamos PopoverContent porque la lista
  // queda atrapada en scroll dentro de Sheets padres (ver BankTxReconcileSheet).
  const mobileSheet =
    open && isMobile && typeof document !== "undefined"
      ? createPortal(
          <>
            <div
              aria-hidden
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-in fade-in-0 duration-150"
              onClick={() => setOpen(false)}
            />
            <div
              role="dialog"
              aria-modal="true"
              className={cn(
                "fixed inset-x-0 bottom-0 z-50 flex flex-col",
                "bg-popover border-t border-border/80 rounded-t-2xl shadow-xl",
                "animate-in slide-in-from-bottom duration-200",
                "max-h-[85dvh]",
              )}
              style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
            >
              <div
                aria-hidden
                className="mx-auto mt-2 mb-1 h-1 w-9 rounded-full bg-muted-foreground/30"
              />
              <div className="px-4 pt-1 pb-2">
                <div className="text-sm font-semibold text-foreground">
                  {emptyLabel}
                </div>
              </div>
              <div className="border-b border-border px-3 pb-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    autoFocus
                    placeholder={placeholder}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    className="h-11 pl-9"
                    style={{ fontSize: 16 }}
                  />
                </div>
              </div>
              {renderList("min-h-[48px] px-4")}
              <div className="border-t border-border/60 px-3 py-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="w-full h-11 rounded-lg bg-muted text-sm font-medium text-foreground hover:bg-muted/80 active:bg-muted transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </>,
          document.body,
        )
      : null;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              "h-11 sm:h-9 w-full justify-between font-normal text-sm",
              !selected && "text-muted-foreground",
              triggerClassName,
            )}
          >
            <span className="truncate">{triggerLabel}</span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50 ml-2" />
          </Button>
        </PopoverTrigger>
        {!isMobile && (
          <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
            <div className="border-b border-border p-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  ref={inputRef}
                  placeholder={placeholder}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="h-8 pl-8 text-sm"
                />
              </div>
            </div>
            <div className="max-h-72 flex flex-col">{renderList()}</div>
          </PopoverContent>
        )}
      </Popover>
      {mobileSheet}
    </>
  );
}
