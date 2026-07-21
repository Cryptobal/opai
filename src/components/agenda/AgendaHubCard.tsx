"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { Surface, Tag, Spinner, EmptyState } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { AgendaHubDays } from "./AgendaHubDays";
import { type HubAgendaItem as Item, hhmm } from "./agenda-hub-item";

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function AgendaHubCard() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const from = startOfDay(new Date());
    const to = new Date(from);
    to.setDate(to.getDate() + (expanded ? 7 : 4));
    fetch(`/api/agenda?from=${from.toISOString()}&to=${to.toISOString()}`)
      .then((r) => r.json())
      .then((j) => setItems(j.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [expanded]);

  const todayKey = startOfDay(new Date()).toDateString();
  const todayItems = items.filter((i) => new Date(i.start).toDateString() === todayKey);
  const days = Array.from({ length: expanded ? 7 : 4 }, (_, i) => {
    const d = startOfDay(new Date());
    d.setDate(d.getDate() + i);
    return d;
  });

  return (
    <Surface elevation={1} padding="md" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          <p className="font-display text-sm font-semibold text-ds-text-1">Agenda</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Compactar" : "Ampliar"}
          </Button>
          <Button asChild size="sm">
            <Link href="/opai/agenda">Abrir agenda</Link>
          </Button>
        </div>
      </div>

      {loading ? (
        <Spinner className="mx-auto" />
      ) : items.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Sin agenda para los próximos días"
          description="Agenda la primera visita desde CRM o Agenda."
          compact
        />
      ) : (
        <div className="space-y-3">
          <div>
            <p className="mb-1 text-[12px] uppercase tracking-wide text-ds-text-4">Hoy</p>
            {todayItems.length === 0 ? (
              <p className="text-[13px] text-ds-text-3">Sin visitas hoy</p>
            ) : (
              <ul className="space-y-1">
                {todayItems.map((i) =>
                  i.source === "google" ? (
                    <li key={`google-${i.id}`}>
                      <a
                        href={i.htmlLink || undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between gap-2 rounded-lg bg-ds-surface-3 px-2 py-1.5 text-[13px] text-ds-text-2"
                      >
                        <span className="truncate">
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
                      className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-[13px] ${
                        i.allDay ? "bg-tint-violet/60" : "bg-ds-surface-2"
                      }`}
                    >
                      <span className={`truncate ${i.allDay ? "text-tint-violet-fg" : "text-ds-text-1"}`}>
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
      )}
    </Surface>
  );
}
