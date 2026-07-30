"use client";

import { Plus } from "lucide-react";

export type AccountSuggestion = {
  id: string;
  name: string;
  reason: string;
  confidence?: "alta" | "media";
};

type Props = {
  suggestions: AccountSuggestion[];
  onAssociate: (accountId: string) => void;
};

/**
 * Chips de cuenta sugerida (lector sin cuenta asociada).
 * Visualmente distintos de una cuenta ya asignada: ícono + y sub-badge de confianza.
 */
export function CorreoAccountSuggestionChips({ suggestions, onAssociate }: Props) {
  if (suggestions.length === 0) return null;

  return (
    <>
      <span className="shrink-0 text-[12px] text-ds-text-4">Sugeridas:</span>
      {suggestions.slice(0, 3).map((s) => (
        <button
          key={s.id}
          type="button"
          title={s.reason}
          aria-label={`Asociar a ${s.name} — ${s.reason}`}
          onClick={() => onAssociate(s.id)}
          className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border border-ds-border-default bg-ds-surface-1 px-2.5 text-[12px] text-ds-text-1 ds-tap sm:min-h-8"
        >
          <Plus className="h-3 w-3 text-ds-text-3" aria-hidden />
          <span className="max-w-[120px] truncate">{s.name}</span>
          {s.confidence && (
            <span className="rounded bg-ds-surface-2 px-1 text-[12px] text-ds-text-4">
              {s.confidence}
            </span>
          )}
        </button>
      ))}
    </>
  );
}
