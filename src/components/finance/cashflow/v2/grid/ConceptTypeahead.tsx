"use client";

import { useMemo, useRef } from "react";
import type { ConceptOption } from "./concept-options";

/** Type-ahead de concepto + opción final Crear "…". Esc cancela. */
export function ConceptTypeahead({
  query,
  onQuery,
  options,
  onChoose,
  onCancel,
}: {
  query: string;
  onQuery: (q: string) => void;
  options: ConceptOption[];
  onChoose: (c: ConceptOption) => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? options.filter(
          (o) =>
            o.name.toLowerCase().includes(q) ||
            o.hint?.toLowerCase().includes(q),
        )
      : options;
    return base.slice(0, 8);
  }, [query, options]);
  const free = query.trim() ? `Crear "${query.trim()}"` : null;

  return (
    <div className="relative">
      <input
        ref={inputRef}
        autoFocus
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
          if (e.key === "Enter" && free) {
            e.preventDefault();
            onChoose({ name: query.trim(), categoryId: null });
          }
        }}
        placeholder="Buscar o crear…"
        className="h-10 w-full rounded-ds-sm border border-ds-border-default bg-ds-surface-1 px-2 text-[13px] text-ds-text-1 sm:h-9"
      />
      <ul className="absolute left-0 right-0 top-full z-40 mt-1 max-h-48 overflow-auto rounded-ds-md border border-ds-border-default bg-ds-surface-1 shadow-md">
        {filtered.map((o) => (
          <li key={`${o.name}-${o.categoryId ?? ""}`}>
            <button
              type="button"
              className="flex h-10 w-full flex-col justify-center px-2 text-left hover:bg-ds-surface-2 sm:h-9"
              onClick={() => onChoose(o)}
            >
              <span className="truncate text-[13px] text-ds-text-1">{o.name}</span>
              {o.hint && (
                <span className="truncate text-[12px] text-ds-text-3">{o.hint}</span>
              )}
            </button>
          </li>
        ))}
        {free && (
          <li>
            <button
              type="button"
              className="flex h-10 w-full items-center px-2 text-left text-[13px] text-primary hover:bg-ds-surface-2 sm:h-9"
              onClick={() => onChoose({ name: query.trim(), categoryId: null })}
            >
              {free}
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}
