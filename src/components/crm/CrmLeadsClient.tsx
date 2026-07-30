/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CrmLead } from "@/types";
import { Plus, Loader2, ChevronRight, UserPlus, Phone, Mail, Trash2, Check, X, MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
import { StatusTag } from "@/components/ops/StatusTag";
import { EmptyState, Stat, Tag } from "@/components/opai-ds";
import { cn } from "@/lib/utils";
import { CrmDates } from "@/components/crm/CrmDates";
import { CrmToolbar } from "./CrmToolbar";
import { LeadSourceBadge } from "./LeadSourceBadge";
import { LeadContactActions } from "./LeadContactActions";
import { DotacionSummary } from "./DotacionSummary";
import type { ViewMode } from "@/components/shared/ViewToggle";
import { toast } from "sonner";

/* ─── Form types ─── */

type LeadFormState = {
  companyName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  source: string;
};

const DEFAULT_FORM: LeadFormState = {
  companyName: "",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  source: "",
};

type LeadStatusFilter = "all" | "pending" | "in_review" | "approved" | "rejected";
type LeadRejectReason =
  | "spot_service"
  | "out_of_scope"
  | "no_budget"
  | "duplicate"
  | "no_response"
  | "other";

const REJECTION_REASON_OPTIONS: { value: LeadRejectReason; label: string }[] = [
  { value: "spot_service", label: "Servicio spot" },
  { value: "out_of_scope", label: "Fuera de perfil / alcance" },
  { value: "no_budget", label: "Sin presupuesto" },
  { value: "duplicate", label: "Duplicado" },
  { value: "no_response", label: "Sin respuesta" },
  { value: "other", label: "Otro" },
];

type LeadRejectReasonFilter = "all" | LeadRejectReason;

function getLeadRejectReasonLabel(value: LeadRejectReasonFilter): string {
  if (value === "all") return "Todos";
  return REJECTION_REASON_OPTIONS.find((opt) => opt.value === value)?.label ?? value;
}

function getLeadRejectReasonFromMetadata(metadata: unknown): LeadRejectReason | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const rejection = (metadata as Record<string, unknown>).rejection;
  if (!rejection || typeof rejection !== "object" || Array.isArray(rejection)) return null;
  const reason = (rejection as Record<string, unknown>).reason;
  if (typeof reason !== "string") return null;
  const validReasons = new Set<LeadRejectReason>(["spot_service", "out_of_scope", "no_budget", "duplicate", "no_response", "other"]);
  return validReasons.has(reason as LeadRejectReason) ? (reason as LeadRejectReason) : null;
}

function getLeadRejectionInfo(metadata: unknown): {
  emailSent: boolean;
  note: string | null;
} | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const rejection = (metadata as Record<string, unknown>).rejection;
  if (!rejection || typeof rejection !== "object" || Array.isArray(rejection)) return null;
  const emailSent = Boolean((rejection as Record<string, unknown>).emailSent);
  const note = (rejection as Record<string, unknown>).note;
  return {
    emailSent,
    note: typeof note === "string" && note.trim() ? note.trim() : null,
  };
}

function getLeadFilterLabel(filter: LeadStatusFilter): string | null {
  if (filter === "pending") return "Mostrando leads pendientes";
  if (filter === "in_review") return "Mostrando leads en revisión";
  if (filter === "approved") return "Mostrando leads aprobados";
  if (filter === "rejected") return "Mostrando leads rechazados";
  return null;
}

/* ─── Component ─── */

/* Chip de estado — misma familia visual que STATUS_MAP de Cotizaciones */
const LEAD_STATUS_MAP: Record<string, { label: string; className: string }> = {
  pending: { label: "Pendiente", className: "border-status-warn-border text-status-warn-fg bg-status-warn-soft" },
  in_review: { label: "En revisión", className: "border-status-info-border text-status-info-fg" },
  approved: { label: "Aprobado", className: "border-status-ok-border text-status-ok-fg" },
  rejected: { label: "Rechazado", className: "border-status-danger-border text-status-danger-fg" },
};

