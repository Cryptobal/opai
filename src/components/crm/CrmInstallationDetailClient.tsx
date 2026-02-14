/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, ExternalLink, Trash2, Pencil, Loader2, LayoutGrid, Plus, QrCode, Copy, RefreshCw } from "lucide-react";
import { PuestoFormModal, type PuestoFormData } from "@/components/shared/PuestoFormModal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AddressAutocomplete, type AddressResult } from "@/components/ui/AddressAutocomplete";
import { EmptyState } from "@/components/opai/EmptyState";
import { CrmDetailLayout, type DetailSection } from "./CrmDetailLayout";
import { DetailField, DetailFieldGrid } from "./DetailField";
import { CrmRelatedRecordCard } from "./CrmRelatedRecordCard";
import { CRM_MODULES } from "./CrmModuleIcons";
import { NotesSection } from "./NotesSection";
import { FileAttachments } from "./FileAttachments";
import { InstallationExpensesSection } from "@/components/finance/InstallationExpensesSection";
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
  account?: { id: string; name: string; type?: "prospect" | "client"; status?: string; isActive?: boolean } | null;
};

/* ── Lifecycle colors (shared) ── */

const LIFECYCLE_COLORS: Record<string, string> = {
  postulante: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  seleccionado: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  contratado_activo: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  inactivo: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  desvinculado: "bg-red-500/15 text-red-300 border-red-500/30",
};

