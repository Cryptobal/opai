"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  FileWarning,
  Gavel,
  Loader2,
  Palmtree,
  Paperclip,
  Plus,
  ShieldAlert,
  Stethoscope,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type GuardEvent,
  type GuardEventCategory,
  type GuardEventSubtype,
  type GuardEventStatus,
  type CausalDt,
  EVENT_CATEGORIES,
  EVENT_SUBTYPES,
  EVENT_STATUS_CONFIG,
  calcTotalDays,
  getCategoryLabel,
  getSubtypeLabel,
  formatDateUTC,
  isEditable,
  isApprovable,
  isCancellable,
  CAUSALES_DT,
} from "@/lib/guard-events";
import { EventDocuments } from "./EventDocuments";

// ═══════════════════════════════════════════════════════════════
//  ICONS BY SUBTYPE
// ═══════════════════════════════════════════════════════════════

const SUBTYPE_ICON: Record<string, typeof Palmtree> = {
  vacaciones: Palmtree,
  licencia_medica: Stethoscope,
  permiso_con_goce: CalendarDays,
  permiso_sin_goce: CalendarDays,
  finiquito: FileWarning,
  amonestacion_verbal: ShieldAlert,
  amonestacion_escrita: ShieldAlert,
  amonestacion_grave: AlertTriangle,
};

// ═══════════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════════

type ViewState =
  | { view: "list" }
  | { view: "create" }
  | { view: "detail"; event: GuardEvent };

interface GuardEventsTabProps {
  guardiaId: string;
  guardiaName: string;
  userRole: string;
}

// ═══════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

