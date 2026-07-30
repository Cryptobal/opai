"use client";

import { Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import { priorityLabel, type TareaPriority } from "@/modules/tareas/tarea-priority";

const OPTIONS: Array<{ value: TareaPriority; tone: string }> = [
  { value: null, tone: "text-ds-text-4 border-ds-border-default" },
  { value: "low", tone: "border-status-info-border bg-status-info-soft text-status-info-fg" },
  { value: "medium", tone: "border-status-warn-border bg-status-warn-soft text-status-warn-fg" },
  { value: "high", tone: "border-status-danger-border bg-status-danger-soft text-status-danger-fg" },
];

/** Chips de prioridad (detalle / creación). null = sin prioridad. */
export function TareaPriorityChips({
  value,
  onChange,
  disabled,
}: {
  value: TareaPriority;
  onChange: (next: TareaPriority) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Prioridad"
      className="flex flex-wrap items-center gap-1.5"
    >
      {OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              "opai-glass-soft inline-flex min-h-[40px] items-center gap-1 rounded-2xl border px-2.5 text-[13px] disabled:opacity-50",
              active ? opt.tone : "border-transparent text-ds-text-3 hover:text-ds-text-1",
            )}
          >
            <Flag className="h-3.5 w-3.5" />
            {priorityLabel(opt.value)}
          </button>
        );
      })}
    </div>
  );
}

/** Color del ícono de bandera cíclica en filas. */
export function priorityFlagClass(p: TareaPriority): string {
  if (p === "high") return "text-status-danger-fg";
  if (p === "medium") return "text-status-warn-fg";
  if (p === "low") return "text-status-info-fg";
  return "text-ds-text-4";
}
