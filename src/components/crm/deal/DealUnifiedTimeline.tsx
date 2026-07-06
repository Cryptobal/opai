"use client";

import { type ReactNode, useMemo, useState } from "react";
import { StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";
import { DealTimelineRow, type TimelineEntry } from "./DealTimelineRow";
import {
  buildDealTimelineEntries,
  monthLabel,
  type FollowUpEntry,
  type SystemEvent,
} from "./dealTimeline";

/**
 * DealUnifiedTimeline — línea de tiempo de presentación que fusiona eventos de
 * sistema (activityEvents) y seguimientos automáticos (followUpLogs) del lado
 * cliente. Los correos y las notas viven en componentes con fetch propio, por lo
 * que sus filtros muestran el componente correspondiente (emailSlot) o hacen foco
 * en el compositor (onFocusNotes) — no se duplica su fetching.
 */
interface DealUnifiedTimelineProps {
  activityEvents: SystemEvent[];
  followUpLogs: FollowUpEntry[];
  emailSlot: ReactNode;
  headerAction?: ReactNode;
  onFocusNotes?: () => void;
}

type Filter = "todo" | "notas" | "correos" | "seguimientos" | "sistema";

const CHIPS: { key: Filter; label: string }[] = [
  { key: "todo", label: "Todo" },
  { key: "notas", label: "Notas" },
  { key: "correos", label: "Correos" },
  { key: "seguimientos", label: "Seguimientos" },
  { key: "sistema", label: "Sistema" },
];

export function DealUnifiedTimeline({
  activityEvents,
  followUpLogs,
  emailSlot,
  headerAction,
  onFocusNotes,
}: DealUnifiedTimelineProps) {
  const [filter, setFilter] = useState<Filter>("todo");

  const entries = useMemo<TimelineEntry[]>(
    () => buildDealTimelineEntries(activityEvents, followUpLogs),
    [activityEvents, followUpLogs]
  );

  const visible = entries.filter((e) =>
    filter === "seguimientos" ? e.kind === "followup" : filter === "sistema" ? e.kind === "system" : true
  );

  // Agrupación por mes preservando orden descendente.
  const groups: { label: string; items: TimelineEntry[] }[] = [];
  for (const entry of visible) {
    const label = monthLabel(entry.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(entry);
    else groups.push({ label, items: [entry] });
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {CHIPS.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => {
                setFilter(chip.key);
                if (chip.key === "notas") onFocusNotes?.();
              }}
              className={cn(
                "rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors",
                filter === chip.key
                  ? "bg-primary/10 text-primary"
                  : "text-ds-text-3 hover:bg-muted/50"
              )}
            >
              {chip.label}
            </button>
          ))}
        </div>
        {headerAction}
      </div>

      <div className="px-4 py-4">
        {filter === "correos" ? (
          emailSlot
        ) : filter === "notas" ? (
          <button
            type="button"
            onClick={() => onFocusNotes?.()}
            className="flex w-full items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2.5 text-left text-[13px] text-ds-text-3 hover:bg-muted/40"
          >
            <StickyNote className="h-4 w-4 shrink-0" />
            Las notas se registran en el compositor de arriba. Toca para ir.
          </button>
        ) : groups.length === 0 ? (
          <p className="text-[13px] text-ds-text-3">Sin actividad registrada.</p>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <div key={group.label}>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ds-text-3">
                  {group.label}
                </p>
                <div className="relative space-y-3 pl-6">
                  <div className="absolute left-[7px] top-1 bottom-1 w-px bg-border" />
                  {group.items.map((entry) => (
                    <DealTimelineRow key={entry.id} entry={entry} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
