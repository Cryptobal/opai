"use client";

import { CalendarClock, CalendarPlus, Check, Flag, Trash2 } from "lucide-react";
import { Avatar } from "@/components/opai-ds";
import { cn } from "@/lib/utils";
import { formatAgendaTime } from "@/components/agenda/agenda-calendar-utils";
import { todayInChile, ymdInChile, addDaysChile } from "@/lib/dates-cl";
import { cyclePriority } from "@/modules/tareas/tarea-priority";
import { dueFromYmd, DEFAULT_MINUTE, type DueValue } from "./TareaDatePopover";
import { priorityFlagClass } from "./TareaPriorityChips";
import { TareaOriginChip } from "./TareaOriginChip";
import type { TareaItem } from "./types";

function dueInfo(task: TareaItem): { label: string; tone: "danger" | "today" | "neutral" } | null {
  if (!task.dueAt) return null;
  const d = new Date(task.dueAt);
  const day = d.toLocaleDateString("es-CL", { day: "2-digit", month: "short", timeZone: "America/Santiago" });
  const label = task.allDay ? day : `${day} · ${formatAgendaTime(d)}`;
  const dueYmd = ymdInChile(d);
  const today = todayInChile(new Date());
  return { label, tone: dueYmd < today ? "danger" : dueYmd === today ? "today" : "neutral" };
}

/** Fila de tarea clicable. Touch target ≥44px. */
export function TareaRow({
  task, nameById, canEdit, canDelete, selected, onOpen, onToggle, onDelete, onPostpone, onPriority,
}: {
  task: TareaItem;
  nameById: Map<string, string>;
  canEdit: boolean;
  canDelete: boolean;
  selected?: boolean;
  onOpen: (t: TareaItem) => void;
  onToggle: (t: TareaItem) => void;
  onDelete: (id: string) => void;
  onPostpone: (t: TareaItem, next: DueValue) => void;
  onPriority?: (t: TareaItem, next: TareaItem["priority"]) => void;
}) {
  const done = task.status === "done";
  const due = dueInfo(task);
  const names = task.assigneeIds.map((id) => nameById.get(id)).filter((n): n is string => Boolean(n));
  const notesPreview = task.notes?.trim().split("\n")[0] ?? "";
  const toneClass =
    due?.tone === "danger" ? "bg-status-danger-soft text-status-danger-fg"
      : due?.tone === "today" ? "bg-primary/15 text-primary"
        : "text-ds-text-4";

  return (
    <div
      role="button"
      tabIndex={0}
      data-tarea-id={task.id}
      onClick={() => onOpen(task)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(task); } }}
      className={cn(
        "group flex min-h-[44px] cursor-pointer items-start gap-2 border-b border-ds-border-subtle px-1 py-2 last:border-0 sm:gap-3",
        selected && "bg-primary/5",
      )}
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); if (canEdit) onToggle(task); }}
        disabled={!canEdit}
        aria-label={done ? "Marcar como pendiente" : "Completar tarea"}
        className={cn(
          "mt-0.5 flex h-6 w-6 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full border sm:min-h-[24px] sm:min-w-[24px]",
          done ? "border-primary bg-primary text-primary-foreground" : "border-ds-border-default text-transparent hover:border-primary",
        )}
      >
        <Check className="h-3.5 w-3.5" />
      </button>

      {canEdit && onPriority && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onPriority(task, cyclePriority(task.priority)); }}
          aria-label="Cambiar prioridad"
          className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-ds-surface-2", priorityFlagClass(task.priority))}
        >
          <Flag className={cn("h-4 w-4", task.priority ? "fill-current" : "")} />
        </button>
      )}

      <div className="min-w-0 flex-1 py-1">
        <p className={cn("truncate text-[14px] text-ds-text-1", done && "text-ds-text-4 line-through")}>{task.title}</p>
        {notesPreview && <p className="truncate text-[12px] text-ds-text-4">{notesPreview}</p>}
        {(due || task.emailThreadId || task.dealId) && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {due && (
              <span className={cn("inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[12px]", toneClass)}>
                <CalendarClock className="h-3 w-3" /> {due.label}
              </span>
            )}
            <TareaOriginChip task={task} />
          </div>
        )}
      </div>

      {names.length > 0 && (
        <div className="flex shrink-0 -space-x-1.5 pt-1">
          {names.slice(0, 3).map((name, i) => (
            <Avatar key={i} name={name} size="sm" variant="brand" />
          ))}
        </div>
      )}

      {canEdit && canDelete && (
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPostpone(task, dueFromYmd(ymdInChile(addDaysChile(new Date(), 1)), DEFAULT_MINUTE, true));
            }}
            aria-label="Posponer a mañana"
            className="hidden h-9 w-9 items-center justify-center rounded-lg text-ds-text-4 opacity-0 transition-opacity hover:bg-ds-surface-2 hover:text-primary group-hover:opacity-100 sm:flex"
          >
            <CalendarPlus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
            aria-label="Eliminar tarea"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-ds-text-4 hover:bg-ds-surface-2 hover:text-status-danger-fg sm:h-9 sm:w-9"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
