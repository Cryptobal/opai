"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatAgendaTime } from "@/components/agenda/agenda-calendar-utils";
import { hubTareaHref } from "@/components/agenda/agenda-hub-item";
import { todayInChile, ymdInChile } from "@/lib/dates-cl";
import type { TareaBucket } from "@/modules/tareas/tareas.service";
import type { TareaItem } from "./types";

function dueLabel(task: TareaItem): string | null {
  if (!task.dueAt) return null;
  const d = new Date(task.dueAt);
  const day = d.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
    timeZone: "America/Santiago",
  });
  return task.allDay ? day : `${day} · ${formatAgendaTime(d)}`;
}

export function TareaHubRow({
  task,
  bucket,
  bucketLabel,
  canEdit,
  pending,
  onComplete,
}: {
  task: TareaItem;
  bucket: TareaBucket;
  bucketLabel: string;
  canEdit: boolean;
  pending: boolean;
  onComplete: (task: TareaItem) => void;
}) {
  const due = dueLabel(task);
  const todayYmd = todayInChile();
  const overdueTone =
    bucket === "vencidas" ||
    (task.dueAt != null && ymdInChile(new Date(task.dueAt)) < todayYmd);

  return (
    <div className="flex min-h-11 min-w-0 items-center gap-1 rounded-ds-md">
      <button
        type="button"
        onClick={() => onComplete(task)}
        disabled={!canEdit || pending}
        aria-label="Completar tarea"
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border motion-reduce:transition-none sm:h-6 sm:w-6",
          "border-ds-border-default text-transparent transition-colors hover:border-primary",
          "disabled:cursor-not-allowed disabled:opacity-40",
        )}
      >
        <Check className="h-3.5 w-3.5" />
      </button>
      <Link
        href={hubTareaHref(task.id)}
        className="min-w-0 flex-1 rounded-ds-md px-2 py-1.5 transition-colors hover:bg-ds-surface-2 ds-tap"
      >
        <p className="truncate text-[13px] font-medium text-ds-text-1">{task.title}</p>
        <p
          className={cn(
            "truncate text-[12px]",
            overdueTone ? "text-status-danger-fg" : "text-ds-text-4",
          )}
        >
          {bucketLabel}
          {due ? ` · ${due}` : ""}
        </p>
      </Link>
    </div>
  );
}