export function CrmLeadsClient({
  initialLeads,
  initialStatusFilter = "pending",
  userRole = "",
  canEditLeads = false,
}: {
  initialLeads: CrmLead[];
  initialStatusFilter?: LeadStatusFilter;
  userRole?: string;
  canEditLeads?: boolean;
}) {
  const router = useRouter();
  const canDeleteLead =
    (userRole === "owner" || userRole === "admin") as boolean;
  const [leads, setLeads] = useState<CrmLead[]>(initialLeads);
  const [form, setForm] = useState<LeadFormState>(DEFAULT_FORM);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatusFilter>(initialStatusFilter);
  const [sort, setSort] = useState("newest");
  const [view, setView] = useState<ViewMode>("cards");
  const [rejectReasonFilter, setRejectReasonFilter] = useState<LeadRejectReasonFilter>("all");
  const [deleteLeadId, setDeleteLeadId] = useState<string | null>(null);
  const [deleteDeleting, setDeleteDeleting] = useState(false);
  // Rechazo inline desde la lista — reutiliza POST /api/crm/leads/[id]/reject
  const [rejectLeadId, setRejectLeadId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<LeadRejectReason>("other");
  const [rejectNote, setRejectNote] = useState("");
  const [rejecting, setRejecting] = useState(false);

  const inputClassName = "bg-background text-foreground placeholder:text-muted-foreground border-input focus-visible:ring-ring";

  const handleDeleteLead = (e: React.MouseEvent, leadId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleteLeadId(leadId);
  };

  const handleConfirmDelete = async () => {
    if (!deleteLeadId) return;
    setDeleteDeleting(true);
    try {
      const res = await fetch(`/api/crm/leads/${deleteLeadId}`, { method: "DELETE" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || "Error al eliminar");
      setLeads((prev) => prev.filter((l) => l.id !== deleteLeadId));
      setDeleteLeadId(null);
      toast.success("Lead eliminado");
    } catch (err) {
      console.error(err);
      toast.error("No se pudo eliminar el lead");
    } finally {
      setDeleteDeleting(false);
    }
  };

  const openRejectDialog = (e: React.MouseEvent, leadId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setRejectReason("other");
    setRejectNote("");
    setRejectLeadId(leadId);
  };

  const confirmRejectLead = async () => {
    if (!rejectLeadId || rejecting) return;
    setRejecting(true);
    try {
      const res = await fetch(`/api/crm/leads/${rejectLeadId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: rejectReason,
          note: rejectNote.trim() || undefined,
          sendEmail: false,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || "No se pudo rechazar el lead");
      setLeads((prev) =>
        prev.map((l) =>
          l.id === rejectLeadId
            ? {
                ...l,
                status: "rejected",
                metadata: {
                  ...(l.metadata && typeof l.metadata === "object" ? l.metadata : {}),
                  rejection: { reason: rejectReason, note: rejectNote.trim() || null, emailSent: false },
                },
              }
            : l
        )
      );
      setRejectLeadId(null);
      toast.success("Lead rechazado");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "No se pudo rechazar el lead.");
    } finally {
      setRejecting(false);
    }
  };

  const counts = useMemo(() => ({
    total: leads.filter((l) => l.status !== "approved").length,
    pending: leads.filter((l) => l.status === "pending").length,
    in_review: leads.filter((l) => l.status === "in_review").length,
    approved: leads.filter((l) => l.status === "approved").length,
    rejected: leads.filter((l) => l.status === "rejected").length,
  }), [leads]);

  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = leads.filter((lead) => {
      if (statusFilter === "all" && lead.status === "approved") return false;
      if (statusFilter !== "all" && lead.status !== statusFilter) return false;
      if (q) {
        const searchable = `${lead.companyName || ""} ${lead.firstName || ""} ${lead.lastName || ""} ${lead.email || ""}`.toLowerCase();
        if (!searchable.includes(q)) return false;
      }
      return true;
    });

    if (statusFilter === "rejected" && rejectReasonFilter !== "all") {
      result = result.filter((lead) => getLeadRejectReasonFromMetadata(lead.metadata) === rejectReasonFilter);
    }

    result = [...result].sort((a, b) => {
      switch (sort) {
        case "oldest": return (a.createdAt || "").localeCompare(b.createdAt || "");
        case "az": return (a.companyName || "").localeCompare(b.companyName || "");
        case "za": return (b.companyName || "").localeCompare(a.companyName || "");
        case "newest":
        default: return (b.createdAt || "").localeCompare(a.createdAt || "");
      }
    });

    return result;
  }, [leads, statusFilter, rejectReasonFilter, search, sort]);

  const updateForm = (key: keyof LeadFormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const createLead = async () => {
    setCreating(true);
    try {
      const response = await fetch("/api/crm/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Error creando prospecto");
      setLeads((prev) => [payload.data, ...prev]);
      setForm(DEFAULT_FORM);
      setOpen(false);
      toast.success("Lead creado exitosamente");
    } catch (error) {
      console.error(error);
      toast.error("No se pudo crear el lead.");
    } finally {
      setCreating(false);
    }
  };

  const leadDisplayName = (lead: CrmLead) => {
    const parts = [lead.firstName, lead.lastName].filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : "Sin contacto";
  };

  const statusFilters = [
    { key: "all", label: "Todos", count: counts.total },
    { key: "pending", label: "Pendientes", count: counts.pending },
    { key: "in_review", label: "En revisión", count: counts.in_review },
    { key: "approved", label: "Aprobados", count: counts.approved },
    { key: "rejected", label: "Rechazados", count: counts.rejected },
  ];

  const initialFilterLabel = getLeadFilterLabel(initialStatusFilter);

  return (
    <div className="space-y-4">
      {initialFilterLabel && (
        <p className="text-xs text-muted-foreground">{initialFilterLabel}</p>
      )}

      {/* ── Stat strip clickeable: filtra la lista ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([
          { key: "all" as const, label: "Total", value: counts.total, variant: "default" as const },
          { key: "pending" as const, label: "Pendientes", value: counts.pending, variant: "warn" as const },
          { key: "approved" as const, label: "Aprobados", value: counts.approved, variant: "ok" as const },
          { key: "rejected" as const, label: "Rechazados", value: counts.rejected, variant: "danger" as const },
        ]).map((stat) => (
          <Stat
            key={stat.key}
            label={stat.label}
            value={String(stat.value)}
            variant={stat.variant}
            onClick={() => setStatusFilter(stat.key)}
            className={cn(statusFilter === stat.key && "ring-1 ring-primary/40")}
          />
        ))}
      </div>

      {/* ── Toolbar ── */}
      <CrmToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por empresa, contacto o email..."
        filters={statusFilters}
        activeFilter={statusFilter}
        onFilterChange={(value) => setStatusFilter((value as LeadStatusFilter) || "all")}
        activeSort={sort}
        onSortChange={setSort}
        viewModes={["list", "cards"]}
        activeView={view}
        onViewChange={(v) => setView(v as ViewMode)}
        actionSlot={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="icon" variant="secondary" className="h-9 w-9 shrink-0">
                <Plus className="h-4 w-4" />
                <span className="sr-only">Nuevo lead</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Nuevo lead</DialogTitle>
                <DialogDescription>
                  Ingresa los datos básicos del contacto.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label>Empresa</Label>
                  <Input autoFocus value={form.companyName} onChange={(event) => updateForm("companyName", event.target.value)} placeholder="Nombre de la empresa" className={inputClassName} />
                </div>
                <div className="space-y-2">
                  <Label>Nombre</Label>
                  <Input value={form.firstName} onChange={(event) => updateForm("firstName", event.target.value)} placeholder="Nombre" className={inputClassName} />
                </div>
                <div className="space-y-2">
                  <Label>Apellido</Label>
                  <Input value={form.lastName} onChange={(event) => updateForm("lastName", event.target.value)} placeholder="Apellido" className={inputClassName} />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={form.email} onChange={(event) => updateForm("email", event.target.value)} placeholder="correo@empresa.com" className={inputClassName} />
                </div>
                <div className="space-y-2">
                  <Label>Teléfono</Label>
                  <Input value={form.phone} onChange={(event) => updateForm("phone", event.target.value)} placeholder="+56 9 1234 5678" className={inputClassName} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Fuente</Label>
                  <Input value={form.source} onChange={(event) => updateForm("source", event.target.value)} placeholder="Formulario web, referido, inbound, etc." className={inputClassName} />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={createLead} disabled={creating}>
                  {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                  Guardar lead
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {/* ── Rejection reason sub-filter ── */}
      {statusFilter === "rejected" && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground mr-1">Motivo:</span>
          {[{ value: "all" as LeadRejectReasonFilter, label: "Todos" }, ...REJECTION_REASON_OPTIONS].map((opt) => (
            <Button
              key={opt.value}
              size="sm"
              variant={rejectReasonFilter === opt.value ? "default" : "outline"}
              className="h-7 text-xs rounded-full"
              onClick={() => setRejectReasonFilter(opt.value as LeadRejectReasonFilter)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      )}

      {/* ── Lead list ── */}
      <Card>
        <CardContent className="pt-5">
          {filteredLeads.length === 0 ? (
            <EmptyState
              icon={UserPlus}
              title="Sin prospectos"
              description={
                search || statusFilter !== "all"
                  ? "No hay prospectos para los filtros seleccionados."
                  : "No hay prospectos registrados todavía."
              }
              compact
            />
          ) : view === "cards" ? (
            /* ═══ Cards View — familia visual de Cotizaciones ═══ */
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 min-w-0">
              {filteredLeads.map((lead) => {
                const meta = lead.metadata as Record<string, unknown> | undefined;
                const totalGuards = (meta?.totalGuards as number) || 0;
                const rejectionInfo = getLeadRejectionInfo(lead.metadata);
                const status = LEAD_STATUS_MAP[lead.status] || LEAD_STATUS_MAP.pending;
                const isPending = lead.status === "pending" || lead.status === "in_review";
                return (
                  <Link
                    key={lead.id}
                    href={`/crm/leads/${lead.id}`}
                    className="flex flex-col rounded-lg border border-border transition-colors hover:border-primary/30 hover:bg-accent/30 group min-w-0 overflow-hidden"
                  >
                    <div className="flex-1 p-4">
                      {/* Header: empresa + chip estado con dot */}
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-sm truncate">{lead.companyName || "Empresa sin nombre"}</p>
                        <Badge variant="outline" className={`shrink-0 ${status.className}`}>
                          <span className="inline-flex h-1.5 w-1.5 rounded-full mr-1 bg-current" />
                          {status.label}
                        </Badge>
                      </div>

                      {/* Contacto · email */}
                      <p className="mt-1 text-xs text-muted-foreground truncate">
                        {leadDisplayName(lead)}
                        {lead.email ? ` · ${lead.email}` : ""}
                        {!lead.email && lead.phone ? ` · ${lead.phone}` : ""}
                      </p>

                      {/* Chips: origen / comuna / correo de rechazo */}
                      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                        <LeadSourceBadge source={lead.source} />
                        {lead.commune && (
                          <Tag variant="neutral" size="sm" icon={MapPin}>
                            {lead.commune}
                          </Tag>
                        )}
                        {lead.status === "rejected" && rejectionInfo && (
                          <Tag variant={rejectionInfo.emailSent ? "neutral" : "warn"} size="sm">
                            {rejectionInfo.emailSent ? "Correo enviado" : "Sin correo enviado"}
                          </Tag>
                        )}
                      </div>

                      {/* Rejection note */}
                      {lead.status === "rejected" && rejectionInfo?.note && (
                        <p className="mt-2 rounded-md border border-border bg-muted/30 px-2 py-1 text-[11px] text-muted-foreground line-clamp-3">
                          Observación: {rejectionInfo.note}
                        </p>
                      )}

                      {/* Métricas con hairline superior */}
                      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-ds-border-subtle pt-2 text-center">
                        <div className="min-w-0">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Guardias</p>
                          <p className="truncate text-sm font-medium font-mono">
                            {totalGuards > 0 ? totalGuards : "—"}
                          </p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Servicio</p>
                          <p className="truncate text-[12px] font-medium">
                            {lead.serviceType || "—"}
                          </p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Recibido</p>
                          <div className="flex justify-center">
                            <CrmDates createdAt={lead.createdAt} />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Footer: acciones inline (solo pendientes con permiso de edición) */}
                    <div className="flex items-center justify-between gap-2 border-t border-ds-border-subtle px-4 py-2">
                      {isPending && canEditLeads ? (
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            className="h-8 gap-1 bg-status-ok text-white hover:brightness-110"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              router.push(`/crm/leads/${lead.id}`);
                            }}
                          >
                            <Check className="h-3.5 w-3.5" />
                            Aprobar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1 border-status-danger-border text-status-danger-fg hover:bg-status-danger-soft"
                            onClick={(e) => openRejectDialog(e, lead.id)}
                          >
                            <X className="h-3.5 w-3.5" />
                            Rechazar
                          </Button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">
                          {isPending ? "Revisar en la ficha" : ""}
                        </span>
                      )}
                      <div className="flex items-center gap-1">
                        {lead.status !== "approved" && canDeleteLead && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={(e) => handleDeleteLead(e, lead.id)}
                            title="Eliminar lead"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            /* ═══ List View ═══ */
            <div className="space-y-2 min-w-0">
              {filteredLeads.map((lead) => {
                const meta = lead.metadata as Record<string, unknown> | undefined;
                const dotacion = (meta?.dotacion as { puesto: string; cantidad: number; dias?: string[]; horaInicio?: string; horaFin?: string }[] | undefined);
                const totalGuards = (meta?.totalGuards as number) || 0;
                const rejectionInfo = getLeadRejectionInfo(lead.metadata);

                return (
                  <Link
                    key={lead.id}
                    href={`/crm/leads/${lead.id}`}
                    className="block rounded-lg border border-border p-3 sm:p-4 transition-colors hover:bg-accent/30 group min-w-0 overflow-hidden"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex-1 min-w-0">
                        {/* Row 1: Company + badges */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-sm">{lead.companyName || "Empresa sin nombre"}</p>
                          <StatusTag status={lead.status} />
                          <LeadSourceBadge source={lead.source} />
                          {totalGuards > 0 && (
                            <Badge variant="success" className="text-[10px] px-1.5 py-0">
                              {totalGuards} guardia{totalGuards > 1 ? "s" : ""}
                            </Badge>
                          )}
                          {lead.status === "rejected" && rejectionInfo && (
                            <Badge variant={rejectionInfo.emailSent ? "default" : "warning"} className="text-[10px] px-1.5 py-0">
                              {rejectionInfo.emailSent ? "Correo enviado" : "Sin correo enviado"}
                            </Badge>
                          )}
                        </div>

                        {/* Row 2: Contact info + quick actions */}
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-xs text-muted-foreground">{leadDisplayName(lead)}</span>
                          {lead.email ? (
                            <span className="text-xs text-primary inline-flex items-center gap-1">
                              <Mail className="h-3 w-3" />{lead.email}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">Sin email</span>
                          )}
                          {lead.phone && (
                            <span className="text-xs text-primary inline-flex items-center gap-1">
                              <Phone className="h-3 w-3" />{lead.phone}
                            </span>
                          )}
                          {lead.status === "rejected" && rejectionInfo?.note && (
                            <span className="inline-flex items-center rounded border border-border bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground max-w-full truncate">
                              Observación: {rejectionInfo.note}
                            </span>
                          )}
                          <LeadContactActions phone={lead.phone} email={lead.email} stopPropagation />
                        </div>

                        {/* Row 3: Dates + meta */}
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 items-center">
                          <CrmDates createdAt={lead.createdAt} updatedAt={(lead as { updatedAt?: string }).updatedAt} showTime />
                          {lead.source && lead.source !== "web_cotizador" && lead.source !== "web_cotizador_inteligente" && lead.source !== "email_forward" && (
                            <span className="text-[11px] text-muted-foreground/80">Fuente: {lead.source}</span>
                          )}
                          {lead.industry && (
                            <span className="text-[11px] text-muted-foreground/80">Industria: {lead.industry}</span>
                          )}
                        </div>
                      </div>

                      {/* Right: CTA + delete + chevron */}
                      <div className="flex items-center gap-2 shrink-0">
                        {(lead.status === "pending" || lead.status === "in_review") && (
                          <span className="text-xs text-primary font-medium group-hover:underline">
                            {lead.status === "in_review" ? "Revisar" : "Revisar y aprobar"}
                          </span>
                        )}
                        {lead.status !== "approved" && canDeleteLead && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={(e) => handleDeleteLead(e, lead.id)}
                            title="Eliminar lead"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                      </div>
                    </div>

                    {/* Dotación solicitada */}
                    {dotacion && dotacion.length > 0 && (
                      <div className="mt-3">
                        <DotacionSummary dotacion={dotacion} totalGuards={totalGuards} />
                      </div>
                    )}

                    {/* Notes preview */}
                    {lead.notes && !dotacion && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{lead.notes}</p>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rechazo inline — mismo endpoint que la ficha; sin envío de correo */}
      <Dialog open={!!rejectLeadId} onOpenChange={(o) => !o && setRejectLeadId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rechazar lead</DialogTitle>
            <DialogDescription>
              El lead pasará a rechazados. Para rechazar con correo al contacto, hazlo desde la ficha.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Motivo</Label>
              <div className="flex flex-wrap gap-1.5">
                {REJECTION_REASON_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    size="sm"
                    variant={rejectReason === opt.value ? "default" : "outline"}
                    className="h-8 rounded-full text-xs"
                    onClick={() => setRejectReason(opt.value)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Observación (opcional)</Label>
              <Input
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="Contexto del rechazo..."
                className={inputClassName}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectLeadId(null)} disabled={rejecting}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmRejectLead} disabled={rejecting}>
              {rejecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Rechazar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteLeadId}
        onOpenChange={(open) => !open && setDeleteLeadId(null)}
        title="¿Eliminar prospecto?"
        description="Esta acción no se puede deshacer. El prospecto se eliminará permanentemente."
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        onConfirm={handleConfirmDelete}
        variant="destructive"
        loading={deleteDeleting}
        loadingLabel="Eliminando..."
      />
    </div>
  );
}
