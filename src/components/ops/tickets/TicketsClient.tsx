"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  Bookmark,
  Check,
  ChevronRight,
  Clock,
  FileText,
  Loader2,
  Plus,
  Search,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Ticket as TicketIcon,
  Trash2,
  User,
  UserCircle,
  X,
} from "lucide-react";
import {
  useTicketSavedViews,
  viewStatesEqual,
  type TicketViewState,
} from "./useTicketSavedViews";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  activeP1: number;
  unassigned: number;
  mine: number;
  byStatus: Record<string, number>;
  byPriority: Record<"p1" | "p2" | "p3" | "p4", number>;
  byOrigin: { all: number; internal: number; guard: number; client: number };
};

type QuickViewKey = "active" | "p1" | "breached" | "unassigned" | "mine" | "all";
type AssignedFilter = "any" | "me" | "unassigned";

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
  const [assignedFilter, setAssignedFilter] = useState<AssignedFilter>("any");
  const [slaOnly, setSlaOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // ── Bulk selection ──
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkTagInput, setBulkTagInput] = useState("");
  const [bulkAdmins, setBulkAdmins] = useState<
    Array<{ id: string; name: string }>
  >([]);

  // Cargar admins solo cuando se entra a modo selección, una vez.
  useEffect(() => {
    if (!selectionMode || bulkAdmins.length > 0) return;
    fetch("/api/ops/admins")
      .then((r) => r.json())
      .then((d) => {
        if (d.success && Array.isArray(d.data)) {
          setBulkAdmins(
            d.data.map((u: { id: string; name: string | null; email: string }) => ({
              id: u.id,
              name: u.name || u.email,
            })),
          );
        }
      })
      .catch(() => {});
  }, [selectionMode, bulkAdmins.length]);

  function toggleSelected(ticketId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(ticketId)) next.delete(ticketId);
      else next.add(ticketId);
      return next;
    });
  }
  function clearSelection() {
    setSelectedIds(new Set());
  }
  function exitSelectionMode() {
    setSelectionMode(false);
    clearSelection();
  }

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
    if (assignedFilter !== "any") params.set("assignedTo", assignedFilter);
    if (slaOnly) params.set("slaBreached", "true");
    if (debouncedSearch) params.set("search", debouncedSearch);
    return params;
  }, [installationFilterId, originTab, filterStatus, filterPriorities, filterTypeId, assignedFilter, slaOnly, debouncedSearch]);

  // Filter signature: when it changes, results must be replaced from page 1.
  // NOTE: listMode is part of the key because kanban uses a larger page size.
  const filterKey = useMemo(() => JSON.stringify({
    installationFilterId,
    originTab,
    filterStatus,
    priorities: Array.from(filterPriorities).sort(),
    filterTypeId,
    assignedFilter,
    slaOnly,
    debouncedSearch,
    listMode,
  }), [installationFilterId, originTab, filterStatus, filterPriorities, filterTypeId, assignedFilter, slaOnly, debouncedSearch, listMode]);

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

  // Ejecuta una acción masiva contra /api/ops/tickets/bulk y refresca.
  const runBulkAction = useCallback(
    async (
      action: "assign" | "status" | "priority" | "addTag" | "removeTag",
      payload: Record<string, unknown>,
    ) => {
      if (selectedIds.size === 0) return;
      setBulkLoading(true);
      try {
        const res = await fetch("/api/ops/tickets/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ticketIds: Array.from(selectedIds),
            action,
            payload,
          }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        const { updated, skipped } = data.data as {
          updated: number;
          skipped: number;
        };
        toast.success(
          `${updated} actualizado${updated === 1 ? "" : "s"}${
            skipped > 0
              ? ` · ${skipped} omitido${skipped === 1 ? "" : "s"}`
              : ""
          }`,
        );
        exitSelectionMode();
        fetchTickets(1, true);
        fetchCounts(originTab, installationFilterId);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Error en operación masiva",
        );
      } finally {
        setBulkLoading(false);
      }
    },
    [selectedIds, fetchTickets, fetchCounts, originTab, installationFilterId],
  );

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

  // ── Vistas guardadas (localStorage) ──
  const {
    views: savedViews,
    save: saveView,
    remove: removeView,
    rename: renameView,
  } = useTicketSavedViews();
  const [savedViewsOpen, setSavedViewsOpen] = useState(false);
  const [savedViewName, setSavedViewName] = useState("");

  const currentViewState: TicketViewState = useMemo(
    () => ({
      filterStatus,
      filterPriorities: Array.from(filterPriorities),
      originTab,
      filterTypeId,
      assignedFilter,
      slaOnly,
      search: debouncedSearch,
    }),
    [
      filterStatus,
      filterPriorities,
      originTab,
      filterTypeId,
      assignedFilter,
      slaOnly,
      debouncedSearch,
    ],
  );

  function applyViewState(state: TicketViewState) {
    setFilterStatus(state.filterStatus);
    setFilterPriorities(new Set(state.filterPriorities));
    setOriginTab(state.originTab);
    setFilterTypeId(state.filterTypeId);
    setAssignedFilter(state.assignedFilter);
    setSlaOnly(state.slaOnly);
    setSearchQuery(state.search ?? "");
    setInstallationFilterId(null);
  }

  // Apply a quick-view preset (one-click filter combo).
  function applyQuickView(key: QuickViewKey) {
    // Baseline: active only, no priorities, any assignee, no sla flag, no origin/type filter.
    setOriginTab("all");
    setFilterTypeId("all");
    setFilterPriorities(new Set());
    setAssignedFilter("any");
    setSlaOnly(false);
    switch (key) {
      case "active":
        setFilterStatus("active");
        break;
      case "p1":
        setFilterStatus("active");
        setFilterPriorities(new Set(["p1"]));
        break;
      case "breached":
        setFilterStatus("active");
        setSlaOnly(true);
        break;
      case "unassigned":
        setFilterStatus("active");
        setAssignedFilter("unassigned");
        break;
      case "mine":
        setFilterStatus("active");
        setAssignedFilter("me");
        break;
      case "all":
        setFilterStatus("all");
        break;
    }
  }

  // Derive the active quick view from current state (null if custom combo).
  const activeQuickView: QuickViewKey | null = (() => {
    const base =
      originTab === "all" &&
      filterTypeId === "all" &&
      !debouncedSearch;
    if (!base) return null;
    if (filterStatus === "active" && filterPriorities.size === 0 && assignedFilter === "any" && !slaOnly) {
      return "active";
    }
    if (
      filterStatus === "active" &&
      filterPriorities.size === 1 &&
      filterPriorities.has("p1") &&
      assignedFilter === "any" &&
      !slaOnly
    ) {
      return "p1";
    }
    if (filterStatus === "active" && filterPriorities.size === 0 && assignedFilter === "any" && slaOnly) {
      return "breached";
    }
    if (filterStatus === "active" && filterPriorities.size === 0 && assignedFilter === "unassigned" && !slaOnly) {
      return "unassigned";
    }
    if (filterStatus === "active" && filterPriorities.size === 0 && assignedFilter === "me" && !slaOnly) {
      return "mine";
    }
    if (filterStatus === "all" && filterPriorities.size === 0 && assignedFilter === "any" && !slaOnly) {
      return "all";
    }
    return null;
  })();

  // Active-filter chips (beyond the quick view baseline).
  const activeChips: Array<{ key: string; label: string; onClear: () => void }> = [];
  if (activeQuickView === null) {
    if (filterStatus === "active") {
      activeChips.push({ key: "status", label: "Activos", onClear: () => setFilterStatus("all") });
    } else if (filterStatus !== "all") {
      const cfg = TICKET_STATUS_CONFIG[filterStatus];
      activeChips.push({
        key: "status",
        label: `Estado: ${cfg?.label ?? filterStatus}`,
        onClear: () => setFilterStatus("all"),
      });
    }
    if (filterPriorities.size > 0) {
      const list = Array.from(filterPriorities).map((p) => p.toUpperCase()).join(", ");
      activeChips.push({
        key: "priority",
        label: `Prioridad: ${list}`,
        onClear: () => setFilterPriorities(new Set()),
      });
    }
    if (slaOnly) {
      activeChips.push({ key: "sla", label: "SLA vencidos", onClear: () => setSlaOnly(false) });
    }
    if (assignedFilter === "me") {
      activeChips.push({ key: "assigned", label: "Asignados a mí", onClear: () => setAssignedFilter("any") });
    } else if (assignedFilter === "unassigned") {
      activeChips.push({ key: "assigned", label: "Sin asignar", onClear: () => setAssignedFilter("any") });
    }
  }
  if (originTab !== "all") {
    const originLabels = { internal: "Internos", guard: "Guardias", client: "Clientes" } as const;
    activeChips.push({
      key: "origin",
      label: `Origen: ${originLabels[originTab]}`,
      onClear: () => setOriginTab("all"),
    });
  }
  if (filterTypeId !== "all") {
    const tt = ticketTypes.find((t) => t.id === filterTypeId);
    activeChips.push({
      key: "type",
      label: `Tipo: ${tt?.name ?? "…"}`,
      onClear: () => setFilterTypeId("all"),
    });
  }

  function resetAllFilters() {
    applyQuickView("active");
    setSearchQuery("");
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

      {/* Quick views — one-click filter presets */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {([
          { key: "active" as const, label: "Activos", count: counts?.active, tone: "primary" as const },
          { key: "p1" as const, label: "P1", count: counts?.activeP1, tone: "danger" as const },
          { key: "breached" as const, label: "SLA vencidos", count: counts?.slaBreached, tone: "danger" as const },
          { key: "unassigned" as const, label: "Sin asignar", count: counts?.unassigned, tone: "warning" as const },
          { key: "mine" as const, label: "Míos", count: counts?.mine, tone: "default" as const },
          { key: "all" as const, label: "Todos", count: counts?.total, tone: "default" as const },
        ]).map((q) => {
          const on = activeQuickView === q.key;
          const toneOn =
            q.tone === "primary"
              ? "bg-primary text-primary-foreground"
              : q.tone === "danger"
                ? "bg-status-danger-soft text-status-danger-fg border-status-danger-border"
                : q.tone === "warning"
                  ? "bg-status-warn-soft text-status-warn-fg border-status-warn-border"
                  : "bg-background text-foreground border-border";
          return (
            <button
              key={q.key}
              type="button"
              onClick={() => applyQuickView(q.key)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                on ? toneOn : "border-transparent bg-muted/60 text-muted-foreground hover:text-foreground"
              }`}
            >
              {q.label}
              {typeof q.count === "number" && (
                <span className="ml-1 opacity-80">({q.count})</span>
              )}
            </button>
          );
        })}

        {/* Vistas guardadas (localStorage) — al final de los quick views */}
        <Popover open={savedViewsOpen} onOpenChange={setSavedViewsOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={`shrink-0 inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                savedViews.length > 0 &&
                savedViews.some((v) => viewStatesEqual(v.state, currentViewState))
                  ? "bg-primary/10 text-primary border-primary/30"
                  : "border-transparent bg-muted/60 text-muted-foreground hover:text-foreground"
              }`}
              title="Vistas guardadas"
            >
              <Bookmark className="h-3.5 w-3.5" />
              <span>Mis vistas</span>
              {savedViews.length > 0 && (
                <span className="opacity-80">({savedViews.length})</span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-72 p-0"
            sideOffset={6}
          >
            <div className="border-b border-border p-3 space-y-2">
              <Label className="text-xs">Guardar vista actual</Label>
              <div className="flex items-center gap-1.5">
                <Input
                  value={savedViewName}
                  onChange={(e) => setSavedViewName(e.target.value)}
                  placeholder="Ej: Mis P1 críticos"
                  className="h-9 text-[13px]"
                  maxLength={60}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && savedViewName.trim()) {
                      e.preventDefault();
                      saveView(savedViewName.trim(), currentViewState);
                      setSavedViewName("");
                      toast.success("Vista guardada");
                    }
                  }}
                />
                <Button
                  size="sm"
                  className="h-9 text-xs"
                  disabled={!savedViewName.trim()}
                  onClick={() => {
                    if (!savedViewName.trim()) return;
                    saveView(savedViewName.trim(), currentViewState);
                    setSavedViewName("");
                    toast.success("Vista guardada");
                  }}
                >
                  <Star className="mr-1 h-3 w-3" />
                  Guardar
                </Button>
              </div>
            </div>

            <div className="max-h-72 overflow-y-auto p-1">
              {savedViews.length === 0 ? (
                <p className="px-3 py-3 text-center text-xs text-muted-foreground">
                  Sin vistas guardadas. Combina filtros y guarda esta vista para reutilizarla.
                </p>
              ) : (
                <ul className="space-y-0.5">
                  {savedViews.map((v) => {
                    const isActive = viewStatesEqual(v.state, currentViewState);
                    return (
                      <li
                        key={v.id}
                        className={`flex items-center gap-1 rounded-md px-1.5 py-1 ${
                          isActive ? "bg-primary/10" : "hover:bg-accent"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            applyViewState(v.state);
                            setSavedViewsOpen(false);
                          }}
                          className="flex flex-1 items-center gap-2 text-left text-[13px]"
                          title={`Aplicar vista: ${v.name}`}
                        >
                          <Star
                            className={`h-3 w-3 ${
                              isActive
                                ? "text-primary"
                                : "text-muted-foreground"
                            }`}
                          />
                          <span className="truncate">{v.name}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const next = window.prompt(
                              "Renombrar vista:",
                              v.name,
                            );
                            if (next && next.trim()) renameView(v.id, next);
                          }}
                          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                          aria-label="Renombrar vista"
                          title="Renombrar"
                        >
                          <FileText className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeView(v.id)}
                          className="rounded p-1 text-muted-foreground hover:bg-status-danger-soft hover:text-status-danger-fg"
                          aria-label="Eliminar vista"
                          title="Eliminar"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Toolbar: Filtros popover + view mode */}
      <div className="flex items-center gap-2 flex-wrap">
        <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filtros
              {activeChips.length > 0 && (
                <span className="ml-0.5 rounded-full bg-primary/15 px-1.5 text-[12px] font-semibold text-primary">
                  {activeChips.length}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-[320px] max-w-[92vw] p-4 space-y-3"
            onInteractOutside={(e) => {
              // Nested Radix Selects are portaled OUTSIDE this popover. Without
              // this guard, opening a Select closes the whole Filtros popover.
              const target = e.target as HTMLElement | null;
              if (!target) return;
              if (
                target.closest?.("[data-radix-select-content]") ||
                target.closest?.("[data-radix-select-trigger]") ||
                target.closest?.("[data-radix-select-viewport]") ||
                target.closest?.("[role='option']")
              ) {
                e.preventDefault();
              }
            }}
          >
            {/* Estado */}
            <div className="space-y-1.5">
              <Label className="text-[12px] uppercase tracking-wide text-muted-foreground">Estado</Label>
              <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as typeof filterStatus)}>
                <SelectTrigger className="h-10 sm:h-9 text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[200]">
                  <SelectItem value="active">Activos {typeof counts?.active === "number" ? `(${counts.active})` : ""}</SelectItem>
                  <SelectItem value="all">Todos {typeof counts?.total === "number" ? `(${counts.total})` : ""}</SelectItem>
                  <SelectItem value="pending_approval">Pend. aprobación {typeof counts?.byStatus.pending_approval === "number" ? `(${counts.byStatus.pending_approval})` : ""}</SelectItem>
                  <SelectItem value="open">Abierto {typeof counts?.byStatus.open === "number" ? `(${counts.byStatus.open})` : ""}</SelectItem>
                  <SelectItem value="in_progress">En progreso {typeof counts?.byStatus.in_progress === "number" ? `(${counts.byStatus.in_progress})` : ""}</SelectItem>
                  <SelectItem value="waiting">En espera {typeof counts?.byStatus.waiting === "number" ? `(${counts.byStatus.waiting})` : ""}</SelectItem>
                  <SelectItem value="resolved">Resuelto {typeof counts?.byStatus.resolved === "number" ? `(${counts.byStatus.resolved})` : ""}</SelectItem>
                  <SelectItem value="cancelled">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Prioridad (multi) — sin contadores crudos para no confundir contexto */}
            <div className="space-y-1.5">
              <Label className="text-[12px] uppercase tracking-wide text-muted-foreground">Prioridad</Label>
              <div className="flex flex-wrap gap-1.5">
                {(Object.entries(TICKET_PRIORITY_CONFIG) as [TicketPriority, (typeof TICKET_PRIORITY_CONFIG)["p1"]][]).map(
                  ([key, cfg]) => {
                    const on = filterPriorities.has(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => togglePriority(key)}
                        className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors ${
                          on ? `${cfg.bg} ${cfg.border} ${cfg.color}` : "border-border bg-muted/50 text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        <span className={`h-2 w-2 rounded-full ${
                          key === "p1" ? "bg-status-danger" : key === "p2" ? "bg-status-warn" : key === "p3" ? "bg-status-warn" : "bg-muted-foreground/50"
                        }`} />
                        {cfg.shortLabel}
                      </button>
                    );
                  },
                )}
              </div>
            </div>

            {/* Origen */}
            <div className="space-y-1.5">
              <Label className="text-[12px] uppercase tracking-wide text-muted-foreground">Origen</Label>
              <Select value={originTab} onValueChange={(v) => setOriginTab(v as typeof originTab)}>
                <SelectTrigger className="h-10 sm:h-9 text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[200]">
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="internal">Internos</SelectItem>
                  <SelectItem value="guard">Guardias</SelectItem>
                  <SelectItem value="client">Clientes</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Asignación */}
            <div className="space-y-1.5">
              <Label className="text-[12px] uppercase tracking-wide text-muted-foreground">Asignación</Label>
              <Select value={assignedFilter} onValueChange={(v) => setAssignedFilter(v as AssignedFilter)}>
                <SelectTrigger className="h-10 sm:h-9 text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[200]">
                  <SelectItem value="any">Cualquiera</SelectItem>
                  <SelectItem value="me">Asignados a mí</SelectItem>
                  <SelectItem value="unassigned">Sin asignar</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Tipo */}
            {ticketTypes.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-[12px] uppercase tracking-wide text-muted-foreground">Tipo</Label>
                <Select value={filterTypeId} onValueChange={setFilterTypeId}>
                  <SelectTrigger className="h-10 sm:h-9 text-[13px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[200]">
                    <SelectItem value="all">Todos los tipos</SelectItem>
                    {ticketTypes.map((tt) => (
                      <SelectItem key={tt.id} value={tt.id}>{tt.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* SLA */}
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={slaOnly}
                onChange={(e) => setSlaOnly(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              Solo con SLA vencido
              {typeof counts?.slaBreached === "number" && (
                <span className="text-muted-foreground">({counts.slaBreached})</span>
              )}
            </label>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={resetAllFilters}
                className="text-[12px] text-muted-foreground hover:text-foreground"
              >
                Restablecer
              </button>
              <Button size="sm" onClick={() => setFiltersOpen(false)} className="h-7 text-xs">
                Listo
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Selection mode toggle (solo en list/cards). Bulk no aplica a
            kanban/by-installation porque la unidad de interacción ahí es
            distinta (drag, drilldown). */}
        {(listMode === "list" || listMode === "cards") && (
          <Button
            type="button"
            variant={selectionMode ? "secondary" : "outline"}
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => {
              if (selectionMode) exitSelectionMode();
              else setSelectionMode(true);
            }}
          >
            <Check className="h-3.5 w-3.5" />
            {selectionMode
              ? selectedIds.size > 0
                ? `${selectedIds.size} seleccionado${selectedIds.size === 1 ? "" : "s"}`
                : "Cancelar selección"
              : "Seleccionar"}
          </Button>
        )}

        {/* View mode toggle */}
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
              className={`rounded-sm px-2 py-1 text-[12px] font-medium ${
                listMode === mode.value ? "bg-background shadow-sm" : "text-muted-foreground"
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {/* Active filter chips (only when filters don't match a quick view) */}
      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {activeChips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[12px]"
            >
              {chip.label}
              <button
                type="button"
                onClick={chip.onClear}
                className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
                aria-label={`Quitar filtro ${chip.label}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={resetAllFilters}
            className="text-[12px] text-muted-foreground hover:text-foreground"
          >
            Limpiar todo
          </button>
        </div>
      )}

      {/* Bulk action bar (visible cuando hay tickets seleccionados) */}
      {selectionMode && (
        <div className="sticky top-0 z-30 -mx-1 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-primary/10">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-medium text-foreground">
              {selectedIds.size === 0
                ? "Selecciona tickets para acciones masivas"
                : `${selectedIds.size} seleccionado${selectedIds.size === 1 ? "" : "s"}`}
            </span>

            {selectedIds.size > 0 && (
              <button
                type="button"
                onClick={() =>
                  setSelectedIds(new Set(filteredTickets.map((t) => t.id)))
                }
                className="text-[12px] text-muted-foreground hover:text-foreground"
              >
                Seleccionar visibles ({filteredTickets.length})
              </button>
            )}
            {selectedIds.size > 0 && (
              <button
                type="button"
                onClick={clearSelection}
                className="text-[12px] text-muted-foreground hover:text-foreground"
              >
                Quitar selección
              </button>
            )}

            {/* Acciones — solo visibles con al menos 1 seleccionado */}
            {selectedIds.size > 0 && (
              <div className="ml-auto flex flex-wrap items-center gap-1.5">
                {/* Asignar */}
                <Select
                  value=""
                  onValueChange={(v) => {
                    if (!v) return;
                    if (v === "__unassign__") {
                      runBulkAction("assign", { assignedTo: null });
                    } else {
                      runBulkAction("assign", { assignedTo: v });
                    }
                  }}
                >
                  <SelectTrigger className="h-10 sm:h-9 w-[160px] text-[13px]">
                    <SelectValue placeholder="Asignar a…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__unassign__">Sin asignar</SelectItem>
                    {bulkAdmins.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Cambiar prioridad */}
                <Select
                  value=""
                  onValueChange={(v) => {
                    if (!v) return;
                    runBulkAction("priority", { priority: v });
                  }}
                >
                  <SelectTrigger className="h-10 sm:h-9 w-[120px] text-[13px]">
                    <SelectValue placeholder="Prioridad…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="p1">P1</SelectItem>
                    <SelectItem value="p2">P2</SelectItem>
                    <SelectItem value="p3">P3</SelectItem>
                    <SelectItem value="p4">P4</SelectItem>
                  </SelectContent>
                </Select>

                {/* Cambiar estado */}
                <Select
                  value=""
                  onValueChange={(v) => {
                    if (!v) return;
                    runBulkAction("status", { status: v });
                  }}
                >
                  <SelectTrigger className="h-10 sm:h-9 w-[140px] text-[13px]">
                    <SelectValue placeholder="Estado…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Abierto</SelectItem>
                    <SelectItem value="in_progress">En proceso</SelectItem>
                    <SelectItem value="waiting">En espera</SelectItem>
                    <SelectItem value="resolved">Resuelto</SelectItem>
                    <SelectItem value="cancelled">Cancelado</SelectItem>
                  </SelectContent>
                </Select>

                {/* Tag add/remove */}
                <div className="flex items-center gap-1">
                  <Input
                    value={bulkTagInput}
                    onChange={(e) => setBulkTagInput(e.target.value)}
                    placeholder="tag…"
                    maxLength={32}
                    className="h-8 w-24 text-xs"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    disabled={!bulkTagInput.trim() || bulkLoading}
                    onClick={() =>
                      runBulkAction("addTag", { tag: bulkTagInput.trim() })
                    }
                  >
                    + Tag
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs text-muted-foreground"
                    disabled={!bulkTagInput.trim() || bulkLoading}
                    onClick={() =>
                      runBulkAction("removeTag", { tag: bulkTagInput.trim() })
                    }
                  >
                    − Tag
                  </Button>
                </div>

                {bulkLoading && (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                )}
              </div>
            )}
          </div>
        </div>
      )}

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
              <p className="text-[12px] text-muted-foreground">
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
                  selectable={selectionMode}
                  selected={selectedIds.has(ticket.id)}
                  onToggleSelect={toggleSelected}
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
                  selectable={selectionMode}
                  selected={selectedIds.has(ticket.id)}
                  onToggleSelect={toggleSelected}
                />
              ))}
            </div>
          )}

          {/* Pagination: load more + counter */}
          <div className="flex flex-col items-center gap-2 pt-2">
            <p className="text-[12px] text-muted-foreground">
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

function TicketCard({
  ticket,
  onClick,
  selectable,
  selected,
  onToggleSelect,
}: {
  ticket: Ticket;
  onClick: () => void;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (ticketId: string) => void;
}) {
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

  // Cuando hay modo de selección activo, click en el cuerpo toggle-ea
  // selección en lugar de navegar. Esto se siente más natural en mobile
  // que tener que apuntar al checkbox chiquito.
  function handleCardActivate() {
    if (selectable && onToggleSelect) {
      onToggleSelect(ticket.id);
      return;
    }
    onClick();
  }

  return (
    <button
      type="button"
      onClick={handleCardActivate}
      className={`group relative flex w-full flex-col gap-2 rounded-xl border-l-[3px] border border-border bg-ds-surface-1 p-3.5 text-left transition-all hover:bg-ds-surface-2 hover:border-primary/20 active:bg-ds-surface-2 ${borderColor} ${
        breached && !isTerminal ? "animate-pulse-subtle border-status-danger-border" : ""
      } ${selected ? "ring-2 ring-primary/60" : ""}`}
    >
      {selectable && (
        <span
          className={`absolute -top-2 -left-2 z-10 flex h-5 w-5 items-center justify-center rounded-full border-2 ${
            selected
              ? "bg-primary border-primary text-primary-foreground"
              : "bg-background border-border text-transparent"
          }`}
          aria-hidden="true"
        >
          <Check className="h-3 w-3" />
        </span>
      )}
      {/* Row 1: Code + Status + Priority + Avatar */}
      <div className="flex items-center gap-2">
        <span className="font-mono text-[12px] text-muted-foreground">{ticket.code}</span>
        <Badge variant={statusCfg.variant} className="text-[12px]">
          {statusCfg.label}
        </Badge>
        <span className={`text-[12px] font-semibold ${priorityCfg.color}`}>
          {ticket.priority.toUpperCase()}
        </span>
        {ticket.approvalStatus === "pending" && (
          <Badge variant="secondary" className="text-[12px] gap-0.5">
            <ShieldCheck className="h-2.5 w-2.5" />
            Aprobación
          </Badge>
        )}
        {breached && !isTerminal && (
          <Badge variant="destructive" className="text-[12px] gap-0.5">
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
              className="flex h-6 w-6 items-center justify-center rounded-full bg-status-warn-soft text-status-warn-fg"
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
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
          <FileText className="h-3 w-3 text-status-warn-fg/80" />
          <span className="font-medium text-status-warn-fg/90">
            {ticket.finding.tipoDocNombre
              ?? ticket.finding.guardiaDocCode
              ?? findingCategoryLabel(ticket.finding.category)}
          </span>
          {ticket.finding.occurrenceCount > 1 && (
            <span className="rounded bg-status-warn-soft px-1.5 py-0.5 text-[12px] font-semibold text-status-warn-fg">
              ×{ticket.finding.occurrenceCount}
            </span>
          )}
          {ticket.finding.tipoDocCapa ? (
            <span className="text-[12px] text-muted-foreground capitalize">
              {ticket.finding.tipoDocCapa}
            </span>
          ) : (
            !ticket.finding.tipoDocNombre && !ticket.finding.guardiaDocCode && (
              <span className="text-[12px] text-muted-foreground italic">
                Sin documento específico
              </span>
            )
          )}
          {ticket.finding.guardName && (
            <span className="text-[12px] text-muted-foreground">
              · {ticket.finding.guardName}
            </span>
          )}
        </div>
      )}

      {/* Row 3: Type + Team */}
      <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
        <span className="truncate">{typeName}</span>
        <span className="text-border">·</span>
        <span>{teamName}</span>
      </div>

      {/* Row 4: Guard badge (if applicable) */}
      {ticket.guardiaName && (
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1 rounded-full bg-status-info-soft px-2 py-0.5">
            <Shield className="h-3 w-3 text-status-info-fg" />
            <span className="text-[12px] font-medium text-status-info-fg">
              {ticket.guardiaName}
            </span>
            {ticket.guardiaRut && (
              <span className="text-[12px] text-status-info-fg/60">
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
              className="rounded-full bg-primary/10 px-2 py-0.5 text-[12px] font-medium text-primary"
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
          <div className={`flex items-center gap-1 text-[12px] font-medium ${slaTextColor}`}>
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
  live = false,
}: {
  slaDueAt: string | null;
  createdAt: string;
  status?: TicketStatus;
  resolvedAt?: string | null;
  showText?: boolean;
  /** Refresca el countdown cada 30s. Activarlo solo en vistas estáticas
   *  (detalle de ticket); en listas largas degrada el render. */
  live?: boolean;
}) {
  // Tick para forzar recálculo del tiempo restante. Solo si live=true y el
  // ticket no está en estado terminal.
  const [, setTick] = useState(0);
  const isTerminal =
    !!status &&
    ["resolved", "closed", "rejected", "cancelled"].includes(status);
  useEffect(() => {
    if (!live || isTerminal) return;
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [live, isTerminal]);

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
        <div className={`flex items-center gap-1 text-[12px] font-medium shrink-0 ${slaTextColor}`}>
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
        <div className="rounded-xl border border-status-info-border bg-status-info-soft p-2.5 text-xs text-status-info-fg">
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
        <div className="space-y-1.5 rounded-xl border border-status-info-border bg-status-info-soft p-3">
          <Label className="text-xs flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5 text-status-info-fg" />
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
                      <ShieldCheck className="h-3 w-3 text-status-info-fg" />
                    )}
                    <span className="text-[12px] text-muted-foreground">
                      {TICKET_TEAM_CONFIG[tt.assignedTeam]?.label}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {selectedType?.description && (
          <p className="text-[12px] text-muted-foreground">{selectedType.description}</p>
        )}
      </div>

      {/* Approval chain preview */}
      {selectedType?.requiresApproval && selectedType.approvalSteps.length > 0 && (
        <div className="rounded-xl border border-status-info-border bg-status-info-soft p-2.5 text-xs space-y-1">
          <div className="flex items-center gap-1.5 font-medium text-status-info-fg">
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
                      key === "p1" ? "bg-status-danger" : key === "p2" ? "bg-status-warn" : key === "p3" ? "bg-status-warn" : "bg-muted-foreground/50"
                    }`}
                  />
                  <div>
                    <p className={`text-xs font-semibold ${active ? cfg.color : ""}`}>{cfg.shortLabel}</p>
                    <p className="text-[12px] text-muted-foreground">{cfg.description}</p>
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
