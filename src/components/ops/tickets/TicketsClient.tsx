"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Clock,
  FileText,
  Loader2,
  Plus,
  Search,
  Shield,
  ShieldCheck,
  Ticket as TicketIcon,
  User,
  UserCircle,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type Ticket,
  type TicketType,
  type TicketStatus,
  type TicketPriority,
  TICKET_STATUS_CONFIG,
  TICKET_PRIORITY_CONFIG,
  TICKET_TEAM_CONFIG,
  getSlaRemaining,
  getSlaPercentage,
  getSlaColor,
  getSlaTextColor,
  getPriorityBorderColor,
  isSlaBreached,
} from "@/lib/tickets";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import type { SearchableOption } from "@/components/ui/SearchableSelect";
import { TicketsDashboard } from "./TicketsDashboard";
import { TicketsKanban } from "./TicketsKanban";
import { TicketsByInstallationView } from "./TicketsByInstallationView";
import { ArrowLeft } from "lucide-react";

// ═══════════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════════

interface TicketsClientProps {
  userRole: string;
}

type ViewState = { view: "list" } | { view: "create" };

type ListMode = "list" | "cards" | "kanban" | "by-installation";

type ModuleView = "dashboard" | "tickets";

type TicketCounts = {
  total: number;
  active: number;
  slaBreached: number;
  byStatus: Record<string, number>;
  byPriority: Record<"p1" | "p2" | "p3" | "p4", number>;
  byOrigin: { all: number; internal: number; guard: number; client: number };
};

// ═══════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

