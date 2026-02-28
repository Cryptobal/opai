"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Clock,
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

// ═══════════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════════

interface TicketsClientProps {
  userRole: string;
}

type ViewState = { view: "list" } | { view: "create" };

type ListMode = "list" | "cards";

type ModuleView = "dashboard" | "list" | "kanban";

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

  const [viewState, setViewState] = useState<ViewState>(
    prefillSource ? { view: "create" } : { view: "list" },
  );
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | TicketStatus>("active");
  const [filterPriorities, setFilterPriorities] = useState<Set<TicketPriority>>(new Set());
  const [originTab, setOriginTab] = useState<"all" | "internal" | "guard">("all");
  const [listMode, setListMode] = useState<ListMode>("list");
  const [moduleView, setModuleView] = useState<ModuleView>("list");

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ops/tickets");
      const data = await res.json();
      if (data.success) setTickets(data.data.items);
    } catch {
      toast.error("Error al cargar tickets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTickets();
    function handleVisibility() {
      if (document.visibilityState === "visible") fetchTickets();
    }
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", fetchTickets);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", fetchTickets);
    };
  }, [fetchTickets]);

  function togglePriority(p: TicketPriority) {
    setFilterPriorities((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  const filteredTickets = useMemo(() => {
    let result = tickets;

    if (originTab !== "all") {
      result = result.filter((t) => {
        const typeOrigin = t.ticketType?.origin;
        if (!typeOrigin || typeOrigin === "both") return true;
        return typeOrigin === originTab;
      });
    }

    if (filterStatus === "active") {
      result = result.filter((t) =>
        ["pending_approval", "open", "in_progress", "waiting"].includes(t.status),
      );
    } else if (filterStatus !== "all") {
      result = result.filter((t) => t.status === filterStatus);
    }

    if (filterPriorities.size > 0) {
      result = result.filter((t) => filterPriorities.has(t.priority));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.code.toLowerCase().includes(q) ||
          (t.description ?? "").toLowerCase().includes(q) ||
          (t.guardiaName ?? "").toLowerCase().includes(q) ||
          (t.guardiaRut ?? "").toLowerCase().includes(q),
      );
    }
    return result;
  }, [tickets, filterStatus, filterPriorities, searchQuery, originTab]);

  function handleTicketCreated(ticket: Ticket) {
    setTickets((prev) => [ticket, ...prev]);
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
      {/* Header */}
      <div>
        <h2 className="text-base font-semibold">Tickets</h2>
        <p className="text-xs text-muted-foreground">
          Solicitudes, incidentes y requerimientos internos
        </p>
      </div>

      {/* Module view switcher: Dashboard / Lista / Kanban */}
      <div className="flex gap-1 rounded-lg bg-muted p-0.5">
        {([
          { value: "dashboard" as const, label: "Dashboard" },
          { value: "list" as const, label: "Lista" },
          { value: "kanban" as const, label: "Kanban" },
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

      {/* Kanban view */}
      {moduleView === "kanban" && (
        <TicketsKanban
          tickets={filteredTickets}
          loading={loading}
          onTicketClick={(id) => router.push(`/ops/tickets/${id}`)}
          onStatusChange={async (ticketId, newStatus) => {
            // Optimistic update
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
              fetchTickets(); // revert
              toast.error("Error al cambiar estado");
            }
          }}
        />
      )}

      {/* List view (only when moduleView = "list") */}
      {moduleView === "list" && (
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

      {/* Origin tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {([
          { value: "all" as const, label: "Todos" },
          { value: "internal" as const, label: "Internos" },
          { value: "guard" as const, label: "Guardias" },
        ]).map((tab) => (
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
          </button>
        ))}

        {/* View mode toggle */}
        <div className="ml-auto flex gap-1 rounded-md bg-muted p-0.5">
          <button
            type="button"
            onClick={() => setListMode("list")}
            className={`rounded-sm px-2 py-1 text-[10px] font-medium ${
              listMode === "list" ? "bg-background shadow-sm" : "text-muted-foreground"
            }`}
          >
            Lista
          </button>
          <button
            type="button"
            onClick={() => setListMode("cards")}
            className={`rounded-sm px-2 py-1 text-[10px] font-medium ${
              listMode === "cards" ? "bg-background shadow-sm" : "text-muted-foreground"
            }`}
          >
            Cards
          </button>
        </div>
      </div>

      {/* Priority pills (toggleable) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {(Object.entries(TICKET_PRIORITY_CONFIG) as [TicketPriority, (typeof TICKET_PRIORITY_CONFIG)["p1"]][]).map(
          ([key, cfg]) => {
            const active = filterPriorities.has(key);
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
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Activos</SelectItem>
            <SelectItem value="pending_approval">Pend. aprobación</SelectItem>
            <SelectItem value="open">Abierto</SelectItem>
            <SelectItem value="in_progress">En progreso</SelectItem>
            <SelectItem value="waiting">En espera</SelectItem>
            <SelectItem value="resolved">Resuelto</SelectItem>
            <SelectItem value="closed">Cerrado</SelectItem>
            <SelectItem value="cancelled">Cancelado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filteredTickets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <TicketIcon className="mx-auto h-10 w-10 text-muted-foreground/30" />
          <p className="mt-2 text-sm text-muted-foreground">
            {tickets.length === 0
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
      ) : listMode === "cards" ? (
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

function TicketCard({ ticket, onClick }: { ticket: Ticket; onClick: () => void }) {
  const statusCfg = TICKET_STATUS_CONFIG[ticket.status];
  const priorityCfg = TICKET_PRIORITY_CONFIG[ticket.priority];
  const slaText = getSlaRemaining(ticket.slaDueAt, ticket.status, ticket.resolvedAt);
  const slaPercent = getSlaPercentage(ticket.slaDueAt, ticket.createdAt, ticket.status, ticket.resolvedAt);
  const slaColor = getSlaColor(slaPercent);
  const slaTextColor = getSlaTextColor(slaPercent);
  const breached = isSlaBreached(ticket.slaDueAt, ticket.status, ticket.resolvedAt);
  const typeName = ticket.ticketType?.name ?? ticket.assignedTeam;
  const teamName = TICKET_TEAM_CONFIG[ticket.assignedTeam]?.label ?? ticket.assignedTeam;
  const borderColor = getPriorityBorderColor(ticket.priority);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex w-full flex-col gap-2 rounded-xl border-l-[3px] border border-border bg-[#161b22] p-3.5 text-left transition-all hover:bg-[#1c2333] hover:border-primary/20 active:bg-[#1c2333] ${borderColor} ${
        breached ? "animate-pulse-subtle border-red-500/40" : ""
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
        {breached && (
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
              style={{ width: `${Math.max(slaPercent ?? 0, 2)}%` }}
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
          style={{ width: `${Math.max(slaPercent ?? 0, 2)}%` }}
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

  useEffect(() => {
    if (query.length >= 2) {
      const timer = setTimeout(() => onSearch(query), 300);
      return () => clearTimeout(timer);
    }
  }, [query, onSearch]);

  return (
    <SearchableSelect
      value={value}
      options={options}
      placeholder="Buscar por nombre, RUT o código..."
      emptyText={loading ? "Buscando..." : query.length < 2 ? "Escribe al menos 2 caracteres" : "Sin resultados"}
      onChange={onChange}
    />
  );
}
