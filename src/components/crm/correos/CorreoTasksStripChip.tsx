"use client";

import { Avatar } from "@/components/opai-ds/Avatar";
import { cn } from "@/lib/utils";
import { todayInChile, ymdInChile } from "@/lib/dates-cl";
import type { CorreoWorkTask } from "./CorreoWorkContext";

function urgencyDot(dueAt: string | null): string {
  if (!dueAt) return "bg-ds-text-4";
  const y = ymdInChile(new Date(dueAt));
  const t = todayInChile();
  if (y < t) return "bg-status-danger";
  if (y === t) return "bg-primary";
  return "bg-status-info";
}

function dueLabel(iso: string | null, allDay: boolean): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  const day = d.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
    timeZone: "America/Santiago",
  });
  if (allDay) return day;
  const time = d.toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Santiago",
  });
  return `${day} · ${time}`;
}

/** Chip de tarea abierta: dot de urgencia, título, vencimiento, avatar. */
export function CorreoTasksStripChip({
  task,
  onClick,
  compact,
}: {
  task: CorreoWorkTask;
  onClick: () => void;
  compact?: boolean;
}) {
  const due = dueLabel(task.dueAt, task.allDay);
  const name = task.assignedTo?.name ?? null;
  return (
    <button
      type="button"
      onClick={onClick}
      title={task.title}
      className={cn(
        "opai-glass-soft inline-flex max-w-[14rem] items-center gap-1.5 rounded-2xl px-2 text-left ds-tap",
        compact ? "min-h-9 py-1" : "min-h-10 py-1.5",
      )}
    >
      <span className={cn("h-2 w-2 shrink-0 rounded-full", urgencyDot(task.dueAt))} aria-hidden />
      <span className="min-w-0 flex-1 truncate text-[13px] text-ds-text-1">{task.title}</span>
      {due && <span className="shrink-0 text-[12px] text-ds-text-3">{due}</span>}
      {name && (
        <Avatar name={name} size="sm" variant="brand" className="!h-5 !w-5 text-[12px]" />
      )}
    </button>
  );
}
