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
  ShieldCheck,
  Ticket as TicketIcon,
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
  isSlaBreached,
} from "@/lib/tickets";

interface TicketsClientProps {
  userRole: string;
}

type ViewState = { view: "list" } | { view: "create" };

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
  const [filterPriority, setFilterPriority] = useState<"all" | TicketPriority>("all");
  const [originTab, setOriginTab] = useState<"all" | "internal" | "guard">("all");

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
    // Re-fetch when the user navigates back so stale status is updated
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
    if (filterPriority !== "all") {
      result = result.filter((t) => t.priority === filterPriority);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.code.toLowerCase().includes(q) ||
          (t.description ?? "").toLowerCase().includes(q),
      );
    }
    return result;
  }, [tickets, filterStatus, filterPriority, searchQuery, originTab]);

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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar tickets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <Button
          size="sm"
          onClick={() => setViewState({ view: "create" })}
          className="h-9 gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          Nuevo ticket
        </Button>
      </div>

      {/* Origin tabs */}
      <div className="flex gap-1 rounded-md bg-muted p-0.5 w-fit">
        {([
          { value: "all", label: "Todos" },
          { value: "internal", label: "Internos" },
          { value: "guard", label: "Guardias" },
        ] as const).map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setOriginTab(tab.value)}
            className={`rounded-sm px-3 py-1 text-xs font-medium transition-colors ${
              originTab === tab.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={filterStatus}
          onValueChange={(v) => setFilterStatus(v as typeof filterStatus)}
        >
          <SelectTrigger className="h-8 w-[140px] text-xs">
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
        <Select
          value={filterPriority}
          onValueChange={(v) => setFilterPriority(v as typeof filterPriority)}
        >
          <SelectTrigger className="h-8 w-[120px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Prioridad</SelectItem>
            <SelectItem value="p1">P1 Crítica</SelectItem>
            <SelectItem value="p2">P2 Alta</SelectItem>
            <SelectItem value="p3">P3 Media</SelectItem>
            <SelectItem value="p4">P4 Baja</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filteredTickets.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-8 text-center">
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
      ) : (
        <div className="space-y-2">
          {filteredTickets.map((ticket) => (
            <TicketListItem
              key={ticket.id}
              ticket={ticket}
              onClick={() => router.push(`/ops/tickets/${ticket.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  LIST ITEM
// ═══════════════════════════════════════════════════════════════

function TicketListItem({ ticket, onClick }: { ticket: Ticket; onClick: () => void }) {
  const statusCfg = TICKET_STATUS_CONFIG[ticket.status];
  const priorityCfg = TICKET_PRIORITY_CONFIG[ticket.priority];
  const slaText = getSlaRemaining(ticket.slaDueAt);
  const breached = isSlaBreached(ticket.slaDueAt);
  const typeName = ticket.ticketType?.name ?? ticket.assignedTeam;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-md border border-border bg-card p-3 text-left transition-colors hover:bg-accent/50 active:bg-accent"
    >
      <div
        className={`h-9 w-1 shrink-0 rounded-full ${
          ticket.priority === "p1"
            ? "bg-red-500"
            : ticket.priority === "p2"
              ? "bg-orange-500"
              : ticket.priority === "p3"
                ? "bg-yellow-500"
                : "bg-muted-foreground/30"
        }`}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-muted-foreground">{ticket.code}</span>
          <Badge variant={statusCfg.variant} className="text-[10px]">
            {statusCfg.label}
          </Badge>
          {ticket.approvalStatus === "pending" && (
            <Badge variant="secondary" className="text-[10px] gap-0.5">
              <ShieldCheck className="h-2.5 w-2.5" />
              Aprobación
            </Badge>
          )}
          {breached && (
            <Badge variant="destructive" className="text-[10px] gap-0.5">
              <AlertTriangle className="h-2.5 w-2.5" />
              SLA
            </Badge>
          )}
        </div>
        <p className="mt-0.5 truncate text-sm font-medium">{ticket.title}</p>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>{typeName}</span>
          <span className="text-border">·</span>
          <span className={priorityCfg.color}>{ticket.priority.toUpperCase()}</span>
          {slaText && (
            <>
              <span className="text-border">·</span>
              <Clock className="h-3 w-3" />
              <span className={breached ? "text-red-500" : ""}>{slaText}</span>
            </>
          )}
          {ticket.guardiaName && (
            <>
              <span className="text-border">·</span>
              <span>{ticket.guardiaName}</span>
            </>
          )}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════
//  CREATE FORM
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

  const selectedType = ticketTypes.find((t) => t.id === selectedTypeId);

  // Filter ticket types based on selected category
  const filteredTypes = ticketCategory
    ? ticketTypes.filter((t) =>
        t.origin === "both" || t.origin === ticketCategory
      )
    : [];

  function handleCategoryChange(val: string) {
    setTicketCategory(val as "" | "internal" | "guard");
    // Reset selected type when category changes
    setSelectedTypeId("");
  }

  function handleTypeChange(val: string) {
    setSelectedTypeId(val);
    const tt = ticketTypes.find((t) => t.id === val);
    if (tt && !priority) setPriority(tt.defaultPriority);
  }

  const isValid = selectedTypeId && title.trim();

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
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
        Cancelar
      </button>

      <h3 className="text-sm font-semibold">Nuevo ticket</h3>

      {prefillSource === "guard_event" && (
        <div className="rounded-md border border-blue-500/20 bg-blue-500/5 p-2.5 text-xs text-blue-700 dark:text-blue-400">
          Creando ticket asociado a un evento laboral
        </div>
      )}

      {/* Category selector */}
      <div className="space-y-1.5">
        <Label className="text-xs">Categoría *</Label>
        <Select value={ticketCategory} onValueChange={handleCategoryChange}>
          <SelectTrigger className="text-sm">
            <SelectValue placeholder="Seleccionar categoría..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="internal">Solicitud interna</SelectItem>
            <SelectItem value="guard">Solicitud de guardia</SelectItem>
          </SelectContent>
        </Select>
      </div>

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
            <SelectTrigger className="text-sm">
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
        <div className="rounded-md border border-blue-500/20 bg-blue-500/5 p-2.5 text-xs space-y-1">
          <div className="flex items-center gap-1.5 font-medium text-blue-700 dark:text-blue-400">
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
          className="text-sm"
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
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          placeholder="Detalle adicional (opcional)..."
        />
      </div>

      {/* Priority */}
      <div className="space-y-1.5">
        <Label className="text-xs">Prioridad</Label>
        <Select value={priority} onValueChange={(v) => setPriority(v as TicketPriority)}>
          <SelectTrigger className="text-sm">
            <SelectValue placeholder="Según tipo de solicitud" />
          </SelectTrigger>
          <SelectContent>
            {(
              Object.entries(TICKET_PRIORITY_CONFIG) as [
                TicketPriority,
                (typeof TICKET_PRIORITY_CONFIG)["p1"],
              ][]
            ).map(([key, cfg]) => (
              <SelectItem key={key} value={key}>
                <span className={cfg.color}>{cfg.label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* SLA info */}
      {selectedType && (
        <div className="rounded-md bg-muted/50 p-2.5 text-xs text-muted-foreground">
          <p>
            SLA: <strong>{selectedType.slaHours}h</strong> · Equipo:{" "}
            <strong>{TICKET_TEAM_CONFIG[selectedType.assignedTeam]?.label}</strong>
          </p>
        </div>
      )}

      {/* Submit */}
      <div className="flex items-center gap-2 pt-2">
        <Button onClick={handleSubmit} disabled={!isValid || saving} className="gap-1.5">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Crear ticket
        </Button>
        <Button variant="ghost" onClick={onBack} disabled={saving}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