export function GuardEventsTab({
  guardiaId,
  guardiaName,
  userRole,
}: GuardEventsTabProps) {
  const [viewState, setViewState] = useState<ViewState>({ view: "list" });
  const [events, setEvents] = useState<GuardEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<"all" | GuardEventStatus>("all");

  // ── Fetch events ──
  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ops/guard-events?guardiaId=${guardiaId}`);
      const data = await res.json();
      if (data.success) {
        setEvents(data.data.items);
      }
    } catch {
      toast.error("Error al cargar eventos laborales");
    } finally {
      setLoading(false);
    }
  }, [guardiaId]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // ── Filtered events ──
  const filteredEvents = useMemo(() => {
    if (filterStatus === "all") return events;
    return events.filter((e) => e.status === filterStatus);
  }, [events, filterStatus]);

  // ── Event created callback ──
  function handleEventCreated(newEvent: GuardEvent) {
    setEvents((prev) => [newEvent, ...prev]);
    setViewState({ view: "detail", event: newEvent });
    toast.success("Evento laboral creado");
  }

  // ── Status action callbacks ──
  async function handleApprove(event: GuardEvent) {
    try {
      const res = await fetch(`/api/ops/guard-events/${event.id}/approve`, {
        method: "POST",
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      const updated = { ...event, status: "approved" as const, approvedAt: new Date().toISOString() };
      setEvents((prev) => prev.map((e) => (e.id === event.id ? updated : e)));
      setViewState({ view: "detail", event: updated });
      toast.success("Evento aprobado");
    } catch {
      toast.error("Error al aprobar evento");
    }
  }

  async function handleReject(event: GuardEvent) {
    try {
      const res = await fetch(`/api/ops/guard-events/${event.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      const updated = { ...event, status: "rejected" as const };
      setEvents((prev) => prev.map((e) => (e.id === event.id ? updated : e)));
      setViewState({ view: "detail", event: updated });
      toast.success("Evento rechazado");
    } catch {
      toast.error("Error al rechazar evento");
    }
  }

  async function handleCancel(event: GuardEvent) {
    try {
      const res = await fetch(`/api/ops/guard-events/${event.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      const updated = { ...event, status: "cancelled" as const };
      setEvents((prev) => prev.map((e) => (e.id === event.id ? updated : e)));
      setViewState({ view: "detail", event: updated });
      toast.success("Evento anulado");
    } catch {
      toast.error("Error al anular evento");
    }
  }

  // ── RENDER ──
  if (viewState.view === "create") {
    return (
      <EventCreateForm
        guardiaId={guardiaId}
        guardiaName={guardiaName}
        onBack={() => setViewState({ view: "list" })}
        onCreated={handleEventCreated}
      />
    );
  }

  if (viewState.view === "detail") {
    return (
      <EventDetailView
        event={viewState.event}
        userRole={userRole}
        onBack={() => setViewState({ view: "list" })}
        onApprove={handleApprove}
        onReject={handleReject}
        onCancel={handleCancel}
      />
    );
  }

  // ── LIST VIEW ──
  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Select
            value={filterStatus}
            onValueChange={(v) => setFilterStatus(v as typeof filterStatus)}
          >
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="draft">Borrador</SelectItem>
              <SelectItem value="pending">Pendiente</SelectItem>
              <SelectItem value="approved">Aprobado</SelectItem>
              <SelectItem value="rejected">Rechazado</SelectItem>
              <SelectItem value="cancelled">Anulado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          size="sm"
          onClick={() => setViewState({ view: "create" })}
          className="h-8 gap-1.5 text-xs"
        >
          <Plus className="h-3.5 w-3.5" />
          Nuevo evento
        </Button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-6 text-center">
          <Gavel className="mx-auto h-10 w-10 text-muted-foreground/30" />
          <p className="mt-2 text-sm text-muted-foreground">
            {events.length === 0
              ? "No hay eventos laborales registrados para este guardia."
              : "No hay eventos con el filtro seleccionado."}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-3"
            onClick={() => setViewState({ view: "create" })}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Registrar primer evento
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredEvents.map((event) => (
            <EventListItem
              key={event.id}
              event={event}
              onClick={() => setViewState({ view: "detail", event })}
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

function EventListItem({
  event,
  onClick,
}: {
  event: GuardEvent;
  onClick: () => void;
}) {
  const statusCfg = EVENT_STATUS_CONFIG[event.status];
  const Icon = SUBTYPE_ICON[event.subtype] ?? Gavel;
  const dateLabel = event.endDate
    ? `${formatDateUTC(event.startDate)} → ${formatDateUTC(event.endDate)}`
    : formatDateUTC(event.startDate);
  const daysLabel =
    event.totalDays != null ? `${event.totalDays} día${event.totalDays !== 1 ? "s" : ""}` : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-md border border-border bg-card p-3 text-left transition-colors hover:bg-accent/50 active:bg-accent"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{getSubtypeLabel(event.subtype)}</p>
          <Badge variant={statusCfg.variant} className="shrink-0 text-[10px]">
            {statusCfg.label}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{dateLabel}</span>
          {daysLabel && (
            <>
              <span className="text-border">·</span>
              <span>{daysLabel}</span>
            </>
          )}
          {event.attachments.length > 0 && (
            <Paperclip className="h-3 w-3" />
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

function EventCreateForm({
  guardiaId,
  guardiaName,
  onBack,
  onCreated,
}: {
  guardiaId: string;
  guardiaName: string;
  onBack: () => void;
  onCreated: (event: GuardEvent) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [category, setCategory] = useState<GuardEventCategory | "">("");
  const [subtype, setSubtype] = useState<GuardEventSubtype | "">("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [causalDtCode, setCausalDtCode] = useState("");
  const [status, setStatus] = useState<"draft" | "pending" | "approved">("draft");

  // Derive causales for finiquito
  const causales = useMemo(
    () =>
      CAUSALES_DT.map((c, i) => ({
        id: `stub-${i}`,
        ...c,
        defaultTemplateId: null,
      })),
    [],
  );

  // Subtypes for selected category
  const subtypeOptions = category ? EVENT_SUBTYPES[category] ?? [] : [];

  // Reset subtype when category changes
  function handleCategoryChange(val: string) {
    setCategory(val as GuardEventCategory);
    setSubtype("");
    setCausalDtCode("");
  }

  // Calculate total days
  const totalDays = startDate && endDate ? calcTotalDays(startDate, endDate) : null;

  // Whether form needs end date
  const needsEndDate = category === "ausencia" || category === "finiquito";
  const needsCausal = category === "finiquito";
  const isAmonestacion = category === "amonestacion";

  // Validation
  const isValid =
    category &&
    subtype &&
    startDate &&
    (isAmonestacion || endDate) &&
    (!needsCausal || causalDtCode);

  async function handleSubmit() {
    if (!isValid) return;
    setSaving(true);

    const selectedCausal = causales.find((c) => c.code === causalDtCode);

    try {
      const res = await fetch("/api/ops/guard-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guardiaId,
          category,
          subtype,
          startDate,
          endDate: isAmonestacion ? null : endDate,
          totalDays: isAmonestacion ? null : totalDays,
          reason: reason || null,
          internalNotes: internalNotes || null,
          causalDtCode: selectedCausal?.code ?? null,
          causalDtLabel: selectedCausal?.label ?? null,
          status,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      onCreated(data.data);
    } catch {
      toast.error("Error al crear evento laboral");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Back button */}
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Volver al listado
      </button>

      <h3 className="text-sm font-semibold">Nuevo evento laboral</h3>
      <p className="text-xs text-muted-foreground">Guardia: {guardiaName}</p>

      {/* ── Category ── */}
      <div className="space-y-1.5">
        <Label className="text-xs">Categoría *</Label>
        <div className="grid grid-cols-3 gap-2">
          {EVENT_CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              type="button"
              onClick={() => handleCategoryChange(cat.value)}
              className={`rounded-md border p-2.5 text-left transition-colors ${
                category === cat.value
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border hover:bg-accent/50"
              }`}
            >
              <p className="text-xs font-medium">{cat.label}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">{cat.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* ── Subtype ── */}
      {category && (
        <div className="space-y-1.5">
          <Label className="text-xs">Tipo *</Label>
          <Select value={subtype} onValueChange={(v) => setSubtype(v as GuardEventSubtype)}>
            <SelectTrigger className="text-sm">
              <SelectValue placeholder="Seleccionar tipo..." />
            </SelectTrigger>
            <SelectContent>
              {subtypeOptions.map((st) => (
                <SelectItem key={st.value} value={st.value}>
                  {st.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* ── Causal DT (finiquito only) ── */}
      {needsCausal && (
        <div className="space-y-1.5">
          <Label className="text-xs">Causal de término (DT) *</Label>
          <Select value={causalDtCode} onValueChange={setCausalDtCode}>
            <SelectTrigger className="text-sm">
              <SelectValue placeholder="Seleccionar causal..." />
            </SelectTrigger>
            <SelectContent>
              {causales.filter((c) => c.isActive).map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  <span className="font-mono text-xs text-muted-foreground mr-1.5">{c.article} {c.number}</span>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* ── Dates ── */}
      {subtype && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">
              {isAmonestacion ? "Fecha *" : "Fecha inicio *"}
            </Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="text-sm"
            />
          </div>
          {needsEndDate && (
            <div className="space-y-1.5">
              <Label className="text-xs">Fecha término *</Label>
              <Input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="text-sm"
              />
            </div>
          )}
        </div>
      )}

      {/* Days summary */}
      {totalDays != null && totalDays > 0 && (
        <p className="text-xs text-muted-foreground">
          Total: <strong>{totalDays}</strong> día{totalDays !== 1 ? "s" : ""} (incluye inicio y término)
        </p>
      )}

      {/* ── Reason ── */}
      {subtype && (
        <div className="space-y-1.5">
          <Label className="text-xs">
            {isAmonestacion ? "Descripción / motivo" : "Motivo / observación"}
          </Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="text-sm"
            placeholder={
              isAmonestacion
                ? "Descripción de la amonestación..."
                : "Motivo del evento (opcional)..."
            }
          />
        </div>
      )}

      {/* ── Internal Notes ── */}
      {subtype && (
        <div className="space-y-1.5">
          <Label className="text-xs">Notas internas (no visible al guardia)</Label>
          <Textarea
            value={internalNotes}
            onChange={(e) => setInternalNotes(e.target.value)}
            rows={2}
            className="text-sm"
            placeholder="Notas internas..."
          />
        </div>
      )}

      {/* ── Status on creation ── */}
      {subtype && (
        <div className="space-y-1.5">
          <Label className="text-xs">Estado inicial</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger className="text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Borrador (no afecta pauta)</SelectItem>
              <SelectItem value="pending">Pendiente de aprobación</SelectItem>
              <SelectItem value="approved">Aprobado (afecta pauta inmediatamente)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* ── Submit ── */}
      {subtype && (
        <div className="flex items-center gap-2 pt-2">
          <Button
            onClick={handleSubmit}
            disabled={!isValid || saving}
            className="gap-1.5"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Registrar evento
          </Button>
          <Button variant="ghost" onClick={onBack} disabled={saving}>
            Cancelar
          </Button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  DETAIL VIEW
// ═══════════════════════════════════════════════════════════════

function EventDetailView({
  event,
  userRole,
  onBack,
  onApprove,
  onReject,
  onCancel,
}: {
  event: GuardEvent;
  userRole: string;
  onBack: () => void;
  onApprove: (event: GuardEvent) => void;
  onReject: (event: GuardEvent) => void;
  onCancel: (event: GuardEvent) => void;
}) {
  const statusCfg = EVENT_STATUS_CONFIG[event.status];
  const Icon = SUBTYPE_ICON[event.subtype] ?? Gavel;
  const canApprove =
    isApprovable(event.status) &&
    ["owner", "admin", "rrhh", "operaciones"].includes(userRole);
  const canCancel = isCancellable(event.status);

  return (
    <div className="space-y-4">
      {/* Back */}
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Volver al listado
      </button>

      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">{getSubtypeLabel(event.subtype)}</h3>
            <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {getCategoryLabel(event.category)} · Creado {new Date(event.createdAt).toLocaleDateString("es-CL")}
          </p>
        </div>
      </div>

      {/* Info grid */}
      <div className="grid gap-3 sm:grid-cols-2">
        <InfoField label="Fecha inicio" value={formatDateUTC(event.startDate)} />
        {event.endDate && <InfoField label="Fecha término" value={formatDateUTC(event.endDate)} />}
        {event.totalDays != null && (
          <InfoField label="Duración" value={`${event.totalDays} día${event.totalDays !== 1 ? "s" : ""}`} />
        )}
        {event.causalDtCode && (
          <InfoField
            label="Causal DT"
            value={`${event.causalDtCode} — ${event.causalDtLabel ?? ""}`}
            className="sm:col-span-2"
          />
        )}
      </div>

      {/* Reason */}
      {event.reason && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Motivo</p>
          <p className="rounded-md bg-muted/50 p-2.5 text-sm">{event.reason}</p>
        </div>
      )}

      {/* Internal notes */}
      {event.internalNotes && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Notas internas</p>
          <p className="rounded-md border border-dashed border-amber-500/30 bg-amber-500/5 p-2.5 text-sm">
            {event.internalNotes}
          </p>
        </div>
      )}

      {/* Attachments */}
      {event.attachments.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Adjuntos</p>
          <div className="space-y-1">
            {event.attachments.map((att, i) => (
              <a
                key={i}
                href={att.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-md border border-border p-2 text-sm hover:bg-accent/50"
              >
                <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="truncate">{att.name}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Audit trail */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Auditoría</p>
        <div className="space-y-1 text-xs text-muted-foreground">
          {event.createdByName && (
            <p>Creado por {event.createdByName} · {new Date(event.createdAt).toLocaleString("es-CL")}</p>
          )}
          {event.approvedAt && event.approvedByName && (
            <p>Aprobado por {event.approvedByName} · {new Date(event.approvedAt).toLocaleString("es-CL")}</p>
          )}
          {event.rejectedAt && (
            <p>Rechazado · {new Date(event.rejectedAt).toLocaleString("es-CL")}</p>
          )}
          {event.cancelledAt && (
            <p>Anulado · {new Date(event.cancelledAt).toLocaleString("es-CL")}</p>
          )}
          {event.rejectionReason && <p>Motivo rechazo: {event.rejectionReason}</p>}
        </div>
      </div>

      {/* Documents section */}
      <div className="border-t border-border pt-3">
        <EventDocuments event={event} />
      </div>

      {/* Action buttons */}
      {(canApprove || canCancel) && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          {canApprove && (
            <>
              <Button
                size="sm"
                onClick={() => onApprove(event)}
                className="gap-1.5"
              >
                <Check className="h-3.5 w-3.5" />
                Aprobar
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => onReject(event)}
                className="gap-1.5"
              >
                <X className="h-3.5 w-3.5" />
                Rechazar
              </Button>
            </>
          )}
          {canCancel && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onCancel(event)}
              className="gap-1.5"
            >
              Anular
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  HELPER UI
// ═══════════════════════════════════════════════════════════════

function InfoField({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  );
}