const LIFECYCLE_LABELS: Record<string, string> = {
  postulante: "Postulante",
  seleccionado: "Seleccionado",
  contratado_activo: "Contratado",
  inactivo: "Inactivo",
  desvinculado: "Desvinculado",
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

/* ── Dotación Section (guardias asignados, read-only from OPS) ── */

function DotacionSection({ installation }: { installation: InstallationDetail }) {
  const asignaciones = installation.asignacionGuardias ?? [];
  const puestos = installation.puestosActivos ?? [];
  const guardiasDirectos = installation.guardiasActuales ?? [];

  // IDs de guardias ya mostrados vía asignaciones (para evitar duplicados)
  const assignedGuardiaIds = new Set(asignaciones.map((a) => a.guardia.id));
  // Guardias directos que NO aparecen ya en asignaciones
  const guardiasExtraDirectos = guardiasDirectos.filter((g) => !assignedGuardiaIds.has(g.id));

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

  // Group assignments by puestoId
  const assignmentsByPuesto = new Map<string, typeof asignaciones>();
  for (const a of asignaciones) {
    const list = assignmentsByPuesto.get(a.puestoId) ?? [];
    list.push(a);
    assignmentsByPuesto.set(a.puestoId, list);
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Link
          href="/ops/puestos"
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          Gestionar en OPS
        </Link>
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
                      <span className="text-muted-foreground font-mono text-[10px] w-10">
                        Slot {slotNum}
                      </span>
                      {assignment ? (
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {assignment.guardia.persona.firstName} {assignment.guardia.persona.lastName}
                          </span>
                          {assignment.guardia.code && (
                            <span className="text-muted-foreground">({assignment.guardia.code})</span>
                          )}
                          <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium border ${
                            LIFECYCLE_COLORS[assignment.guardia.lifecycleStatus] ?? LIFECYCLE_COLORS.postulante
                          }`}>
                            {LIFECYCLE_LABELS[assignment.guardia.lifecycleStatus] ?? assignment.guardia.lifecycleStatus}
                          </span>
                          {assignment.guardia.persona.rut && (
                            <span className="text-[10px] text-muted-foreground">{assignment.guardia.persona.rut}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-amber-400 italic text-[11px]">Vacante</span>
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
            Guardias asignados ({guardiasExtraDirectos.length})
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

      <p className="text-[10px] text-muted-foreground/60 border-t border-border pt-3">
        La asignación de guardias se gestiona desde OPS (Puestos operativos). Esta vista es de solo lectura.
      </p>
    </div>
  );
}

/* ── Staffing Section (defined before main component) ── */

function StaffingSection({
  installation,
  sourceQuoteId,
  sourceQuoteCode,
  sourceUpdatedAt,
}: {
  installation: InstallationDetail;
  sourceQuoteId: string | null;
  sourceQuoteCode: string | null;
  sourceUpdatedAt: string | null;
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

  // Save (create or edit)
  const handleSave = async (data: PuestoFormData) => {
    const body = {
      name: data.customName || `Puesto ${data.startTime}-${data.endTime}`,
      puestoTrabajoId: data.puestoTrabajoId || null,
      cargoId: data.cargoId || null,
      rolId: data.rolId || null,
      shiftStart: data.startTime,
      shiftEnd: data.endTime,
      weekdays: data.weekdays,
      requiredGuards: data.numGuards,
      baseSalary: data.baseSalary || null,
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
    setActionLoading(true);
    try {
      const res = await fetch(`/api/ops/puestos/${deleteConfirm.id}`, { method: "DELETE" });
      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload.error || "No se pudo eliminar");
      toast.success("Puesto eliminado");
      setDeleteConfirm({ open: false, id: "", name: "" });
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error("No se pudo eliminar el puesto");
    } finally {
      setActionLoading(false);
    }
  };

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
        {hasPuestos && (
          <Link
            href="/ops/puestos"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Ver en OPS
          </Link>
        )}
      </div>

      {/* Puestos table */}
      {hasPuestos ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full text-xs sm:text-sm">
            <thead className="bg-muted/30">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Puesto</th>
                <th className="px-3 py-2 text-left font-medium">Cargo / Rol</th>
                <th className="px-3 py-2 text-left font-medium">Horario</th>
                <th className="px-3 py-2 text-right font-medium">Dotación</th>
                <th className="px-3 py-2 text-right font-medium">Sueldo base</th>
                <th className="px-3 py-2 text-right font-medium w-[160px]">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {installation.puestosActivos!.map((item) => {
                const cargoName = item.cargo?.name ?? "—";
                const rolName = item.rol?.name ?? "—";
                const salary = Number(item.baseSalary ?? 0);
                return (
                  <tr key={item.id} className="border-t border-border/60">
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
                          onClick={() => setDeleteConfirm({ open: true, id: item.id, name: item.name })}
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
      ) : (
        <EmptyState icon={<StaffingIcon className="h-8 w-8" />} title="Sin dotación activa" description="Aún no hay puestos activos. Usa el botón para agregar uno." compact />
      )}

      {/* Historial de puestos inactivos */}
      {installation.puestosHistorial && installation.puestosHistorial.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Historial de puestos</p>
          <div className="overflow-x-auto rounded-lg border border-border/50">
            <table className="min-w-full text-xs">
              <thead className="bg-muted/20">
                <tr>
                  <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Puesto</th>
                  <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Cargo / Rol</th>
                  <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Horario</th>
                  <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Período</th>
                </tr>
              </thead>
              <tbody>
                {installation.puestosHistorial.map((item) => {
                  const from = item.activeFrom ? (() => { const d = new Date(item.activeFrom); return `${String(d.getUTCDate()).padStart(2,"0")}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${d.getUTCFullYear()}`; })() : "—";
                  const until = item.activeUntil ? (() => { const d = new Date(item.activeUntil); return `${String(d.getUTCDate()).padStart(2,"0")}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${d.getUTCFullYear()}`; })() : "—";
                  return (
                    <tr key={item.id} className="border-t border-border/30">
                      <td className="px-3 py-1.5 text-muted-foreground">{item.name}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{item.cargo?.name ?? "—"} / {item.rol?.name ?? "—"}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{item.shiftStart} - {item.shiftEnd}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{from} → {until}</td>
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
        onOpenChange={(open) => setDeleteConfirm((prev) => ({ ...prev, open }))}
        title="Eliminar puesto"
        description={`El puesto "${deleteConfirm.name}" será eliminado permanentemente. Si tiene pauta o asistencia asociada, no se podrá eliminar.`}
        confirmLabel="Eliminar"
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
}: {
  installation: InstallationDetail;
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

  // ── Helpers ──
  const AccountIcon = CRM_MODULES.accounts.icon;
  const StaffingIcon = CRM_MODULES.installations.icon;

  const subtitle = [
    installation.account?.name,
    [installation.commune, installation.city].filter(Boolean).join(", "),
  ].filter(Boolean).join(" · ") || "Sin ubicación";

  // ── Sections ──
  const sections: DetailSection[] = [
    {
      key: "general",
      children: (
        <div className="flex flex-col lg:flex-row lg:gap-6">
          <DetailFieldGrid className="flex-1">
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
      ),
    },
    {
      key: "account",
      children: installation.account ? (
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
      ),
    },
    {
      key: "staffing",
      label: "Puestos operativos",
      children: (
        <StaffingSection
          installation={installation}
          sourceQuoteId={sourceQuoteId}
          sourceQuoteCode={sourceQuoteCode}
          sourceUpdatedAt={sourceUpdatedAt}
        />
      ),
    },
    {
      key: "dotacion",
      label: "Dotación activa",
      children: (
        <DotacionSection installation={installation} />
      ),
    },
    {
      key: "marcacion_asistencia",
      label: "Marcación asistencia",
      children: (
        <MarcacionAsistenciaSection installation={installation} />
      ),
    },
    {
      key: "marcacion_rondas",
      label: "Marcación rondas",
      children: (
        <MarcacionRondasSection installation={installation} />
      ),
    },
    {
      key: "rendiciones",
      label: "Rendiciones de gastos",
      children: (
        <InstallationExpensesSection installationId={installation.id} />
      ),
    },
    {
      key: "files",
      children: <FileAttachments entityType="installation" entityId={installation.id} title="Archivos" />,
    },
  ];

  return (
    <>
      <CrmDetailLayout
        pageType="installation"
        module="installations"
        title={installation.name}
        subtitle={subtitle}
        badge={isActive ? { label: "Activa", variant: "success" } : { label: "Inactiva", variant: "warning" }}
        backHref="/crm/installations"
        actions={[
          { label: "Editar instalación", icon: Pencil, onClick: openEdit },
          { label: "Eliminar instalación", icon: Trash2, onClick: () => setDeleteConfirm(true), variant: "destructive" },
        ]}
        extra={
          <Button
            size="sm"
            variant={isActive ? "outline" : "secondary"}
            onClick={openToggleInstallationStatus}
            disabled={statusUpdating}
          >
            {statusUpdating ? "Guardando..." : isActive ? "Desactivar" : "Activar"}
          </Button>
        }
        sections={sections}
      />

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
    </>
  );
}
