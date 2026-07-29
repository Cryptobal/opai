"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronRight } from "lucide-react";
import { Surface, Tag, Spinner, EmptyState } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { addDaysChile, startOfDayChile, todayInChile } from "@/lib/dates-cl";
import { cn } from "@/lib/utils";
import { agendaItemDayKey } from "./agenda-calendar-utils";
import { AgendaHubDays } from "./AgendaHubDays";
import { AgendaHubUpcomingList } from "./AgendaHubUpcomingList";
import { AgendaHubCardDense } from "./AgendaHubCardDense";
import { type HubAgendaItem as Item, hhmm } from "./agenda-hub-item";

export type AgendaHubCardProps = {
  /** Si se pasan, el componente no hace fetch propio (hub de Productividad). */
  items?: Item[];
  loading?: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  /** Variante densa del hub productividad (línea ahora, huecos, pie de días). */
  variant?: "default" | "dense";
  className?: string;
};

/**
 * Tarjeta "Mi día" del Hub — resumen de agenda que deriva a /opai/agenda.
 *
 * Puede operar de forma autónoma (fetch interno) o recibir items por props
 * cuando el padre monta `useAgendaHubItems` (Productividad).
 */
export function AgendaHubCard({
  items: itemsProp,
  loading: loadingProp,
  expanded: expandedProp,
  onExpandedChange,
  variant = "default",
  className,
}: AgendaHubCardProps = {}) {
  const controlled = itemsProp !== undefined;
  const [localItems, setLocalItems] = useState<Item[]>([]);
  const [localLoading, setLocalLoading] = useState(true);
  const [localExpanded, setLocalExpanded] = useState(false);

  const expanded = controlled ? Boolean(expandedProp) : localExpanded;
  const setExpanded = (v: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof v === "function" ? v(expanded) : v;
    if (controlled) onExpandedChange?.(next);
    else setLocalExpanded(next);
  };

  useEffect(() => {
    if (controlled) return;
    let cancelled = false;
    setLocalLoading(true);
    const from = startOfDayChile(new Date());
    const to = addDaysChile(from, expanded ? 7 : 4);
    fetch(`/api/agenda?from=${from.toISOString()}&to=${to.toISOString()}`)
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) setLocalItems(j.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setLocalItems([]);
      })
      .finally(() => {
        if (!cancelled) setLocalLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [controlled, expanded]);

  const items = controlled ? itemsProp : localItems;
  const loading = controlled ? Boolean(loadingProp) : localLoading;
  const todayKey = todayInChile();
  // Hoy + tareas pendientes vencidas (carry-forward): sin esto, una tarea de
  // día completo deja de verse en Agenda al pasar la fecha aunque siga abierta.
  const todayItems = items.filter((i) => {
    const key = agendaItemDayKey(i);
    if (key === todayKey) return true;
    return i.source === "tarea" && key < todayKey;
  });
  const days = Array.from({ length: expanded ? 7 : 4 }, (_, i) =>
    addDaysChile(new Date(), i),
  );

  if (variant === "dense") {
    return (
      <AgendaHubCardDense
        items={items}
        loading={loading}
        todayItems={todayItems}
        days={days}
        className={className}
      />
    );
  }

  return (
    <Surface elevation={1} padding="md" className={cn("min-w-0 space-y-3", className)}>
      <Link
        href="/opai/agenda"
        aria-label="Abrir agenda"
        className="flex min-h-11 min-w-0 items-center gap-2 lg:hidden"
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
        <p className="min-w-0 flex-1 truncate font-display text-sm font-semibold text-ds-text-1">
          Agenda
        </p>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-ds-border-subtle bg-ds-surface-2 text-ds-text-3">
          <ChevronRight className="h-4 w-4" />
        </span>
      </Link>

      <div className="hidden min-w-0 items-center justify-between gap-2 lg:flex">
        <div className="flex min-w-0 items-center gap-2">
          <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
          <p className="truncate font-display text-sm font-semibold text-ds-text-1">Agenda</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Compactar" : "Ampliar"}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-32 items-center justify-center">
          <Spinner className="mx-auto" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Sin agenda para los próximos días"
          description="Agenda la primera visita desde CRM o Agenda."
          compact
        />
      ) : (
        <>
          <AgendaHubUpcomingList items={items} className="sm:hidden" />
          <div className="hidden min-w-0 space-y-3 sm:block">
            <div className="min-w-0">
              <p className="mb-1 text-[12px] uppercase tracking-wide text-ds-text-4">Hoy</p>
              {todayItems.length === 0 ? (
                <p className="text-[13px] text-ds-text-3">Sin visitas hoy</p>
              ) : (
                <ul className="space-y-1">
                  {todayItems.map((i) =>
                    i.source === "tarea" ? (
                      <li key={`tarea-${i.id}`} className="min-w-0">
                        <Link
                          href={i.href || "/crm/mi-semana"}
                          className="flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/10 px-2 py-1.5 text-[13px] text-ds-text-1 ds-tap"
                        >
                          <span className="min-w-0 truncate">
                            ✓ {i.allDay ? i.title : `${hhmm(i.start)} · ${i.title}`}
                          </span>
                          <span className="shrink-0 text-[12px] text-primary">Tarea</span>
                        </Link>
                      </li>
                    ) : i.source === "google" ? (
                      <li key={`google-${i.id}`} className="min-w-0">
                        <a
                          href={i.htmlLink || undefined}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between gap-2 rounded-lg bg-ds-surface-3 px-2 py-1.5 text-[13px] text-ds-text-2"
                        >
                          <span className="min-w-0 truncate">
                            {i.allDay ? i.title : `${hhmm(i.start)} · ${i.title}`}
                          </span>
                          <span
                            className="max-w-[40%] shrink-0 truncate text-[12px] font-mono uppercase tracking-[0.08em] text-ds-text-4"
                            title={i.calendarName || "Google Calendar"}
                          >
                            {i.calendarName || "Google"}
                          </span>
                        </a>
                      </li>
                    ) : (
                      <li
                        key={`${i.type}-${i.id}`}
                        className={`flex min-w-0 items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-[13px] ${
                          i.allDay ? "bg-tint-violet/60" : "bg-ds-surface-2"
                        }`}
                      >
                        <span
                          className={`min-w-0 truncate ${i.allDay ? "text-tint-violet-fg" : "text-ds-text-1"}`}
                        >
                          {i.allDay ? `Licitación · ${i.title}` : `${hhmm(i.start)} · ${i.title}`}
                        </span>
                        {!i.allDay && i.syncStatus && (
                          <Tag variant={i.syncStatus === "SYNCED" ? "ok" : "warn"} size="sm">
                            {i.syncStatus}
                          </Tag>
                        )}
                      </li>
                    ),
                  )}
                </ul>
              )}
            </div>
            <AgendaHubDays items={items} days={days} expanded={expanded} />
          </div>
        </>
      )}
    </Surface>
  );
}
