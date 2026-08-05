"use client";

import type { ReactNode } from "react";
import { Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { SearchScope } from "./types";

const SCOPE_CHIPS: Array<{ id: SearchScope; label: string }> = [
  { id: "factoring", label: "Factoring" },
  { id: "ceded", label: "Cedidas" },
  { id: "open", label: "Por cobrar" },
  { id: "all", label: "Todas" },
];

const SCOPE_LABELS: Record<SearchScope, string> = {
  factoring: "Factoring",
  ceded: "Cedidas",
  open: "Por cobrar",
  all: "Todas",
};

export interface CandidateSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  scope: SearchScope;
  onScopeChange: (scope: SearchScope) => void;
  loading?: boolean;
  placeholder?: string;
  /** Scopes visibles (p. ej. ocultar factoring si no hay detección). */
  visibleScopes?: SearchScope[];
  /** Acción a la derecha del input (p. ej. botón Filtrar). */
  rightSlot?: ReactNode;
  resultCount?: number;
  selectedCount?: number;
  onlySelected?: boolean;
  onToggleOnlySelected?: () => void;
}

export function CandidateSearchBar({
  value,
  onChange,
  scope,
  onScopeChange,
  loading = false,
  placeholder = "Folio, cliente, RUT, glosa o cesión",
  visibleScopes,
  rightSlot,
  resultCount,
  selectedCount = 0,
  onlySelected = false,
  onToggleOnlySelected,
}: CandidateSearchBarProps) {
  const chips = visibleScopes
    ? SCOPE_CHIPS.filter((c) => visibleScopes.includes(c.id))
    : SCOPE_CHIPS;

  const scopeLabel = onlySelected
    ? "Solo seleccionadas"
    : SCOPE_LABELS[scope];

  return (
    <div className="space-y-2 bg-background/95 backdrop-blur-sm pb-1">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ds-text-3 pointer-events-none" />
          <Input
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            maxLength={80}
            className="h-11 sm:h-10 pl-8 pr-9 text-base sm:text-sm"
            style={{ fontSize: 16 }}
            aria-label="Buscar candidatos"
          />
          {loading && (
            <Loader2 className="h-3.5 w-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-ds-text-3" />
          )}
        </div>
        {rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}
      </div>
      <div
        className="flex gap-1.5 overflow-x-auto flex-nowrap scrollbar-hide"
        role="tablist"
        aria-label="Ámbito de búsqueda"
      >
        {chips.map((chip) => {
          const active = !onlySelected && scope === chip.id;
          return (
            <button
              key={chip.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                if (onlySelected && onToggleOnlySelected) {
                  onToggleOnlySelected();
                }
                onScopeChange(chip.id);
              }}
              className={cn(
                "h-[30px] min-h-[44px] sm:min-h-[30px] px-3 rounded-full text-[13px] border transition-colors shrink-0",
                "inline-flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                active
                  ? "bg-primary/10 border-primary/40 text-primary font-medium"
                  : "bg-ds-surface-1 border-ds-border-default text-ds-text-2 hover:bg-ds-surface-2",
              )}
            >
              {chip.label}
            </button>
          );
        })}
        {selectedCount > 0 && onToggleOnlySelected && (
          <button
            type="button"
            role="tab"
            aria-selected={onlySelected}
            onClick={onToggleOnlySelected}
            className={cn(
              "h-[30px] min-h-[44px] sm:min-h-[30px] px-3 rounded-full text-[13px] border transition-colors shrink-0",
              "inline-flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              onlySelected
                ? "bg-primary/10 border-primary/40 text-primary font-medium"
                : "bg-ds-surface-1 border-ds-border-default text-ds-text-2 hover:bg-ds-surface-2",
            )}
          >
            Solo seleccionadas
          </button>
        )}
      </div>
      {resultCount != null && (
        <p className="text-[12px] text-ds-text-3 tabular-nums">
          {resultCount} resultado{resultCount === 1 ? "" : "s"} · {scopeLabel}
        </p>
      )}
    </div>
  );
}
