"use client";

import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { Surface, Spinner, EmptyState, Tag } from "@/components/opai-ds";
import { addDaysChile, startOfDayChile, todayInChile } from "@/lib/dates-cl";
import { cn } from "@/lib/utils";
import { agendaItemCoversDay, agendaItemDayKey } from "./agenda-calendar-utils";
import {
  type HubAgendaItem as Item,
  hhmm,
  agendaDurationMin,
  formatDurationLabel,
  computeFreeSlots,
  hubAgendaDayHref,
  hubAgendaItemHref,
} from "./agenda-hub-item";

export function AgendaHubCardDense({
  items,
  loading,
  todayItems,
  days,
  className,
}: {
  items: Item[];
  loading: boolean;
  todayItems: Item[];
  days: Date[];
  className?: string;
}) {
  const now = new Date();
  const todayKey = todayInChile(now);
  const nowLabel = now.toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Santiago",
  });
  const dayStart = startOfDayChile(now);
  const dayEnd = addDaysChile(dayStart, 1);
  // Huecos solo con eventos timed de hoy (las vencidas carry-forward no cuentan).
  const freeSlots = computeFreeSlots(
    todayItems.filter((i) => agendaItemDayKey(i) === todayKey),
    dayStart,
    dayEnd,
  );

  type Row =
    | { kind: "event"; item: Item; at: number }
    | { kind: "gap"; slot: ReturnType<typeof computeFreeSlots>[number]; at: number };

  const rows: Row[] = [
    ...todayItems.map((item) => ({
      kind: "event" as const,
      item,
      at: new Date(item.start).getTime(),
    })),
    ...freeSlots.map((slot) => ({
      kind: "gap" as const,
      slot,
      at: slot.start.getTime(),
    })),
  ].sort((a, b) => a.at - b.at);

  const upcomingDays = days.slice(1, 4);

  return (
    <Surface
      elevation={1}
      padding="md"
      className={cn("flex min-h-0 min-w-0 flex-col gap-3", className)}
    >
      <div className="flex min-h-11 shrink-0 items-center justify-between gap-2">
        <Link
          href="/opai/agenda"
          aria-label="Abrir agenda"
          className="flex min-h-11 min-w-0 items-center gap-2 rounded-ds-md transition-colors hover:bg-ds-surface-2 ds-tap"
        >
          <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
          <p className="truncate text-[13px] font-semibold text-ds-text-1">Agenda</p>
        </Link>
        <Tag variant="neutral" size="sm" className="shrink-0 tabular-nums">
          {todayItems.length} hoy
        </Tag>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {loading ? (
          <div className="flex min-h-24 items-center justify-center">
            <Spinner />
          </div>
        ) : todayItems.length === 0 && items.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="Sin eventos"
            description="Tu agenda de hoy está libre."
            compact
            action={
              <Link
                href="/opai/agenda"
                className="text-[13px] font-medium text-primary hover:underline"
              >
                Abrir agenda
              </Link>
            }
          />
        ) : (
          <div className="space-y-1">
            <div className="flex items-center gap-2 px-1 py-1">
              <span className="w-12 shrink-0 text-[12px] font-mono tabular-nums text-primary">
                {nowLabel}
              </span>
              <span className="h-px flex-1 bg-primary/40" />
              <span className="text-[12px] text-primary">Ahora</span>
            </div>

            {rows.length === 0 ? (
              <p className="px-1 py-2 text-[13px] text-ds-text-3">Sin visitas hoy</p>
            ) : (
              <ul className="space-y-0.5">
                {rows.map((row) =>
                  row.kind === "gap" ? (
                    <li key={`gap-${row.slot.start.toISOString()}`}>
                      <Link
                        href={`/opai/agenda?nueva=1&start=${encodeURIComponent(row.slot.start.toISOString())}`}
                        className="flex min-h-11 items-center gap-2 rounded-lg border border-dashed border-ds-border-default px-2 py-1.5 text-[13px] text-ds-text-3 transition-colors hover:border-primary/40 hover:text-primary ds-tap"
                      >
                        <span className="w-12 shrink-0 font-mono text-[12px] tabular-nums">
                          {hhmm(row.slot.start.toISOString())}
                        </span>
                        <span className="min-w-0 truncate">
                          {formatDurationLabel(row.slot.minutes)} libres
                        </span>
                      </Link>
                    </li>
                  ) : (
                    <li key={`${row.item.source ?? row.item.type}-${row.item.id}`}>
                      <DenseEventRow item={row.item} />
                    </li>
                  ),
                )}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 space-y-1 border-t border-ds-border-subtle pt-2">
        <p className="text-[12px] uppercase tracking-wide text-ds-text-4">Próximos días</p>
        <ul className="space-y-0.5">
          {upcomingDays.map((d) => {
            const key = d.toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
            const dayItems = items.filter((i) => agendaItemCoversDay(i, key));
            const first = dayItems[0];
            const label = d.toLocaleDateString("es-CL", {
              weekday: "short",
              day: "numeric",
              timeZone: "America/Santiago",
            });
            const summary = first
              ? `${first.allDay ? first.title : `${hhmm(first.start)} · ${first.title}`}${
                  dayItems.length > 1 ? ` +${dayItems.length - 1}` : ""
                }`
              : "Sin eventos";
            return (
              <li key={key}>
                <Link
                  href={hubAgendaDayHref(key)}
                  aria-label={`Abrir agenda del ${label}`}
                  className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg px-1 py-1.5 text-[13px] text-ds-text-2 transition-colors hover:bg-ds-surface-2 ds-tap"
                >
                  <span className="w-16 shrink-0 capitalize text-ds-text-3">{label}</span>
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate",
                      first ? "text-ds-text-2" : "text-ds-text-4",
                    )}
                  >
                    {summary}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </Surface>
  );
}

function DenseEventRow({ item }: { item: Item }) {
  const overdue =
    item.source === "tarea" && agendaItemDayKey(item) < todayInChile();
  const context =
    item.accountName ||
    item.installationName ||
    item.calendarName ||
    (item.source === "google" ? "Google" : item.source === "tarea" ? "Tarea" : null);
  const duration = item.allDay || overdue ? null : formatDurationLabel(agendaDurationMin(item));
  const barTone = overdue
    ? "bg-status-danger"
    : item.source === "tarea"
      ? "bg-primary"
      : item.source === "google"
        ? "bg-status-info"
        : item.allDay
          ? "bg-tint-violet"
          : "bg-status-ok";
  const timeLabel = overdue ? "Venc." : item.allDay ? "Día" : hhmm(item.start);
  const href = hubAgendaItemHref(item);

  return (
    <Link
      href={href}
      className="flex min-h-11 min-w-0 items-stretch gap-2 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-ds-surface-2 ds-tap"
    >
      <span
        className={cn(
          "w-12 shrink-0 self-center font-mono text-[12px] tabular-nums",
          overdue ? "text-status-danger-fg" : "text-ds-text-3",
        )}
      >
        {timeLabel}
      </span>
      <span className={cn("w-0.5 shrink-0 self-stretch rounded-full", barTone)} />
      <span className="min-w-0 flex-1 self-center">
        <span className="block truncate text-[13px] font-medium text-ds-text-1">{item.title}</span>
        {(duration || context) && (
          <span className="block truncate text-[12px] text-ds-text-4">
            {[duration, context].filter(Boolean).join(" · ")}
          </span>
        )}
      </span>
    </Link>
  );
}