export function TicketsClient({ userRole }: TicketsClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const prefillSource = searchParams.get("source");
  const prefillSourceId = searchParams.get("sourceId");
  const prefillTitle = searchParams.get("title");
  const prefillGuardiaId = searchParams.get("guardiaId");

  const urlView = searchParams.get("view");
  const initialListMode: ListMode =
    urlView === "by-installation" || urlView === "cards" || urlView === "kanban" || urlView === "list"
      ? urlView
      : "list";
  const urlInstallationId = searchParams.get("installationId");

  const [viewState, setViewState] = useState<ViewState>(
    prefillSource ? { view: "create" } : { view: "list" },
  );
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | TicketStatus>("active");
  const [filterPriorities, setFilterPriorities] = useState<Set<TicketPriority>>(new Set());
  const [originTab, setOriginTab] = useState<"all" | "internal" | "guard" | "client">("all");
  const [listMode, setListMode] = useState<ListMode>(initialListMode);
  const [installationFilterId, setInstallationFilterId] = useState<string | null>(urlInstallationId);
  const [installationCtx, setInstallationCtx] = useState<{ name: string; total: number } | null>(null);
  const [moduleView, setModuleView] = useState<ModuleView>("tickets");
  const [filterTypeId, setFilterTypeId] = useState<string>("all");
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [counts, setCounts] = useState<TicketCounts | null>(null);

  const initialLoadDone = useRef(false);
  const PAGE_SIZE = 50;
  const KANBAN_PAGE_SIZE = 150;

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Build server filter params (everything except page)
  const buildQueryParams = useCallback((pageNum: number, size: number) => {
    const params = new URLSearchParams({
      page: String(pageNum),
      limit: String(size),
    });
    if (installationFilterId) params.set("installationId", installationFilterId);
    if (originTab !== "all") params.set("origin", originTab);
    if (filterStatus === "active") {
      params.set("activeOnly", "true");
    } else if (filterStatus !== "all") {
      params.set("status", filterStatus);
    }
    if (filterPriorities.size > 0) {
      params.set("priorities", Array.from(filterPriorities).join(","));
    }
    if (filterTypeId !== "all") params.set("ticketTypeId", filterTypeId);
    if (debouncedSearch) params.set("search", debouncedSearch);
    return params;
  }, [installationFilterId, originTab, filterStatus, filterPriorities, filterTypeId, debouncedSearch]);

  // Filter signature: when it changes, results must be replaced from page 1.
  // NOTE: listMode is part of the key because kanban uses a larger page size.
  const filterKey = useMemo(() => JSON.stringify({
    installationFilterId,
    originTab,
    filterStatus,
    priorities: Array.from(filterPriorities).sort(),
    filterTypeId,
    debouncedSearch,
    listMode,
  }), [installationFilterId, originTab, filterStatus, filterPriorities, filterTypeId, debouncedSearch, listMode]);

  const fetchTickets = useCallback(async (pageNum: number, replace: boolean) => {
    if (replace) setLoading(true);
    else setLoadingMore(true);
    try {
      const size = listMode === "kanban" ? KANBAN_PAGE_SIZE : PAGE_SIZE;
      const params = buildQueryParams(pageNum, size);
      const res = await fetch(`/api/ops/tickets?${params}`);
      const data = await res.json();
      if (data.success) {
        const incoming: Ticket[] = data.data.items;
        setTickets((prev) => (replace ? incoming : [...prev, ...incoming]));
        setTotal(data.data.total ?? 0);
        setHasMore(Boolean(data.data.hasMore));
        setPage(pageNum);
      }
    } catch {
      toast.error("Error al cargar tickets");
    } finally {
      setLoading(false);
      setLoadingMore(false);
      initialLoadDone.current = true;
    }
  }, [buildQueryParams, listMode]);

  const fetchCounts = useCallback(async (tab: typeof originTab, installId: string | null) => {
    try {
      const params = new URLSearchParams();
      if (tab === "internal" || tab === "guard" || tab === "client") {
        params.set("type", tab);
      }
      if (installId) params.set("installationId", installId);
      const qs = params.toString();
      const res = await fetch(`/api/ops/tickets/counts${qs ? `?${qs}` : ""}`);
      const data = await res.json();
      if (data.success) setCounts(data.data);
    } catch {
      // Counts are non-critical — silently fail
    }
  }, []);

  // Initial + filter-driven load (resets to page 1)
  useEffect(() => {
    fetchTickets(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  // Refresh on focus / visibility change
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "visible" && initialLoadDone.current) {
        fetchTickets(1, true);
        fetchCounts(originTab, installationFilterId);
      }
    }
    function handleFocus() {
      if (initialLoadDone.current) {
        fetchTickets(1, true);
        fetchCounts(originTab, installationFilterId);
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleFocus);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
    };
  }, [fetchTickets, fetchCounts, originTab, installationFilterId]);

  // Counts follow origin tab + installation drill-down
  useEffect(() => {
    fetchCounts(originTab, installationFilterId);
  }, [fetchCounts, originTab, installationFilterId]);

  const handleLoadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    fetchTickets(page + 1, false);
  }, [fetchTickets, page, loadingMore, hasMore]);

  // Sync view + installationId with URL
  useEffect(() => {
    const current = new URLSearchParams(window.location.search);
    if (listMode === "by-installation") current.set("view", "by-installation");
    else if (listMode !== "list") current.set("view", listMode);
    else current.delete("view");
    if (installationFilterId) current.set("installationId", installationFilterId);
    else current.delete("installationId");
    const qs = current.toString();
    router.replace(`/ops/tickets${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [listMode, installationFilterId, router]);

  function handleSelectInstallation(id: string, name: string, total: number) {
    setInstallationFilterId(id);
    setInstallationCtx({ name, total });
    setListMode("list");
  }

  function handleBackToInstallations() {
    setInstallationFilterId(null);
    setInstallationCtx(null);
    setListMode("by-installation");
  }

  // Load ticket types for filter
  useEffect(() => {
    fetch("/api/ops/ticket-types?activeOnly=true")
      .then((r) => r.json())
      .then((d) => { if (d.success) setTicketTypes(d.data); })
      .catch(() => {});
  }, []);

  function togglePriority(p: TicketPriority) {
    setFilterPriorities((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  // Tickets already come filtered from the server; this alias keeps call sites
  // stable during the refactor and is a no-op transformation.
  const filteredTickets = tickets;

  function handleTicketCreated(ticket: Ticket) {
    setTickets((prev) => [ticket, ...prev]);
    setTotal((t) => t + 1);
    setViewState({ view: "list" });
    toast.success(`Ticket ${ticket.code} creado`);
    router.push(`/ops/tickets/${ticket.id}`);
  }

  if (viewState.view === "create") {
    return (
      <TicketCreateForm
        onBack={() => setViewState({ view: "list" })}
        onCreated={handleTicketCreated}
        prefillTitle={prefillTitle ?? undefined}
        prefillSource={prefillSource ?? undefined}
        prefillSourceId={prefillSourceId ?? undefined}
        prefillGuardiaId={prefillGuardiaId ?? undefined}
      />
    );
  }

  return (
    <div className="space-y-3">
      {/* Header + Nuevo ticket */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Tickets</h2>
          <p className="text-xs text-muted-foreground">
            Solicitudes, incidentes y requerimientos internos
          </p>
        </div>
        <Button
          size="sm"
          className="shrink-0 gap-1.5"
          onClick={() => setViewState({ view: "create" })}
        >
          <Plus className="h-4 w-4" />
          Nuevo ticket
        </Button>
      </div>

      {/* Module view switcher: Dashboard / Tickets */}
      <div className="flex gap-1 rounded-lg bg-muted p-0.5">
        {([
          { value: "dashboard" as const, label: "Dashboard" },
          { value: "tickets" as const, label: "Tickets" },
        ]).map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setModuleView(tab.value)}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              moduleView === tab.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Dashboard view */}
      {moduleView === "dashboard" && <TicketsDashboard />}

      {/* Tickets view (List/Cards/Kanban) */}
      {moduleView === "tickets" && (
        <>
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Buscar tickets..."
          className="pl-9 h-10 text-[16px] bg-background"
        />
      </div>

      {/* Totales: banner de conteos globales */}
      {counts && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-white/10 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <span>
            Total: <span className="font-semibold text-foreground">{counts.total}</span>
          </span>
          <span className="text-white/20">·</span>
          <span>
            Activos: <span className="font-semibold text-foreground">{counts.active}</span>
          </span>
          <span className="text-white/20">·</span>
          <span>
            Cerrados: <span className="font-semibold text-foreground">{counts.byStatus.closed ?? 0}</span>
          </span>
          <span className="text-white/20">·</span>
          <span>
            Resueltos: <span className="font-semibold text-foreground">{counts.byStatus.resolved ?? 0}</span>
          </span>
          <span className="text-white/20">·</span>
          <span>
            P1: <span className="font-semibold text-red-400">{counts.byPriority.p1}</span>
          </span>
          <span className="text-white/20">·</span>
          <span>
            SLA vencidos: <span className="font-semibold text-red-400">{counts.slaBreached}</span>
          </span>
        </div>
      )}

      {/* Origin tabs + View mode toggle */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {([
          { value: "all" as const, label: "Todos", countKey: "all" as const },
          { value: "internal" as const, label: "Internos", countKey: "internal" as const },
          { value: "guard" as const, label: "Guardias", countKey: "guard" as const },
          { value: "client" as const, label: "Clientes", countKey: "client" as const },
        ]).map((tab) => {
          const n = counts?.byOrigin[tab.countKey];
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => setOriginTab(tab.value)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                originTab === tab.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
              {typeof n === "number" && (
                <span className="ml-1 opacity-70">({n})</span>
              )}
            </button>
          );
        })}

        {/* View mode toggle: Lista / Cards / Kanban / Por instalación */}
        <div className="ml-auto flex gap-1 rounded-md bg-muted p-0.5">
          {([
            { value: "list" as const, label: "Lista" },
            { value: "cards" as const, label: "Cards" },
            { value: "kanban" as const, label: "Kanban" },
            { value: "by-installation" as const, label: "Por instalación" },
          ]).map((mode) => (
            <button
              key={mode.value}
              type="button"
              onClick={() => {
                setListMode(mode.value);
                if (mode.value === "kanban" && filterStatus === "active") {
                  setFilterStatus("all");
                }
                if (mode.value === "by-installation") {
                  setInstallationFilterId(null);
                  setInstallationCtx(null);
                }
              }}
              className={`rounded-sm px-2 py-1 text-[10px] font-medium ${
                listMode === mode.value ? "bg-background shadow-sm" : "text-muted-foreground"
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filters: Priority pills + Status + Ticket type */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {(Object.entries(TICKET_PRIORITY_CONFIG) as [TicketPriority, (typeof TICKET_PRIORITY_CONFIG)["p1"]][]).map(
          ([key, cfg]) => {
            const active = filterPriorities.has(key);
            const n = counts?.byPriority[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => togglePriority(key)}
                className={`shrink-0 flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors ${
                  active
                    ? `${cfg.bg} ${cfg.border} ${cfg.color}`
                    : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    key === "p1" ? "bg-red-500" : key === "p2" ? "bg-orange-500" : key === "p3" ? "bg-yellow-500" : "bg-muted-foreground/50"
                  }`}
                />
                {cfg.shortLabel}
                {typeof n === "number" && (
                  <span className="opacity-70">({n})</span>
                )}
              </button>
            );
          },
        )}

        {/* Status filter */}
        <Select
          value={filterStatus}
          onValueChange={(v) => setFilterStatus(v as typeof filterStatus)}
        >
          <SelectTrigger className="h-7 w-[130px] text-[11px] border-0 bg-muted/50 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              Todos{typeof counts?.total === "number" ? ` (${counts.total})` : ""}
            </SelectItem>
            <SelectItem value="active">
              Activos{typeof counts?.active === "number" ? ` (${counts.active})` : ""}
            </SelectItem>
            <SelectItem value="pending_approval">
              Pend. aprobación{typeof counts?.byStatus.pending_approval === "number" ? ` (${counts.byStatus.pending_approval})` : ""}
            </SelectItem>
            <SelectItem value="open">
              Abierto{typeof counts?.byStatus.open === "number" ? ` (${counts.byStatus.open})` : ""}
            </SelectItem>
            <SelectItem value="in_progress">
              En progreso{typeof counts?.byStatus.in_progress === "number" ? ` (${counts.byStatus.in_progress})` : ""}
            </SelectItem>
            <SelectItem value="waiting">
              En espera{typeof counts?.byStatus.waiting === "number" ? ` (${counts.byStatus.waiting})` : ""}
            </SelectItem>
            <SelectItem value="resolved">
              Resuelto{typeof counts?.byStatus.resolved === "number" ? ` (${counts.byStatus.resolved})` : ""}
            </SelectItem>
            <SelectItem value="cancelled">Cancelado</SelectItem>
          </SelectContent>
        </Select>

        {/* Ticket type filter */}
        {ticketTypes.length > 0 && (
          <Select
            value={filterTypeId}
            onValueChange={setFilterTypeId}
          >
            <SelectTrigger className="h-7 w-[140px] text-[11px] border-0 bg-muted/50 shrink-0">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tipos</SelectItem>
              {ticketTypes.map((tt) => (
                <SelectItem key={tt.id} value={tt.id}>
                  {tt.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Drill-down breadcrumb (when filtering by a single installation) */}
      {installationFilterId && installationCtx && listMode !== "by-installation" && (
        <div className="flex items-center justify-between rounded-md border border-white/10 bg-muted/30 px-3 py-2 text-xs">
          <div className="flex items-center gap-2 text-muted-foreground">
            <button
              type="button"
              onClick={handleBackToInstallations}
              className="flex items-center gap-1 text-foreground hover:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Volver al mapa
            </button>
            <span>›</span>
            <span className="font-medium text-foreground">{installationCtx.name}</span>
            <span className="text-muted-foreground">
              ({installationCtx.total} {installationCtx.total === 1 ? "ticket activo" : "tickets activos"})
            </span>
          </div>
        </div>
      )}

      {/* By-installation view */}
      {listMode === "by-installation" ? (
        <TicketsByInstallationView
          originTab={originTab}
          onSelectInstallation={handleSelectInstallation}
        />
      ) : listMode === "kanban" ? (
        <>
          <TicketsKanban
            tickets={filteredTickets}
            loading={loading}
            onTicketClick={(id) => router.push(`/ops/tickets/${id}`)}
            onStatusChange={async (ticketId, newStatus) => {
              setTickets((prev) =>
                prev.map((t) => (t.id === ticketId ? { ...t, status: newStatus } : t)),
              );
              try {
                const res = await fetch(`/api/ops/tickets/${ticketId}/transition`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ status: newStatus }),
                });
                const data = await res.json();
                if (!data.success) throw new Error(data.error);
                toast.success(`Estado actualizado`);
              } catch {
                fetchTickets(1, true);
                toast.error("Error al cambiar estado");
              }
            }}
          />
          {hasMore && (
            <div className="flex flex-col items-center gap-2 pt-2">
              <p className="text-[11px] text-muted-foreground">
                Mostrando {filteredTickets.length} de {total}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="gap-1.5"
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Cargando...
                  </>
                ) : (
                  <>Cargar más</>
                )}
              </Button>
            </div>
          )}
        </>
      ) : (
      /* List/Cards content */
      loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filteredTickets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <TicketIcon className="mx-auto h-10 w-10 text-muted-foreground/30" />
          <p className="mt-2 text-sm text-muted-foreground">
            {(counts?.total ?? 0) === 0
              ? "No hay tickets creados todavía."
              : "No hay tickets con los filtros seleccionados."}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-3"
            onClick={() => setViewState({ view: "create" })}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Crear primer ticket
          </Button>
        </div>
      ) : (
        <>
          {listMode === "cards" ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredTickets.map((ticket) => (
                <TicketCard
                  key={ticket.id}
                  ticket={ticket}
                  onClick={() => router.push(`/ops/tickets/${ticket.id}`)}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTickets.map((ticket) => (
                <TicketCard
                  key={ticket.id}
                  ticket={ticket}
                  onClick={() => router.push(`/ops/tickets/${ticket.id}`)}
                />
              ))}
            </div>
          )}

          {/* Pagination: load more + counter */}
          <div className="flex flex-col items-center gap-2 pt-2">
            <p className="text-[11px] text-muted-foreground">
              Mostrando {filteredTickets.length} de {total}
            </p>
            {hasMore && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="gap-1.5"
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Cargando...
                  </>
                ) : (
                  <>Cargar más</>
                )}
              </Button>
            )}
          </div>
        </>
      ))}
        </>
      )}

      {/* FAB - New ticket */}
      <button
        type="button"
        onClick={() => setViewState({ view: "create" })}
        className="fixed bottom-20 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
      >
        <Plus className="h-5 w-5" />
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  TICKET CARD (unified list/card item)
// ═══════════════════════════════════════════════════════════════

