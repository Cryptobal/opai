/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
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
import { CrmLead } from "@/types";
import { Plus, Loader2, ChevronRight, UserPlus, Phone, Mail, MessageSquare, Clock, Users, Calendar, Briefcase } from "lucide-react";
import { StatusBadge } from "@/components/opai/StatusBadge";
import { EmptyState } from "@/components/opai/EmptyState";
import { CrmDates } from "@/components/crm/CrmDates";
import { CrmToolbar } from "./CrmToolbar";
import type { ViewMode } from "./ViewToggle";
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

/** Normaliza teléfono para tel: (solo dígitos) */
function telHref(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 0) return "";
  return `tel:${digits.length <= 9 ? "+56" + digits : "+" + digits}`;
}

/** URL WhatsApp Chile */
function whatsappHref(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 0) return "";
  const withCountry = digits.length === 9 && digits.startsWith("9") ? "56" + digits : digits.length >= 10 ? digits : "56" + digits;
  return `https://wa.me/${withCountry}`;
}

/* ─── Component ─── */

export function CrmLeadsClient({
  initialLeads,
  initialStatusFilter = "pending",
}: {
  initialLeads: CrmLead[];
  initialStatusFilter?: LeadStatusFilter;
}) {
  const [leads, setLeads] = useState<CrmLead[]>(initialLeads);
  const [form, setForm] = useState<LeadFormState>(DEFAULT_FORM);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatusFilter>(initialStatusFilter);
  const [sort, setSort] = useState("newest");
  const [view, setView] = useState<ViewMode>("cards");
  const [rejectReasonFilter, setRejectReasonFilter] = useState<LeadRejectReasonFilter>("all");

  const inputClassName = "bg-background text-foreground placeholder:text-muted-foreground border-input focus-visible:ring-ring";

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
                  <Input value={form.companyName} onChange={(event) => updateForm("companyName", event.target.value)} placeholder="Nombre de la empresa" className={inputClassName} />
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
                  {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Guardar lead
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {statusFilter === "rejected" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Motivo:</span>
          <Button
            size="sm"
            variant={rejectReasonFilter === "all" ? "default" : "outline"}
            className="h-7 text-xs"
            onClick={() => setRejectReasonFilter("all")}
          >
            {getLeadRejectReasonLabel("all")}
          </Button>
          {REJECTION_REASON_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              size="sm"
              variant={rejectReasonFilter === opt.value ? "default" : "outline"}
              className="h-7 text-xs"
              onClick={() => setRejectReasonFilter(opt.value)}
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
              icon={<UserPlus className="h-8 w-8" />}
              title="Sin prospectos"
              description={
                search || statusFilter !== "all"
                  ? "No hay prospectos para los filtros seleccionados."
                  : "No hay prospectos registrados todavía."
              }
              compact
            />
          ) : view === "cards" ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 min-w-0">
              {filteredLeads.map((lead) => {
                const meta = lead.metadata as Record<string, unknown> | undefined;
                const totalGuards = (meta?.totalGuards as number) || 0;
                const rejectionInfo = getLeadRejectionInfo(lead.metadata);
                return (
                  <Link
                    key={lead.id}
                    href={`/crm/leads/${lead.id}`}
                    className="block rounded-lg border p-4 transition-colors hover:border-primary/30 hover:bg-accent/30 group space-y-2 min-w-0 overflow-hidden"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-sm truncate">{lead.companyName || "Empresa sin nombre"}</p>
                      <StatusBadge status={lead.status} />
                    </div>
                    <p className="text-xs text-muted-foreground">{leadDisplayName(lead)}</p>
                    {lead.email && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                        <Mail className="h-3 w-3 shrink-0" />{lead.email}
                      </p>
                    )}
                    {lead.phone && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Phone className="h-3 w-3 shrink-0" />{lead.phone}
                      </p>
                    )}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {totalGuards > 0 && (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                          {totalGuards} guardia{totalGuards > 1 ? "s" : ""}
                        </span>
                      )}
                      {lead.source && (
                        <span className="text-[10px] text-muted-foreground/80">
                          {lead.source === "web_cotizador" ? "Cotizador Web" : lead.source === "web_cotizador_inteligente" ? "Cotizador IA" : lead.source === "email_forward" ? "Correo reenviado" : lead.source}
                        </span>
                      )}
                      {lead.source === "email_forward" && (
                        <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-400">Email</span>
                      )}
                      {lead.status === "rejected" && rejectionInfo && (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${rejectionInfo.emailSent ? "bg-blue-500/15 text-blue-400" : "bg-amber-500/15 text-amber-400"}`}>
                          {rejectionInfo.emailSent ? "Correo enviado" : "Sin correo enviado"}
                        </span>
                      )}
                    </div>
                    {lead.status === "rejected" && rejectionInfo?.note && (
                      <p className="rounded-md border border-border/70 bg-muted/20 px-2 py-1 text-[11px] text-muted-foreground line-clamp-3">
                        Observación: {rejectionInfo.note}
                      </p>
                    )}
                    <div className="flex items-center justify-between pt-1">
                      <CrmDates createdAt={lead.createdAt} />
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
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
                    className="block rounded-lg border p-3 sm:p-4 transition-colors hover:bg-accent/30 group min-w-0 overflow-hidden"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-sm">{lead.companyName || "Empresa sin nombre"}</p>
                          <StatusBadge status={lead.status} />
                          {lead.source === "web_cotizador" && (
                            <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-medium text-blue-400">Web</span>
                          )}
                          {lead.source === "web_cotizador_inteligente" && (
                            <span className="rounded-full bg-teal-500/15 px-2 py-0.5 text-[10px] font-medium text-teal-400">Cotizador Inteligente</span>
                          )}
                          {lead.source === "email_forward" && (
                            <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-400">Correo reenviado</span>
                          )}
                          {totalGuards > 0 && (
                            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                              {totalGuards} guardia{totalGuards > 1 ? "s" : ""}
                            </span>
                          )}
                          {lead.status === "rejected" && rejectionInfo && (
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${rejectionInfo.emailSent ? "bg-blue-500/15 text-blue-400" : "bg-amber-500/15 text-amber-400"}`}>
                              {rejectionInfo.emailSent ? "Correo enviado" : "Sin correo enviado"}
                            </span>
                          )}
                        </div>
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
                            <span className="inline-flex items-center rounded border border-border/70 bg-muted/20 px-2 py-0.5 text-[11px] text-muted-foreground max-w-full truncate">
                              Observación: {rejectionInfo.note}
                            </span>
                          )}
                          <div className="flex items-center gap-1 ml-1">
                            {lead.phone && (
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground" asChild>
                                <a href={telHref(lead.phone)} onClick={(e) => e.stopPropagation()} aria-label="Llamar"><Phone className="h-3.5 w-3.5" /></a>
                              </Button>
                            )}
                            {lead.email && (
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground" asChild>
                                <a href={`mailto:${lead.email}`} onClick={(e) => e.stopPropagation()} aria-label="Enviar email"><Mail className="h-3.5 w-3.5" /></a>
                              </Button>
                            )}
                            {lead.phone && (
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-emerald-600" asChild>
                                <a href={whatsappHref(lead.phone)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} aria-label="WhatsApp"><MessageSquare className="h-3.5 w-3.5" /></a>
                              </Button>
                            )}
                          </div>
                        </div>
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
                      <div className="flex items-center gap-2 shrink-0">
                        {(lead.status === "pending" || lead.status === "in_review") && (
                          <span className="text-xs text-primary font-medium group-hover:underline">
                            {lead.status === "in_review" ? "Revisar" : "Revisar y aprobar"}
                          </span>
                        )}
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                      </div>
                    </div>

                    {/* Dotación solicitada */}
                    {dotacion && dotacion.length > 0 && (
                      <div className="mt-3 rounded-lg border border-border/80 bg-muted/20 overflow-hidden">
                        <div className="px-3 py-2 border-b border-border/60 bg-muted/30 flex items-center gap-2">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dotación solicitada</span>
                          {totalGuards > 0 && (
                            <span className="text-[10px] font-medium text-foreground bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                              {totalGuards} guardia{totalGuards > 1 ? "s" : ""} total
                            </span>
                          )}
                        </div>
                        <div className="divide-y divide-border/60">
                          {dotacion.map((d, i) => (
                            <div key={i} className="px-3 py-2.5 flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <Briefcase className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <span className="text-sm font-medium text-foreground truncate">{d.puesto}</span>
                              </div>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground pl-5 sm:pl-0">
                                <span className="inline-flex items-center gap-1"><Users className="h-3 w-3 shrink-0" />{d.cantidad} guardia{d.cantidad > 1 ? "s" : ""}</span>
                                {d.horaInicio && d.horaFin && (
                                  <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3 shrink-0" />{d.horaInicio} – {d.horaFin}</span>
                                )}
                                {d.dias && d.dias.length > 0 && (
                                  <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3 shrink-0" />{d.dias.length === 7 ? "Todos los días" : d.dias.join(", ")}</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
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

    </div>
  );
}
