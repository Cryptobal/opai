"use client";

import { Check, Trash2, Calendar } from "lucide-react";
import { Avatar } from "@/components/opai-ds";
import { cn } from "@/lib/utils";
import { formatAgendaTime } from "@/components/agenda/agenda-calendar-utils";
import type { TareaItem } from "./types";

function dueLabel(task: TareaItem): string | null {
  if (!task.dueAt) return null;
  const d = new Date(task.dueAt);
  const day = d.toLocaleDateString("es-CL", { day: "2-digit", month: "short", timeZone: "America/Santiago" });
  return task.allDay ? day : `${day} · ${formatAgendaTime(d)}`;
}

/** Fila de tarea reutilizable (desktop y móvil). Touch target ≥44px. */
export function TareaRow({
  task,
  nameById,
  canEdit,
  onToggle,
  onDelete,
}: {
  task: TareaItem;
  nameById: Map<string, string>;
  canEdit: boolean;
  onToggle: (t: TareaItem) => void;
  onDelete: (id: string) => void;
}) {
  const done = task.status === "done";
  const due = dueLabel(task);
  const names = task.assigneeIds.map((id) => nameById.get(id)).filter((n): n is string => Boolean(n));

  return (
    <div className="flex items-center gap-3 border-b border-ds-border-subtle px-1 py-2 last:border-0">
      <button
        type="button"
        onClick={() => canEdit && onToggle(task)}
        disabled={!canEdit}
        aria-label={done ? "Marcar como pendiente" : "Completar tarea"}
        className={cn(
          "flex h-6 w-6 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full border sm:min-h-[24px] sm:min-w-[24px]",
          done
            ? "border-primary bg-primary text-primary-foreground"
            : "border-ds-border-default text-transparent hover:border-primary",
        )}
      >
        <Check className="h-3.5 w-3.5" />
      </button>

      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-[14px] text-ds-text-1", done && "text-ds-text-4 line-through")}>
          {task.title}
        </p>
        {due && (
          <span className="mt-0.5 inline-flex items-center gap-1 text-[12px] text-ds-text-4">
            <Calendar className="h-3 w-3" /> {due}
          </span>
        )}
      </div>

      {names.length > 0 && (
        <div className="flex shrink-0 -space-x-1.5">
          {names.slice(0, 3).map((name, i) => (
            <Avatar key={i} name={name} size="sm" variant="brand" />
          ))}
          {names.length > 3 && (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ds-surface-3 text-[12px] text-ds-text-4">
              +{names.length - 3}
            </span>
          )}
        </div>
      )}

      {canEdit && (
        <button
          type="button"
          onClick={() => onDelete(task.id)}
          aria-label="Eliminar tarea"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ds-text-4 hover:bg-ds-surface-2 hover:text-status-danger-fg"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
