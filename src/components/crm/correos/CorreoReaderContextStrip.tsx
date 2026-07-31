"use client";

import { Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  accountId: string | null;
  accountName: string | null;
  canEdit: boolean;
  onOpenAssociations: () => void;
  onSearchAccount: () => void;
};

/**
 * Franja de contexto del lector móvil: una sola línea (~28–32px).
 * Solo cuenta ancla — las tareas viven en el header (sin duplicar).
 */
export function CorreoReaderContextStrip({
  accountId,
  accountName,
  canEdit,
  onOpenAssociations,
  onSearchAccount,
}: Props) {
  return (
    <div
      className={cn(
        "flex h-8 min-h-8 max-h-8 items-center gap-2 overflow-hidden",
        "border-y border-ds-border-subtle",
      )}
    >
      {accountId ? (
        <button
          type="button"
          onClick={onOpenAssociations}
          aria-label={`Asociaciones: ${accountName || "Cuenta"}`}
          className="flex min-h-8 min-w-0 flex-1 items-center gap-1.5 text-left ds-tap"
        >
          <Briefcase className="h-3.5 w-3.5 shrink-0 text-ds-text-3" aria-hidden />
          <span className="truncate text-[12px] font-medium text-ds-text-2">
            {accountName || "Cuenta"}
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={canEdit ? onSearchAccount : undefined}
          disabled={!canEdit}
          className="flex min-h-8 min-w-0 flex-1 items-center gap-1.5 text-left text-[12px] text-status-warn-fg ds-tap disabled:opacity-70"
        >
          <Briefcase className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">{canEdit ? "Asociar cuenta" : "Sin cuenta"}</span>
        </button>
      )}
    </div>
  );
}
