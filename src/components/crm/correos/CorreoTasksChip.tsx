"use client";

import { ListChecks } from "lucide-react";
import type { CorreoThreadDTO } from "@/modules/crm/email/correos.types";

type Level = CorreoThreadDTO["taskDueLevel"];

function labelFor(count: number, level: Level): string {
  if (level === "overdue") {
    return count === 1 ? "1 vencida" : `${count} vencidas`;
  }
  if (level === "today") return `${count} · hoy`;
  return String(count);
}

function toneClass(level: Level): string {
  if (level === "overdue") {
    return "bg-status-danger-soft text-status-danger-fg border-status-danger-border";
  }
  if (level === "today") {
    return "bg-primary/10 text-primary border-primary/30";
  }
  return "bg-ds-surface-2 text-ds-text-3 border-ds-border-subtle";
}

type Props = {
  count: number;
  level: Level;
  onOpen: () => void;
  compact?: boolean;
};

/** Chip compacto de tareas del hilo (listado correos). */
export function CorreoTasksChip({ count, level, onOpen, compact }: Props) {
  if (count <= 0) return null;
  const label = compact ? String(count) : labelFor(count, level);
  return (
    <button
      type="button"
      title="Tareas del hilo"
      aria-label={`Tareas del hilo: ${labelFor(count, level)}`}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      className={`inline-flex h-5 max-w-[7.5rem] items-center gap-0.5 rounded-md border px-1 text-[12px] font-medium tabular-nums ds-tap ${toneClass(level)}`}
    >
      <ListChecks className="h-3 w-3 shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
    </button>
  );
}
