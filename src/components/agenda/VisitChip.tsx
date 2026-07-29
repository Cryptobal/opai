"use client";

import { Cloud, CloudOff, Loader2 } from "lucide-react";
import { Tag } from "@/components/opai-ds";
import {
  paletteBorder,
  paletteFgText,
  paletteSoftBg,
} from "@/lib/design/calendar-palette";
import { cn } from "@/lib/utils";

const TYPE_CLASS: Record<string, string> = {
  tecnica: "bg-status-ok-soft text-status-ok-fg border-status-ok-border",
  cliente: "bg-tint-violet text-tint-violet-fg border-tint-violet-fg/30",
  supervision: "bg-status-info-soft text-status-info-fg border-status-info-border",
  otra: "bg-ds-surface-2 text-ds-text-2 border-ds-border-subtle",
};

type Props = {
  type: string;
  title: string;
  start: string;
  syncStatus?: string | null;
  eventColor?: string;
  onClick?: () => void;
  /** Con id, el chip se puede arrastrar a otro día (reprograma + Google Calendar). */
  draggableId?: string;
};

export function VisitChip({
  type,
  title,
  start,
  syncStatus,
  eventColor,
  onClick,
  draggableId,
}: Props) {
  const time = new Date(start).toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const SyncIcon =
    syncStatus === "SYNCED" ? Cloud : syncStatus === "PENDING" ? Loader2 : CloudOff;

  const tone = eventColor
    ? cn(
        paletteSoftBg(eventColor),
        paletteFgText(eventColor),
        "border-l-2",
        paletteBorder(eventColor),
      )
    : TYPE_CLASS[type] ?? TYPE_CLASS.otra;

  return (
    <button
      type="button"
      onClick={onClick}
      draggable={Boolean(draggableId)}
      onDragStart={(e) => {
        if (!draggableId) return;
        e.dataTransfer.setData("application/x-opai-visita", draggableId);
        e.dataTransfer.effectAllowed = "move";
      }}
      className={cn(
        "w-full rounded-xl border px-2 py-1.5 text-left text-[12px] ds-tap",
        draggableId && "cursor-grab active:cursor-grabbing",
        tone,
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="font-medium">{time}</span>
        {syncStatus && <SyncIcon className="h-3.5 w-3.5 shrink-0 opacity-70" />}
      </div>
      <p className="truncate">{title}</p>
      <Tag size="sm" variant="neutral" className="mt-1">
        {type}
      </Tag>
    </button>
  );
}
