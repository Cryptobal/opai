"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCanEdit, useHasCapability } from "@/lib/permissions-context";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { GuardiaSearchInput } from "@/components/ops/GuardiaSearchInput";
import {
  Moon,
  Loader2,
  Save,
  Send,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  Clock,
  Users,
  Building2,
  FileDown,
  MessageSquare,
} from "lucide-react";

/* ── Types ── */

type RondaItem = {
  id: string;
  rondaNumber: number;
  horaEsperada: string;
  horaMarcada: string | null;
  status: string;
  notes: string | null;
};

type GuardiaItem = {
  id?: string;
  guardiaId?: string | null;
  guardiaNombre: string;
  isExtra: boolean;
  horaLlegada: string | null;
};

type RelevoDiaItem = { nombre: string; hora: string | null; isExtra?: boolean };

type InstalacionItem = {
  id: string;
  installationId: string | null;
  installationName: string;
  orderIndex: number;
  guardiasRequeridos: number;
  guardiasPresentes: number;
  horaLlegadaTurnoDia: string | null;
  guardiaDiaNombres: string | null;
  statusInstalacion: string;
  notes: string | null;
  guardias: GuardiaItem[];
  rondas: RondaItem[];
  /** Lista de guardias de relevo mañana (derivada de guardiaDiaNombres/hora) */
  relevoDiaList?: RelevoDiaItem[];
};

type Reporte = {
  id: string;
  date: string;
  centralOperatorName: string;
  centralLabel: string | null;
  shiftStart: string;
  shiftEnd: string;
  status: string;
  generalNotes: string | null;
  submittedBy: string | null;
  approvedBy: string | null;
  rejectedBy: string | null;
  rejectionReason: string | null;
  instalaciones: InstalacionItem[];
};

interface Props {
  reporteId: string;
  userRole?: string; // legacy, unused — permissions come from context
}

/* ── Status helpers ── */

const STATUS_LABELS: Record<string, string> = {
  borrador: "Borrador",
  enviado: "Enviado",
  aprobado: "Enviado",
};

const STATUS_COLORS: Record<string, string> = {
  borrador: "bg-zinc-500/15 text-zinc-400",
  enviado: "bg-emerald-500/15 text-emerald-400",
  aprobado: "bg-emerald-500/15 text-emerald-400",
};

const INST_STATUS_LABELS: Record<string, string> = {
  normal: "Normal",
  novedad: "Novedad",
  critico: "Crítico",
  no_aplica: "No aplica",
};

const INST_STATUS_COLORS: Record<string, string> = {
  normal: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  novedad: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  critico: "bg-red-500/15 text-red-400 border-red-500/30",
  no_aplica: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
};

const RONDA_STATUS_OPTIONS = [
  { value: "pendiente", label: "Pendiente" },
  { value: "completada", label: "OK" },
  { value: "omitida", label: "Omitida" },
  { value: "no_aplica", label: "N/A" },
];

const RONDA_STATUS_COLORS: Record<string, string> = {
  pendiente: "bg-zinc-800 text-zinc-400 border-zinc-700",
  completada: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
  omitida: "bg-red-500/20 text-red-400 border-red-500/40",
  no_aplica: "bg-zinc-500/15 text-zinc-500 border-zinc-600",
};

/** Parsea guardiaDiaNombres a lista. Soporta JSON array o legacy string único. */
function parseRelevoDiaList(
  guardiaDiaNombres: string | null,
  horaLlegadaTurnoDia: string | null
): RelevoDiaItem[] {
  if (!guardiaDiaNombres?.trim()) {
    return horaLlegadaTurnoDia ? [{ nombre: "", hora: horaLlegadaTurnoDia, isExtra: false }] : [];
  }
  const s = guardiaDiaNombres.trim();
  if (s.startsWith("[")) {
    try {
      const arr = JSON.parse(s) as Array<{ nombre?: string; hora?: string | null; isExtra?: boolean }>;
      if (Array.isArray(arr)) {
        return arr.map((x) => ({
          nombre: typeof x.nombre === "string" ? x.nombre : "",
          hora: typeof x.hora === "string" ? x.hora : null,
          isExtra: !!x.isExtra,
        }));
      }
    } catch {
      /* fallback */
    }
  }
  return [{ nombre: s, hora: horaLlegadaTurnoDia, isExtra: false }];
}

