"use client";

/**
 * AccountPlanCombobox — selector de cuenta contable con búsqueda inline.
 *
 * Reemplaza al `<Select>` viejo en flujos donde el usuario tiene 10+ cuentas
 * por tipo y filtrar por scroll es tedioso. Permite escribir parte del
 * código (`6.1.02`) o del nombre (`combustible`) y matchea ambos.
 *
 * No depende de `cmdk` (no quisimos sumar la dependencia). Construido sobre
 * `<Popover>` + `<Input>` + filtrado client-side.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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

  // Reset query al cerrar (siguiente apertura empieza limpio).
  useEffect(() => {
    if (!open) setQ("");
    if (open) {
      // pequeño delay para que el popover esté montado antes de enfocar.
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  const selected = items.find((i) => i.id === value) ?? null;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((i) => {
      const hay = `${i.code} ${i.name}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [items, q]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-10 sm:h-9 w-full justify-between font-normal text-sm",
            !selected && "text-muted-foreground",
            triggerClassName,
          )}
        >
          <span className="truncate">
            {selected
              ? `${selected.code} ${selected.name}`
              : disabled
                ? "Elegí un tipo primero"
                : emptyLabel}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50 ml-2" />
        </Button>
      </PopoverTrigger>
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
        <ul className="max-h-72 overflow-y-auto py-1">
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
                      "w-full text-left px-3 py-1.5 text-sm hover:bg-muted/50 flex items-center gap-2",
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
      </PopoverContent>
    </Popover>
  );
}
