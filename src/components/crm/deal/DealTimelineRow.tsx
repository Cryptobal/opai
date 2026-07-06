"use client";

import { History, Send } from "lucide-react";
import { cn } from "@/lib/utils";

/** Entrada normalizada del timeline unificado del deal. */
export type TimelineEntry = {
  id: string;
  kind: "system" | "followup";
  title: string;
  subtitle?: string;
  createdAt: string;
};

export function DealTimelineRow({ entry }: { entry: TimelineEntry }) {
  const isFollowUp = entry.kind === "followup";
  const Icon = isFollowUp ? Send : History;
  const when = new Date(entry.createdAt).toLocaleString("es-CL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <div className="relative">
      <div
        className={cn(
          "absolute -left-6 top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-background",
          isFollowUp ? "bg-tint-violet text-tint-violet-fg" : "bg-muted-foreground/40"
        )}
      >
        <Icon className="h-2 w-2 text-background" />
      </div>
      <p className="text-[13px] font-medium leading-tight">{entry.title}</p>
      <p className="mt-0.5 text-[12px] text-ds-text-3">
        {when}
        {entry.subtitle ? ` · ${entry.subtitle}` : ""}
      </p>
    </div>
  );
}
