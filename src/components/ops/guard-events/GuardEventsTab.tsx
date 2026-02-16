"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  DollarSign,
  FileWarning,
  Gavel,
  Info,
  Loader2,
  Palmtree,
  Paperclip,
  Plus,
  ShieldAlert,
  Stethoscope,
  Ticket,
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
  type GuardEvent,
  type GuardEventCategory,
  type GuardEventSubtype,
  type GuardEventStatus,
  type GuardContract,
  EVENT_CATEGORIES,
  EVENT_SUBTYPES,
  EVENT_STATUS_CONFIG,
  calcTotalDays,
  getCategoryLabel,
  getSubtypeLabel,
  formatDateUTC,
  formatCLP,
  isEditable,
  isApprovable,
  isCancellable,
  validateCausal159N4,
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
  guardContract?: GuardContract | null;
}

// ═══════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

export function GuardEventsTab({
  guardiaId,
  guardiaName,
  userRole,
  guardContract,
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
        guardContract={guardContract ?? null}
        onBack={() => setViewState({ view: "list" })}
        onCreated={handleEventCreated}
      />
    );
  }

  if (viewState.view === "detail") {
    return (
      <EventDetailView
        event={viewState.event}
        guardiaName={guardiaName}
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

  let dateLabel: string;
  if (event.category === "finiquito" && event.finiquitoDate) {
    dateLabel = `Finiquito: ${formatDateUTC(event.finiquitoDate)}`;
  } else if (event.endDate && event.startDate) {
    dateLabel = `${formatDateUTC(event.startDate)} → ${formatDateUTC(event.endDate)}`;
  } else if (event.startDate) {
    dateLabel = formatDateUTC(event.startDate);
  } else {
    dateLabel = "";
  }

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
          {daysLabel && event.category !== "finiquito" && (
            <>
              <span className="text-border">·</span>
              <span>{daysLabel}</span>
            </>
          )}
          {event.totalSettlementAmount != null && event.category === "finiquito" && (
            <>
              <span className="text-border">·</span>
              <span className="font-medium">{formatCLP(event.totalSettlementAmount)}</span>
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
  guardContract,
  onBack,
  onCreated,
}: {
  guardiaId: string;
  guardiaName: string;
  guardContract: GuardContract | null;
  onBack: () => void;
  onCreated: (event: GuardEvent) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [category, setCategory] = useState<GuardEventCategory | "">("");
  const [subtype, setSubtype] = useState<GuardEventSubtype | "">("");
  // Dates - ausencia uses startDate + endDate; finiquito uses finiquitoDate; amonestacion uses startDate
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [finiquitoDate, setFiniquitoDate] = useState("");
  const [reason, setReason] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [causalDtCode, setCausalDtCode] = useState("");
  const [status, setStatus] = useState<"draft" | "pending" | "approved">("draft");

  // Finiquito financial fields
  const [vacationDaysPending, setVacationDaysPending] = useState<string>("");
  const [vacationPaymentAmount, setVacationPaymentAmount] = useState<string>("");
  const [pendingRemunerationAmount, setPendingRemunerationAmount] = useState<string>("");
  const [yearsOfServiceAmount, setYearsOfServiceAmount] = useState<string>("");
  const [substituteNoticeAmount, setSubstituteNoticeAmount] = useState<string>("");

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

  // Category flags
  const isFiniquito = category === "finiquito";
  const isAusencia = category === "ausencia";
  const isAmonestacion = category === "amonestacion";
  const needsDateRange = isAusencia;
  const needsCausal = isFiniquito;

  // Causal 159-4 validation
  const causal159N4Validation = useMemo(() => {
    if (causalDtCode !== "159-4" || !finiquitoDate || !guardContract) return null;
    return validateCausal159N4(finiquitoDate, guardContract);
  }, [causalDtCode, finiquitoDate, guardContract]);

  // Calculate settlement total
  const totalSettlement = useMemo(() => {
    const vac = Number(vacationPaymentAmount) || 0;
    const rem = Number(pendingRemunerationAmount) || 0;
    const yos = Number(yearsOfServiceAmount) || 0;
    const sub = Number(substituteNoticeAmount) || 0;
    return vac + rem + yos + sub;
  }, [vacationPaymentAmount, pendingRemunerationAmount, yearsOfServiceAmount, substituteNoticeAmount]);

  // Reset subtype when category changes
  function handleCategoryChange(val: string) {
    setCategory(val as GuardEventCategory);
    setSubtype("");
    setCausalDtCode("");
    setFiniquitoDate("");
    setStartDate("");
    setEndDate("");
  }

  // Calculate total days (only for ausencia)
  const totalDays = startDate && endDate ? calcTotalDays(startDate, endDate) : null;

  // Validation
  const isValid = useMemo(() => {
    if (!category || !subtype) return false;

    if (isFiniquito) {
      if (!finiquitoDate || !causalDtCode) return false;
      if (causal159N4Validation && !causal159N4Validation.valid) return false;
    } else if (isAusencia) {
      if (!startDate || !endDate) return false;
    } else if (isAmonestacion) {
      if (!startDate) return false;
    }

    return true;
  }, [category, subtype, isFiniquito, isAusencia, isAmonestacion, finiquitoDate, causalDtCode, startDate, endDate, causal159N4Validation]);

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
          startDate: isFiniquito ? null : startDate || null,
          endDate: isAusencia ? endDate : null,
          totalDays: isAusencia ? totalDays : null,
          finiquitoDate: isFiniquito ? finiquitoDate : null,
          reason: reason || null,
          internalNotes: internalNotes || null,
          causalDtCode: selectedCausal?.code ?? null,
          causalDtLabel: selectedCausal?.label ?? null,
          status,
          // Finiquito financial fields
          vacationDaysPending: isFiniquito ? (Number(vacationDaysPending) || null) : null,
          vacationPaymentAmount: isFiniquito ? (Number(vacationPaymentAmount) || null) : null,
          pendingRemunerationAmount: isFiniquito ? (Number(pendingRemunerationAmount) || null) : null,
          yearsOfServiceAmount: isFiniquito ? (Number(yearsOfServiceAmount) || null) : null,
          substituteNoticeAmount: isFiniquito ? (Number(substituteNoticeAmount) || null) : null,
          totalSettlementAmount: isFiniquito ? totalSettlement : null,
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
      {needsCausal && subtype && (
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

          {/* Warning for 159-4 when contract is not plazo fijo */}
          {causalDtCode === "159-4" && guardContract?.contractType !== "plazo_fijo" && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs text-amber-600">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <p>Esta causal solo aplica a contratos a plazo fijo. El contrato actual es indefinido.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Dates ── */}
      {subtype && (
        <>
          {isFiniquito ? (
            /* Finiquito: single date */
            <div className="space-y-1.5">
              <Label className="text-xs">Fecha de finiquito *</Label>
              <Input
                type="date"
                value={finiquitoDate}
                onChange={(e) => setFiniquitoDate(e.target.value)}
                className="text-sm max-w-xs"
              />
              {/* Causal 159-4 validation message */}
              {causal159N4Validation && !causal159N4Validation.valid && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <p>{causal159N4Validation.reason}</p>
                </div>
              )}
              {causal159N4Validation && causal159N4Validation.valid && (
                <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2.5 text-xs text-emerald-600">
                  <Check className="h-4 w-4 shrink-0 mt-0.5" />
                  <p>Causal 159 N°4 válida — dentro de la ventana de tiempo permitida.</p>
                </div>
              )}
            </div>
          ) : (
            /* Ausencia / Amonestación: date range or single date */
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
              {needsDateRange && (
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
        </>
      )}

      {/* Days summary (ausencia only) */}
      {totalDays != null && totalDays > 0 && !isFiniquito && (
        <p className="text-xs text-muted-foreground">
          Total: <strong>{totalDays}</strong> día{totalDays !== 1 ? "s" : ""} (incluye inicio y término)
        </p>
      )}

      {/* ── Finiquito Financial Fields ── */}
      {isFiniquito && subtype && finiquitoDate && (
        <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-medium">Liquidación del finiquito</h4>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Días de vacaciones pendientes</Label>
              <Input
                type="number"
                min="0"
                value={vacationDaysPending}
                onChange={(e) => setVacationDaysPending(e.target.value)}
                placeholder="0"
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Monto vacaciones pendientes ($)</Label>
              <Input
                type="number"
                min="0"
                value={vacationPaymentAmount}
                onChange={(e) => setVacationPaymentAmount(e.target.value)}
                placeholder="0"
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Remuneración pendiente ($)</Label>
              <Input
                type="number"
                min="0"
                value={pendingRemunerationAmount}
                onChange={(e) => setPendingRemunerationAmount(e.target.value)}
                placeholder="0"
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Indemnización por años de servicio ($)</Label>
              <Input
                type="number"
                min="0"
                value={yearsOfServiceAmount}
                onChange={(e) => setYearsOfServiceAmount(e.target.value)}
                placeholder="0"
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Indemnización sustitutiva aviso previo ($)</Label>
              <Input
                type="number"
                min="0"
                value={substituteNoticeAmount}
                onChange={(e) => setSubstituteNoticeAmount(e.target.value)}
                placeholder="0"
                className="text-sm max-w-xs"
              />
              <p className="text-[10px] text-muted-foreground">
                Solo aplica si se invoca Art. 161 con menos de 30 días de aviso previo
              </p>
            </div>
          </div>

          {/* Total */}
          <div className="flex items-center justify-between rounded-md border border-primary/20 bg-primary/5 p-3">
            <span className="text-sm font-medium">Total liquidación</span>
            <span className="text-lg font-bold text-primary">{formatCLP(totalSettlement)}</span>
          </div>
        </div>
      )}

      {/* ── Reason ── */}
      {subtype && (
        <div className="space-y-1.5">
          <Label className="text-xs">
            {isAmonestacion ? "Descripción / motivo" : "Motivo / observación"}
          </Label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
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
          <textarea
            value={internalNotes}
            onChange={(e) => setInternalNotes(e.target.value)}
            rows={2}
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
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
  guardiaName,
  userRole,
  onBack,
  onApprove,
  onReject,
  onCancel,
}: {
  event: GuardEvent;
  guardiaName: string;
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
  const isFiniquito = event.category === "finiquito";

  return (
    <div className="space-y-4">
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
        {isFiniquito && event.finiquitoDate && (
          <InfoField label="Fecha de finiquito" value={formatDateUTC(event.finiquitoDate)} />
        )}
        {!isFiniquito && event.startDate && (
          <InfoField label="Fecha inicio" value={formatDateUTC(event.startDate)} />
        )}
        {!isFiniquito && event.endDate && (
          <InfoField label="Fecha término" value={formatDateUTC(event.endDate)} />
        )}
        {event.totalDays != null && !isFiniquito && (
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

      {/* Finiquito financial summary */}
      {isFiniquito && (event.vacationDaysPending != null || event.totalSettlementAmount != null) && (
        <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-medium">Liquidación</h4>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 text-sm">
            {event.vacationDaysPending != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Días vacaciones pendientes</span>
                <span className="font-medium">{event.vacationDaysPending}</span>
              </div>
            )}
            {event.vacationPaymentAmount != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Monto vacaciones</span>
                <span className="font-medium">{formatCLP(event.vacationPaymentAmount)}</span>
              </div>
            )}
            {event.pendingRemunerationAmount != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Remuneración pendiente</span>
                <span className="font-medium">{formatCLP(event.pendingRemunerationAmount)}</span>
              </div>
            )}
            {event.yearsOfServiceAmount != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Indemnización años servicio</span>
                <span className="font-medium">{formatCLP(event.yearsOfServiceAmount)}</span>
              </div>
            )}
            {event.substituteNoticeAmount != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Indemn. sustitutiva aviso</span>
                <span className="font-medium">{formatCLP(event.substituteNoticeAmount)}</span>
              </div>
            )}
          </div>
          {event.totalSettlementAmount != null && (
            <div className="flex items-center justify-between rounded-md border border-primary/20 bg-primary/5 p-3 mt-2">
              <span className="text-sm font-medium">Total liquidación</span>
              <span className="text-lg font-bold text-primary">{formatCLP(event.totalSettlementAmount)}</span>
            </div>
          )}
        </div>
      )}

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

      {/* Create ticket from event */}
      {event.status !== "cancelled" && (
        <div className="border-t border-border pt-3">
          <a
            href={`/ops/tickets?source=guard_event&sourceId=${event.id}&title=${encodeURIComponent(
              `${getSubtypeLabel(event.subtype)} — ${guardiaName}`
            )}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
          >
            <Ticket className="h-3.5 w-3.5" />
            Crear ticket asociado
          </a>
        </div>
      )}

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
