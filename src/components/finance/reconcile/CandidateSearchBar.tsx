"use client";

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

export interface CandidateSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  scope: SearchScope;
  onScopeChange: (scope: SearchScope) => void;
  loading?: boolean;
  placeholder?: string;
  /** Scopes visibles (p. ej. ocultar factoring si no hay detección). */
  visibleScopes?: SearchScope[];
}

export function CandidateSearchBar({
  value,
  onChange,
  scope,
  onScopeChange,
  loading = false,
  placeholder = "Buscar folio, cliente, RUT o cesión…",
  visibleScopes,
}: CandidateSearchBarProps) {
  const chips = visibleScopes
    ? SCOPE_CHIPS.filter((c) => visibleScopes.includes(c.id))
    : SCOPE_CHIPS;

  return (
    <div className="space-y-2 bg-background/95 backdrop-blur-sm pb-2">
      <div className="relative">
        <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ds-text-3" />
        <Input
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 sm:h-10 pl-8 pr-9 text-base sm:text-sm"
          aria-label="Buscar candidatos"
        />
        {loading && (
          <Loader2 className="h-3.5 w-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-ds-text-3" />
        )}
      </div>
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Ámbito de búsqueda">
        {chips.map((chip) => {
          const active = scope === chip.id;
          return (
            <button
              key={chip.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onScopeChange(chip.id)}
              className={cn(
                "min-h-11 sm:min-h-9 px-3 rounded-full text-[13px] border transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                active
                  ? "bg-primary/10 border-primary/40 text-primary font-medium"
                  : "bg-ds-surface-1 border-ds-border-default text-ds-text-2 hover:bg-ds-surface-2",
              )}
            >
              {chip.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
