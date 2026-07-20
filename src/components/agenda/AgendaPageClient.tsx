"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { PageHero, Surface, EmptyState, Spinner } from "@/components/opai-ds";
import { AgendaWeekStrip, type WeekItem } from "./AgendaWeekStrip";
import { AgendaFilters, type TypeFilter } from "./AgendaFilters";
import { LicitacionesList, type LicRow } from "./LicitacionesList";
import { VisitList } from "./VisitList";
import { NuevaVisitaModal } from "./NuevaVisitaModal";
import { VisitDrawer } from "./VisitDrawer";
import { LicitacionDrawer } from "./LicitacionDrawer";

function mondayOf(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

export function AgendaPageClient() {
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [items, setItems] = useState<WeekItem[]>([]);
  const [lics, setLics] = useState<LicRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("todos");
  const [assignedUserId, setAssignedUserId] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [visitaId, setVisitaId] = useState<string | null>(null);
  const [licId, setLicId] = useState<string | null>(null);

  const clearParams = useCallback(
    (keys: string[]) => {
      const next = new URLSearchParams(search.toString());
      keys.forEach((k) => next.delete(k));
      router.replace(next.size ? `${pathname}?${next.toString()}` : pathname, { scroll: false });
    },
    [search, router, pathname],
  );

  const ctx = useMemo(
    () => ({
      dealId: search.get("dealId"),
      accountId: search.get("accountId"),
      installationId: search.get("installationId"),
    }),
    [search],
  );

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

  useEffect(() => {
    if (search.get("nueva") === "1") setModalOpen(true);
    if (search.get("visita")) setVisitaId(search.get("visita"));
    if (search.get("licitacion")) setLicId(search.get("licitacion"));
  }, [search]);

  const filtered = items.filter(
    (i) =>
      (typeFilter === "todos" || i.type === typeFilter) &&
      (!assignedUserId || i.assignedUserId === assignedUserId),
  );
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekLabel = `${weekStart.toLocaleDateString("es-CL", { day: "numeric", month: "short" })} – ${weekEnd.toLocaleDateString("es-CL", { day: "numeric", month: "short" })}`;

  return (
    <div className="ds-page-enter space-y-6">
      <PageHero
        icon={CalendarDays}
        iconTone="violet"
        title="Agenda"
        subtitle="Visitas y licitaciones"
        description="Semana comercial unificada: visitas OPAI + Google Calendar"
        actions={
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex h-10 items-center rounded-xl bg-primary px-4 text-[13px] font-medium text-primary-foreground ds-tap sm:h-9"
          >
            Nueva visita
          </button>
        }
      />

      <AgendaFilters
        typeFilter={typeFilter}
        onTypeChange={setTypeFilter}
        assignedUserId={assignedUserId}
        onAssignedChange={setAssignedUserId}
        weekLabel={weekLabel}
        onPrevWeek={() => {
          const d = new Date(weekStart);
          d.setDate(d.getDate() - 7);
          setWeekStart(d);
        }}
        onToday={() => setWeekStart(mondayOf(new Date()))}
        onNextWeek={() => {
          const d = new Date(weekStart);
          d.setDate(d.getDate() + 7);
          setWeekStart(d);
        }}
      />

      {loading ? (
        <Spinner className="mx-auto" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Sin visitas esta semana — agenda la primera"
          description="Creá una visita a cliente, supervisión u otra desde el botón Nueva visita."
          action={
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex h-10 items-center rounded-xl bg-primary px-4 text-[13px] font-medium text-primary-foreground ds-tap sm:h-9"
            >
              Nueva visita
            </button>
          }
        />
      ) : (
        <AgendaWeekStrip
          weekStart={weekStart}
          items={filtered}
          onVisitClick={(i) => {
            if (i.source === "agenda_visita") setVisitaId(i.id);
          }}
          onLicClick={(i) => setLicId(i.dealId || i.id)}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Surface elevation={1} padding="md" className="space-y-3">
          <p className="text-xs uppercase tracking-wide text-ds-text-4">Próximas visitas</p>
          <VisitList
            items={filtered}
            onSelect={(i) => {
              if (i.source === "agenda_visita") setVisitaId(i.id);
            }}
          />
        </Surface>
        <Surface elevation={1} padding="md" className="space-y-3">
          <p className="text-xs uppercase tracking-wide text-ds-text-4">Licitaciones en carpeta</p>
          <LicitacionesList items={lics} onSelect={setLicId} />
        </Surface>
      </div>

      <NuevaVisitaModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        dealId={ctx.dealId}
        accountId={ctx.accountId}
        installationId={ctx.installationId}
        onCreated={() => void load()}
      />
      <VisitDrawer
        visitaId={visitaId}
        onClose={() => setVisitaId(null)}
        onChanged={() => void load()}
      />
      <LicitacionDrawer
        dealId={licId}
        onClose={() => setLicId(null)}
        onAgendar={() => {
          setLicId(null);
          setModalOpen(true);
        }}
      />
    </div>
  );
}
