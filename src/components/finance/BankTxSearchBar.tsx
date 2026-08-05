"use client";

import { Search, Loader2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface BankTxSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  loading?: boolean;
  resultCount?: number;
  total?: number | null;
  placeholder?: string;
  className?: string;
}

export function BankTxSearchBar({
  value,
  onChange,
  loading = false,
  resultCount,
  total = null,
  placeholder = "Buscar por descripción, RUT, referencia o monto",
  className,
}: BankTxSearchBarProps) {
  const hasValue = value.trim().length > 0;

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="relative">
        <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-ds-text-3 pointer-events-none" />
        <Input
          id="tx-search"
          type="search"
          inputMode="search"
          enterKeyHint="search"
          maxLength={80}
          placeholder={placeholder}
          className="h-11 sm:h-9 pl-8 pr-11"
          style={{ fontSize: 16 }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Buscar movimientos bancarios"
        />
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center">
          {loading ? (
            <Loader2 className="h-4 w-4 mx-2.5 animate-spin text-ds-text-3" />
          ) : hasValue ? (
            <button
              type="button"
              onClick={() => onChange("")}
              className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] sm:min-w-9 sm:min-h-9 text-ds-text-3 hover:text-ds-text-1"
              aria-label="Limpiar búsqueda"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
      {total != null && (
        <p className="text-[12px] text-ds-text-3 tabular-nums">
          {resultCount ?? 0} de {total} movimiento{total === 1 ? "" : "s"}
        </p>
      )}
    </div>
  );
}