const FINDING_CATEGORY_LABELS: Record<string, string> = {
  documentation: "Hallazgo de documentación",
  infrastructure: "Hallazgo de infraestructura",
  equipment: "Hallazgo de equipamiento",
  personnel: "Hallazgo de personal",
  other: "Hallazgo de supervisión",
};

function findingCategoryLabel(category: string | null | undefined): string {
  if (!category) return "Hallazgo de supervisión";
  return FINDING_CATEGORY_LABELS[category] ?? "Hallazgo de supervisión";
}

function TicketCard({ ticket, onClick }: { ticket: Ticket; onClick: () => void }) {
  const statusCfg = TICKET_STATUS_CONFIG[ticket.status];
  const priorityCfg = TICKET_PRIORITY_CONFIG[ticket.priority];
  const slaText = getSlaRemaining(ticket.slaDueAt, ticket.status, ticket.resolvedAt);
  const slaPercent = getSlaPercentage(ticket.slaDueAt, ticket.createdAt, ticket.status, ticket.resolvedAt);
  const slaColor = getSlaColor(slaPercent);
  const slaTextColor = getSlaTextColor(slaPercent);
  const breached = isSlaBreached(ticket.slaDueAt, ticket.status, ticket.resolvedAt);
  const isTerminal = ["resolved", "closed", "rejected", "cancelled"].includes(ticket.status);
  const typeName = ticket.ticketType?.name ?? ticket.assignedTeam;
  const teamName = TICKET_TEAM_CONFIG[ticket.assignedTeam]?.label ?? ticket.assignedTeam;
  const borderColor = getPriorityBorderColor(ticket.priority);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex w-full flex-col gap-2 rounded-xl border-l-[3px] border border-border bg-[#161b22] p-3.5 text-left transition-all hover:bg-[#1c2333] hover:border-primary/20 active:bg-[#1c2333] ${borderColor} ${
        breached && !isTerminal ? "animate-pulse-subtle border-red-500/40" : ""
      }`}
    >
      {/* Row 1: Code + Status + Priority + Avatar */}
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] text-muted-foreground">{ticket.code}</span>
        <Badge variant={statusCfg.variant} className="text-[10px]">
          {statusCfg.label}
        </Badge>
        <span className={`text-[10px] font-semibold ${priorityCfg.color}`}>
          {ticket.priority.toUpperCase()}
        </span>
        {ticket.approvalStatus === "pending" && (
          <Badge variant="secondary" className="text-[10px] gap-0.5">
            <ShieldCheck className="h-2.5 w-2.5" />
            Aprobación
          </Badge>
        )}
        {breached && !isTerminal && (
          <Badge variant="destructive" className="text-[10px] gap-0.5">
            <AlertTriangle className="h-2.5 w-2.5" />
            SLA Vencido
          </Badge>
        )}

        {/* Assignee avatar */}
        <div className="ml-auto">
          {ticket.assignedToName ? (
            <div
              className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-[9px] font-semibold text-primary"
              title={ticket.assignedToName}
            >
              {ticket.assignedToName
                .split(" ")
                .slice(0, 2)
                .map((w) => w[0])
                .join("")
                .toUpperCase()}
            </div>
          ) : (
            <div
              className="flex h-6 w-6 items-center justify-center rounded-full bg-yellow-500/10 text-yellow-500"
              title="Sin asignar"
            >
              <UserCircle className="h-3.5 w-3.5" />
            </div>
          )}
        </div>
      </div>

      {/* Row 2: Title */}
      <p className="text-sm font-medium leading-snug line-clamp-2">{ticket.title}</p>

      {/* Row 2.5: Supervision finding context (documento específico o fallback) */}
      {ticket.finding && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
          <FileText className="h-3 w-3 text-amber-400/80" />
          <span className="font-medium text-amber-200/90">
            {ticket.finding.tipoDocNombre
              ?? ticket.finding.guardiaDocCode
              ?? findingCategoryLabel(ticket.finding.category)}
          </span>
          {ticket.finding.occurrenceCount > 1 && (
            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
              ×{ticket.finding.occurrenceCount}
            </span>
          )}
          {ticket.finding.tipoDocCapa ? (
            <span className="text-[10px] text-muted-foreground capitalize">
              {ticket.finding.tipoDocCapa}
            </span>
          ) : (
            !ticket.finding.tipoDocNombre && !ticket.finding.guardiaDocCode && (
              <span className="text-[10px] text-muted-foreground italic">
                Sin documento específico
              </span>
            )
          )}
          {ticket.finding.guardName && (
            <span className="text-[10px] text-muted-foreground">
              · {ticket.finding.guardName}
            </span>
          )}
        </div>
      )}

      {/* Row 3: Type + Team */}
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="truncate">{typeName}</span>
        <span className="text-border">·</span>
        <span>{teamName}</span>
      </div>

      {/* Row 4: Guard badge (if applicable) */}
      {ticket.guardiaName && (
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5">
            <Shield className="h-3 w-3 text-blue-400" />
            <span className="text-[11px] font-medium text-blue-400">
              {ticket.guardiaName}
            </span>
            {ticket.guardiaRut && (
              <span className="text-[10px] text-blue-400/60">
                ({ticket.guardiaRut})
              </span>
            )}
          </div>
        </div>
      )}

      {/* Row 5: Tags */}
      {ticket.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {ticket.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Row 6: SLA Bar */}
      {slaText && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${slaColor}`}
              style={{ width: `${slaPercent === 0 ? 100 : Math.max(slaPercent ?? 0, 2)}%` }}
            />
          </div>
          <div className={`flex items-center gap-1 text-[10px] font-medium ${slaTextColor}`}>
            <Clock className="h-3 w-3" />
            <span>{slaText}</span>
          </div>
        </div>
      )}

      {/* Hover chevron */}
      <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/0 group-hover:text-muted-foreground/50 transition-colors" />
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════
//  SLA BAR (reusable)
// ═══════════════════════════════════════════════════════════════

