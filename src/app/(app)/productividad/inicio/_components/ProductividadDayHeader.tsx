"use client";

import Link from "next/link";
import { Plus, PenSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ProductividadDayHeader({
  eventCount,
  unreadCount,
  openTaskCount,
  canCreateTask,
  canComposeEmail,
}: {
  eventCount: number;
  unreadCount: number;
  openTaskCount: number;
  canCreateTask: boolean;
  canComposeEmail: boolean;
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
    <header className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1
          id="prod-my-day"
          className="font-display text-lg font-semibold tracking-tight text-ds-text-1 sm:text-xl"
        >
          Mi día
        </h1>
        <p className="mt-0.5 truncate text-[13px] capitalize text-ds-text-3">
          {dateLabel}
          <span className="text-ds-text-4"> · {counters}</span>
        </p>
      </div>
      {(canCreateTask || canComposeEmail) && (
        <div className="flex shrink-0 items-center gap-2">
          {canCreateTask && (
            <Button asChild variant="outline" size="sm" className="min-h-11 sm:min-h-9">
              <Link href="/opai/tareas?nueva=1">
                <Plus className="mr-1.5 h-4 w-4" />
                Tarea
              </Link>
            </Button>
          )}
          {canComposeEmail && (
            <Button asChild size="sm" className="min-h-11 sm:min-h-9">
              <Link href="/crm/correos?compose=1">
                <PenSquare className="mr-1.5 h-4 w-4" />
                Redactar
              </Link>
            </Button>
          )}
        </div>
      )}
    </header>
  );
}
