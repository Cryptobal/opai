"use client";

import { SectionHeader } from "@/components/opai-ds";

export function ProductividadDayHeader({
  eventCount,
  unreadCount,
  openTaskCount,
}: {
  eventCount: number;
  unreadCount: number;
  openTaskCount: number;
}) {
  const dateLabel = new Date().toLocaleDateString("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Santiago",
  });

  const counters = [
    `${eventCount} evento${eventCount === 1 ? "" : "s"}`,
    `${unreadCount} correo${unreadCount === 1 ? "" : "s"} sin leer`,
    `${openTaskCount} tarea${openTaskCount === 1 ? "" : "s"} abierta${openTaskCount === 1 ? "" : "s"}`,
  ].join(" · ");

  return (
    <div id="prod-my-day" className="min-w-0">
      <SectionHeader
        size="sm"
        title="Mi día"
        hint={
          <span className="capitalize">
            {dateLabel}
            <span className="text-ds-text-4"> · {counters}</span>
          </span>
        }
      />
    </div>
  );
}