export function SlaBar({
  slaDueAt,
  createdAt,
  status,
  resolvedAt,
  showText = true,
}: {
  slaDueAt: string | null;
  createdAt: string;
  status?: TicketStatus;
  resolvedAt?: string | null;
  showText?: boolean;
}) {
  const slaText = getSlaRemaining(slaDueAt, status, resolvedAt);
  const slaPercent = getSlaPercentage(slaDueAt, createdAt, status, resolvedAt);
  const slaColor = getSlaColor(slaPercent);
  const slaTextColor = getSlaTextColor(slaPercent);

  if (!slaText) return null;

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${slaColor}`}
          style={{ width: `${slaPercent === 0 ? 100 : Math.max(slaPercent ?? 0, 2)}%` }}
        />
      </div>
      {showText && (
        <div className={`flex items-center gap-1 text-[10px] font-medium shrink-0 ${slaTextColor}`}>
          <Clock className="h-3 w-3" />
          <span>{slaText}</span>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  CREATE FORM (redesigned)
// ═══════════════════════════════════════════════════════════════

function TicketCreateForm({
  onBack,
  onCreated,
  prefillTitle,
  prefillSource,
  prefillSourceId,
  prefillGuardiaId,
}: {
  onBack: () => void;
  onCreated: (ticket: Ticket) => void;
  prefillTitle?: string;
  prefillSource?: string;
  prefillSourceId?: string;
  prefillGuardiaId?: string;
}) {
  const [saving, setSaving] = useState(false);
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [ticketCategory, setTicketCategory] = useState<"" | "internal" | "guard">("");
  const [selectedTypeId, setSelectedTypeId] = useState("");
  const [title, setTitle] = useState(prefillTitle ?? "");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TicketPriority | "">("");
  const [guardiaId, setGuardiaId] = useState(prefillGuardiaId ?? "");

  // Guard search state
  const [guardiaOptions, setGuardiaOptions] = useState<SearchableOption[]>([]);
  const [guardiaSearchLoading, setGuardiaSearchLoading] = useState(false);

  useEffect(() => {
    async function loadTypes() {
      try {
        const res = await fetch("/api/ops/ticket-types?activeOnly=true");
        const data = await res.json();
        if (data.success) setTicketTypes(data.data);
      } catch {
        toast.error("Error al cargar tipos de ticket");
      } finally {
        setLoadingTypes(false);
      }
    }
    loadTypes();
  }, []);

  // Load initial guard options (or pre-fill)
  useEffect(() => {
    if (prefillGuardiaId) {
      // Load single guard info
      fetch(`/api/ops/guardias-active-search?q=${prefillGuardiaId}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.success && d.data.length > 0) {
            setGuardiaOptions(
              d.data.map((g: any) => ({
                id: g.id,
                label: g.nombreCompleto,
                description: g.rut ? `${g.rut}${g.code ? ` · ${g.code}` : ""}` : g.code ?? "",
              })),
            );
          }
        })
        .catch(() => {});
    }
  }, [prefillGuardiaId]);

  const selectedType = ticketTypes.find((t) => t.id === selectedTypeId);

  const filteredTypes = ticketCategory
    ? ticketTypes.filter((t) => t.origin === "both" || t.origin === ticketCategory)
    : [];

  const showGuardSearch = ticketCategory === "guard";

  function handleCategoryChange(val: string) {
    setTicketCategory(val as "" | "internal" | "guard");
    setSelectedTypeId("");
  }

  function handleTypeChange(val: string) {
    setSelectedTypeId(val);
    const tt = ticketTypes.find((t) => t.id === val);
    if (tt && !priority) setPriority(tt.defaultPriority);
  }

  // Guard search handler
  async function handleGuardSearch(query: string) {
    if (query.length < 2) return;
    setGuardiaSearchLoading(true);
    try {
      const res = await fetch(`/api/ops/guardias-active-search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (data.success) {
        setGuardiaOptions(
          data.data.map((g: any) => ({
            id: g.id,
            label: g.nombreCompleto,
            description: g.rut ? `${g.rut}${g.code ? ` · ${g.code}` : ""}` : g.code ?? "",
            searchText: `${g.nombreCompleto} ${g.rut ?? ""} ${g.code ?? ""}`,
          })),
        );
      }
    } catch {
      /* silent */
    } finally {
      setGuardiaSearchLoading(false);
    }
  }

  // Debounced guard search
  useEffect(() => {
    // We don't auto-search here; SearchableSelect handles it via onInputChange
  }, []);

  const isValid = selectedTypeId && title.trim() && (showGuardSearch ? guardiaId : true);

  async function handleSubmit() {
    if (!isValid || !selectedType) return;
    setSaving(true);
    try {
      const res = await fetch("/api/ops/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketTypeId: selectedType.id,
          title: title.trim(),
          description: description.trim() || null,
          priority: priority || selectedType.defaultPriority,
          assignedTeam: selectedType.assignedTeam,
          source: prefillSource ?? "manual",
          sourceGuardEventId: prefillSourceId ?? null,
          guardiaId: guardiaId || null,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      onCreated(data.data);
    } catch (err: any) {
      toast.error(err?.message ?? "Error al crear ticket");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 max-w-lg mx-auto">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
        Cancelar
      </button>

      <h3 className="text-base font-semibold">Nuevo ticket</h3>

      {prefillSource === "guard_event" && (
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-2.5 text-xs text-blue-400">
          Creando ticket asociado a un evento laboral
        </div>
      )}

      {/* Category selector */}
      <div className="space-y-1.5">
        <Label className="text-xs">Categoría *</Label>
        <Select value={ticketCategory} onValueChange={handleCategoryChange}>
          <SelectTrigger className="text-[16px]">
            <SelectValue placeholder="Seleccionar categoría..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="internal">Solicitud interna</SelectItem>
            <SelectItem value="guard">Solicitud de guardia</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Guard search (appears when category = guard) */}
      {showGuardSearch && (
        <div className="space-y-1.5 rounded-xl border border-blue-500/20 bg-blue-500/5 p-3">
          <Label className="text-xs flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5 text-blue-400" />
            Guardia asociado *
          </Label>
          <GuardSearchInput
            value={guardiaId}
            onChange={setGuardiaId}
            options={guardiaOptions}
            onSearch={handleGuardSearch}
            loading={guardiaSearchLoading}
          />
        </div>
      )}

      {/* Ticket Type */}
      <div className="space-y-1.5">
        <Label className="text-xs">Tipo de solicitud *</Label>
        {loadingTypes ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Cargando tipos...
          </div>
        ) : !ticketCategory ? (
          <p className="text-xs text-muted-foreground py-2">
            Selecciona una categoría primero
          </p>
        ) : (
          <Select value={selectedTypeId} onValueChange={handleTypeChange}>
            <SelectTrigger className="text-[16px]">
              <SelectValue placeholder="Seleccionar tipo de solicitud..." />
            </SelectTrigger>
            <SelectContent>
              {filteredTypes.map((tt) => (
                <SelectItem key={tt.id} value={tt.id}>
                  <div className="flex items-center gap-2">
                    <span>{tt.name}</span>
                    {tt.requiresApproval && (
                      <ShieldCheck className="h-3 w-3 text-blue-500" />
                    )}
                    <span className="text-[10px] text-muted-foreground">
                      {TICKET_TEAM_CONFIG[tt.assignedTeam]?.label}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {selectedType?.description && (
          <p className="text-[11px] text-muted-foreground">{selectedType.description}</p>
        )}
      </div>

      {/* Approval chain preview */}
      {selectedType?.requiresApproval && selectedType.approvalSteps.length > 0 && (
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-2.5 text-xs space-y-1">
          <div className="flex items-center gap-1.5 font-medium text-blue-400">
            <ShieldCheck className="h-3.5 w-3.5" />
            Requiere aprobación
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            {selectedType.approvalSteps.map((step, i) => (
              <span key={step.id} className="flex items-center gap-1">
                {i > 0 && <span className="text-border">→</span>}
                <span>{step.approverGroupName ?? step.label}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Title */}
      <div className="space-y-1.5">
        <Label className="text-xs">Título *</Label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="text-[16px]"
          placeholder="Descripción breve del ticket..."
        />
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label className="text-xs">Descripción</Label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="flex w-full rounded-xl border border-input bg-transparent px-3 py-2 text-[16px] shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          placeholder="Detalle adicional (opcional)..."
        />
      </div>

      {/* Priority — Grid buttons */}
      <div className="space-y-1.5">
        <Label className="text-xs">Prioridad</Label>
        <div className="grid grid-cols-2 gap-2">
          {(Object.entries(TICKET_PRIORITY_CONFIG) as [TicketPriority, (typeof TICKET_PRIORITY_CONFIG)["p1"]][]).map(
            ([key, cfg]) => {
              const active = priority === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPriority(key)}
                  className={`flex items-center gap-2 rounded-xl border p-3 text-left transition-colors ${
                    active
                      ? `${cfg.bg} ${cfg.border} ${cfg.color}`
                      : "border-border bg-card hover:bg-accent/30"
                  }`}
                >
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      key === "p1" ? "bg-red-500" : key === "p2" ? "bg-orange-500" : key === "p3" ? "bg-yellow-500" : "bg-muted-foreground/50"
                    }`}
                  />
                  <div>
                    <p className={`text-xs font-semibold ${active ? cfg.color : ""}`}>{cfg.shortLabel}</p>
                    <p className="text-[10px] text-muted-foreground">{cfg.description}</p>
                  </div>
                </button>
              );
            },
          )}
        </div>
      </div>

      {/* SLA info */}
      {selectedType && (
        <div className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground flex items-center gap-3">
          <Clock className="h-4 w-4 shrink-0" />
          <div>
            <p>
              SLA: <strong className="text-foreground">{selectedType.slaHours}h</strong>
            </p>
            <p>
              Equipo: <strong className="text-foreground">{TICKET_TEAM_CONFIG[selectedType.assignedTeam]?.label}</strong>
            </p>
          </div>
        </div>
      )}

      {/* Submit */}
      <div className="flex items-center gap-2 pt-2 pb-8">
        <Button
          onClick={handleSubmit}
          disabled={!isValid || saving}
          className="flex-1 h-11 gap-1.5 rounded-xl text-[16px]"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Crear ticket
        </Button>
        <Button variant="ghost" onClick={onBack} disabled={saving} className="h-11 rounded-xl">
          Cancelar
        </Button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  GUARD SEARCH INPUT (uses SearchableSelect API)
// ═══════════════════════════════════════════════════════════════

function GuardSearchInput({
  value,
  onChange,
  options,
  onSearch,
  loading,
}: {
  value: string;
  onChange: (id: string) => void;
  options: SearchableOption[];
  onSearch: (query: string) => void;
  loading: boolean;
}) {
  const [query, setQuery] = useState("");
  const onSearchRef = useRef(onSearch);
  onSearchRef.current = onSearch;

  useEffect(() => {
    if (query.length >= 2) {
      const timer = setTimeout(() => onSearchRef.current(query), 300);
      return () => clearTimeout(timer);
    }
  }, [query]);

  const handleInputChange = useCallback((q: string) => {
    setQuery(q);
  }, []);

  return (
    <SearchableSelect
      value={value}
      options={options}
      placeholder="Buscar por nombre, RUT o código..."
      emptyText={loading ? "Buscando..." : query.length < 2 ? "Escribe al menos 2 caracteres" : "Sin resultados"}
      onChange={onChange}
      onInputChange={handleInputChange}
    />
  );
}
