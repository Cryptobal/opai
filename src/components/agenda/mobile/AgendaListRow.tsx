"use client";

import { useState } from "react";
import { Check, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Avatar, Tag } from "@/components/opai-ds";
import { cn } from "@/lib/utils";
import type { AgendaCalendarItem } from "../agenda-calendar.types";
import { hhmmChile, mobileTypeLabel, typeBarClass } from "./agenda-mobile-utils";

type Props = {
  item: AgendaCalendarItem;
  onSelect: (item: AgendaCalendarItem) => void;
  onChanged: () => void;
};

/** Fila de evento de la vista Agenda móvil (spec §2). */
export function AgendaListRow({ item, onSelect, onChanged }: Props) {
  const [completing, setCompleting] = useState(false);
  const [done, setDone] = useState(false);
  const isTask = item.source === "tarea";
  const isLic = item.source === "licitacion" || item.type === "licitacion";
  const isGoogle = item.source === "google";

  const completeTask = async () => {
    if (completing || done) return;
    setCompleting(true);
    const res = await fetch(`/api/crm/tasks/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    }).catch(() => null);
    setCompleting(false);
    if (res?.ok) {
      setDone(true);
      toast.success("Tarea completada");
      onChanged();
    } else {
      toast.error("No se pudo completar la tarea");
    }
  };

  if (isLic) {
    return (
      <button
        type="button"
        onClick={() => onSelect(item)}
        className="w-full rounded-[18px] border border-status-warn-border px-3 py-2.5 text-left ds-tap"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, hsl(var(--status-warn)/0.12) 0 6px, transparent 6px 12px)",
        }}
      >
        <p className="truncate text-[14px] font-semibold text-ds-text-1">{item.title}</p>
        <p className="mt-0.5 font-mono text-[12px] text-status-warn-fg">
          {licDeadlineLabel(item)}
        </p>
      </button>
    );
  }

  return (
    <div className="opai-glass-soft flex items-stretch gap-2 rounded-[18px] px-2.5 py-2">
      {isTask && (
        <button
          type="button"
          aria-label={done ? "Tarea completada" : "Completar tarea"}
          disabled={completing}
          onClick={completeTask}
          className={cn(
            "my-auto flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md border ds-tap",
            done
              ? "border-status-ok-border bg-status-ok-soft text-status-ok-fg"
              : "border-ds-border-default text-transparent",
          )}
        >
          <Check className="h-3.5 w-3.5" />
        </button>
      )}

      {!item.allDay && (
        <div className="flex w-11 shrink-0 flex-col items-end justify-center">
          <span className="font-mono text-[13px] leading-tight text-ds-text-1">
            {hhmmChile(item.start)}
          </span>
          {!isTask && item.end !== item.start && (
            <span className="font-mono text-[12px] leading-tight text-ds-text-4">
              {hhmmChile(item.end)}
            </span>
          )}
        </div>
      )}

      <div className={cn("w-[3px] shrink-0 self-stretch rounded-full", typeBarClass(item))} />

      <button
        type="button"
        onClick={() => {
          if (isGoogle && item.htmlLink) {
            window.open(item.htmlLink, "_blank", "noopener");
            return;
          }
          onSelect(item);
        }}
        className="min-w-0 flex-1 py-0.5 text-left ds-tap"
      >
        <p
          className={cn(
            "line-clamp-2 text-[14px] font-semibold leading-snug text-ds-text-1",
            done && "line-through text-ds-text-4",
          )}
        >
          {item.title}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Tag variant={isGoogle ? "neutral" : "info"} className="text-[12px]">
            {mobileTypeLabel(item)}
            {isGoogle && <ExternalLink className="ml-1 inline h-3 w-3" />}
          </Tag>
          {item.assignedName && (
            <Avatar name={item.assignedName} size="sm" className="h-5 w-5 text-[12px]" />
          )}
          {item.syncStatus === "SYNCED" && (
            <span className="text-[12px] text-status-ok-fg">☁ sync</span>
          )}
          {item.syncStatus === "PENDING" && (
            <span className="text-[12px] text-status-warn-fg">◌ pendiente</span>
          )}
        </div>
      </button>
    </div>
  );
}

function licDeadlineLabel(item: AgendaCalendarItem): string {
  const entrega = new Date(item.end || item.start);
  if (Number.isNaN(entrega.getTime())) return "LICITACIÓN";
  const dd = entrega.toLocaleDateString("es-CL", {
    day: "numeric",
    month: "short",
    timeZone: "America/Santiago",
  });
  const days = Math.max(0, Math.ceil((entrega.getTime() - Date.now()) / 86_400_000));
  return `entrega ${dd} · ${days}d`;
}
