"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState, Spinner } from "@/components/opai-ds";
import { CalendarCheck2, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Info, Loader2, RotateCcw, MapPin, Clock, X } from "lucide-react";
import { CollapsibleSection } from "@/components/crm/CollapsibleSection";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { Input } from "@/components/ui/input";
import { hasOpsCapability } from "@/lib/ops-rbac";
import { formatPersonName } from "@/lib/personas";
import { GuardiaTeIngresoForm } from "@/components/ops/GuardiaTeIngresoForm";

/* ── types ─────────────────────────────────────── */

type ClientOption = {
  id: string;
  name: string;
  installations: { id: string; name: string }[];
};

type GuardiaOption = {
  id: string;
  code?: string | null;
  lifecycleStatus?: string;
  persona: { firstName: string; lastName: string; rut?: string | null };
};

type MarcacionItem = {
  id: string;
  tipo: string;
  timestamp: string;
  hashIntegridad: string;
  geoValidada: boolean;
  geoDistanciaM: number | null;
  gpsStatus?: string; // dentro_rango | fuera_rango | sin_gps
  lat: number | null;
  lng: number | null;
  ipAddress: string | null;
  userAgent: string | null;
  metodoId?: string | null; // "face_id" | "pin_fallback" | "rut_pin" | "manual"
  pinFallbackReason?: string | null;
  fotoEvidenciaUrl?: string | null;
  deviceDisplay?: string | null;
};

type AsistenciaItem = {
  id: string;
  date: string;
  slotNumber: number;
  attendanceStatus: string;
  plannedGuardiaId?: string | null;
  actualGuardiaId?: string | null;
  replacementGuardiaId?: string | null;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  checkInSource?: string | null;
  checkOutSource?: string | null;
  plannedMinutes?: number;
  workedMinutes?: number;
  overtimeMinutes?: number;
  lateMinutes?: number;
  lockedAt?: string | null;
  installation: { id: string; name: string };
  puesto: {
    id: string;
    name: string;
    shiftStart: string;
    shiftEnd: string;
    teMontoClp?: string | number | null;
    requiredGuards?: number;
  };
  plannedGuardia?: {
    id: string;
    code?: string | null;
    lifecycleStatus?: string;
    persona: { firstName: string; lastName: string };
  } | null;
  actualGuardia?: {
    id: string;
    code?: string | null;
    lifecycleStatus?: string;
    persona: { firstName: string; lastName: string };
  } | null;
  replacementGuardia?: {
    id: string;
    code?: string | null;
    lifecycleStatus?: string;
    persona: { firstName: string; lastName: string };
  } | null;
  turnosExtra?: Array<{
    id: string;
    status: string;
    amountClp: string | number;
    amountJustification?: string | null;
    tipo?: string;
    horasExtra?: string | number | null;
  }>;
  marcaciones?: MarcacionItem[];
  absenceCode?: string | null;
};

interface OpsPautaDiariaClientProps {
  initialClients: ClientOption[];
  guardias: GuardiaOption[];
  userRole: string;
}

function toDateInput(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const DATE_INPUT_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const ABSENCE_LABELS: Record<string, string> = {
  V: "Vacaciones",
  L: "Licencia",
  PCG: "Permiso c/goce",
  PSG: "Permiso s/goce",
};

/** Parsea "YYYY-MM-DD" como fecha local (medianoche local). Si el string no es válido, devuelve hoy. */
function parseDateLocal(dateStr: string): Date {
  if (!dateStr || !DATE_INPUT_REGEX.test(dateStr)) {
    return new Date();
  }
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) {
    return new Date();
  }
  return date;
}

function isDayShift(shiftStart: string): boolean {
  const match = shiftStart.match(/^(\d{1,2})/);
  const hour = match ? parseInt(match[1], 10) : 12;
  return hour < 12;
}

const STATUS_ICONS: Record<string, string> = {
  pendiente: "⏳",
  asistio: "✅",
  no_asistio: "❌",
  reemplazo: "🔄",
  ppc: "🟡",
};

/* ── component ─────────────────────────────────── */

