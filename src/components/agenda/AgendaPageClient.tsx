"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { PageHero, Surface, EmptyState, Spinner } from "@/components/opai-ds";
import { addDaysChile, startOfDayChile, ymdInChile } from "@/lib/dates-cl";
import { AgendaWeekStrip, type WeekItem } from "./AgendaWeekStrip";
import { LicitacionesList, type LicRow } from "./LicitacionesList";
import { VisitList } from "./VisitList";
import { AgendaFilters, type TypeFilter } from "./AgendaFilters";
import { NuevaVisitaModal } from "./NuevaVisitaModal";
import { VisitDrawer } from "./VisitDrawer";
import { LicitacionDrawer } from "./LicitacionDrawer";

const CAL_RECONNECT_HREF =
  "/api/integrations/google-calendar/oauth/start?return=/opai/agenda";

/** Lunes 00:00 America/Santiago de la semana que contiene `d`. */
function mondayOfChile(d: Date) {
  const start = startOfDayChile(d);
  const dow = new Date(`${ymdInChile(start)}T12:00:00.000Z`).getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  return addDaysChile(start, diff);
}

export function AgendaPageClient() {
  const search = useSearchParams();
  const [weekStart, setWeekStart] = useState(() => mondayOfChile(new Date()));
  const [items, setItems] = useState<WeekItem[]>([]);
  const [lics, setLics] = useState<LicRow[]>([]);
  const [googleStatus, setGoogleStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("todos");
  const [assignedUserId, setAssignedUserId] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [visitaId, setVisitaId] = useState<string | null>(null);
  const [licId, setLicId] = useState<string | null>(null);

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
    const from = startOfDayChile(weekStart);
    const to = addDaysChile(from, 7);
    try {
      const [a, l] = await Promise.all([
        fetch(`/api/agenda?from=${from.toISOString()}&to=${to.toISOString()}`).then((r) => r.json()),
        fetch("/api/agenda/licitaciones").then((r) => r.json()),
      ]);
      setItems(a.items ?? []);
      setGoogleStatus(a.googleStatus ?? null);
      setLics(l.items ?? []);
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => {
    void load();
  }, [load]);

  const calHandled = useRef(false);
  useEffect(() => {
    if (search.get("nueva") === "1") setModalOpen(true);
    if (search.get("visita")) setVisitaId(search.get("visita"));
    if (search.get("licitacion")) setLicId(search.get("licitacion"));
    const cal = search.get("cal");
    if (!cal || calHandled.current) return;
    calHandled.current = true;
    if (cal === "connected") {
      toast.success("Calendar conectado — tus eventos ya aparecen");
      void load();
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("cal");
    window.history.replaceState({}, "", url.pathname + url.search);
  }, [search, load]);

  const filtered = items.filter((i) => {
    if (typeFilter !== "todos" && i.type !== typeFilter) return false;
    if (assignedUserId && i.assignedUserId !== assignedUserId) return false;
    return true;
  });

  const weekLabel = weekStart.toLocaleDateString("es-CL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "America/Santiago",
  });

  const nuevaVisitaBtn = (
    <button
      type="button"
      onClick={() => setModalOpen(true)}
      className="inline-flex h-10 items-center rounded-xl bg-primary px-4 text-[13px] font-medium text-primary-foreground ds-tap sm:h-9"
    >
      Nueva visita
    </button>
  );

  return (
    <div className="ds-page-enter space-y-6">
      <PageHero
        icon={CalendarDays}
        iconTone="violet"
        title="Agenda"
        subtitle="Visitas y licitaciones"
        description="Semana comercial unificada: visitas OPAI + Google Calendar"
        actions={nuevaVisitaBtn}
      />

      <AgendaFilters
        typeFilter={typeFilter}
        onTypeChange={setTypeFilter}
        assignedUserId={assignedUserId}
        onAssignedChange={setAssignedUserId}
        weekLabel={weekLabel}
        onPrevWeek={() => setWeekStart(addDaysChile(weekStart, -7))}
        onToday={() => setWeekStart(mondayOfChile(new Date()))}
        onNextWeek={() => setWeekStart(addDaysChile(weekStart, 7))}
      />

      {(googleStatus === "missing_scope" || googleStatus === "insufficient_scopes") && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-status-warn-border bg-status-warn-soft px-3 py-2.5 text-[13px] text-status-warn-fg">
          <span>
            Reconectá tu Calendar para ver tus eventos — Opai necesita permiso de lectura
          </span>
          <a href={CAL_RECONNECT_HREF} className="shrink-0 font-medium underline underline-offset-2">
            Reconectar
          </a>
        </div>
      )}

      {googleStatus === "error" && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-status-warn-border bg-status-warn-soft px-3 py-2 text-[13px] text-status-warn-fg">
          <span>No pudimos leer tu Google Calendar (token expirado o revocado).</span>
          <a href={CAL_RECONNECT_HREF} className="shrink-0 font-medium underline underline-offset-2">
            Reconectar Calendar
          </a>
        </div>
      )}

      {loading ? (
        <Spinner className="mx-auto" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Sin visitas esta semana — agenda la primera"
          description="Creá una visita a cliente, supervisión u otra desde el botón Nueva visita."
          action={nuevaVisitaBtn}
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
