"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { PageHero, Surface, EmptyState, Spinner } from "@/components/opai-ds";
import { AgendaWeekStrip, type WeekItem } from "./AgendaWeekStrip";
import { LicitacionesList, type LicRow } from "./LicitacionesList";
import { VisitList } from "./VisitList";

const TYPE_FILTERS = ["todos", "tecnica", "cliente", "supervision", "otra", "licitacion"] as const;

function mondayOf(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

export function AgendaPageClient() {
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [items, setItems] = useState<WeekItem[]>([]);
  const [lics, setLics] = useState<LicRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<(typeof TYPE_FILTERS)[number]>("todos");

  const load = useCallback(async () => {
    setLoading(true);
    const from = weekStart;
    const to = new Date(weekStart);
    to.setDate(to.getDate() + 7);
    try {
      const [a, l] = await Promise.all([
        fetch(`/api/agenda?from=${from.toISOString()}&to=${to.toISOString()}`).then((r) => r.json()),
        fetch("/api/agenda/licitaciones").then((r) => r.json()),
      ]);
      setItems(a.items ?? []);
      setLics(l.items ?? []);
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = items.filter((i) => typeFilter === "todos" || i.type === typeFilter);

  return (
    <div className="ds-page-enter space-y-6">
      <PageHero
        icon={CalendarDays}
        iconTone="violet"
        title="Agenda"
        subtitle="Visitas y licitaciones"
        description="Semana comercial unificada: visitas OPAI + Google Calendar"
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="h-10 rounded-xl border border-ds-border-default px-3 text-[13px] ds-tap sm:h-9"
          onClick={() => {
            const d = new Date(weekStart);
            d.setDate(d.getDate() - 7);
            setWeekStart(d);
          }}
        >
          ← Semana
        </button>
        <button
          type="button"
          className="h-10 rounded-xl border border-ds-border-default px-3 text-[13px] ds-tap sm:h-9"
          onClick={() => setWeekStart(mondayOf(new Date()))}
        >
          Hoy
        </button>
        <button
          type="button"
          className="h-10 rounded-xl border border-ds-border-default px-3 text-[13px] ds-tap sm:h-9"
          onClick={() => {
            const d = new Date(weekStart);
            d.setDate(d.getDate() + 7);
            setWeekStart(d);
          }}
        >
          Semana →
        </button>
        {TYPE_FILTERS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTypeFilter(t)}
            className={`h-10 rounded-full px-3 text-[12px] ds-tap sm:h-9 ${
              typeFilter === t ? "bg-primary text-primary-foreground" : "bg-ds-surface-2 text-ds-text-2"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner className="mx-auto" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Sin visitas esta semana — agenda la primera"
          description="Creá una visita a cliente, supervisión u otra desde el botón Nueva visita."
        />
      ) : (
        <AgendaWeekStrip weekStart={weekStart} items={filtered} />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Surface elevation={1} padding="md" className="space-y-3">
          <p className="text-xs uppercase tracking-wide text-ds-text-4">Próximas visitas</p>
          <VisitList items={filtered} />
        </Surface>
        <Surface elevation={1} padding="md" className="space-y-3">
          <p className="text-xs uppercase tracking-wide text-ds-text-4">Licitaciones en carpeta</p>
          <LicitacionesList items={lics} />
        </Surface>
      </div>
    </div>
  );
}