/** Serializa relevoDiaList a guardiaDiaNombres y horaLlegadaTurnoDia. */
function serializeRelevoDiaList(list: RelevoDiaItem[]): {
  guardiaDiaNombres: string | null;
  horaLlegadaTurnoDia: string | null;
} {
  if (list.length === 0) return { guardiaDiaNombres: null, horaLlegadaTurnoDia: null };
  if (list.length === 1 && !list[0].nombre && list[0].hora) {
    return { guardiaDiaNombres: null, horaLlegadaTurnoDia: list[0].hora };
  }
  return {
    guardiaDiaNombres: JSON.stringify(list),
    horaLlegadaTurnoDia: list[0]?.hora ?? null,
  };
}

/** Auto-format time input: "2005" → "20:05", "8" → "8", "20" → "20:", "205" → "20:5" */
function formatTimeInput(raw: string): string {
  // Strip everything except digits and colon
  const cleaned = raw.replace(/[^\d:]/g, "");
  // If already has colon, just limit length
  if (cleaned.includes(":")) {
    const [h, m] = cleaned.split(":");
    return `${h.slice(0, 2)}:${(m || "").slice(0, 2)}`;
  }
  // Pure digits: auto-insert colon
  const digits = cleaned.slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function formatDateFull(dateStr: string): string {
  // Handle both "2026-02-13" and "2026-02-13T00:00:00.000Z"
  const dateOnly = dateStr.slice(0, 10);
  const d = new Date(dateOnly + "T12:00:00");
  return d.toLocaleDateString("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/* ── Component ── */

export function OpsControlNocturnoDetailClient({ reporteId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reporte, setReporte] = useState<Reporte | null>(null);
  const [expandedInst, setExpandedInst] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [rondaModalOpen, setRondaModalOpen] = useState(false);
  const [selectedRonda, setSelectedRonda] = useState<{ instId: string; ronda: RondaItem } | null>(null);
  const [dirty, setDirty] = useState(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Permissions from context (works with any role, including custom RoleTemplates)
  const canEditCN = useCanEdit("ops", "control_nocturno");
  const canDeleteCN = useHasCapability("control_nocturno_delete");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isEditable = canEditCN && reporte?.status === "borrador";

  // Mark dirty on any local change
  const markDirty = useCallback(() => setDirty(true), []);

  const fetchReporte = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ops/control-nocturno/${reporteId}`);
      const json = await res.json();
      if (json.success) {
        const data = json.data as Reporte;
        data.instalaciones = data.instalaciones.map((i) => ({
          ...i,
          relevoDiaList: parseRelevoDiaList(i.guardiaDiaNombres, i.horaLlegadaTurnoDia),
        }));
        setReporte(data);
        // Auto-expand first installation on mobile
        if (data.instalaciones.length > 0) {
          setExpandedInst(data.instalaciones[0].id);
        }
      }
    } catch {
      toast.error("Error al cargar reporte");
    } finally {
      setLoading(false);
    }
  }, [reporteId]);

  useEffect(() => { fetchReporte(); }, [fetchReporte]);

  /* ── Save helper ── */

  const doSave = useCallback(async (action?: string, extra?: Record<string, unknown>) => {
    if (!reporte) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/ops/control-nocturno/${reporteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          generalNotes: reporte.generalNotes,
          centralOperatorName: reporte.centralOperatorName,
          centralLabel: reporte.centralLabel,
          instalaciones: reporte.instalaciones.map((inst) => {
            const { guardiaDiaNombres, horaLlegadaTurnoDia } = inst.relevoDiaList?.length
              ? serializeRelevoDiaList(inst.relevoDiaList)
              : { guardiaDiaNombres: inst.guardiaDiaNombres, horaLlegadaTurnoDia: inst.horaLlegadaTurnoDia };
            return {
            id: inst.id,
            guardiasRequeridos: inst.guardiasRequeridos,
            guardiasPresentes: inst.guardiasPresentes,
            horaLlegadaTurnoDia,
            guardiaDiaNombres,
            statusInstalacion: inst.statusInstalacion,
            notes: inst.notes,
            guardias: inst.guardias.map((g) => ({
              id: g.id || undefined,
              guardiaId: g.guardiaId || undefined,
              guardiaNombre: g.guardiaNombre,
              isExtra: g.isExtra,
              horaLlegada: g.horaLlegada,
            })),
            rondas: inst.rondas.map((r) => ({
              id: r.id,
              horaMarcada: r.horaMarcada,
              status: r.status,
              notes: r.notes,
            })),
          };
        }),
          ...extra,
        }),
      });
      const json = await res.json();
      if (json.success) {
        const data = json.data as Reporte;
        data.instalaciones = data.instalaciones.map((i) => ({
          ...i,
          relevoDiaList: parseRelevoDiaList(i.guardiaDiaNombres, i.horaLlegadaTurnoDia),
        }));
        setReporte(data);
        const msgs: Record<string, string> = {
          save: "Guardado",
          submit: "Reporte enviado a operaciones",
          resend: "Reporte reenviado a operaciones",
        };
        toast.success(msgs[action || "save"] || "Actualizado");
      } else {
        toast.error(json.error || "Error al guardar");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setSaving(false);
    }
  }, [reporte, reporteId]);

  /* ── Local state updaters ── */

  const updateInst = useCallback((instId: string, patch: Partial<InstalacionItem>) => {
    setReporte((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        instalaciones: prev.instalaciones.map((i) =>
          i.id === instId ? { ...i, ...patch } : i,
        ),
      };
    });
    markDirty();
  }, [markDirty]);

  const updateGuardia = useCallback((instId: string, gIdx: number, patch: Partial<GuardiaItem>) => {
    setReporte((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        instalaciones: prev.instalaciones.map((i) => {
          if (i.id !== instId) return i;
          const newGuardias = [...i.guardias];
          newGuardias[gIdx] = { ...newGuardias[gIdx], ...patch };
          return { ...i, guardias: newGuardias, guardiasPresentes: newGuardias.length };
        }),
      };
    });
    markDirty();
  }, [markDirty]);

  const addGuardia = useCallback((instId: string) => {
    setReporte((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        instalaciones: prev.instalaciones.map((i) => {
          if (i.id !== instId) return i;
          const newGuardias = [
            ...i.guardias,
            { guardiaNombre: "", isExtra: false, horaLlegada: null },
          ];
          return { ...i, guardias: newGuardias, guardiasPresentes: newGuardias.length };
        }),
      };
    });
    markDirty();
  }, [markDirty]);

  const removeGuardia = useCallback((instId: string, gIdx: number) => {
    setReporte((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        instalaciones: prev.instalaciones.map((i) => {
          if (i.id !== instId) return i;
          const newGuardias = i.guardias.filter((_, idx) => idx !== gIdx);
          return { ...i, guardias: newGuardias, guardiasPresentes: newGuardias.length };
        }),
      };
    });
    markDirty();
  }, [markDirty]);

  const addRelevoDia = useCallback((instId: string) => {
    setReporte((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        instalaciones: prev.instalaciones.map((i) => {
          if (i.id !== instId) return i;
          const list = i.relevoDiaList ?? parseRelevoDiaList(i.guardiaDiaNombres, i.horaLlegadaTurnoDia);
          return { ...i, relevoDiaList: [...list, { nombre: "", hora: null, isExtra: false }] };
        }),
      };
    });
    markDirty();
  }, [markDirty]);

  const removeRelevoDia = useCallback((instId: string, idx: number) => {
    setReporte((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        instalaciones: prev.instalaciones.map((i) => {
          if (i.id !== instId) return i;
          const list = i.relevoDiaList ?? parseRelevoDiaList(i.guardiaDiaNombres, i.horaLlegadaTurnoDia);
          const newList = list.filter((_, i) => i !== idx);
          return { ...i, relevoDiaList: newList };
        }),
      };
    });
    markDirty();
  }, [markDirty]);

  const updateRelevoDia = useCallback((instId: string, idx: number, patch: Partial<RelevoDiaItem>) => {
    setReporte((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        instalaciones: prev.instalaciones.map((i) => {
          if (i.id !== instId) return i;
          const list = i.relevoDiaList ?? parseRelevoDiaList(i.guardiaDiaNombres, i.horaLlegadaTurnoDia);
          const newList = [...list];
          newList[idx] = { ...newList[idx], ...patch };
          return { ...i, relevoDiaList: newList };
        }),
      };
    });
    markDirty();
  }, [markDirty]);

  const updateRonda = useCallback((instId: string, rondaId: string, patch: Partial<RondaItem>) => {
    setReporte((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        instalaciones: prev.instalaciones.map((i) => {
          if (i.id !== instId) return i;
          return {
            ...i,
            rondas: i.rondas.map((r) => (r.id === rondaId ? { ...r, ...patch } : r)),
          };
        }),
      };
    });
    markDirty();
  }, [markDirty]);

  /* ── Auto-save debounce (5s) ── */

  useEffect(() => {
    if (!dirty || !isEditable) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      doSave("save");
      setDirty(false);
    }, 5000);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [dirty, isEditable, doSave]);

  /* ── Export PDF ── */

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/ops/control-nocturno/${reporteId}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        toast.success("Reporte eliminado");
        setDeleteConfirmOpen(false);
        router.push("/ops/control-nocturno");
      } else {
        toast.error(json.error || "Error al eliminar");
      }
    } catch {
      toast.error("Error al eliminar reporte");
    } finally {
      setDeleting(false);
    }
  }, [reporteId, router]);

  const handleExportPdf = useCallback(async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/ops/control-nocturno/${reporteId}/export-pdf`);
      if (!res.ok) throw new Error("Error al generar PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ControlNocturno_${reporte?.date || "reporte"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF descargado");
    } catch {
      toast.error("Error al exportar PDF");
    } finally {
      setExporting(false);
    }
  }, [reporteId, reporte?.date]);

  /* ── Stats ── */

  const stats = useMemo(() => {
    if (!reporte) return { total: 0, ok: 0, novedad: 0, critico: 0, noAplica: 0 };
    const insts = reporte.instalaciones;
    return {
      total: insts.length,
      ok: insts.filter((i) => i.statusInstalacion === "normal").length,
      novedad: insts.filter((i) => i.statusInstalacion === "novedad").length,
      critico: insts.filter((i) => i.statusInstalacion === "critico").length,
      noAplica: insts.filter((i) => i.statusInstalacion === "no_aplica").length,
    };
  }, [reporte]);

  /* ── Loading ── */

  if (loading || !reporte) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      {/* ── Encabezado del reporte ── */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold capitalize">{formatDateFull(reporte.date)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {reporte.centralOperatorName}
                {reporte.centralLabel ? ` · ${reporte.centralLabel}` : ""}
                {" · "}
                {reporte.shiftStart}–{reporte.shiftEnd}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${
                  STATUS_COLORS[reporte.status] || ""
                }`}
              >
                {STATUS_LABELS[reporte.status] || reporte.status}
              </span>
              {canDeleteCN && reporte.status !== "aprobado" && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setDeleteConfirmOpen(true)}
                  title="Eliminar reporte"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                onClick={handleExportPdf}
                disabled={exporting}
                title="Exportar PDF"
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileDown className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* KPI row */}
          <div className="grid grid-cols-4 gap-2">
            <div className="text-center">
              <p className="text-lg font-bold">{stats.total}</p>
              <p className="text-[10px] text-muted-foreground">Total</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-emerald-400">{stats.ok}</p>
              <p className="text-[10px] text-muted-foreground">Normal</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-amber-400">{stats.novedad}</p>
              <p className="text-[10px] text-muted-foreground">Novedad</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-red-400">{stats.critico}</p>
              <p className="text-[10px] text-muted-foreground">Crítico</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Notas generales ── */}
      {isEditable ? (
        <div className="space-y-1">
          <Label className="text-xs">Notas generales de la jornada</Label>
          <textarea
            value={reporte.generalNotes || ""}
            onChange={(e) => { setReporte((prev) => prev ? { ...prev, generalNotes: e.target.value } : prev); markDirty(); }}
            placeholder="Comentarios, incidencias, fallas de señal, etc."
            rows={2}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      ) : reporte.generalNotes ? (
        <Card>
          <CardContent className="p-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">Notas generales</p>
            <p className="text-sm whitespace-pre-wrap">{reporte.generalNotes}</p>
          </CardContent>
        </Card>
      ) : null}

      {/* ── Lista de instalaciones (accordion mobile-first) ── */}
      <div className="space-y-2">
        {reporte.instalaciones.map((inst, instIdx) => {
          const isExpanded = expandedInst === inst.id;
          const instStatusColor = INST_STATUS_COLORS[inst.statusInstalacion] || INST_STATUS_COLORS.normal;
          const completedRondas = inst.rondas.filter((r) => r.status === "completada").length;
          const totalRondas = inst.rondas.filter((r) => r.status !== "no_aplica").length;

          return (
            <Card key={inst.id} className="overflow-hidden">
              {/* Instalacion header — always visible, tappable */}
              <button
                type="button"
                onClick={() => setExpandedInst(isExpanded ? null : inst.id)}
                className="w-full text-left"
              >
                <CardContent className="p-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-bold text-muted-foreground w-5 text-right shrink-0">
                      {instIdx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{inst.installationName}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {inst.guardiasPresentes}/{inst.guardiasRequeridos}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          Rondas: {completedRondas}/{totalRondas}
                        </span>
                        <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium border ${instStatusColor}`}>
                          {INST_STATUS_LABELS[inst.statusInstalacion]}
                        </span>
                      </div>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                  </div>
                </CardContent>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="border-t border-border px-3 pb-4 space-y-4">
                  {/* ── Status selector ── */}
                  {isEditable && (
                    <div className="pt-3">
                      <Label className="text-xs">Estado instalación</Label>
                      <div className="flex gap-1.5 mt-1.5 flex-wrap">
                        {Object.entries(INST_STATUS_LABELS).map(([val, label]) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => updateInst(inst.id, { statusInstalacion: val })}
                            className={`rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors ${
                              inst.statusInstalacion === val
                                ? INST_STATUS_COLORS[val]
                                : "border-border text-muted-foreground hover:bg-accent/50"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Guardias nocturnos ── */}
                  <div>
                    <div className="flex items-center justify-between mb-2 pt-2">
                      <p className="text-xs font-semibold flex items-center gap-1.5">
                        <Moon className="h-3.5 w-3.5 text-indigo-400" />
                        Guardias nocturnos
                      </p>
                      {isEditable && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => addGuardia(inst.id)}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Agregar
                        </Button>
                      )}
                    </div>
                    {inst.guardias.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">Sin guardias registrados</p>
                    ) : (
                      <div className="space-y-2">
                        {inst.guardias.map((g, gIdx) => (
                          <div key={g.id || `new-${gIdx}`} className="flex items-center gap-2">
                            {isEditable ? (
                              <>
                                <GuardiaSearchInput
                                  value={g.guardiaNombre}
                                  onChange={(patch) =>
                                    updateGuardia(inst.id, gIdx, {
                                      guardiaNombre: patch.guardiaNombre,
                                      guardiaId: patch.guardiaId ?? undefined,
                                    })
                                  }
                                  placeholder="Buscar guardia o escribir nombre"
                                  className="h-8 text-xs"
                                />
                                <Input
                                  value={g.horaLlegada || ""}
                                  onChange={(e) =>
                                    updateGuardia(inst.id, gIdx, { horaLlegada: formatTimeInput(e.target.value) || null })
                                  }
                                  placeholder="HH:MM"
                                  className="h-8 text-xs w-16 text-center"
                                  maxLength={5}
                                />
                                <button
                                  type="button"
                                  onClick={() => updateGuardia(inst.id, gIdx, { isExtra: !g.isExtra })}
                                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium border transition-colors ${
                                    g.isExtra
                                      ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                                      : "border-border text-muted-foreground"
                                  }`}
                                >
                                  EXTRA
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeGuardia(inst.id, gIdx)}
                                  className="shrink-0 p-1 text-muted-foreground hover:text-red-400 transition-colors"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </>
                            ) : (
                              <div className="flex items-center gap-2 flex-1">
                                <span className="text-sm">{g.guardiaNombre}</span>
                                {g.isExtra && (
                                  <span className="rounded-full bg-amber-500/20 text-amber-400 px-1.5 py-0.5 text-[10px] font-medium">
                                    EXTRA
                                  </span>
                                )}
                                {g.horaLlegada && (
                                  <span className="text-xs text-muted-foreground ml-auto">
                                    {g.horaLlegada}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ── Rondas — grid compacto mobile ── */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-blue-400" />
                        Rondas
                      </p>
                      {isEditable && (
                        <p className="text-[10px] text-muted-foreground">Toca para editar</p>
                      )}
                    </div>
                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
                      {inst.rondas.map((r) => {
                        const rColor = RONDA_STATUS_COLORS[r.status] || RONDA_STATUS_COLORS.pendiente;
                        const hasNote = !!r.notes;
                        return (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => {
                              setSelectedRonda({ instId: inst.id, ronda: r });
                              setRondaModalOpen(true);
                            }}
                            className={`relative flex flex-col items-center justify-center rounded-lg border p-1.5 transition-colors ${rColor} active:scale-95`}
                          >
                            <span className="text-[10px] font-medium opacity-70">{r.horaEsperada.slice(0, 5)}</span>
                            {r.status === "completada" && r.horaMarcada ? (
                              <span className="text-[11px] font-bold">{r.horaMarcada}</span>
                            ) : r.status === "completada" ? (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            ) : r.status === "omitida" ? (
                              <XCircle className="h-3.5 w-3.5" />
                            ) : r.status === "no_aplica" ? (
                              <span className="text-[10px]">N/A</span>
                            ) : (
                              <span className="text-[10px]">—</span>
                            )}
                            {hasNote && (
                              <MessageSquare className="absolute top-0.5 right-0.5 h-2.5 w-2.5 text-blue-400" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {/* Leyenda */}
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      <span className="flex items-center gap-1 text-[10px] text-emerald-400"><CheckCircle2 className="h-2.5 w-2.5" /> OK</span>
                      <span className="flex items-center gap-1 text-[10px] text-red-400"><XCircle className="h-2.5 w-2.5" /> Omitida</span>
                      <span className="text-[10px] text-zinc-500">— Pendiente</span>
                      <span className="text-[10px] text-zinc-500">N/A No aplica</span>
                    </div>
                  </div>

                  {/* ── Relevo mañana (múltiples guardias) ── */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-orange-400" />
                        Relevo mañana
                      </p>
                      {isEditable && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => addRelevoDia(inst.id)}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Agregar
                        </Button>
                      )}
                    </div>
                    {isEditable ? (
                      <div className="space-y-2">
                        {(inst.relevoDiaList ?? parseRelevoDiaList(inst.guardiaDiaNombres, inst.horaLlegadaTurnoDia)).length === 0 ? (
                          <p className="text-xs text-muted-foreground italic">Sin guardias de relevo</p>
                        ) : (
                          (inst.relevoDiaList ?? parseRelevoDiaList(inst.guardiaDiaNombres, inst.horaLlegadaTurnoDia)).map((r, rIdx) => (
                            <div key={rIdx} className="flex items-center gap-2">
                              <GuardiaSearchInput
                                value={r.nombre}
                                onChange={(patch) =>
                                  updateRelevoDia(inst.id, rIdx, { nombre: patch.guardiaNombre })
                                }
                                placeholder="Buscar guardia o escribir nombre"
                                className="h-8 text-xs flex-1"
                              />
                              <Input
                                value={r.hora || ""}
                                onChange={(e) =>
                                  updateRelevoDia(inst.id, rIdx, {
                                    hora: formatTimeInput(e.target.value) || null,
                                  })
                                }
                                placeholder="HH:MM"
                                className="h-8 text-xs w-16 text-center"
                                maxLength={5}
                              />
                              <button
                                type="button"
                                onClick={() => updateRelevoDia(inst.id, rIdx, { isExtra: !r.isExtra })}
                                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium border transition-colors ${
                                  r.isExtra
                                    ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                                    : "border-border text-muted-foreground"
                                }`}
                              >
                                EXTRA
                              </button>
                              <button
                                type="button"
                                onClick={() => removeRelevoDia(inst.id, rIdx)}
                                className="shrink-0 p-1 text-muted-foreground hover:text-red-400 transition-colors"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {(inst.relevoDiaList ?? parseRelevoDiaList(inst.guardiaDiaNombres, inst.horaLlegadaTurnoDia)).length === 0 ? (
                          <span className="text-sm text-muted-foreground">—</span>
                        ) : (
                          (inst.relevoDiaList ?? parseRelevoDiaList(inst.guardiaDiaNombres, inst.horaLlegadaTurnoDia)).map((r, rIdx) => (
                            <div key={rIdx} className="flex items-center gap-2 text-sm">
                              <span>{r.nombre || "—"}</span>
                              {r.isExtra && (
                                <span className="rounded-full bg-amber-500/20 text-amber-400 px-1.5 py-0.5 text-[10px] font-medium">
                                  EXTRA
                                </span>
                              )}
                              {r.hora && (
                                <span className="text-xs text-muted-foreground">{r.hora}</span>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  {/* ── Notas instalación ── */}
                  {isEditable ? (
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Notas</Label>
                      <Input
                        value={inst.notes || ""}
                        onChange={(e) => updateInst(inst.id, { notes: e.target.value || null })}
                        placeholder="Comentarios de esta instalación"
                        className="h-8 text-xs mt-0.5"
                      />
                    </div>
                  ) : inst.notes ? (
                    <p className="text-xs text-muted-foreground italic">{inst.notes}</p>
                  ) : null}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* ── Action bar fijo abajo (mobile-first) ── */}
      <div className="sticky bottom-0 left-0 right-0 bg-background/95 backdrop-blur border-t border-border p-3 -mx-4 sm:-mx-6 flex items-center gap-2 z-20">
        {isEditable && (
          <>
            {dirty && !saving && (
              <span className="text-[10px] text-muted-foreground shrink-0 hidden sm:inline">
                Cambios sin guardar
              </span>
            )}
            {saving && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-1 shrink-0">
                <Loader2 className="h-3 w-3 animate-spin" /> Guardando…
              </span>
            )}
            <Button
              size="sm"
              variant="outline"
              className="flex-1 sm:flex-none"
              onClick={() => { doSave("save"); setDirty(false); }}
              disabled={saving}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
              <span className="sm:inline hidden">Guardar</span>
              <span className="sm:hidden">Guardar</span>
            </Button>
            <Button
              size="sm"
              className="flex-1 sm:flex-none"
              onClick={() => { doSave("submit"); setDirty(false); }}
              disabled={saving}
            >
              <Send className="h-4 w-4 mr-1.5" />
              Finalizar y Enviar
            </Button>
          </>
        )}
        {(reporte.status === "aprobado" || reporte.status === "enviado") && (
          <>
            <p className="text-xs text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" />
              Reporte enviado
            </p>
            <Button
              size="sm"
              variant="outline"
              className="ml-auto"
              onClick={() => doSave("resend")}
              disabled={saving}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
              Reenviar
            </Button>
          </>
        )}
      </div>

      {/* ── Modal detalle ronda ── */}
      <Dialog open={rondaModalOpen} onOpenChange={(open) => {
        setRondaModalOpen(open);
        if (!open) setSelectedRonda(null);
      }}>
        <DialogContent className="sm:max-w-sm">
          {selectedRonda && (() => {
            const r = selectedRonda.ronda;
            const instId = selectedRonda.instId;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="text-base">
                    Ronda {r.rondaNumber} · {r.horaEsperada}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  {/* Estado */}
                  <div>
                    <Label className="text-xs">Estado</Label>
                    <div className="flex gap-1.5 mt-1.5 flex-wrap">
                      {RONDA_STATUS_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          disabled={!isEditable}
                          onClick={() => {
                            updateRonda(instId, r.id, { status: opt.value });
                            setSelectedRonda({ instId, ronda: { ...r, status: opt.value } });
                          }}
                          className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
                            r.status === opt.value
                              ? RONDA_STATUS_COLORS[opt.value]
                              : "border-border text-muted-foreground hover:bg-accent/50"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Hora marcada */}
                  {(r.status === "completada" || r.horaMarcada) && (
                    <div>
                      <Label className="text-xs">Hora real de la ronda</Label>
                      <Input
                        value={r.horaMarcada || ""}
                        onChange={(e) => {
                          const val = formatTimeInput(e.target.value) || null;
                          updateRonda(instId, r.id, { horaMarcada: val });
                          setSelectedRonda({ instId, ronda: { ...r, horaMarcada: val } });
                        }}
                        placeholder="HH:MM"
                        className="mt-1 text-center"
                        maxLength={5}
                        disabled={!isEditable}
                      />
                    </div>
                  )}

                  {/* Notas */}
                  <div>
                    <Label className="text-xs">Notas de esta ronda</Label>
                    <textarea
                      value={r.notes || ""}
                      onChange={(e) => {
                        const val = e.target.value || null;
                        updateRonda(instId, r.id, { notes: val });
                        setSelectedRonda({ instId, ronda: { ...r, notes: val } });
                      }}
                      placeholder="Comentario, motivo de omisión, observaciones..."
                      rows={3}
                      disabled={!isEditable}
                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setRondaModalOpen(false);
                      setSelectedRonda(null);
                    }}
                  >
                    Cerrar
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Confirmar eliminación ── */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Eliminar reporte"
        description="¿Estás seguro de que deseas eliminar este reporte de control nocturno? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        onConfirm={handleDelete}
        variant="destructive"
        loading={deleting}
        loadingLabel="Eliminando…"
      />

    </>
  );
}
