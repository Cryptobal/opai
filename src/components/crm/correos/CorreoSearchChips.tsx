"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import {
  chipsFromQuery,
  removeChipFromQuery,
  type SearchTokenChip,
} from "@/lib/search-tokens";

/** @deprecated Preferir `SearchTokenChip` de `@/lib/search-tokens`. */
export type CorreoSearchChip = SearchTokenChip;

export { chipsFromQuery, removeChipFromQuery };

type Props = {
  query: string;
  onQuery: (q: string) => void;
  /** Chip/acción adicional al final de la fila (p. ej. alcance de búsqueda). */
  trailing?: ReactNode;
};

/** Chips removibles de la consulta interpretada. */
export function CorreoSearchChips({ query, onQuery, trailing }: Props) {
  const chips = chipsFromQuery(query);
  if (chips.length === 0 && !trailing) return null;

  return (
    <div className="flex min-w-0 gap-1.5 overflow-x-auto scrollbar-none py-1">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => onQuery(removeChipFromQuery(query, chip.token))}
          className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full border border-ds-border-default bg-ds-surface-2 px-2.5 text-[12px] text-ds-text-2 ds-tap hover:bg-ds-surface-3 sm:h-8"
          title={`Quitar ${chip.label}`}
        >
          <span className="max-w-[12rem] truncate font-mono">{chip.label}</span>
          <X className="h-3.5 w-3.5 text-ds-text-4" aria-hidden />
        </button>
      ))}
      {trailing}
    </div>
  );
}
