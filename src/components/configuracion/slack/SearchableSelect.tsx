"use client";

import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
}

/** Combobox mínimo: botón + panel con filtro y lista. Cierra al elegir. */
export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder,
  disabled,
  variant = "floating",
}: {
  options: SelectOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
  /**
   * "floating": panel superpuesto con flip vertical (default, para páginas).
   * "inline": la lista se expande en el flujo — usar DENTRO de modales/Dialog,
   * donde un panel flotante queda recortado por el overflow y el focus-trap
   * de Radix impide portales externos.
   */
  variant?: "floating" | "inline";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [openUp, setOpenUp] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value) ?? null;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.hint?.toLowerCase().includes(q));
  }, [options, query]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!open) {
            // Si no hay espacio abajo (panel ~320px), abrir hacia arriba.
            const rect = containerRef.current?.getBoundingClientRect();
            if (rect) {
              const spaceBelow = window.innerHeight - rect.bottom;
              setOpenUp(spaceBelow < 320 && rect.top > spaceBelow);
            }
          }
          setOpen((v) => !v);
        }}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-left text-sm disabled:opacity-50"
      >
        <span className={selected ? "" : "text-muted-foreground"}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {open && !disabled && (
        <div
          className={
            variant === "inline"
              ? "mt-1 w-full rounded-md border border-border bg-popover shadow-sm"
              : `absolute z-20 w-full rounded-md border border-border bg-popover shadow-md ${openUp ? "bottom-full mb-1" : "top-full mt-1"}`
          }
        >
          <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar…"
              className="h-7 border-0 px-0 focus-visible:ring-0"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">Sin resultados</li>
            ) : (
              filtered.map((o) => (
                <li key={o.value}>
                  <button
                    type="button"
                    onClick={() => { onChange(o.value); setOpen(false); setQuery(""); }}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60"
                  >
                    <span className="min-w-0 truncate">
                      {o.label}
                      {o.hint && <span className="ml-1 text-xs text-muted-foreground">{o.hint}</span>}
                    </span>
                    {o.value === value && <Check className="h-4 w-4 shrink-0 text-primary" />}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
