/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, ExternalLink, Trash2, Pencil, Loader2, LayoutGrid, Plus, QrCode, Copy, RefreshCw, Moon, UserPlus, UserMinus, Search, CalendarDays, AlertTriangle, Info, Users, Briefcase, FileText, ClipboardList, Shield, Receipt, Package, MessageSquareText, UserCircle } from "lucide-react";
import { PuestoFormModal, type PuestoFormData } from "@/components/shared/PuestoFormModal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
} from "@/components/ui/dialog";
import { AddressAutocomplete, type AddressResult } from "@/components/ui/AddressAutocomplete";
import { MapsUrlPasteInput } from "@/components/ui/MapsUrlPasteInput";
import { EmptyState } from "@/components/opai/EmptyState";
import { EntityDetailLayout, useEntityTabs, type EntityTab, type EntityHeaderAction } from "./EntityDetailLayout";
import { DetailField, DetailFieldGrid } from "./DetailField";
import { CrmRelatedRecordCard, CrmRelatedRecordGrid } from "./CrmRelatedRecordCard";
import { CRM_MODULES } from "./CrmModuleIcons";
import { NotesSection } from "./NotesSection";
import { FileAttachments } from "./FileAttachments";
import { InstallationExpensesSection } from "@/components/finance/InstallationExpensesSection";
import { InventarioInstallationSection } from "@/components/inventario/InventarioInstallationSection";
import { OpsRefuerzosClient } from "@/components/ops";
import { CreateQuoteModal } from "@/components/cpq/CreateQuoteModal";
import { CreateDealModal } from "./CreateDealModal";
import { CrmSectionCreateButton } from "./CrmSectionCreateButton";
import { toast } from "sonner";

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

export type InstallationDetail = {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  commune?: string | null;
  lat?: number | null;
  lng?: number | null;
  isActive?: boolean;
  teMontoClp?: number | string | null;
  notes?: string | null;
  marcacionCode?: string | null;
  geoRadiusM?: number;
  metadata?: Record<string, unknown> | null;
  nocturnoEnabled?: boolean;
  startDate?: string | null;
  endDate?: string | null;
  puestosActivos?: Array<{
    id: string;
    name: string;
    puestoTrabajoId?: string | null;
    cargoId?: string | null;
    rolId?: string | null;
    shiftStart: string;
    shiftEnd: string;
    weekdays: string[];
    requiredGuards: number;
    baseSalary?: number | string | null;
    teMontoClp?: number | string | null;
    activeFrom?: string | null;
    puestoTrabajo?: { id: string; name: string } | null;
    cargo?: { id: string; name: string } | null;
    rol?: { id: string; name: string } | null;
  }>;
  quotesInstalacion?: Array<{
    id: string;
    code: string;
    status: string;
    totalPositions: number;
    totalGuards: number;
    updatedAt: string;
  }>;
  puestosHistorial?: Array<{
    id: string;
    name: string;
    shiftStart: string;
    shiftEnd: string;
    requiredGuards: number;
    activeFrom?: string | null;
    activeUntil?: string | null;
    cargo?: { name: string } | null;
    rol?: { name: string } | null;
  }>;
  asignacionGuardias?: Array<{
    id: string;
    guardiaId: string;
    puestoId: string;
    slotNumber: number;
    startDate: string;
    guardia: {
      id: string;
      code?: string | null;
      lifecycleStatus: string;
      persona: { firstName: string; lastName: string; rut?: string | null };
    };
    puesto: { id: string; name: string; shiftStart: string; shiftEnd: string };
  }>;
  guardiasActuales?: Array<{
    id: string;
    code?: string | null;
    lifecycleStatus: string;
    persona: { firstName: string; lastName: string; rut?: string | null };
  }>;
  refuerzos?: Array<{
    id: string;
    installationId: string;
    accountId?: string | null;
    guardiaId: string;
    puestoId?: string | null;
    requestedByName?: string | null;
    requestChannel?: string | null;
    startAt: string;
    endAt: string;
    guardsCount: number;
    shiftType?: string | null;
    paymentCondition?: string | null;
    guardPaymentClp: number;
    estimatedTotalClp: number;
    status: "solicitado" | "en_curso" | "realizado" | "facturado";
    invoiceNumber?: string | null;
    installation: { id: string; name: string };
    account?: { id: string; name: string } | null;
    puesto?: { id: string; name: string } | null;
    guardia: {
      id: string;
      code?: string | null;
      persona: { firstName: string; lastName: string; rut?: string | null };
    };
    turnoExtra?: { id: string; status: string; amountClp: number; paidAt?: string | null } | null;
  }>;
  account?: { id: string; name: string; type?: "prospect" | "client"; status?: string; isActive?: boolean } | null;
  /** Negocios de la cuenta asociada (solo cuando hay accountId) */
  dealsOfAccount?: Array<{
    id: string;
    title: string;
    amount: string;
    status: string;
    stage?: { name: string } | null;
  }>;
  /** Contactos de la cuenta asociada (solo cuando hay accountId) */
  contactsOfAccount?: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email?: string | null;
    phone?: string | null;
    roleTitle?: string | null;
    isPrimary?: boolean;
  }>;
};

/* ── Lifecycle colors (shared) ── */

const LIFECYCLE_COLORS: Record<string, string> = {
  postulante: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  seleccionado: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  contratado: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  te: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  inactivo: "bg-amber-500/15 text-amber-300 border-amber-500/30",
};

const LIFECYCLE_LABELS: Record<string, string> = {
  postulante: "Postulante",
  seleccionado: "Seleccionado",
  contratado: "Contratado",
  te: "Turno Extra",
  inactivo: "Inactivo",
};

/* ── Marcación asistencia Section ── */

function MarcacionAsistenciaSection({ installation }: { installation: InstallationDetail }) {
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState(installation.marcacionCode || "");

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://opai.gard.cl";
  const marcacionUrl = code ? `${baseUrl}/marcar/${code}` : "";
  const handleGenerar = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ops/marcacion/generar-codigo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ installationId: installation.id }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error || "Error al generar código");
        return;
      }
      setCode(data.data.marcacionCode);
      toast.success(data.data.message);
    } catch {
      toast.error("Error de conexión");
    } finally {
      setLoading(false);
    }
  };
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado al portapapeles");
  };

  if (!code) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Genera un código para habilitar marcación de asistencia en esta instalación.
        </p>
        <Button onClick={handleGenerar} disabled={loading} size="sm">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <QrCode className="mr-2 h-4 w-4" />}
          Generar código de asistencia
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
        <div>
          <p className="text-xs text-muted-foreground">Código de asistencia</p>
          <p className="text-lg font-mono font-bold tracking-widest">{code}</p>
        </div>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" onClick={() => handleCopy(code)} title="Copiar código">
            <Copy className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={handleGenerar} disabled={loading} title="Regenerar código">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">URL de asistencia móvil</p>
          <p className="text-sm font-mono truncate">{marcacionUrl}</p>
        </div>
        <Button size="icon" variant="ghost" onClick={() => handleCopy(marcacionUrl)} title="Copiar URL asistencia">
          <Copy className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex flex-col items-center gap-3 p-4 rounded-lg border border-border bg-white">
        <p className="text-xs text-muted-foreground">QR asistencia</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(marcacionUrl)}`}
          alt={`QR asistencia ${code}`}
          width={200}
          height={200}
          className="rounded"
        />
        <p className="text-[10px] text-muted-foreground">
          Link: /marcar/{code}
        </p>
      </div>
    </div>
  );
}

/* ── Marcación rondas Section ── */

function MarcacionRondasSection({ installation }: { installation: InstallationDetail }) {
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState(installation.marcacionCode || "");

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://opai.gard.cl";
  const rondaUrl = code ? `${baseUrl}/ronda/${code}` : "";

  const handleGenerar = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ops/marcacion/generar-codigo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ installationId: installation.id }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error || "Error al generar código");
        return;
      }
      setCode(data.data.marcacionCode);
      toast.success(data.data.message);
    } catch {
      toast.error("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado al portapapeles");
  };

  if (!code) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Genera un código para habilitar marcación de rondas en esta instalación.
        </p>
        <Button onClick={handleGenerar} disabled={loading} size="sm">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <QrCode className="mr-2 h-4 w-4" />}
          Generar código de rondas
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
        <div>
          <p className="text-xs text-muted-foreground">Código de rondas</p>
          <p className="text-lg font-mono font-bold tracking-widest">{code}</p>
        </div>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" onClick={() => handleCopy(code)} title="Copiar código">
            <Copy className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={handleGenerar} disabled={loading} title="Regenerar código">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-emerald-300">URL de rondas móvil</p>
          <p className="text-sm font-mono truncate">{rondaUrl}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={() => handleCopy(rondaUrl)} title="Copiar URL de rondas">
            <Copy className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => window.open(rondaUrl, "_blank", "noopener,noreferrer")} title="Abrir ronda móvil">
            <ExternalLink className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-col items-center gap-3 p-4 rounded-lg border border-border bg-white">
        <p className="text-xs text-muted-foreground">QR rondas</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(rondaUrl)}`}
          alt={`QR ronda ${code}`}
          width={200}
          height={200}
          className="rounded"
        />
        <p className="text-[10px] text-muted-foreground">
          Link: /ronda/{code}
        </p>
      </div>

      <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
        <MapPin className="h-4 w-4 text-blue-400 shrink-0" />
        <p className="text-xs text-blue-300">
          Radio de validación GPS: <strong>{installation.geoRadiusM ?? 100}m</strong>.
          Las marcaciones fuera de este radio se registran con advertencia.
        </p>
      </div>
    </div>
  );
}