export function OpsPautaDiariaClient({
  initialClients,
  guardias,
  userRole,
}: OpsPautaDiariaClientProps) {
  const searchParams = useSearchParams();
  const urlDate = searchParams.get("date");
  const urlGuardiaId = searchParams.get("guardiaId");
  const [clients] = useState<ClientOption[]>(initialClients);
  const [clientId, setClientId] = useState<string>("all");
  const [installationId, setInstallationId] = useState<string>("all");
  const [date, setDate] = useState<string>(() => {
    if (urlDate && DATE_INPUT_REGEX.test(urlDate)) return urlDate;
    return toDateInput(new Date());
  });
  const [shiftFilter, setShiftFilter] = useState<"todos" | "dia" | "noche">("todos");
  const [kpiFilter, setKpiFilter] = useState<"todos" | "cubiertos" | "ppc" | "te">("todos");
  const [loading, setLoading] = useState<boolean>(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [items, setItems] = useState<AsistenciaItem[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [replacementOpenId, setReplacementOpenId] = useState<string | null>(null);
  const [replacementSearch, setReplacementSearch] = useState("");
  const [teModalOpenForItemId, setTeModalOpenForItemId] = useState<string | null>(null);
  const [extraGuardias, setExtraGuardias] = useState<GuardiaOption[]>([]);
  const replacementPopoverRef = useRef<HTMLDivElement>(null);
  const replacementDropdownRef = useRef<HTMLDivElement>(null);
  const replacementTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [replacementAnchor, setReplacementAnchor] = useState<{ top: number; left: number; width: number } | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const [marcacionDetalleOpen, setMarcacionDetalleOpen] = useState<MarcacionItem[] | null>(null);
  const [fotoLightbox, setFotoLightbox] = useState<{
    url: string; guardiaName: string; tipo: string; timestamp: string;
  } | null>(null);
  // Modal para marcar Asistió: obliga a ingresar horas antes de guardar (no hay entrada inline)
  const [asistioModalItem, setAsistioModalItem] = useState<AsistenciaItem | null>(null);
  const [asistioModalHours, setAsistioModalHours] = useState<{ checkIn: string; checkOut: string }>({ checkIn: "", checkOut: "" });
  const [allSectionsState, setAllSectionsState] = useState<"default" | "all-collapsed" | "all-expanded">("default");
  // Dialog de confirmación: contradicción con marcación electrónica
  const [contradictionPending, setContradictionPending] = useState<{
    id: string;
    payload: Record<string, unknown>;
    message: string;
    successMessage?: string;
  } | null>(null);

  const handleKpiClick = useCallback((kpi: "todos" | "cubiertos" | "ppc" | "te") => {
    const finalKpi = kpiFilter === kpi && kpi !== "todos" ? "todos" : kpi;
    setLoading(true);
    setTimeout(() => {
      setKpiFilter(finalKpi);
      setLoading(false);
    }, 150);
  }, [kpiFilter]);

  // Sync date from URL when navigating with params
  useEffect(() => {
    if (urlDate && DATE_INPUT_REGEX.test(urlDate)) {
      setDate(urlDate);
    }
  }, [urlDate]);

  useEffect(() => {
    const m = window.matchMedia("(min-width: 768px)");
    setIsDesktop(m.matches);
    const on = () => setIsDesktop(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  const canManagePaidTeReset = userRole === "owner" || userRole === "admin";
  const canExecuteOps = hasOpsCapability(userRole, "ops_execution");

  // Installations from selected client
  const installations = useMemo(() => {
    if (clientId === "all") {
      return clients.flatMap((c) => c.installations);
    }
    return clients.find((c) => c.id === clientId)?.installations ?? [];
  }, [clients, clientId]);

  const fetchAsistencia = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ date });
      if (installationId !== "all") params.set("installationId", installationId);
      const res = await fetch(`/api/ops/asistencia?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = await res.json();
      if (!res.ok || !payload.success)
        throw new Error((payload as { error?: string; errorDetail?: string }).errorDetail || (payload as { error?: string }).error || "Error cargando asistencia");
      setItems(payload.data.items as AsistenciaItem[]);
    } catch (error) {
      console.error(error);
      const msg = error instanceof Error ? error.message : "No se pudo cargar la asistencia diaria";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [installationId, date]);

  useEffect(() => {
    void fetchAsistencia();
  }, [fetchAsistencia]);

  useEffect(() => {
    if (!replacementOpenId) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      const inTrigger = replacementPopoverRef.current?.contains(target);
      const inDropdown = replacementDropdownRef.current?.contains(target);
      if (!inTrigger && !inDropdown) setReplacementOpenId(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [replacementOpenId]);

  // Medir botón para posicionar dropdown en portal (solo desktop)
  useEffect(() => {
    if (!replacementOpenId || !isDesktop) {
      setReplacementAnchor(null);
      return;
    }
    const measure = () => {
      const el = replacementTriggerRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        setReplacementAnchor({ top: rect.bottom, left: rect.left, width: rect.width });
      }
    };
    const id = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(id);
  }, [replacementOpenId, isDesktop]);

  // Combined list including TE guardias registered through inline modal
  const allGuardias = useMemo(() => [...guardias, ...extraGuardias], [guardias, extraGuardias]);

  // Filtered guardias for replacement search (when popover is open)
  const replacementGuardiasFiltered = useMemo(() => {
    const q = replacementSearch.trim().toLowerCase();
    if (!q) return allGuardias.slice(0, 20);
    return allGuardias
      .filter((g) => {
        const hay = `${formatPersonName(g.persona.firstName, g.persona.lastName)} ${g.code ?? ""} ${g.persona.rut ?? ""}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 20);
  }, [allGuardias, replacementSearch]);

  // Filter by guardiaId (from URL) and shift (todos/día/noche)
  const shiftFilteredItems = useMemo(() => {
    let base = items;
    if (urlGuardiaId) {
      base = base.filter(
        (item) =>
          item.plannedGuardiaId === urlGuardiaId ||
          item.actualGuardiaId === urlGuardiaId ||
          item.replacementGuardiaId === urlGuardiaId
      );
    }
    return shiftFilter === "todos"
      ? base
      : base.filter((item) => {
        const isDay = isDayShift(item.puesto.shiftStart);
        return shiftFilter === "dia" ? isDay : !isDay;
      });
  }, [items, shiftFilter, urlGuardiaId]);

  // Aplica filtro KPI
  const { filteredItems, grouped } = useMemo(() => {
    let result = shiftFilteredItems;
    if (kpiFilter !== "todos") {
      result = result.filter(item => {
        if (kpiFilter === "cubiertos") return item.attendanceStatus === "asistio" || item.attendanceStatus === "reemplazo";
        if (kpiFilter === "ppc") return !item.plannedGuardiaId || (Boolean(item.absenceCode) && item.attendanceStatus === "ppc");
        if (kpiFilter === "te") return item.turnosExtra?.some((t: { status: string }) => t.status !== "rejected");
        return true;
      });
    }

    const map = new Map<string, { name: string; items: AsistenciaItem[] }>();
    for (const item of result) {
      const key = item.installation.id;
      if (!map.has(key)) {
        map.set(key, { name: item.installation.name, items: [] });
      }
      map.get(key)!.items.push(item);
    }
    const groupedResult = Array.from(map.entries()).sort(([, a], [, b]) => a.name.localeCompare(b.name));
    return { filteredItems: result, grouped: groupedResult };
  }, [shiftFilteredItems, kpiFilter]);

  const openReplacementItem = replacementOpenId ? items.find((i) => i.id === replacementOpenId) ?? null : null;

  // Summary (sin filtro KPI para mantener los números estables al clickear)
  const summary = useMemo(() => {
    let total = 0, cubiertos = 0, ppc = 0, te = 0;
    for (const item of shiftFilteredItems) {
      total++;
      if (item.attendanceStatus === "asistio" || item.attendanceStatus === "reemplazo") cubiertos++;
      if (!item.plannedGuardiaId || (Boolean(item.absenceCode) && item.attendanceStatus === "ppc")) ppc++;
      if (item.turnosExtra?.some((t: { status: string }) => t.status !== "rejected")) te++;
    }
    const cobertura = total > 0 ? Math.round((cubiertos / total) * 100) : 0;
    return { total, cubiertos, ppc, te, cobertura };
  }, [shiftFilteredItems]);

  const patchAsistencia = async (
    id: string,
    payload: Record<string, unknown>,
    successMessage?: string
  ) => {
    setSavingId(id);
    try {
      const res = await fetch(`/api/ops/asistencia/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.status === 409 && data.code === "CONTRADICCION_MARCACION_ELECTRONICA") {
        setContradictionPending({ id, payload, message: data.error as string, successMessage });
        return;
      }
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Error actualizando asistencia");
      }
      setItems((prev) =>
        prev.map((row) => (row.id === id ? (data.data as AsistenciaItem) : row))
      );
      if (successMessage) toast.success(successMessage);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar la asistencia");
    } finally {
      setSavingId(null);
    }
  };

  const timeFromISO = (iso?: string | null): string => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  };

  const dateFromISO = (isoDate: string): string => {
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) return isoDate.slice(0, 10);
    return d.toISOString().slice(0, 10);
  };

  const buildIsoFromDateAndTime = (isoDate: string, hhmm: string): string => {
    const day = dateFromISO(isoDate);
    return `${day}T${hhmm}:00.000Z`;
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-3 space-y-3">
          {/* Filtro turno: todos / día / noche */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Turno:</span>
            <div className="flex rounded-md border border-input overflow-hidden">
              {(["todos", "dia", "noche"] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${shiftFilter === opt
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:bg-muted"
                    }`}
                  onClick={() => setShiftFilter(opt)}
                >
                  {opt === "todos" ? "Todos" : opt === "dia" ? "Día" : "Noche"}
                </button>
              ))}
            </div>
          </div>

          {/* Date navigation — always visible */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 flex-1">
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-md border border-input bg-transparent h-9 w-10 sm:h-9 sm:w-9 shrink-0 text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                onClick={() => {
                  setDate((prev) => {
                    const d = parseDateLocal(prev);
                    d.setDate(d.getDate() - 1);
                    return toDateInput(d);
                  });
                }}
                aria-label="Día anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <input
                key={date}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-9 flex-1 min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-md border border-input bg-transparent h-9 w-10 sm:h-9 sm:w-9 shrink-0 text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                onClick={() => {
                  setDate((prev) => {
                    const d = parseDateLocal(prev);
                    d.setDate(d.getDate() + 1);
                    return toDateInput(d);
                  });
                }}
                aria-label="Día siguiente"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-2 ml-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                disabled={loading}
                onClick={() => {
                  const params = new URLSearchParams({
                    from: date,
                    to: date,
                  });
                  if (installationId !== "all") params.set("installationId", installationId);
                  window.open(`/api/ops/asistencia/export-horas-extra?${params.toString()}`, "_blank");
                }}
              >
                Exportar HE día
              </Button>
              {loading ? (
                <Spinner size="sm" />
              ) : items.length > 0 ? (
                <span className="text-status-ok-fg" title="Pauta cargada">
                  <CalendarCheck2 className="h-4 w-4" aria-hidden />
                </span>
              ) : null}
              {items.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => setAllSectionsState((prev) => prev === "all-collapsed" ? "all-expanded" : "all-collapsed")}
                >
                  {allSectionsState === "all-collapsed" ? (
                    <>Expandir <ChevronDown className="ml-1 h-3 w-3" /></>
                  ) : (
                    <>Contraer <ChevronUp className="ml-1 h-3 w-3" /></>
                  )}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFiltersOpen(!filtersOpen)}
                className="text-xs"
              >
                Filtros
                {filtersOpen ? <ChevronUp className="ml-1 h-3 w-3" /> : <ChevronDown className="ml-1 h-3 w-3" />}
              </Button>
            </div>
          </div>

          {/* Collapsible filters */}
          {filtersOpen && (
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 animate-in slide-in-from-top-2 duration-200">
              <div className="space-y-1">
                <Label className="text-xs">Cliente</Label>
                <SearchableSelect
                  value={clientId === "all" ? "" : clientId}
                  options={clients.map((c) => ({ id: c.id, label: c.name }))}
                  placeholder="Todos los clientes"
                  emptyText="Sin clientes"
                  onChange={(val) => {
                    setClientId(val || "all");
                    setInstallationId("all");
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Instalación</Label>
                <SearchableSelect
                  value={installationId === "all" ? "" : installationId}
                  options={installations.map((inst) => ({ id: inst.id, label: inst.name }))}
                  placeholder="Todas"
                  emptyText="Sin instalaciones"
                  onChange={(val) => setInstallationId(val || "all")}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary bar — responsive: 3+2 on mobile, 5 on desktop */}
      {items.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {[
            { id: "todos", label: "Total", value: summary.total, color: "text-foreground" },
            { id: "cubiertos", label: "Cubiertos", value: summary.cubiertos, color: "text-status-ok-fg" },
            { id: "ppc", label: "PPC", value: summary.ppc, color: "text-status-warn-fg" },
            { id: "te", label: "TE", value: summary.te, color: "text-status-danger-fg" },
            { id: "cobertura", label: "Cobertura", value: `${summary.cobertura}%`, color: summary.cobertura >= 80 ? "text-status-ok-fg" : "text-status-warn-fg" },
          ].map((s) => (
            <Card
              key={s.label}
              className={`transition-colors ${s.id === "cobertura"
                  ? ""
                  : kpiFilter === s.id
                    ? "ring-2 ring-primary/80 bg-primary/10 cursor-pointer pointer-events-auto"
                    : "cursor-pointer hover:bg-muted/50 pointer-events-auto"
                }`}
              onClick={() => {
                if (s.id !== "cobertura") {
                  handleKpiClick(s.id as any);
                }
              }}
            >
              <CardContent className="pt-2.5 pb-2.5 text-center">
                <p className="text-[11px] sm:text-[10px] uppercase tracking-wide text-muted-foreground">{s.label}</p>
                <p className={`text-base sm:text-lg font-bold ${s.color}`}>{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Content grouped by installation */}
      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <Spinner size="md" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="pt-5">
            <EmptyState
              icon={CalendarCheck2}
              title="Sin asistencia"
              description="No hay puestos para la fecha seleccionada. Genera primero la pauta mensual."
              compact
            />
          </CardContent>
        </Card>
      ) : (
        <div className={`space-y-2 ${loading ? "opacity-80 transition-opacity" : "opacity-100 transition-opacity"}`}>
          {grouped.map(([instId, group]) => (
            <CollapsibleSection
              key={instId}
              title={group.name}
              count={group.items.length}
              badge={`${group.items.filter((i) => i.attendanceStatus === "asistio" || i.attendanceStatus === "reemplazo").length}/${group.items.length}`}
              defaultOpen={true}
              open={allSectionsState === "all-collapsed" ? false : allSectionsState === "all-expanded" ? true : undefined}
              onToggle={() => setAllSectionsState("default")}
              className="overflow-visible"
            >
              {/* Desktop: encabezados de columna para filas angostas */}
              <div className="hidden md:grid md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,150px)_auto] md:gap-x-3 md:pb-1 md:border-b md:border-border/60">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Puesto</span>
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Planificado</span>
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Reemplazo</span>
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Marcación</span>
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Acciones</span>
              </div>

              {/* Card-based layout: cada item es una fila (desktop) o tarjeta vertical (móvil) */}
              <div className="space-y-1">
                {group.items.map((item) => {
                  const TE_PRIORITY: Record<string, number> = { paid: 0, approved: 1, pending: 2 };
                  const te = item.turnosExtra
                    ?.filter((t: { status: string }) => t.status !== "rejected")
                    .sort((a: { status: string }, b: { status: string }) =>
                      (TE_PRIORITY[a.status] ?? 9) - (TE_PRIORITY[b.status] ?? 9)
                    )[0];
                  const isLocked = Boolean(item.lockedAt);
                  const isAbsencePPC = Boolean(item.absenceCode) && item.attendanceStatus === "ppc";
                  const isPPC = !item.plannedGuardiaId || isAbsencePPC;
                  const showReplacementSearch =
                    isPPC ||
                    item.attendanceStatus === "no_asistio" ||
                    (item.attendanceStatus === "reemplazo" && item.replacementGuardia);
                  // Con reemplazo asignado: solo Resetear. Sin reemplazo: Asistió / No asistió
                  const tieneReemplazoAsignado = item.attendanceStatus === "reemplazo" && item.replacementGuardiaId;
                  const showAsistioNoAsistio = !isPPC && item.attendanceStatus !== "asistio" && !tieneReemplazoAsignado;
                  const initialStatus: "pendiente" | "ppc" = (item.plannedGuardiaId && !isAbsencePPC) ? "pendiente" : "ppc";
                  const hasChanges =
                    item.attendanceStatus !== initialStatus || item.replacementGuardiaId != null;
                  const isReplacementOpen = replacementOpenId === item.id;
                  const showAsistenciaPreviaWarning =
                    item.actualGuardiaId != null &&
                    item.attendanceStatus === "asistio" &&
                    (item.plannedGuardiaId !== item.actualGuardiaId || item.plannedGuardiaId == null);
                  const asistenciaPreviaGuardiaName =
                    item.actualGuardia
                      ? formatPersonName(item.actualGuardia.persona.firstName, item.actualGuardia.persona.lastName)
                      : "Guardia";

                  return (
                    <div
                      key={item.id}
                      className={`rounded-lg border border-border/60 p-2 min-w-0 overflow-hidden ${isLocked ? "opacity-60" : ""} grid grid-cols-1 md:grid md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,150px)_auto] md:gap-x-3 md:gap-y-0 gap-y-2 md:items-start`}
                    >
                      {/* Col 1: Puesto + Slot + Horas inline */}
                      <div className="flex items-start md:items-center justify-between gap-2 min-w-0">
                        <div className="min-w-0">
                          <div className="font-medium text-sm leading-tight">{item.puesto.name}</div>
                          <div className="text-xs text-muted-foreground leading-tight">
                            S{item.slotNumber} · {item.puesto.shiftStart}-{item.puesto.shiftEnd}
                            {" "}
                            <span className={isDayShift(item.puesto.shiftStart) ? "text-status-info-fg" : "text-status-info-fg"}>
                              {isDayShift(item.puesto.shiftStart) ? "Día" : "Noche"}
                            </span>
                          </div>
                          {item.plannedGuardiaId && (
                            <div className="flex flex-wrap items-center gap-1 mt-0.5">
                              <span className="text-[10px] text-muted-foreground">
                                P:{item.puesto.shiftStart}-{item.puesto.shiftEnd}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                T:{((item.workedMinutes ?? 0) / 60).toFixed(1)}h
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                J:{((item.plannedMinutes ?? 0) / 60).toFixed(1)}h
                              </span>
                              {(item.overtimeMinutes ?? 0) > 0 && (
                                <span className="text-[10px] text-status-warn-fg font-medium">
                                  HE:{((item.overtimeMinutes ?? 0) / 60).toFixed(1)}h
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <span title={item.attendanceStatus} className="text-base shrink-0 md:order-first md:mr-1.5">
                          {STATUS_ICONS[item.attendanceStatus] ?? "—"}
                        </span>
                      </div>

                      {/* Col 2: Planificado */}
                      <div className="flex items-center gap-2 text-sm min-w-0">
                        <span className="text-xs text-muted-foreground shrink-0 md:hidden">Planificado</span>
                        {isAbsencePPC && item.plannedGuardia ? (
                          <span className="truncate flex items-center gap-2">
                            <span className="text-muted-foreground">{formatPersonName(item.plannedGuardia.persona.firstName, item.plannedGuardia.persona.lastName)}</span>
                            <span className="inline-flex items-center rounded-full bg-status-ok-soft px-1.5 py-0.5 text-[10px] font-medium text-status-ok-fg shrink-0">
                              {item.absenceCode}
                            </span>
                          </span>
                        ) : item.plannedGuardia ? (
                          <span className="truncate flex items-center gap-2">
                            {formatPersonName(item.plannedGuardia.persona.firstName, item.plannedGuardia.persona.lastName)}
                            {item.plannedGuardia.code && (
                              <span className="text-xs text-muted-foreground">({item.plannedGuardia.code})</span>
                            )}
                            {item.plannedGuardia.lifecycleStatus === "te" && (
                              <span className="inline-flex items-center rounded-full bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-400 shrink-0">
                                TE
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-status-warn-fg text-sm">Sin asignar (PPC)</span>
                        )}
                      </div>

                      {/* Col 3: Reemplazo / buscar guardia — en desktop el popover se renderiza en portal para no quedar dentro del contenedor */}
                      <div className="text-sm min-w-0 md:flex md:items-center">
                        <span className="text-xs text-muted-foreground md:hidden">Reemplazo</span>
                        <div className="mt-1 md:mt-0 md:min-w-0 md:w-full">
                          {item.attendanceStatus === "reemplazo" && item.replacementGuardia ? (
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-status-danger-fg">
                                {formatPersonName(item.replacementGuardia.persona.firstName, item.replacementGuardia.persona.lastName)}
                              </span>
                              {item.replacementGuardia.lifecycleStatus === "te" && (
                                <span className="inline-flex items-center rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-medium text-violet-400">
                                  TE
                                </span>
                              )}
                              {te && (
                                <span className="text-xs text-status-warn-fg ml-2 inline-flex items-center gap-1">
                                  {te.tipo === "hora_extra" ? `HHEE ${te.horasExtra ?? "?"}h` : "TE"}{" "}
                                  {te.status} (${Number(te.amountClp).toLocaleString("es-CL")})
                                  {te.amountJustification && (
                                    <span title={te.amountJustification}>
                                      <Info className="h-3 w-3 text-status-warn-fg inline" />
                                    </span>
                                  )}
                                </span>
                              )}
                            </div>
                          ) : showReplacementSearch && (isPPC || item.attendanceStatus === "no_asistio") ? (
                            <div className="relative" ref={isReplacementOpen ? replacementPopoverRef : undefined}>
                              <Button
                                ref={isReplacementOpen ? replacementTriggerRef : undefined}
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-9 w-full justify-start text-sm font-normal"
                                disabled={savingId === item.id || isLocked}
                                onClick={() => {
                                  setReplacementOpenId((prev) => (prev === item.id ? null : item.id));
                                  setReplacementSearch("");
                                }}
                              >
                                {item.replacementGuardiaId
                                  ? allGuardias.find((g) => g.id === item.replacementGuardiaId)
                                    ? formatPersonName(allGuardias.find((g) => g.id === item.replacementGuardiaId)!.persona.firstName, allGuardias.find((g) => g.id === item.replacementGuardiaId)!.persona.lastName)
                                    : "Guardia seleccionado"
                                  : "Buscar guardia…"}
                              </Button>
                              {isReplacementOpen && (!isDesktop || !replacementAnchor) && (
                                <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border border-border bg-popover shadow-lg">
                                  <Input
                                    placeholder="Nombre, código, RUT…"
                                    value={replacementSearch}
                                    onChange={(e) => setReplacementSearch(e.target.value)}
                                    className="m-2 h-9 text-sm"
                                    autoFocus
                                  />
                                  <ul className="max-h-60 overflow-auto py-1">
                                    <li className="px-3 py-2 border-b border-border bg-muted/40">
                                      <button
                                        type="button"
                                        className="text-xs font-medium text-primary hover:underline w-full text-left"
                                        onClick={() => {
                                          setTeModalOpenForItemId(item.id);
                                          setReplacementOpenId(null);
                                          setReplacementSearch("");
                                        }}
                                      >
                                        + Registrar nuevo guardia TE
                                      </button>
                                      <p className="text-[10px] text-muted-foreground mt-0.5">
                                        Si la persona no está en el sistema, regístrala como TE y se asignará automáticamente como reemplazo.
                                      </p>
                                    </li>
                                    {replacementGuardiasFiltered
                                      .filter((g) => g.id !== item.plannedGuardiaId)
                                      .map((g) => (
                                        <li key={g.id}>
                                          <button
                                            type="button"
                                            className="w-full px-3 py-2.5 text-left text-sm hover:bg-muted active:bg-muted/80"
                                            onClick={() => {
                                              if (g.id === item.plannedGuardiaId) {
                                                toast.error("No puede asignar al guardia planificado como reemplazo.");
                                                return;
                                              }
                                              void patchAsistencia(
                                                item.id,
                                                {
                                                  replacementGuardiaId: g.id,
                                                  attendanceStatus: "reemplazo",
                                                },
                                                "Reemplazo asignado"
                                              );
                                              setReplacementOpenId(null);
                                              setReplacementSearch("");
                                            }}
                                          >
                                            <span className="flex items-center gap-2">
                                              {formatPersonName(g.persona.firstName, g.persona.lastName)}
                                              {g.code ? ` (${g.code})` : ""}
                                              {g.lifecycleStatus === "te" && (
                                                <span className="inline-flex items-center rounded-full bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-400">
                                                  TE
                                                </span>
                                              )}
                                            </span>
                                          </button>
                                        </li>
                                      ))}
                                    {replacementGuardiasFiltered.filter((g) => g.id !== item.plannedGuardiaId).length === 0 && (
                                      <li className="px-3 py-2.5 text-sm text-muted-foreground">Sin resultados</li>
                                    )}
                                    {item.plannedGuardiaId && (
                                      <li className="px-3 py-2 pt-1.5 text-xs text-muted-foreground border-t border-border/60">
                                        El guardia planificado no puede ser reemplazo.
                                      </li>
                                    )}
                                  </ul>
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </div>
                      </div>

                      {/* Col: Marcación asistencia — NO se muestra para Turnos Extra (reemplazo) */}
                      <div className="text-sm min-w-0 md:flex md:items-center">
                        <span className="text-xs text-muted-foreground md:hidden">Marcación</span>
                        <div className="mt-1 md:mt-0">
                          {item.attendanceStatus === "reemplazo" ? (
                            <span className="text-muted-foreground text-xs">—</span>
                          ) : (item.marcaciones && item.marcaciones.length > 0) ? (
                            <div className="flex flex-wrap items-center gap-1.5">
                              {(() => {
                                const entradas = item.marcaciones!.filter((m) => m.tipo === "entrada").sort(
                                  (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                                );
                                const salidas = item.marcaciones!.filter((m) => m.tipo === "salida").sort(
                                  (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                                );
                                const primeraEntrada = entradas[0];
                                const ultimaSalida = salidas[salidas.length - 1];
                                const hayFueraRango = item.marcaciones!.some((m) => m.gpsStatus === "fuera_rango");
                                return (
                                  <>
                                    {primeraEntrada && (
                                      <span
                                        className={`inline-flex items-center gap-0.5 text-xs font-medium ${primeraEntrada.gpsStatus === "fuera_rango" ? "text-status-danger-fg" : "text-status-ok-fg"}`}
                                        title={`Entrada ${primeraEntrada.timestamp} · GPS: ${primeraEntrada.gpsStatus === "dentro_rango" ? `✓ ${primeraEntrada.geoDistanciaM}m` : primeraEntrada.gpsStatus === "fuera_rango" ? `⚠ Fuera de rango (${primeraEntrada.geoDistanciaM}m)` : "sin GPS"}`}
                                      >
                                        <Clock className="h-3.5 w-3.5" />
                                        <span className="text-[10px] opacity-70">E</span>
                                        {new Date(primeraEntrada.timestamp).toLocaleTimeString("es-CL", {
                                          hour: "2-digit",
                                          minute: "2-digit",
                                        })}
                                        {primeraEntrada.gpsStatus && primeraEntrada.gpsStatus !== "sin_gps" && (
                                          <span className={`text-[9px] px-1 py-px rounded ${primeraEntrada.gpsStatus === "dentro_rango" ? "bg-status-ok-soft text-status-ok-fg" : "bg-status-danger-soft text-status-danger-fg"}`}>GPS</span>
                                        )}
                                      </span>
                                    )}
                                    {ultimaSalida && (
                                      <span
                                        className={`inline-flex items-center gap-0.5 text-xs font-medium ${ultimaSalida.gpsStatus === "fuera_rango" ? "text-status-danger-fg" : "text-status-info-fg"}`}
                                        title={`Salida ${ultimaSalida.timestamp} · GPS: ${ultimaSalida.gpsStatus === "dentro_rango" ? `✓ ${ultimaSalida.geoDistanciaM}m` : ultimaSalida.gpsStatus === "fuera_rango" ? `⚠ Fuera de rango (${ultimaSalida.geoDistanciaM}m)` : "sin GPS"}`}
                                      >
                                        <MapPin className="h-3.5 w-3.5" />
                                        <span className="text-[10px] opacity-70">S</span>
                                        {new Date(ultimaSalida.timestamp).toLocaleTimeString("es-CL", {
                                          hour: "2-digit",
                                          minute: "2-digit",
                                        })}
                                        {ultimaSalida.gpsStatus && ultimaSalida.gpsStatus !== "sin_gps" && (
                                          <span className={`text-[9px] px-1 py-px rounded ${ultimaSalida.gpsStatus === "dentro_rango" ? "bg-status-ok-soft text-status-ok-fg" : "bg-status-danger-soft text-status-danger-fg"}`}>GPS</span>
                                        )}
                                      </span>
                                    )}
                                    {hayFueraRango && (
                                      <button
                                        type="button"
                                        className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-status-danger-soft text-status-danger-fg font-semibold hover:brightness-110 transition-colors cursor-pointer animate-pulse"
                                        title="Una o más marcaciones fueron registradas fuera del rango GPS permitido. Click para ver detalle."
                                        onClick={() => setMarcacionDetalleOpen(item.marcaciones ?? [])}
                                      >
                                        <MapPin className="h-3 w-3" />
                                        ⚠ Fuera de rango
                                      </button>
                                    )}
                                  </>
                                );
                              })()}
                              {(() => {
                                const entradaMarca = item.marcaciones?.find((m) => m.tipo === "entrada");
                                const metodo = entradaMarca?.metodoId;
                                if (metodo === "face_id") {
                                  return (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-status-ok-soft text-status-ok-fg font-medium" title="Marcación verificada con Face ID">
                                      Face ID
                                    </span>
                                  );
                                }
                                if (metodo === "foto_evidencia") {
                                  return (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-status-info-soft text-status-info-fg font-medium" title="Marcación con foto de evidencia desde portal guardia">
                                      Foto
                                    </span>
                                  );
                                }
                                if (metodo === "pin_fallback") {
                                  return (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-status-warn-soft text-status-warn-fg font-medium" title="Marcación con PIN fallback — requiere validación del supervisor">
                                      PIN fallback
                                    </span>
                                  );
                                }
                                if (metodo === "rut_pin") {
                                  return (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-status-warn-soft text-status-warn-fg font-medium" title="Marcación con RUT + PIN">
                                      PIN
                                    </span>
                                  );
                                }
                                if (metodo === "manual") {
                                  return (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-500/20 text-zinc-400 font-medium" title="Marcación ingresada manualmente por admin">
                                      Manual
                                    </span>
                                  );
                                }
                                return null;
                              })()}
                              {(() => {
                                const fotoMarca = (item.marcaciones ?? []).find(
                                  (m) => m.fotoEvidenciaUrl && !m.fotoEvidenciaUrl.startsWith("evidence:")
                                );
                                if (!fotoMarca?.fotoEvidenciaUrl) return null;
                                const guardia = item.actualGuardia ?? item.plannedGuardia;
                                const guardiaName = guardia ? `${guardia.persona.firstName} ${guardia.persona.lastName}` : "Guardia";
                                return (
                                  <button
                                    onClick={() => setFotoLightbox({
                                      url: fotoMarca.fotoEvidenciaUrl!,
                                      guardiaName,
                                      tipo: fotoMarca.tipo,
                                      timestamp: fotoMarca.timestamp,
                                    })}
                                    className="mt-1 inline-block rounded-md overflow-hidden border border-border hover:border-primary transition-colors"
                                    title="Ver foto de evidencia"
                                  >
                                    <img src={fotoMarca.fotoEvidenciaUrl} alt="Foto" className="w-10 h-10 object-cover" loading="lazy" />
                                  </button>
                                );
                              })()}
                              <button
                                type="button"
                                className="text-xs text-primary hover:underline"
                                onClick={() => setMarcacionDetalleOpen(item.marcaciones ?? [])}
                              >
                                Ver detalle
                              </button>
                            </div>
                          ) : (item.checkInAt || item.checkOutAt) && item.attendanceStatus === "asistio" ? (
                            <span className="inline-flex items-center gap-1.5 text-xs">
                              <span className="text-status-ok-fg">
                                {timeFromISO(item.checkInAt)}
                              </span>
                              <span className="text-muted-foreground">–</span>
                              <span className="text-status-warn-fg">
                                {timeFromISO(item.checkOutAt)}
                              </span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </div>
                      </div>

                      {/* Col 4: Aviso asistencia previa + Acciones (en desktop una sola columna) */}
                      <div className="md:flex md:flex-col md:items-end md:justify-center md:gap-2 space-y-2.5 md:space-y-0">
                        {/* Asistencia previa warning */}
                        {showAsistenciaPreviaWarning && (
                          <div className="rounded border border-status-warn-border bg-status-warn-soft px-2.5 py-2 text-xs text-status-warn-fg">
                            <p className="font-medium">Asistencia registrada ({asistenciaPreviaGuardiaName}).</p>
                            <div className="flex gap-2 mt-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs px-3 border-status-warn-border text-status-warn-fg hover:bg-status-warn-soft"
                                disabled={savingId === item.id || isLocked || !canExecuteOps}
                                onClick={() =>
                                  void patchAsistencia(
                                    item.id,
                                    { plannedGuardiaId: item.actualGuardiaId ?? undefined },
                                    "Asistencia validada (planificado alineado)"
                                  )
                                }
                              >
                                Validar
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs px-3 border-status-warn-border text-status-warn-fg hover:bg-status-warn-soft"
                                disabled={savingId === item.id || isLocked || !canExecuteOps}
                                onClick={() => {
                                  const te2 = item.turnosExtra?.filter((t: { status: string }) => t.status !== "rejected").sort((a: { status: string }, b: { status: string }) => (TE_PRIORITY[a.status] ?? 9) - (TE_PRIORITY[b.status] ?? 9))[0];
                                  if (te2?.status === "paid" && !canManagePaidTeReset) {
                                    toast.error("No puedes resetear: este TE ya está pagado.");
                                    return;
                                  }
                                  if (te2?.status === "paid" && canManagePaidTeReset) {
                                    const reason = (window.prompt("Motivo para eliminar TE pagado:") || "").trim();
                                    if (!reason) { toast.error("Debes indicar un motivo."); return; }
                                    void patchAsistencia(item.id, { attendanceStatus: initialStatus, actualGuardiaId: null, replacementGuardiaId: null, forceDeletePaidTe: true, forceDeleteReason: reason }, "Estado reseteado (override admin)");
                                    return;
                                  }
                                  if (te2 && (te2.status === "pending" || te2.status === "approved")) {
                                    if (!window.confirm("Se eliminará el TE asociado. ¿Continuar?")) return;
                                  }
                                  void patchAsistencia(item.id, { attendanceStatus: initialStatus, actualGuardiaId: null, replacementGuardiaId: null }, "Estado reseteado");
                                }}
                              >
                                Corregir
                              </Button>
                            </div>
                          </div>
                        )}

                        {/* Actions row */}
                        <div className="flex flex-wrap gap-1.5 items-center pt-0.5">
                          {showAsistioNoAsistio && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className={`h-7 w-7 p-0 ${item.attendanceStatus === "asistio"
                                    ? "border-status-ok-border bg-status-ok-soft text-status-ok-fg"
                                    : "border-status-ok-border text-status-ok-fg hover:bg-status-ok-soft hover:text-status-ok-fg"
                                  }`}
                                disabled={savingId === item.id || isLocked || item.attendanceStatus === "no_asistio"}
                                onClick={() => {
                                  setAsistioModalItem(item);
                                  setAsistioModalHours({
                                    checkIn: timeFromISO(item.checkInAt) || item.puesto.shiftStart,
                                    checkOut: timeFromISO(item.checkOutAt) || item.puesto.shiftEnd,
                                  });
                                }}
                                title="Asistió"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className={`h-7 w-7 p-0 ${item.attendanceStatus === "no_asistio"
                                    ? "border-status-danger-border bg-status-danger-soft text-status-danger-fg"
                                    : "border-status-danger-border/50 text-status-danger-fg hover:bg-status-danger-soft hover:text-status-danger-fg"
                                  }`}
                                disabled={savingId === item.id || isLocked}
                                onClick={() =>
                                  void patchAsistencia(
                                    item.id,
                                    { attendanceStatus: "no_asistio", actualGuardiaId: null },
                                    "No asistió"
                                  )
                                }
                                title="No asistió"
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                          {/* Con reemplazo asignado no se muestran Asistió/No asistió/Asistió(reemplazo), solo Resetear */}
                          {hasChanges && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 text-xs px-2 text-muted-foreground"
                              disabled={savingId === item.id || isLocked || !canExecuteOps}
                              onClick={() => {
                                const te2 = item.turnosExtra?.filter((t: { status: string }) => t.status !== "rejected").sort((a: { status: string }, b: { status: string }) => (TE_PRIORITY[a.status] ?? 9) - (TE_PRIORITY[b.status] ?? 9))[0];
                                if (!te2) {
                                  void patchAsistencia(item.id, { attendanceStatus: initialStatus, actualGuardiaId: null, replacementGuardiaId: null }, "Estado reseteado");
                                  return;
                                }
                                if (te2.status === "paid") {
                                  if (!canManagePaidTeReset) { toast.error("TE pagado. Solicita override a un admin."); return; }
                                  if (!window.confirm("TE pagado. Se forzará eliminación. ¿Continuar?")) return;
                                  const reason = (window.prompt("Motivo:") || "").trim();
                                  if (!reason) { toast.error("Debes indicar un motivo."); return; }
                                  void patchAsistencia(item.id, { attendanceStatus: initialStatus, actualGuardiaId: null, replacementGuardiaId: null, forceDeletePaidTe: true, forceDeleteReason: reason }, "Estado reseteado (override admin)");
                                  return;
                                }
                                if (!window.confirm("Se eliminará el TE asociado. ¿Continuar?")) return;
                                void patchAsistencia(item.id, { attendanceStatus: initialStatus, actualGuardiaId: null, replacementGuardiaId: null }, "Estado reseteado");
                              }}
                              title="Resetear"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>

                    </div>
                  );
                })}
              </div>
            </CollapsibleSection>
          ))}
        </div>
      )}

      {/* Modal detalle marcación */}
      <Dialog open={!!marcacionDetalleOpen} onOpenChange={(open) => !open && setMarcacionDetalleOpen(null)}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle de marcación digital</DialogTitle>
          </DialogHeader>
          {marcacionDetalleOpen && marcacionDetalleOpen.length > 0 && (
            <div className="space-y-4">
              {marcacionDetalleOpen.map((m) => (
                <div key={m.id} className={`rounded border p-3 text-sm space-y-2 ${m.gpsStatus === "fuera_rango" ? "border-status-danger-border bg-status-danger-soft" : "border-border/60"}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      {m.tipo === "entrada" ? "Entrada" : "Salida"}:{" "}
                      {new Date(m.timestamp).toLocaleString("es-CL")}
                    </span>
                    {m.gpsStatus === "fuera_rango" && (
                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-status-danger-soft text-status-danger-fg font-medium">
                        <MapPin className="h-3 w-3" />
                        Fuera de rango
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>
                      <span className="font-medium">Hash:</span> <code className="text-[10px] break-all">{m.hashIntegridad}</code>
                    </p>
                    <p>
                      <span className="font-medium">Geo:</span>{" "}
                      {m.gpsStatus === "dentro_rango" ? (
                        <span className="text-status-ok-fg">Dentro de rango ({m.geoDistanciaM}m)</span>
                      ) : m.gpsStatus === "fuera_rango" ? (
                        <span className="text-status-danger-fg font-medium">Fuera de rango ({m.geoDistanciaM}m)</span>
                      ) : (
                        "Sin GPS"
                      )}
                    </p>
                    {m.lat != null && m.lng != null && (
                      <p>
                        <span className="font-medium">Coordenadas:</span>{" "}
                        <a
                          href={`https://www.google.com/maps?q=${m.lat},${m.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          {m.lat}, {m.lng}
                        </a>
                      </p>
                    )}
                    {m.deviceDisplay && (
                      <p>
                        <span className="font-medium">Dispositivo:</span> {m.deviceDisplay}
                      </p>
                    )}
                    {m.ipAddress && (
                      <p>
                        <span className="font-medium">IP:</span> {m.ipAddress}
                      </p>
                    )}
                    {m.metodoId && (
                      <p>
                        <span className="font-medium">Método:</span>{" "}
                        {m.metodoId === "face_id" ? "Face ID" : m.metodoId === "foto_evidencia" ? "Foto evidencia" : m.metodoId === "pin_fallback" ? "PIN fallback" : m.metodoId === "rut_pin" ? "RUT + PIN" : m.metodoId === "manual" ? "Manual" : m.metodoId}
                      </p>
                    )}
                  </div>
                  {m.fotoEvidenciaUrl && !m.fotoEvidenciaUrl.startsWith("evidence:") && (
                    <div className="mt-2">
                      <p className="text-xs text-muted-foreground mb-1">Foto de evidencia:</p>
                      <button
                        onClick={() => {
                          setMarcacionDetalleOpen(null);
                          setFotoLightbox({
                            url: m.fotoEvidenciaUrl!,
                            guardiaName: "Guardia",
                            tipo: m.tipo,
                            timestamp: m.timestamp,
                          });
                        }}
                        className="rounded-md overflow-hidden border border-border hover:border-primary transition-colors"
                      >
                        <img src={m.fotoEvidenciaUrl} alt="Foto" className="w-24 h-24 object-cover" loading="lazy" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Lightbox foto evidencia */}
      <Dialog open={!!fotoLightbox} onOpenChange={(open) => { if (!open) setFotoLightbox(null); }}>
        <DialogContent className="max-w-2xl p-2">
          {fotoLightbox && (
            <div>
              <img
                src={fotoLightbox.url}
                alt={`Foto ${fotoLightbox.tipo} - ${fotoLightbox.guardiaName}`}
                className="w-full max-h-[75vh] object-contain rounded-lg"
              />
              <div className="mt-2 text-sm text-muted-foreground">
                <p className="font-medium">{fotoLightbox.guardiaName}</p>
                <p>
                  {fotoLightbox.tipo === "entrada" ? "Entrada" : "Salida"} —{" "}
                  {new Date(fotoLightbox.timestamp).toLocaleString("es-CL")}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal Asistió: obliga a ingresar horas de entrada/salida antes de guardar */}
      <Dialog
        open={!!asistioModalItem}
        onOpenChange={(open) => {
          if (!open) {
            setAsistioModalItem(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Marcar asistencia</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Ingresa la hora de entrada y salida real. No se puede marcar asistencia sin registrar las horas.
            </p>
          </DialogHeader>
          {asistioModalItem && (
            <div className="space-y-4 py-2">
              <div className="rounded-md border border-border/60 bg-muted/20 p-2.5 text-sm">
                <span className="font-medium">{asistioModalItem.puesto.name}</span>
                <span className="text-muted-foreground ml-2">
                  S{asistioModalItem.slotNumber} · Plan: {asistioModalItem.puesto.shiftStart}-{asistioModalItem.puesto.shiftEnd}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Entrada real</Label>
                  <Input
                    type="time"
                    step="300"
                    value={asistioModalHours.checkIn}
                    onChange={(e) =>
                      setAsistioModalHours((p) => ({ ...p, checkIn: e.target.value }))
                    }
                    className="h-9"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Salida real</Label>
                  <Input
                    type="time"
                    step="300"
                    value={asistioModalHours.checkOut}
                    onChange={(e) =>
                      setAsistioModalHours((p) => ({ ...p, checkOut: e.target.value }))
                    }
                    className="h-9"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setAsistioModalHours({
                      checkIn: asistioModalItem.puesto.shiftStart,
                      checkOut: asistioModalItem.puesto.shiftEnd,
                    })
                  }
                >
                  Usar plan
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setAsistioModalHours((p) => ({
                      ...p,
                      checkOut: (() => {
                        const [hh, mm] = (p.checkOut || "19:00").split(":").map(Number);
                        let total = (hh * 60 + mm + 60) % (24 * 60);
                        if (total < 0) total += 24 * 60;
                        return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
                      })(),
                    }))
                  }
                >
                  +1h salida
                </Button>
                <Button
                  size="sm"
                  disabled={savingId === asistioModalItem.id}
                  onClick={() => {
                    // Reemplazo/TE NO es asistencia: mantener attendanceStatus "reemplazo"
                    // Solo el planificado que asiste marca "asistio"
                    const isReemplazo = asistioModalItem.attendanceStatus === "reemplazo";
                    const payload: Record<string, unknown> = {
                      checkInAt: buildIsoFromDateAndTime(asistioModalItem.date, asistioModalHours.checkIn),
                      checkOutAt: buildIsoFromDateAndTime(asistioModalItem.date, asistioModalHours.checkOut),
                    };
                    if (!isReemplazo) {
                      payload.attendanceStatus = "asistio";
                      payload.actualGuardiaId =
                        asistioModalItem.actualGuardiaId ??
                        asistioModalItem.plannedGuardiaId ??
                        null;
                    }
                    void patchAsistencia(
                      asistioModalItem.id,
                      payload,
                      isReemplazo ? "Horas del reemplazo guardadas" : "Asistencia marcada con horas"
                    );
                    setAsistioModalItem(null);
                  }}
                >
                  {savingId === asistioModalItem.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Guardar asistencia"
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmación: contradicción con marcación electrónica */}
      <Dialog
        open={!!contradictionPending}
        onOpenChange={(open) => {
          if (!open) setContradictionPending(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Contradicción con marcación electrónica</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {contradictionPending?.message}
            </p>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setContradictionPending(null)}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={contradictionPending ? savingId === contradictionPending.id : false}
              onClick={() => {
                if (!contradictionPending) return;
                const { id, payload, successMessage } = contradictionPending;
                setContradictionPending(null);
                void patchAsistencia(
                  id,
                  { ...payload, confirmarContradiccion: true },
                  successMessage
                );
              }}
            >
              Sí, marcar como no asistió
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Portal: dropdown "Buscar guardia" en desktop para que no quede dentro del contenedor del puesto */}
      {typeof document !== "undefined" &&
        isDesktop &&
        replacementAnchor &&
        openReplacementItem &&
        createPortal(
          <div
            ref={replacementDropdownRef}
            className="fixed z-[100] rounded-md border border-border bg-popover shadow-lg"
            style={{
              top: replacementAnchor.top + 4,
              left: replacementAnchor.left,
              minWidth: replacementAnchor.width,
              maxWidth: Math.max(replacementAnchor.width, 320),
            }}
          >
            <Input
              placeholder="Nombre, código, RUT…"
              value={replacementSearch}
              onChange={(e) => setReplacementSearch(e.target.value)}
              className="m-2 h-9 text-sm"
              autoFocus
            />
            <ul className="max-h-60 overflow-auto py-1">
              <li className="px-3 py-2 border-b border-border bg-muted/40">
                <button
                  type="button"
                  className="text-xs font-medium text-primary hover:underline w-full text-left"
                  onClick={() => {
                    setTeModalOpenForItemId(openReplacementItem.id);
                    setReplacementOpenId(null);
                    setReplacementSearch("");
                  }}
                >
                  + Registrar nuevo guardia TE
                </button>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Si la persona no está en el sistema, regístrala como TE y se asignará automáticamente como reemplazo.
                </p>
              </li>
              {replacementGuardiasFiltered
                .filter((g) => g.id !== openReplacementItem.plannedGuardiaId)
                .map((g) => (
                  <li key={g.id}>
                    <button
                      type="button"
                      className="w-full px-3 py-2.5 text-left text-sm hover:bg-muted active:bg-muted/80"
                      onClick={() => {
                        if (g.id === openReplacementItem.plannedGuardiaId) {
                          toast.error("No puede asignar al guardia planificado como reemplazo.");
                          return;
                        }
                        void patchAsistencia(
                          openReplacementItem.id,
                          {
                            replacementGuardiaId: g.id,
                            attendanceStatus: "reemplazo",
                          },
                          "Reemplazo asignado"
                        );
                        setReplacementOpenId(null);
                        setReplacementSearch("");
                      }}
                    >
                      <span className="flex items-center gap-2">
                        {formatPersonName(g.persona.firstName, g.persona.lastName)}
                        {g.code ? ` (${g.code})` : ""}
                        {g.lifecycleStatus === "te" && (
                          <span className="inline-flex items-center rounded-full bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-400">
                            TE
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              {replacementGuardiasFiltered.filter((g) => g.id !== openReplacementItem.plannedGuardiaId).length === 0 && (
                <li className="px-3 py-2.5 text-sm text-muted-foreground">Sin resultados</li>
              )}
              {openReplacementItem.plannedGuardiaId && (
                <li className="px-3 py-2 pt-1.5 text-xs text-muted-foreground border-t border-border/60">
                  El guardia planificado no puede ser reemplazo.
                </li>
              )}
            </ul>
          </div>,
          document.body
        )}

      {/* Modal: registrar nuevo guardia TE en línea y auto-asignarlo como reemplazo */}
      <Dialog
        open={teModalOpenForItemId !== null}
        onOpenChange={(open) => {
          if (!open) setTeModalOpenForItemId(null);
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar nuevo Guardia TE</DialogTitle>
            <DialogDescription>
              El nuevo guardia se asignará automáticamente como reemplazo del slot al guardar.
            </DialogDescription>
          </DialogHeader>

          {teModalOpenForItemId && (
            <GuardiaTeIngresoForm
              userRole={userRole}
              compact
              navigateOnSuccess={false}
              onSuccess={async (created) => {
                const targetItemId = teModalOpenForItemId;
                if (!created?.id || !targetItemId) {
                  setTeModalOpenForItemId(null);
                  return;
                }
                const newGuardia: GuardiaOption = {
                  id: created.id,
                  code: null,
                  lifecycleStatus: "te",
                  persona: {
                    firstName: created.firstName ?? "",
                    lastName: created.lastName ?? "",
                    rut: null,
                  },
                };
                setExtraGuardias((prev) =>
                  prev.some((g) => g.id === newGuardia.id) ? prev : [...prev, newGuardia],
                );
                try {
                  await patchAsistencia(
                    targetItemId,
                    {
                      replacementGuardiaId: newGuardia.id,
                      attendanceStatus: "reemplazo",
                    },
                    "Reemplazo asignado tras registro TE",
                  );
                  toast.success(
                    `${formatPersonName(newGuardia.persona.firstName, newGuardia.persona.lastName)} registrado y asignado como reemplazo`,
                  );
                } catch (err) {
                  console.error(err);
                  toast.error(
                    "Guardia registrado pero hubo un error al asignarlo. Asígnalo manualmente.",
                  );
                } finally {
                  setTeModalOpenForItemId(null);
                }
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
