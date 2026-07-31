"use client";

import { Briefcase, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCorreoWorkOptional } from "./CorreoWorkContext";

type Props = {
  accountId: string | null;
  accountName: string | null;
  canEdit: boolean;
  onOpenAssociations: () => void;
  onOpenTasks: () => void;
  onSearchAccount: () => void;
};

/**
 * Franja de contexto del lector móvil: una sola línea (~28–32px).
 * Izquierda: cuenta ancla · Derecha: N tareas. La cascada vive en sheet.
 */
export function CorreoReaderContextStrip({
  accountId,
  accountName,
  canEdit,
  onOpenAssociations,
  onOpenTasks,
  onSearchAccount,
}: Props) {
  const work = useCorreoWorkOptional();
  const openTasks = (work?.tasks.data ?? []).filter((t) => t.status !== "done").length;

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

      <button
        type="button"
        onClick={onOpenTasks}
        aria-label={
          openTasks > 0
            ? `${openTasks} tarea${openTasks === 1 ? "" : "s"} abiertas`
            : "Tareas del hilo"
        }
        className="inline-flex h-8 shrink-0 items-center gap-0.5 pl-1 text-[12px] font-medium text-ds-text-3 ds-tap hover:text-ds-text-1"
      >
        <span className="tabular-nums">
          {openTasks > 0 ? `${openTasks} tarea${openTasks === 1 ? "" : "s"}` : "Tareas"}
        </span>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}