/* ── Dotación Section (interactive guard assignment) ── */

function toDateInput(d: Date): string { return d.toISOString().slice(0, 10); }

type GuardiaOption = {
  id: string;
  code?: string | null;
  lifecycleStatus: string;
  persona: { firstName: string; lastName: string; rut?: string | null };
};

type AssignWarning = {
  puestoName: string;
  installationName: string;
  accountName: string | null;
  startDate?: string;
} | null;

function DotacionSection({ installation, canEdit: canEditProp = false }: { installation: InstallationDetail; canEdit?: boolean }) {
  const router = useRouter();

  /* ── data state (can be refreshed after mutations) ── */
  const [asignaciones, setAsignaciones] = useState(installation.asignacionGuardias ?? []);
  const puestos = installation.puestosActivos ?? [];
  const guardiasDirectos = installation.guardiasActuales ?? [];

  /* ── guardias list for assignment modal ── */
  const [guardias, setGuardias] = useState<GuardiaOption[]>([]);
  const [guardiasLoaded, setGuardiasLoaded] = useState(false);

  /* ── assignment modal state ── */
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<{ puestoId: string; slotNumber: number; puestoName: string } | null>(null);
  const [assignGuardiaId, setAssignGuardiaId] = useState("");
  const [assignSearch, setAssignSearch] = useState("");
  const [assignDate, setAssignDate] = useState(toDateInput(new Date()));
  const [assignWarning, setAssignWarning] = useState<AssignWarning>(null);
  const [assignEndDateSameAsStart, setAssignEndDateSameAsStart] = useState(true);
  const [assignEndDatePrevious, setAssignEndDatePrevious] = useState("");
  const [assignSaving, setAssignSaving] = useState(false);

  /* ── unassign modal state ── */
  const [unassignOpen, setUnassignOpen] = useState(false);
  const [unassignTarget, setUnassignTarget] = useState<{ asignacionId: string; guardiaName: string } | null>(null);
  const [unassignDate, setUnassignDate] = useState(toDateInput(new Date()));
  const [unassignSaving, setUnassignSaving] = useState(false);

  const assignedGuardiaIds = useMemo(
    () => new Set(asignaciones.map((a) => a.guardia.id)),
    [asignaciones]
  );
  const guardiasExtraDirectos = useMemo(
    () => guardiasDirectos.filter((g) => !assignedGuardiaIds.has(g.id)),
    [guardiasDirectos, assignedGuardiaIds]
  );

  /* ── Fetch guardias list (lazy, first time modal opens) ── */
  const loadGuardias = useCallback(async () => {
    if (guardiasLoaded) return;
    try {
      const res = await fetch(`/api/crm/installations/${installation.id}/guardias`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok && data.success) {
        setGuardias(data.data as GuardiaOption[]);
      }
    } catch { /* silent */ }
    setGuardiasLoaded(true);
  }, [installation.id, guardiasLoaded]);

  /* ── Refresh assignments after mutations ── */
  const refreshAsignaciones = useCallback(async () => {
    try {
      const res = await fetch(`/api/crm/installations/${installation.id}/asignaciones?activeOnly=true`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok && data.success) {
        setAsignaciones(data.data);
      }
    } catch { /* silent */ }
  }, [installation.id]);

  /* ── Check for existing assignment when guard is selected ── */
  useEffect(() => {
    if (!assignGuardiaId) { setAssignWarning(null); return; }
    const controller = new AbortController();
    fetch(`/api/crm/installations/${installation.id}/asignaciones`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "check", guardiaId: assignGuardiaId }),
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((payload) => {
        if (payload.success && payload.data?.hasActiveAssignment) {
          setAssignWarning({
            puestoName: payload.data.assignment.puestoName,
            installationName: payload.data.assignment.installationName,
            accountName: payload.data.assignment.accountName,
            startDate: payload.data.assignment.startDate,
          });
          setAssignEndDateSameAsStart(true);
          setAssignEndDatePrevious(assignDate);
        } else {
          setAssignWarning(null);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignGuardiaId, installation.id]);

  /* ── Open assign modal ── */
  const openAssign = (puestoId: string, slotNumber: number, puestoName: string) => {
    setAssignTarget({ puestoId, slotNumber, puestoName });
    setAssignGuardiaId("");
    setAssignSearch("");
    setAssignDate(toDateInput(new Date()));
    setAssignWarning(null);
    setAssignEndDateSameAsStart(true);
    setAssignEndDatePrevious("");
    setAssignOpen(true);
    void loadGuardias();
  };

  /* ── Available guardias filtered ── */
  const availableGuardias = useMemo(() => {
    const q = assignSearch.trim().toLowerCase();
    return guardias.filter((g) => {
      if (q) {
        const hay = `${g.persona.firstName} ${g.persona.lastName} ${g.code ?? ""} ${g.persona.rut ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [guardias, assignSearch]);

  /* ── Handle assign ── */
  const handleAssign = async () => {
    if (!assignTarget || !assignGuardiaId) { toast.error("Selecciona un guardia"); return; }
    setAssignSaving(true);
    try {
      const body: Record<string, unknown> = {
        guardiaId: assignGuardiaId,
        puestoId: assignTarget.puestoId,
        slotNumber: assignTarget.slotNumber,
        startDate: assignDate,
      };
      if (assignWarning && !assignEndDateSameAsStart) {
        body.endDatePrevious = assignEndDatePrevious;
      }
      const res = await fetch(`/api/crm/installations/${installation.id}/asignaciones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload.error || "Error");
      toast.success("Guardia asignado correctamente");
      setAssignOpen(false);
      await refreshAsignaciones();
      router.refresh();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "No se pudo asignar");
    } finally { setAssignSaving(false); }
  };

  /* ── Open unassign modal ── */
  const openUnassign = (asignacionId: string, guardiaName: string) => {
    setUnassignTarget({ asignacionId, guardiaName });
    setUnassignDate(toDateInput(new Date()));
    setUnassignOpen(true);
  };

  /* ── Handle unassign ── */
  const handleUnassign = async () => {
    if (!unassignTarget) return;
    setUnassignSaving(true);
    try {
      const res = await fetch(`/api/crm/installations/${installation.id}/asignaciones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "desasignar",
          asignacionId: unassignTarget.asignacionId,
          endDate: unassignDate,
          reason: "Desasignado desde instalación",
        }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload.error || "Error");
      toast.success("Guardia desasignado");
      setUnassignOpen(false);
      await refreshAsignaciones();
      router.refresh();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "No se pudo desasignar");
    } finally { setUnassignSaving(false); }
  };

  /* ── Group assignments by puesto ── */
  const assignmentsByPuesto = useMemo(() => {
    const map = new Map<string, typeof asignaciones>();
    for (const a of asignaciones) {
      const list = map.get(a.puestoId) ?? [];
      list.push(a);
      map.set(a.puestoId, list);
    }
    return map;
  }, [asignaciones]);

  if (puestos.length === 0 && guardiasExtraDirectos.length === 0) {
    return (
      <EmptyState
        icon={<LayoutGrid className="h-8 w-8" />}
        title="Sin dotación"
        description="No hay puestos operativos activos ni guardias asignados."
        compact
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/ops/pauta-mensual?installationId=${installation.id}`}>
            <CalendarDays className="h-3.5 w-3.5 mr-1.5 text-white" />
            Abrir pauta mensual
          </Link>
        </Button>
      </div>

      <div className="space-y-2">
        {puestos.map((puesto) => {
          const puestoAssignments = assignmentsByPuesto.get(puesto.id) ?? [];
          const startH = parseInt(puesto.shiftStart.split(":")[0], 10);
          const isNight = startH >= 18 || startH < 6;

          return (
            <div key={puesto.id} className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{puesto.name}</p>
                <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold border ${
                  isNight
                    ? "bg-indigo-500/15 text-indigo-300 border-indigo-500/30"
                    : "bg-amber-500/15 text-amber-300 border-amber-500/30"
                }`}>
                  {isNight ? "Noche" : "Día"}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {puesto.shiftStart}-{puesto.shiftEnd} · {puesto.requiredGuards} slot(s)
                </span>
              </div>

              <div className="space-y-1">
                {Array.from({ length: puesto.requiredGuards }, (_, i) => i + 1).map((slotNum) => {
                  const assignment = puestoAssignments.find((a) => a.slotNumber === slotNum);
                  return (
                    <div
                      key={slotNum}
                      className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs ${
                        assignment
                          ? "border border-border/60 bg-card"
                          : "border border-dashed border-amber-500/30 bg-amber-500/5"
                      }`}
                    >
                      <span className="text-muted-foreground font-mono text-[10px] w-10 shrink-0">
                        Slot {slotNum}
                      </span>
                      {assignment ? (
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <Link
                            href={`/personas/guardias/${assignment.guardia.id}`}
                            className="font-medium hover:underline hover:text-primary transition-colors truncate"
                          >
                            {assignment.guardia.persona.firstName} {assignment.guardia.persona.lastName}
                          </Link>
                          {assignment.guardia.code && (
                            <span className="text-muted-foreground shrink-0">({assignment.guardia.code})</span>
                          )}
                          <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium border shrink-0 ${
                            LIFECYCLE_COLORS[assignment.guardia.lifecycleStatus] ?? LIFECYCLE_COLORS.postulante
                          }`}>
                            {LIFECYCLE_LABELS[assignment.guardia.lifecycleStatus] ?? assignment.guardia.lifecycleStatus}
                          </span>
                          {assignment.guardia.persona.rut && (
                            <span className="text-[10px] text-muted-foreground shrink-0 hidden sm:inline">{assignment.guardia.persona.rut}</span>
                          )}
                          {canEditProp && (
                            <div className="ml-auto shrink-0 flex items-center gap-0.5">
                              <button
                                type="button"
                                onClick={() => openAssign(puesto.id, slotNum, puesto.name)}
                                className="rounded p-1 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                                title="Reemplazar guardia"
                              >
                                <UserPlus className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => openUnassign(
                                  assignment.id,
                                  `${assignment.guardia.persona.firstName} ${assignment.guardia.persona.lastName}`
                                )}
                                className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                title="Desasignar guardia"
                              >
                                <UserMinus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-amber-400 italic text-[11px]">Vacante</span>
                          {canEditProp && (
                            <button
                              type="button"
                              onClick={() => openAssign(puesto.id, slotNum, puesto.name)}
                              className="ml-auto shrink-0 inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/10 transition-colors border border-primary/20"
                            >
                              <UserPlus className="h-3 w-3" />
                              Asignar
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Guardias asignados directamente (sin puesto operativo, ej: migración masiva) */}
      {guardiasExtraDirectos.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Guardias asignados directamente ({guardiasExtraDirectos.length})
          </p>
          <div className="space-y-1">
            {guardiasExtraDirectos.map((g) => (
              <Link
                key={g.id}
                href={`/personas/guardias/${g.id}`}
                className="flex items-center gap-2 rounded-md border border-border/60 bg-card px-3 py-1.5 text-xs hover:bg-accent transition-colors"
              >
                <span className="font-medium">
                  {g.persona.firstName} {g.persona.lastName}
                </span>
                {g.code && <span className="text-muted-foreground">({g.code})</span>}
                <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium border ${
                  LIFECYCLE_COLORS[g.lifecycleStatus] ?? LIFECYCLE_COLORS.postulante
                }`}>
                  {LIFECYCLE_LABELS[g.lifecycleStatus] ?? g.lifecycleStatus}
                </span>
                {g.persona.rut && (
                  <span className="text-[10px] text-muted-foreground">{g.persona.rut}</span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── Assign Guard Modal ── */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Asignar guardia</DialogTitle>
            <DialogDescription>
              {assignTarget ? `${assignTarget.puestoName} — Slot ${assignTarget.slotNumber}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {/* Fecha de inicio en instalación */}
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5 text-white" />
                Fecha de inicio en instalación
                <span className="relative group">
                  <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block w-56 rounded-md border border-border bg-popover px-3 py-2 text-[10px] text-popover-foreground shadow-md z-50 leading-relaxed">
                    Esta fecha es importante: será utilizada en los contratos como fecha de inicio en la nueva instalación y es la fecha base para el cálculo de payroll.
                  </span>
                </span>
              </Label>
              <input
                type="date"
                value={assignDate}
                onChange={(e) => {
                  setAssignDate(e.target.value);
                  if (assignEndDateSameAsStart) setAssignEndDatePrevious(e.target.value);
                }}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>

            {/* Buscador de guardias */}
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <Search className="h-3.5 w-3.5" />
                Buscar guardia (solo contratados activos)
              </Label>
              <Input
                placeholder="Nombre, RUT o código..."
                value={assignSearch}
                onChange={(e) => setAssignSearch(e.target.value)}
                className="text-sm"
              />
            </div>

            {/* Lista de guardias */}
            <div className="max-h-48 overflow-y-auto space-y-0.5 rounded-md border border-border p-1">
              {!guardiasLoaded ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : availableGuardias.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3">
                  {assignSearch ? "Sin resultados" : "No hay guardias disponibles"}
                </p>
              ) : (
                availableGuardias.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setAssignGuardiaId(g.id)}
                    className={`w-full text-left flex items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors ${
                      assignGuardiaId === g.id
                        ? "bg-primary/15 text-primary border border-primary/30"
                        : "hover:bg-accent text-foreground"
                    }`}
                  >
                    <span className="font-medium truncate">
                      {g.persona.firstName} {g.persona.lastName}
                    </span>
                    {g.code && <span className="text-muted-foreground shrink-0">({g.code})</span>}
                    {g.persona.rut && <span className="text-[10px] text-muted-foreground shrink-0">{g.persona.rut}</span>}
                  </button>
                ))
              )}
            </div>

            {/* Warning: guard already assigned elsewhere */}
            {assignWarning && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-200">
                    <p className="font-medium">Este guardia ya está asignado</p>
                    <p className="text-amber-300/80 mt-0.5">
                      {assignWarning.puestoName} en {assignWarning.installationName}
                      {assignWarning.accountName ? ` (${assignWarning.accountName})` : ""}
                    </p>
                    <p className="text-amber-300/80 mt-1">
                      Al asignar aquí, se cerrará la asignación anterior automáticamente.
                    </p>
                  </div>
                </div>

                {/* Fecha de término de la asignación anterior */}
                <div className="space-y-1.5 pt-1 border-t border-amber-500/20">
                  <label className="flex items-center gap-2 text-xs text-amber-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={assignEndDateSameAsStart}
                      onChange={(e) => {
                        setAssignEndDateSameAsStart(e.target.checked);
                        if (e.target.checked) setAssignEndDatePrevious(assignDate);
                      }}
                      className="rounded border-amber-500/50"
                    />
                    Fecha de término anterior = fecha de inicio ({assignDate})
                  </label>
                  {!assignEndDateSameAsStart && (
                    <div className="space-y-1">
                      <Label className="text-[10px] text-amber-300">Fecha de término en la instalación anterior</Label>
                      <input
                        type="date"
                        value={assignEndDatePrevious}
                        onChange={(e) => setAssignEndDatePrevious(e.target.value)}
                        className="h-8 w-full rounded-md border border-amber-500/30 bg-amber-500/5 px-3 text-xs text-amber-200"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)} disabled={assignSaving}>Cancelar</Button>
            <Button onClick={handleAssign} disabled={assignSaving || !assignGuardiaId}>
              {assignSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Asignando…
                </>
              ) : (
                "Asignar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Unassign Guard Modal ── */}
      <Dialog open={unassignOpen} onOpenChange={setUnassignOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Desasignar guardia</DialogTitle>
            <DialogDescription>
              ¿Desasignar a {unassignTarget?.guardiaName}?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Fecha de término</Label>
              <input
                type="date"
                value={unassignDate}
                onChange={(e) => setUnassignDate(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnassignOpen(false)} disabled={unassignSaving}>Cancelar</Button>
            <Button variant="destructive" onClick={handleUnassign} disabled={unassignSaving}>
              {unassignSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Desasignando…
                </>
              ) : (
                "Desasignar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Staffing Section (defined before main component) ── */

function StaffingSection({
  installation,
  sourceQuoteId,
  sourceQuoteCode,
  sourceUpdatedAt,
  canForceDelete = false,
}: {
  installation: InstallationDetail;
  sourceQuoteId: string | null;
  sourceQuoteCode: string | null;
  sourceUpdatedAt: string | null;
  canForceDelete?: boolean;
}) {
  const router = useRouter();
  const StaffingIcon = CRM_MODULES.installations.icon;

  // Modal states
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [formModalTitle, setFormModalTitle] = useState("Nuevo puesto operativo");
  const [formModalInitial, setFormModalInitial] = useState<Partial<PuestoFormData> | undefined>();
  const [editingPuestoId, setEditingPuestoId] = useState<string | null>(null);

  // Delete/deactivate states
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string; name: string }>({ open: false, id: "", name: "" });
  const [deleteDiagnostics, setDeleteDiagnostics] = useState<{
    canDelete: boolean;
    activeAssignmentCount: number;
    activeAssignments: Array<{ slotNumber: number; guardiaName: string; startDate: string }>;
    pautaSamples: Array<{
      date: string;
      slotNumber: number;
      shiftCode: string | null;
      plannedGuardiaName: string | null;
    }>;
    asistenciaSamples: Array<{
      date: string;
      slotNumber: number;
      attendanceStatus: string;
      plannedGuardiaName: string | null;
      actualGuardiaName: string | null;
      replacementGuardiaName: string | null;
    }>;
    pautaCount: number;
    asistenciaCount: number;
    activeSeriesCount: number;
    firstPautaDate: string | null;
    lastPautaDate: string | null;
    firstAsistenciaDate: string | null;
    lastAsistenciaDate: string | null;
  } | null>(null);
  const [deleteDiagnosticsLoading, setDeleteDiagnosticsLoading] = useState(false);
  const [deleteDiagnosticsError, setDeleteDiagnosticsError] = useState<string>("");
  const [deactivateConfirm, setDeactivateConfirm] = useState<{ open: boolean; id: string; name: string }>({ open: false, id: "", name: "" });
  const [deactivateDate, setDeactivateDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [actionLoading, setActionLoading] = useState(false);

  const hasPuestos = installation.puestosActivos && installation.puestosActivos.length > 0;

  // Open create modal
  const openCreate = () => {
    setEditingPuestoId(null);
    setFormModalTitle("Nuevo puesto operativo");
    setFormModalInitial(undefined);
    setFormModalOpen(true);
  };

  // Open edit modal
  const openEdit = (puesto: NonNullable<InstallationDetail["puestosActivos"]>[number]) => {
    setEditingPuestoId(puesto.id);
    setFormModalTitle("Editar puesto operativo");
    const ss = (puesto as any).salaryStructure;
    setFormModalInitial({
      puestoTrabajoId: puesto.puestoTrabajoId ?? "",
      cargoId: puesto.cargoId ?? "",
      rolId: puesto.rolId ?? "",
      customName: puesto.name,
      startTime: puesto.shiftStart,
      endTime: puesto.shiftEnd,
      weekdays: puesto.weekdays,
      numGuards: puesto.requiredGuards,
      baseSalary: Number(puesto.baseSalary ?? 0),
      colacion: ss ? Number(ss.colacion ?? 0) : 0,
      movilizacion: ss ? Number(ss.movilizacion ?? 0) : 0,
      gratificationType: ss?.gratificationType ?? "AUTO_25",
      gratificationCustomAmount: ss ? Number(ss.gratificationCustomAmount ?? 0) : 0,
      bonos: ss?.bonos?.map((b: any) => ({
        bonoCatalogId: b.bonoCatalog.id,
        overrideAmount: b.overrideAmount != null ? Number(b.overrideAmount) : undefined,
        overridePercentage: b.overridePercentage != null ? Number(b.overridePercentage) : undefined,
      })) ?? [],
      activeFrom: puesto.activeFrom ? new Date(puesto.activeFrom).toISOString().slice(0, 10) : "",
    });
    setFormModalOpen(true);
  };

  // Duplicate puesto (open create modal pre-filled with same data)
  const openDuplicate = (puesto: NonNullable<InstallationDetail["puestosActivos"]>[number]) => {
    setEditingPuestoId(null); // null = crear nuevo
    setFormModalTitle("Duplicar puesto operativo");
    setFormModalInitial({
      puestoTrabajoId: puesto.puestoTrabajoId ?? "",
      cargoId: puesto.cargoId ?? "",
      rolId: puesto.rolId ?? "",
      customName: `${puesto.name} (copia)`,
      startTime: puesto.shiftStart,
      endTime: puesto.shiftEnd,
      weekdays: puesto.weekdays,
      numGuards: puesto.requiredGuards,
      baseSalary: Number(puesto.baseSalary ?? 0),
    });
    setFormModalOpen(true);
  };

  const openDeleteConfirm = useCallback(async (puestoId: string, puestoName: string) => {
    setDeleteConfirm({ open: true, id: puestoId, name: puestoName });
    setDeleteDiagnostics(null);
    setDeleteDiagnosticsError("");
    setDeleteDiagnosticsLoading(true);
    try {
      const res = await fetch(`/api/ops/puestos/${puestoId}`, { cache: "no-store" });
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        throw new Error(payload.error || "No se pudo auditar el puesto");
      }
      setDeleteDiagnostics(payload.data?.diagnostics ?? null);
    } catch (error) {
      console.error(error);
      setDeleteDiagnosticsError(error instanceof Error ? error.message : "No se pudo auditar el puesto");
    } finally {
      setDeleteDiagnosticsLoading(false);
    }
  }, []);

  // Save (create or edit)
  const handleSave = async (data: PuestoFormData) => {
    const body: Record<string, unknown> = {
      name: data.customName || `Puesto ${data.startTime}-${data.endTime}`,
      puestoTrabajoId: data.puestoTrabajoId || null,
      cargoId: data.cargoId || null,
      rolId: data.rolId || null,
      shiftStart: data.startTime,
      shiftEnd: data.endTime,
      weekdays: data.weekdays,
      requiredGuards: data.numGuards,
      baseSalary: data.baseSalary || null,
      colacion: data.colacion ?? 0,
      movilizacion: data.movilizacion ?? 0,
      gratificationType: data.gratificationType ?? "AUTO_25",
      gratificationCustomAmount: data.gratificationCustomAmount ?? null,
      bonos: (data.bonos ?? []).filter((b) => b.bonoCatalogId),
      activeFrom: data.activeFrom || null,
    };

    if (editingPuestoId) {
      // PATCH
      const res = await fetch(`/api/ops/puestos/${editingPuestoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload.error || "No se pudo actualizar");
      toast.success("Puesto actualizado");
    } else {
      // POST
      const res = await fetch("/api/ops/puestos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, installationId: installation.id }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload.error || "No se pudo crear");
      toast.success("Puesto creado");
    }
    setFormModalOpen(false);
    router.refresh();
  };

  // Delete puesto
  const handleDelete = async () => {
    if (!deleteConfirm.id) return;
    if (deleteDiagnosticsLoading) {
      toast.error("Espera el diagnóstico antes de confirmar la eliminación.");
      return;
    }
    setActionLoading(true);
    try {
      const canForce = deleteDiagnostics?.canDelete === false && canForceDelete;
      const url = canForce ? `/api/ops/puestos/${deleteConfirm.id}?force=true` : `/api/ops/puestos/${deleteConfirm.id}`;
      const res = await fetch(url, { method: "DELETE" });
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        if (payload?.details) {
          setDeleteDiagnostics(payload.details);
        }
        throw new Error(payload.error || "No se pudo eliminar");
      }
      toast.success(canForce ? "Puesto eliminado forzadamente" : "Puesto eliminado");
      setDeleteConfirm({ open: false, id: "", name: "" });
      setDeleteDiagnostics(null);
      setDeleteDiagnosticsError("");
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "No se pudo eliminar el puesto");
    } finally {
      setActionLoading(false);
    }
  };

  const canForceThisDelete = deleteDiagnostics?.canDelete === false && canForceDelete;

  const deleteDescription = useMemo(() => {
    if (deleteDiagnosticsLoading) {
      return "Analizando dependencias del puesto para evitar inconsistencias...";
    }
    if (deleteDiagnosticsError) {
      return (
        <div className="space-y-1">
          <p>No se pudo obtener el diagnóstico completo.</p>
          <p className="text-xs text-amber-300">{deleteDiagnosticsError}</p>
        </div>
      );
    }
    if (!deleteDiagnostics) {
      return `El puesto "${deleteConfirm.name}" será eliminado permanentemente.`;
    }

    const hasHistory =
      deleteDiagnostics.pautaCount > 0 ||
      deleteDiagnostics.asistenciaCount > 0 ||
      deleteDiagnostics.activeSeriesCount > 0;
    const pautaPreview = deleteDiagnostics.pautaSamples
      .slice(0, 3)
      .map((row) => {
        const code = row.shiftCode ?? "—";
        const guardia = row.plannedGuardiaName ? ` (${row.plannedGuardiaName})` : "";
        return `${row.date} · S${row.slotNumber} · ${code}${guardia}`;
      })
      .join(" | ");
    const asistenciaPreview = deleteDiagnostics.asistenciaSamples
      .slice(0, 3)
      .map((row) => {
        const plan = row.plannedGuardiaName ? `plan:${row.plannedGuardiaName}` : "plan:—";
        const real = row.actualGuardiaName ? `real:${row.actualGuardiaName}` : "real:—";
        return `${row.date} · S${row.slotNumber} · ${row.attendanceStatus} (${plan}, ${real})`;
      })
      .join(" | ");

    return (
      <div className="space-y-2">
        <p>
          {deleteDiagnostics.canDelete
            ? `El puesto "${deleteConfirm.name}" puede eliminarse sin bloqueos.`
            : `El puesto "${deleteConfirm.name}" tiene bloqueos y no puede eliminarse de forma estándar.`}
        </p>
        <ul className="list-disc pl-4 text-xs space-y-0.5">
          <li>Asignaciones activas: {deleteDiagnostics.activeAssignmentCount}</li>
          <li>Registros en pauta: {deleteDiagnostics.pautaCount}</li>
          <li>Registros en asistencia: {deleteDiagnostics.asistenciaCount}</li>
          <li>Series activas: {deleteDiagnostics.activeSeriesCount}</li>
        </ul>
        {deleteDiagnostics.activeAssignments.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            Slots activos:{" "}
            {deleteDiagnostics.activeAssignments
              .map((a) => `S${a.slotNumber} (${a.guardiaName})`)
              .slice(0, 4)
              .join(", ")}
            {deleteDiagnostics.activeAssignments.length > 4 ? "..." : ""}
          </p>
        ) : null}
        {hasHistory ? (
          <p className="text-xs text-muted-foreground">
            Historial: pauta {deleteDiagnostics.firstPautaDate ?? "—"} → {deleteDiagnostics.lastPautaDate ?? "—"} · asistencia{" "}
            {deleteDiagnostics.firstAsistenciaDate ?? "—"} → {deleteDiagnostics.lastAsistenciaDate ?? "—"}.
          </p>
        ) : null}
        {deleteDiagnostics.pautaSamples.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            Pauta (muestra): {pautaPreview}
          </p>
        ) : null}
        {deleteDiagnostics.asistenciaSamples.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            Asistencia (muestra): {asistenciaPreview}
          </p>
        ) : null}
        {canForceThisDelete ? (
          <p className="text-xs text-amber-300">
            Como administrador puedes eliminar forzadamente. Esto borrará también historial asociado al puesto.
          </p>
        ) : null}
      </div>
    );
  }, [
    canForceThisDelete,
    deleteConfirm.name,
    deleteDiagnostics,
    deleteDiagnosticsError,
    deleteDiagnosticsLoading,
  ]);

  // Deactivate puesto
  const handleDeactivate = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/ops/puestos/${deactivateConfirm.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: false, activeUntil: deactivateDate }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload.error || "No se pudo desactivar");
      toast.success("Puesto desactivado");
      setDeactivateConfirm({ open: false, id: "", name: "" });
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error("No se pudo desactivar el puesto");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      {sourceQuoteId && sourceQuoteCode ? (
        <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3 text-xs text-emerald-200">
          Dotación sincronizada desde cotización{" "}
          <Link href={`/cpq/${sourceQuoteId}`} className="underline underline-offset-2 hover:text-emerald-100">
            {sourceQuoteCode}
          </Link>
          {sourceUpdatedAt ? (
            <span className="text-emerald-300/80"> · {new Date(sourceUpdatedAt).toLocaleString("es-CL")}</span>
          ) : null}
        </div>
      ) : null}

      {/* Actions bar */}
      <div className="flex items-center justify-between">
        <Button size="sm" variant="secondary" onClick={openCreate} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Agregar puesto
        </Button>
        
      </div>

      {/* Puestos */}
      {hasPuestos ? (
        <>
          {/* Mobile cards */}
          <div className="md:hidden space-y-2 min-w-0">
            {installation.puestosActivos!.map((item) => {
              const cargoName = item.cargo?.name ?? "—";
              const rolName = item.rol?.name ?? "—";
              const salary = Number(item.baseSalary ?? 0);
              const ss = (item as any).salaryStructure;
              const net = ss ? Number(ss.netSalaryEstimate ?? 0) : 0;
              const startH = parseInt(item.shiftStart.split(":")[0], 10);
              const isNight = startH >= 18 || startH < 6;
              return (
                <div key={item.id} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm truncate">{item.name}</p>
                        <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold shrink-0 ${
                          isNight
                            ? "bg-indigo-500/15 text-indigo-300 border border-indigo-500/30"
                            : "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                        }`}>
                          {isNight ? "Noche" : "Día"}
                        </span>
                      </div>
                      {item.puestoTrabajo && (
                        <p className="text-[10px] text-muted-foreground">{item.puestoTrabajo.name}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">{cargoName} / {rolName}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openDuplicate(item)} title="Duplicar">
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(item)} title="Editar">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => void openDeleteConfirm(item.id, item.name)}
                        title="Eliminar"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{item.shiftStart} - {item.shiftEnd}</span>
                    <span>Dotación: {item.requiredGuards}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-xs">
                      <span className="text-muted-foreground">Base: </span>
                      <span className="font-medium">{salary > 0 ? `$${salary.toLocaleString("es-CL")}` : "—"}</span>
                    </div>
                    <div className="text-xs">
                      <span className="text-muted-foreground">Líquido: </span>
                      {net > 0
                        ? <span className="text-emerald-400 font-medium">${net.toLocaleString("es-CL")}</span>
                        : <span className="text-muted-foreground">—</span>}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[10px] px-2 w-full"
                    onClick={() => setDeactivateConfirm({ open: true, id: item.id, name: item.name })}
                  >
                    Desactivar
                  </Button>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Puesto</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Cargo / Rol</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Horario</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Dotación</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Sueldo base</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Líquido est.</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground w-[160px]">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {installation.puestosActivos!.map((item) => {
                  const cargoName = item.cargo?.name ?? "—";
                  const rolName = item.rol?.name ?? "—";
                  const salary = Number(item.baseSalary ?? 0);
                  return (
                    <tr key={item.id} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-2">
                        <div className="font-medium">{item.name}</div>
                        {item.puestoTrabajo && (
                          <div className="text-[10px] text-muted-foreground">{item.puestoTrabajo.name}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{cargoName} / {rolName}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <span>{item.shiftStart} - {item.shiftEnd}</span>
                          {(() => {
                            const startH = parseInt(item.shiftStart.split(":")[0], 10);
                            const isNight = startH >= 18 || startH < 6;
                            return (
                              <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                                isNight
                                  ? "bg-indigo-500/15 text-indigo-300 border border-indigo-500/30"
                                  : "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                              }`}>
                                {isNight ? "Noche" : "Día"}
                              </span>
                            );
                          })()}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">{item.requiredGuards}</td>
                      <td className="px-3 py-2 text-right">{salary > 0 ? `$${salary.toLocaleString("es-CL")}` : "—"}</td>
                      <td className="px-3 py-2 text-right">
                        {(() => {
                          const ss = (item as any).salaryStructure;
                          const net = ss ? Number(ss.netSalaryEstimate ?? 0) : 0;
                          if (net > 0) return <span className="text-emerald-400 font-medium">${net.toLocaleString("es-CL")}</span>;
                          return <span className="text-muted-foreground">—</span>;
                        })()}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openDuplicate(item)} title="Duplicar">
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(item)} title="Editar">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[10px] px-2"
                            onClick={() => setDeactivateConfirm({ open: true, id: item.id, name: item.name })}
                            title="Desactivar"
                          >
                            Desactivar
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => void openDeleteConfirm(item.id, item.name)}
                            title="Eliminar"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <EmptyState icon={<StaffingIcon className="h-8 w-8" />} title="Sin dotación activa" description="Aún no hay puestos activos. Usa el botón para agregar uno." compact />
      )}

      {/* Historial de puestos inactivos */}
      {installation.puestosHistorial && installation.puestosHistorial.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Historial de puestos</p>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2 min-w-0">
            {installation.puestosHistorial.map((item) => {
              const from = item.activeFrom ? (() => { const d = new Date(item.activeFrom); return `${String(d.getUTCDate()).padStart(2,"0")}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${d.getUTCFullYear()}`; })() : "—";
              const until = item.activeUntil ? (() => { const d = new Date(item.activeUntil); return `${String(d.getUTCDate()).padStart(2,"0")}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${d.getUTCFullYear()}`; })() : "—";
              return (
                <div key={item.id} className="rounded-lg border border-border/50 p-3 space-y-1">
                  <p className="font-medium text-sm text-muted-foreground">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.cargo?.name ?? "—"} / {item.rol?.name ?? "—"}</p>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{item.shiftStart} - {item.shiftEnd}</span>
                    <span>{from} → {until}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto rounded-lg border border-border/50">
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Puesto</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Cargo / Rol</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Horario</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Período</th>
                </tr>
              </thead>
              <tbody>
                {installation.puestosHistorial.map((item) => {
                  const from = item.activeFrom ? (() => { const d = new Date(item.activeFrom); return `${String(d.getUTCDate()).padStart(2,"0")}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${d.getUTCFullYear()}`; })() : "—";
                  const until = item.activeUntil ? (() => { const d = new Date(item.activeUntil); return `${String(d.getUTCDate()).padStart(2,"0")}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${d.getUTCFullYear()}`; })() : "—";
                  return (
                    <tr key={item.id} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-2 text-muted-foreground">{item.name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{item.cargo?.name ?? "—"} / {item.rol?.name ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{item.shiftStart} - {item.shiftEnd}</td>
                      <td className="px-3 py-2 text-muted-foreground">{from} → {until}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {installation.quotesInstalacion && installation.quotesInstalacion.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Cotizaciones asociadas</p>
          <div className="space-y-2">
            {installation.quotesInstalacion.map((quote) => (
              <CrmRelatedRecordCard key={quote.id} module="quotes" title={quote.code} subtitle={`${quote.totalPositions} puestos · ${quote.totalGuards} guardias`} badge={{ label: quote.status, variant: "secondary" }} meta={new Date(quote.updatedAt).toLocaleDateString("es-CL")} href={`/cpq/${quote.id}`} />
            ))}
          </div>
        </div>
      ) : null}

      {/* Shared puesto form modal */}
      <PuestoFormModal
        open={formModalOpen}
        onOpenChange={setFormModalOpen}
        title={formModalTitle}
        initialData={formModalInitial}
        onSave={handleSave}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => {
          setDeleteConfirm((prev) => ({ ...prev, open }));
          if (!open) {
            setDeleteDiagnostics(null);
            setDeleteDiagnosticsError("");
            setDeleteDiagnosticsLoading(false);
          }
        }}
        title="Eliminar puesto"
        description={deleteDescription}
        confirmLabel={canForceThisDelete ? "Eliminar forzadamente" : "Eliminar"}
        variant="destructive"
        loading={actionLoading}
        loadingLabel="Eliminando..."
        onConfirm={handleDelete}
      />

      {/* Deactivate with date */}
      <Dialog open={deactivateConfirm.open} onOpenChange={(open) => {
        if (open) setDeactivateDate(new Date().toISOString().slice(0, 10));
        setDeactivateConfirm((prev) => ({ ...prev, open }));
      }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Desactivar puesto</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              El puesto &quot;{deactivateConfirm.name}&quot; se desactivará. Se cerrarán las asignaciones de guardias y se limpiará la pauta desde la fecha indicada.
            </p>
            <div className="space-y-1.5">
              <Label>Fecha de desactivación</Label>
              <input
                type="date"
                value={deactivateDate}
                onChange={(e) => setDeactivateDate(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeactivateConfirm((prev) => ({ ...prev, open: false }))} disabled={actionLoading}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDeactivate} disabled={actionLoading}>
              {actionLoading ? "Desactivando..." : "Desactivar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Main Component ── */

export function CrmInstallationDetailClient({
  installation,
  canEditDotacion = false,
  canForceDeletePuesto = false,
  hasInventarioAccess = false,
  currentUserId = "",
}: {
  installation: InstallationDetail;
  canEditDotacion?: boolean;
  canForceDeletePuesto?: boolean;
  hasInventarioAccess?: boolean;
  currentUserId?: string;
}) {
  const router = useRouter();
  const hasCoords = installation.lat != null && installation.lng != null;
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [statusConfirmOpen, setStatusConfirmOpen] = useState(false);
  const [statusNextValue, setStatusNextValue] = useState(false);
  const [statusActivateAccount, setStatusActivateAccount] = useState(false);
  const isActive = useMemo(() => installation.isActive === true, [installation.isActive]);

  const dotacionDesdeCotizacion = (
    installation.metadata &&
    typeof installation.metadata === "object" &&
    "dotacionActiva" in installation.metadata &&
    (installation.metadata.dotacionActiva as Record<string, unknown>) &&
    typeof installation.metadata.dotacionActiva === "object"
      ? (installation.metadata.dotacionActiva as Record<string, unknown>)
      : null
  );

  const dotacionItems = Array.isArray(dotacionDesdeCotizacion?.items)
    ? (dotacionDesdeCotizacion?.items as Array<Record<string, unknown>>)
    : [];

  const sourceQuoteId =
    typeof dotacionDesdeCotizacion?.sourceQuoteId === "string"
      ? dotacionDesdeCotizacion.sourceQuoteId
      : null;
  const sourceQuoteCode =
    typeof dotacionDesdeCotizacion?.sourceQuoteCode === "string"
      ? dotacionDesdeCotizacion.sourceQuoteCode
      : null;
  const sourceUpdatedAt =
    typeof dotacionDesdeCotizacion?.updatedAt === "string"
      ? dotacionDesdeCotizacion.updatedAt
      : null;

  const deleteInstallation = async () => {
    try {
      const res = await fetch(`/api/crm/installations/${installation.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Instalación eliminada");
      router.push("/crm/installations");
    } catch {
      toast.error("No se pudo eliminar");
    }
  };

  const openToggleInstallationStatus = () => {
    const next = !isActive;
    setStatusNextValue(next);
    const accountNeedsActivation =
      installation.account &&
      (installation.account.isActive === false || installation.account.type === "prospect");
    setStatusActivateAccount(next && !!accountNeedsActivation);
    setStatusConfirmOpen(true);
  };

  const toggleInstallationStatus = async () => {
    setStatusUpdating(true);
    try {
      const res = await fetch(`/api/crm/installations/${installation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isActive: statusNextValue,
          activateAccount: Boolean(statusActivateAccount),
        }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload.error || "No se pudo actualizar estado");

      setStatusConfirmOpen(false);
      toast.success(statusNextValue ? "Instalación activada" : "Instalación desactivada");
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error("No se pudo cambiar el estado de la instalación");
    } finally {
      setStatusUpdating(false);
    }
  };

  // ── Nocturno toggle ──
  const [nocturnoEnabled, setNocturnoEnabled] = useState(installation.nocturnoEnabled !== false);
  const [nocturnoConfirmOpen, setNocturnoConfirmOpen] = useState(false);
  const [nocturnoNextValue, setNocturnoNextValue] = useState(false);
  const [nocturnoSaving, setNocturnoSaving] = useState(false);

  const openNocturnoToggle = (nextVal: boolean) => {
    setNocturnoNextValue(nextVal);
    setNocturnoConfirmOpen(true);
  };

  const confirmNocturnoToggle = async () => {
    setNocturnoSaving(true);
    try {
      const res = await fetch(`/api/crm/installations/${installation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nocturnoEnabled: nocturnoNextValue }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload.error || "No se pudo actualizar");
      setNocturnoEnabled(nocturnoNextValue);
      setNocturnoConfirmOpen(false);
      toast.success(
        nocturnoNextValue
          ? "Instalación incluida en control nocturno"
          : "Instalación excluida del control nocturno"
      );
      router.refresh();
    } catch (error: any) {
      toast.error(error?.message || "Error al actualizar control nocturno");
    } finally {
      setNocturnoSaving(false);
    }
  };

  // ── Edit state ──
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    name: installation.name,
    address: installation.address || "",
    city: installation.city || "",
    commune: installation.commune || "",
    lat: installation.lat ?? null as number | null,
    lng: installation.lng ?? null as number | null,
    teMontoClp: Number(installation.teMontoClp) || 0,
    notes: installation.notes || "",
    startDate: installation.startDate ? new Date(installation.startDate).toISOString().slice(0, 10) : "",
    endDate: installation.endDate ? new Date(installation.endDate).toISOString().slice(0, 10) : "",
  });
  const [saving, setSaving] = useState(false);

  const openEdit = () => {
    setEditForm({
      name: installation.name,
      address: installation.address || "",
      city: installation.city || "",
      commune: installation.commune || "",
      lat: installation.lat ?? null,
      lng: installation.lng ?? null,
      teMontoClp: Number(installation.teMontoClp) || 0,
      notes: installation.notes || "",
      startDate: installation.startDate ? new Date(installation.startDate).toISOString().slice(0, 10) : "",
      endDate: installation.endDate ? new Date(installation.endDate).toISOString().slice(0, 10) : "",
    });
    setEditOpen(true);
  };

  const handleAddressChange = (result: AddressResult) => {
    setEditForm((prev) => ({
      ...prev,
      address: result.address,
      city: result.city || prev.city,
      commune: result.commune || prev.commune,
      lat: result.lat,
      lng: result.lng,
    }));
  };

  const saveEdit = async () => {
    if (!editForm.name.trim()) {
      toast.error("El nombre es obligatorio.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/crm/installations/${installation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload?.error || "No se pudo guardar");
      toast.success("Instalación actualizada");
      setEditOpen(false);
      router.refresh();
    } catch (error: any) {
      toast.error(error?.message || "No se pudo guardar la instalación.");
    } finally {
      setSaving(false);
    }
  };

  // ── New contact state ──
  const [newContactOpen, setNewContactOpen] = useState(false);
  const [newContactForm, setNewContactForm] = useState({ firstName: "", lastName: "", email: "", phone: "", roleTitle: "" });
  const [savingContact, setSavingContact] = useState(false);

  const saveNewContact = async () => {
    if (!newContactForm.firstName.trim()) { toast.error("El nombre es obligatorio."); return; }
    if (!installation.account?.id) { toast.error("Se requiere una cuenta asociada."); return; }
    setSavingContact(true);
    try {
      const res = await fetch("/api/crm/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newContactForm, accountId: installation.account.id }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload?.error || "No se pudo crear");
      toast.success("Contacto creado");
      setNewContactOpen(false);
      setNewContactForm({ firstName: "", lastName: "", email: "", phone: "", roleTitle: "" });
      router.refresh();
    } catch (error: any) {
      toast.error(error?.message || "No se pudo crear el contacto.");
    } finally {
      setSavingContact(false);
    }
  };

  // ── Helpers ──
  const AccountIcon = CRM_MODULES.accounts.icon;
  const ContactsIcon = CRM_MODULES.contacts.icon;
  const StaffingIcon = CRM_MODULES.installations.icon;
  const DealsIcon = CRM_MODULES.deals.icon;
  const QuotesIcon = CRM_MODULES.quotes.icon;

  const subtitle = [
    installation.account?.name,
    [installation.commune, installation.city].filter(Boolean).join(", "),
  ].filter(Boolean).join(" · ") || "Sin ubicación";

  // ── Tabs ──
  const { activeTab, setActiveTab } = useEntityTabs("general");

  const tabs: EntityTab[] = [
    { id: "general", label: "General", icon: Info },
    { id: "account", label: "Cuenta", icon: AccountIcon },
    { id: "contacts", label: "Contactos", icon: UserCircle, count: installation.contactsOfAccount?.length ?? 0 },
    { id: "deals", label: "Negocios", icon: Briefcase, count: installation.dealsOfAccount?.length ?? 0 },
    { id: "quotes", label: "Cotizaciones", icon: FileText, count: installation.quotesInstalacion?.length ?? 0 },
    { id: "staffing", label: "Puestos", icon: Users },
    { id: "refuerzos", label: "Refuerzos", icon: Shield, count: installation.refuerzos?.length ?? 0 },
    { id: "dotacion", label: "Dotación", icon: ClipboardList },
    { id: "marcacion", label: "Marcación", icon: QrCode },
    { id: "rendiciones", label: "Rendiciones", icon: Receipt },
    ...(hasInventarioAccess ? [{ id: "uniformes" as const, label: "Uniformes", icon: Package }] : []),
    { id: "notes", label: "Notas", icon: MessageSquareText },
    { id: "files", label: "Archivos", icon: FileText },
  ];

  const headerActions: EntityHeaderAction[] = [
    { label: "Editar instalación", icon: Pencil, onClick: openEdit, primary: true },
    { label: "Eliminar instalación", icon: Trash2, onClick: () => setDeleteConfirm(true), variant: "destructive" },
  ];

  const generalContent = (
        <div className="flex flex-col lg:flex-row lg:gap-6">
          <DetailFieldGrid columns={3} className="flex-1">
            <DetailField
              label="Dirección"
              value={installation.address}
              icon={installation.address ? <MapPin className="h-3 w-3" /> : undefined}
            />
            <DetailField
              label="Comuna / Ciudad"
              value={
                (installation.commune || installation.city)
                  ? [installation.commune, installation.city].filter(Boolean).join(", ")
                  : undefined
              }
            />
            <DetailField
              label="Valor turno extra"
              value={
                installation.teMontoClp != null && Number(installation.teMontoClp) > 0
                  ? `$ ${Number(installation.teMontoClp).toLocaleString("es-CL")}`
                  : "No definido"
              }
            />
            <DetailField
              label="Fecha inicio"
              value={installation.startDate ? new Intl.DateTimeFormat("es-CL").format(new Date(installation.startDate)) : undefined}
            />
            <DetailField
              label="Fecha término"
              value={installation.endDate ? new Intl.DateTimeFormat("es-CL").format(new Date(installation.endDate)) : undefined}
            />
            {installation.notes && (
              <DetailField
                label="Notas"
                value={installation.notes}
                fullWidth
              />
            )}
            {/* Control Nocturno toggle */}
            <div className="col-span-full">
              <button
                type="button"
                onClick={() => openNocturnoToggle(!nocturnoEnabled)}
                disabled={nocturnoSaving}
                className={`flex items-center gap-2.5 w-full rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                  nocturnoEnabled
                    ? "border-indigo-500/30 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/15"
                    : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/50"
                }`}
              >
                <Moon className={`h-4 w-4 shrink-0 ${nocturnoEnabled ? "text-indigo-400" : "text-muted-foreground"}`} />
                <div className="flex-1 text-left">
                  <span className="font-medium">Control nocturno</span>
                  <span className="ml-2 text-xs opacity-70">
                    {nocturnoEnabled ? "Incluida en reportes nocturnos" : "Excluida de reportes nocturnos"}
                  </span>
                </div>
                <div className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                  nocturnoEnabled ? "bg-indigo-500" : "bg-muted-foreground/30"
                }`}>
                  <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                    nocturnoEnabled ? "translate-x-4" : "translate-x-0"
                  }`} />
                </div>
              </button>
            </div>
          </DetailFieldGrid>

          {/* Mapa */}
          {hasCoords && MAPS_KEY ? (
            <a
              href={`https://www.google.com/maps/@${installation.lat},${installation.lng},17z`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 lg:mt-0 shrink-0 block rounded-lg overflow-hidden border border-border hover:opacity-95 transition-opacity lg:w-[220px] lg:h-[160px]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://maps.googleapis.com/maps/api/staticmap?center=${installation.lat},${installation.lng}&zoom=16&size=440x320&scale=2&markers=color:red%7C${installation.lat},${installation.lng}&key=${MAPS_KEY}`}
                alt={`Mapa de ${installation.name}`}
                className="w-full h-[140px] lg:h-[130px] object-cover"
              />
              <div className="flex items-center justify-center gap-1 py-1.5 text-xs text-muted-foreground hover:text-foreground">
                <ExternalLink className="h-3 w-3" />
                Google Maps
              </div>
            </a>
          ) : (
            <div className="mt-4 lg:mt-0 shrink-0 lg:w-[220px] flex items-center justify-center rounded-lg border border-dashed border-border p-4">
              <p className="text-xs text-muted-foreground text-center">
                {hasCoords && !MAPS_KEY ? "Configura GOOGLE_MAPS_API_KEY" : "Sin ubicación"}
              </p>
            </div>
          )}
        </div>
  );

  const accountContent = installation.account ? (
        <CrmRelatedRecordCard
          module="accounts"
          title={installation.account.name}
          badge={
            installation.account.type === "client"
              ? { label: "Cliente", variant: "success" }
              : { label: "Prospecto", variant: "warning" }
          }
          href={`/crm/accounts/${installation.account.id}`}
        />
      ) : (
        <EmptyState icon={<AccountIcon className="h-8 w-8" />} title="Sin cuenta" description="Esta instalación no está vinculada a una cuenta." compact />
  );

  const contactsAction = installation.account?.id ? (
    <CrmSectionCreateButton onClick={() => setNewContactOpen(true)} />
  ) : undefined;

  const contactsContent = !installation.account ? (
        <EmptyState icon={<ContactsIcon className="h-8 w-8" />} title="Sin cuenta" description="Asocia una cuenta a esta instalación para ver los contactos vinculados." compact />
      ) : !installation.contactsOfAccount?.length ? (
        <EmptyState
          icon={<ContactsIcon className="h-8 w-8" />}
          title="Sin contactos"
          description="No hay contactos asociados a la cuenta de esta instalación."
          compact
          action={
            <Button variant="outline" size="sm" asChild>
              <Link href="/crm/contacts">Ver contactos</Link>
            </Button>
          }
        />
      ) : (
        <CrmRelatedRecordGrid>
          {installation.contactsOfAccount.map((c) => (
            <CrmRelatedRecordCard
              key={c.id}
              module="contacts"
              title={`${c.firstName} ${c.lastName}`.trim()}
              subtitle={c.roleTitle || "Sin cargo"}
              meta={[c.email, c.phone].filter(Boolean).join(" · ") || undefined}
              badge={c.isPrimary ? { label: "Principal", variant: "default" } : undefined}
              href={`/crm/contacts/${c.id}`}
            />
          ))}
        </CrmRelatedRecordGrid>
  );

  const dealsAction = installation.account?.id ? (
    <CreateDealModal
      accountId={installation.account.id}
      accountName={installation.account.name}
    />
  ) : undefined;

  const dealsContent = !installation.account ? (
        <EmptyState icon={<DealsIcon className="h-8 w-8" />} title="Sin cuenta" description="Asocia una cuenta a esta instalación para ver los negocios vinculados." compact />
      ) : !installation.dealsOfAccount?.length ? (
        <EmptyState
          icon={<DealsIcon className="h-8 w-8" />}
          title="Sin negocios"
          description="No hay negocios asociados a la cuenta de esta instalación."
          compact
          action={
            <Button variant="outline" size="sm" asChild>
              <Link href="/crm/deals">Ver negocios</Link>
            </Button>
          }
        />
      ) : (
        <CrmRelatedRecordGrid>
          {installation.dealsOfAccount.map((deal) => (
            <CrmRelatedRecordCard
              key={deal.id}
              module="deals"
              title={deal.title}
              subtitle={deal.stage?.name || "Sin etapa"}
              meta={deal.amount ? `$${Number(deal.amount).toLocaleString("es-CL")}` : undefined}
              badge={
                deal.status === "won"
                  ? { label: "Ganado", variant: "success" }
                  : deal.status === "lost"
                    ? { label: "Perdido", variant: "destructive" }
                    : undefined
              }
              href={`/crm/deals/${deal.id}`}
            />
          ))}
        </CrmRelatedRecordGrid>
  );

  const quotesAction = installation.account?.id ? (
    <CreateQuoteModal
      defaultClientName={installation.account.name}
      accountId={installation.account.id}
      installationId={installation.id}
    />
  ) : undefined;

  const quotesContent = !installation.quotesInstalacion?.length ? (
        <EmptyState
          icon={<QuotesIcon className="h-8 w-8" />}
          title="Sin cotizaciones"
          description="No hay cotizaciones asociadas a esta instalación."
          compact
          action={
            <Button variant="outline" size="sm" asChild>
              <Link href="/crm/cotizaciones">Ver cotizaciones</Link>
            </Button>
          }
        />
      ) : (
        <CrmRelatedRecordGrid>
          {installation.quotesInstalacion.map((q) => (
            <CrmRelatedRecordCard
              key={q.id}
              module="quotes"
              title={q.code}
              subtitle={`${q.totalPositions} puestos · ${q.totalGuards} guardias`}
              meta={q.updatedAt ? new Intl.DateTimeFormat("es-CL", { dateStyle: "short" }).format(new Date(q.updatedAt)) : undefined}
              badge={{ label: q.status, variant: "secondary" }}
              href={`/crm/cotizaciones/${q.id}`}
            />
          ))}
        </CrmRelatedRecordGrid>
  );

  return (
    <>
      <EntityDetailLayout
        breadcrumb={["CRM", "Instalaciones", installation.name]}
        breadcrumbHrefs={["/crm", "/crm/installations"]}
        header={{
          avatar: { initials: installation.name.charAt(0).toUpperCase() },
          title: installation.name,
          subtitle,
          status: isActive ? { label: "Activa", variant: "success" } : { label: "Inactiva", variant: "warning" },
          actions: headerActions,
          extra: (
            <Button
              size="sm"
              variant={isActive ? "outline" : "secondary"}
              onClick={openToggleInstallationStatus}
              disabled={statusUpdating}
            >
              {statusUpdating ? "Guardando..." : isActive ? "Desactivar" : "Activar"}
            </Button>
          ),
        }}
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      >
        {activeTab === "general" && generalContent}
        {activeTab === "account" && accountContent}
        {activeTab === "contacts" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Contactos</h3>
              {contactsAction}
            </div>
            {contactsContent}
          </div>
        )}
        {activeTab === "deals" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Negocios</h3>
              {dealsAction}
            </div>
            {dealsContent}
          </div>
        )}
        {activeTab === "quotes" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Cotizaciones</h3>
              {quotesAction}
            </div>
            {quotesContent}
          </div>
        )}
        {activeTab === "staffing" && (
          <StaffingSection
            installation={installation}
            sourceQuoteId={sourceQuoteId}
            sourceQuoteCode={sourceQuoteCode}
            sourceUpdatedAt={sourceUpdatedAt}
            canForceDelete={canForceDeletePuesto}
          />
        )}
        {activeTab === "refuerzos" && (
          <OpsRefuerzosClient
            initialItems={(installation.refuerzos ?? []) as any}
            defaultInstallationId={installation.id}
          />
        )}
        {activeTab === "dotacion" && (
          <DotacionSection installation={installation} canEdit={canEditDotacion} />
        )}
        {activeTab === "marcacion" && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-medium mb-3">Marcación asistencia</h3>
              <MarcacionAsistenciaSection installation={installation} />
            </div>
            <div>
              <h3 className="text-sm font-medium mb-3">Marcación rondas</h3>
              <MarcacionRondasSection installation={installation} />
            </div>
          </div>
        )}
        {activeTab === "rendiciones" && (
          <InstallationExpensesSection installationId={installation.id} />
        )}
        {activeTab === "uniformes" && hasInventarioAccess && (
          <InventarioInstallationSection installationId={installation.id} />
        )}
        {activeTab === "notes" && (
          <NotesSection entityType="installation" entityId={installation.id} currentUserId={currentUserId} />
        )}
        {activeTab === "files" && (
          <FileAttachments entityType="installation" entityId={installation.id} title="Archivos" />
        )}
      </EntityDetailLayout>

      {/* ── Edit Dialog ── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar instalación</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Ej: Planta Norte, Bodega Central..."
                className="bg-background text-foreground border-input"
                disabled={saving}
              />
            </div>
            <div className="space-y-2">
              <Label>Dirección</Label>
              <AddressAutocomplete
                value={editForm.address}
                onChange={handleAddressChange}
                placeholder="Buscar dirección en Google Maps..."
                showMap={true}
              />
              <MapsUrlPasteInput onResolve={handleAddressChange} disabled={saving} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">Ciudad</Label>
                <Input
                  value={editForm.city}
                  onChange={(e) => setEditForm((p) => ({ ...p, city: e.target.value }))}
                  placeholder="Santiago"
                  className="bg-background text-foreground border-input text-sm"
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Comuna</Label>
                <Input
                  value={editForm.commune}
                  onChange={(e) => setEditForm((p) => ({ ...p, commune: e.target.value }))}
                  placeholder="Providencia"
                  className="bg-background text-foreground border-input text-sm"
                  disabled={saving}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Valor turno extra (CLP)</Label>
              <Input
                type="text"
                inputMode="numeric"
                value={editForm.teMontoClp ? editForm.teMontoClp.toLocaleString("es-CL") : ""}
                onChange={(e) => {
                  const raw = e.target.value.replace(/\D/g, "");
                  setEditForm((p) => ({ ...p, teMontoClp: raw ? parseInt(raw, 10) : 0 }));
                }}
                placeholder="Ej: 25.000"
                className="bg-background text-foreground border-input"
                disabled={saving}
              />
              <p className="text-[10px] text-muted-foreground">
                Este valor se usa para calcular el monto de los turnos extra generados en esta instalación.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Notas</Label>
              <Input
                value={editForm.notes}
                onChange={(e) => setEditForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Observaciones..."
                className="bg-background text-foreground border-input"
                disabled={saving}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">Fecha inicio</Label>
                <Input
                  type="date"
                  value={editForm.startDate}
                  onChange={(e) => setEditForm((p) => ({ ...p, startDate: e.target.value }))}
                  className="bg-background text-foreground border-input text-sm"
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Fecha término</Label>
                <Input
                  type="date"
                  value={editForm.endDate}
                  onChange={(e) => setEditForm((p) => ({ ...p, endDate: e.target.value }))}
                  className="bg-background text-foreground border-input text-sm"
                  disabled={saving}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={saveEdit} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteConfirm}
        onOpenChange={setDeleteConfirm}
        title="Eliminar instalación"
        description="La instalación será eliminada permanentemente. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        onConfirm={deleteInstallation}
      />
      <ConfirmDialog
        open={statusConfirmOpen}
        onOpenChange={setStatusConfirmOpen}
        title={statusNextValue ? "Activar instalación" : "Desactivar instalación"}
        description={
          statusNextValue
            ? statusActivateAccount
              ? "La instalación quedará activa y también se activará la cuenta asociada para mantener consistencia."
              : "La instalación quedará activa."
            : "La instalación quedará inactiva."
        }
        confirmLabel={statusNextValue ? "Activar" : "Desactivar"}
        variant="default"
        loading={statusUpdating}
        loadingLabel="Guardando..."
        onConfirm={toggleInstallationStatus}
      />
      <ConfirmDialog
        open={nocturnoConfirmOpen}
        onOpenChange={setNocturnoConfirmOpen}
        title={nocturnoNextValue ? "Incluir en control nocturno" : "Excluir del control nocturno"}
        description={
          nocturnoNextValue
            ? "Esta instalación aparecerá en los reportes de control nocturno y se le asignarán rondas."
            : "Esta instalación dejará de aparecer en los nuevos reportes de control nocturno. Los reportes existentes no se verán afectados."
        }
        confirmLabel={nocturnoNextValue ? "Incluir" : "Excluir"}
        variant="default"
        loading={nocturnoSaving}
        loadingLabel="Guardando..."
        onConfirm={confirmNocturnoToggle}
      />

      {/* New Contact modal */}
      <Dialog open={newContactOpen} onOpenChange={setNewContactOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo contacto</DialogTitle>
            <DialogDescription>
              Crear contacto vinculado a {installation.account?.name || "esta cuenta"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Nombre *</Label>
              <Input value={newContactForm.firstName} onChange={(e) => setNewContactForm((p) => ({ ...p, firstName: e.target.value }))} placeholder="Nombre" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Apellido</Label>
              <Input value={newContactForm.lastName} onChange={(e) => setNewContactForm((p) => ({ ...p, lastName: e.target.value }))} placeholder="Apellido" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <Input type="email" value={newContactForm.email} onChange={(e) => setNewContactForm((p) => ({ ...p, email: e.target.value }))} placeholder="email@ejemplo.com" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Teléfono</Label>
              <Input value={newContactForm.phone} onChange={(e) => setNewContactForm((p) => ({ ...p, phone: e.target.value }))} placeholder="+56 9 1234 5678" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cargo</Label>
              <Input value={newContactForm.roleTitle} onChange={(e) => setNewContactForm((p) => ({ ...p, roleTitle: e.target.value }))} placeholder="Cargo o rol" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setNewContactOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={saveNewContact} disabled={savingContact || !newContactForm.firstName.trim()}>
              {savingContact && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              Crear contacto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
