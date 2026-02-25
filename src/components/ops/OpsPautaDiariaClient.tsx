"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/opai";
import { CalendarCheck2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Loader2, RotateCcw, MapPin, Clock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { hasOpsCapability } from "@/lib/ops-rbac";

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
  lat: number | null;
  lng: number | null;
  ipAddress: string | null;
  userAgent: string | null;
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
  }>;
  marcaciones?: MarcacionItem[];
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
  const [clients] = useState<ClientOption[]>(initialClients);
  const [clientId, setClientId] = useState<string>("all");
  const [installationId, setInstallationId] = useState<string>("all");
  const [date, setDate] = useState<string>(toDateInput(new Date()));
  const [shiftFilter, setShiftFilter] = useState<"todos" | "dia" | "noche">("todos");
  const [loading, setLoading] = useState<boolean>(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [items, setItems] = useState<AsistenciaItem[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [replacementOpenId, setReplacementOpenId] = useState<string | null>(null);
  const [replacementSearch, setReplacementSearch] = useState("");
  const replacementPopoverRef = useRef<HTMLDivElement>(null);
  const replacementDropdownRef = useRef<HTMLDivElement>(null);
  const replacementTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [replacementAnchor, setReplacementAnchor] = useState<{ top: number; left: number; width: number } | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const [marcacionDetalleOpen, setMarcacionDetalleOpen] = useState<MarcacionItem[] | null>(null);
  // Modal para marcar Asistió: obliga a ingresar horas antes de guardar (no hay entrada inline)
  const [asistioModalItem, setAsistioModalItem] = useState<AsistenciaItem | null>(null);
  const [asistioModalHours, setAsistioModalHours] = useState<{ checkIn: string; checkOut: string }>({ checkIn: "", checkOut: "" });
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
        throw new Error(payload.error || "Error cargando asistencia");
      setItems(payload.data.items as AsistenciaItem[]);
    } catch (error) {
      console.error(error);
      toast.error("No se pudo cargar la asistencia diaria");
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

  // Filtered guardias for replacement search (when popover is open)
  const replacementGuardiasFiltered = useMemo(() => {
    const q = replacementSearch.trim().toLowerCase();
    if (!q) return guardias.slice(0, 20);
    return guardias
      .filter((g) => {
        const hay = `${g.persona.firstName} ${g.persona.lastName} ${g.code ?? ""} ${g.persona.rut ?? ""}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 20);
  }, [guardias, replacementSearch]);

  // Filter by shift (todos/día/noche) and group by installation
  const { filteredItems, grouped } = useMemo(() => {
    const filtered =
      shiftFilter === "todos"
        ? items
        : items.filter((item) => {
            const isDay = isDayShift(item.puesto.shiftStart);
            return shiftFilter === "dia" ? isDay : !isDay;
          });
    const map = new Map<string, { name: string; items: AsistenciaItem[] }>();
    for (const item of filtered) {
      const key = item.installation.id;
      if (!map.has(key)) {
        map.set(key, { name: item.installation.name, items: [] });
      }
      map.get(key)!.items.push(item);
    }
    const groupedResult = Array.from(map.entries()).sort(([, a], [, b]) => a.name.localeCompare(b.name));
    return { filteredItems: filtered, grouped: groupedResult };
  }, [items, shiftFilter]);

  const openReplacementItem = replacementOpenId ? items.find((i) => i.id === replacementOpenId) ?? null : null;

  // Summary (usa items filtrados por turno)
  const summary = useMemo(() => {
    let total = 0, cubiertos = 0, ppc = 0, te = 0;
    for (const item of filteredItems) {
      total++;
      if (item.attendanceStatus === "asistio" || item.attendanceStatus === "reemplazo") cubiertos++;
      if (!item.plannedGuardiaId) ppc++;
      if (item.turnosExtra && item.turnosExtra.length > 0) te++;
    }
    const cobertura = total > 0 ? Math.round((cubiertos / total) * 100) : 0;
    return { total, cubiertos, ppc, te, cobertura };
  }, [filteredItems]);

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
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    shiftFilter === opt
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
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-10 sm:h-9 sm:w-9 shrink-0"
                onClick={() => {
                  const d = new Date(date);
                  d.setUTCDate(d.getUTCDate() - 1);
                  setDate(toDateInput(d));
                }}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-9 flex-1 min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-10 sm:h-9 sm:w-9 shrink-0"
                onClick={() => {
                  const d = new Date(date);
                  d.setUTCDate(d.getUTCDate() + 1);
                  setDate(toDateInput(d));
                }}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2 ml-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
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
                <div className="flex items-center gap-1.5 text-sm text-emerald-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="hidden sm:inline">Cargando…</span>
                </div>
              ) : items.length > 0 ? (
                <div className="flex items-center gap-1.5 text-sm text-emerald-400">
                  <CalendarCheck2 className="h-4 w-4 text-white" />
                </div>
              ) : null}
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
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={clientId}
                  onChange={(e) => {
                    setClientId(e.target.value);
                    setInstallationId("all");
                  }}
                >
                  <option value="all">Todos los clientes</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Instalación</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={installationId}
                  onChange={(e) => setInstallationId(e.target.value)}
                >
                  <option value="all">Todas</option>
                  {installations.map((inst) => (
                    <option key={inst.id} value={inst.id}>{inst.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary bar — responsive: 3+2 on mobile, 5 on desktop */}
      {items.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {[
            { label: "Total", value: summary.total, color: "text-foreground" },
            { label: "Cubiertos", value: summary.cubiertos, color: "text-emerald-400" },
            { label: "PPC", value: summary.ppc, color: "text-amber-400" },
            { label: "TE", value: summary.te, color: "text-rose-400" },
            { label: "Cobertura", value: `${summary.cobertura}%`, color: summary.cobertura >= 80 ? "text-emerald-400" : "text-amber-400" },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="pt-2.5 pb-2.5 text-center">
                <p className="text-[11px] sm:text-[10px] uppercase tracking-wide text-muted-foreground">{s.label}</p>
                <p className={`text-base sm:text-lg font-bold ${s.color}`}>{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Content grouped by installation */}
      {items.length === 0 ? (
        <Card>
          <CardContent className="pt-5">
            <EmptyState
              icon={<CalendarCheck2 className="h-8 w-8 text-white" />}
              title="Sin asistencia"
              description="No hay puestos para la fecha seleccionada. Genera primero la pauta mensual."
              compact
            />
          </CardContent>
        </Card>
      ) : (
        grouped.map(([instId, group]) => (
          <Card key={instId} className="overflow-visible">
            <CardContent className="pt-4 pb-3 space-y-3 overflow-visible">
              <h3 className="text-sm font-semibold text-primary/80 uppercase tracking-wide">
                {group.name}
              </h3>

              {/* Desktop: encabezados de columna para filas angostas */}
              <div className="hidden md:grid md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,180px)_auto] md:gap-x-4 md:pb-1 md:border-b md:border-border/60">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Puesto</span>
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Planificado</span>
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Reemplazo</span>
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Marcación</span>
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Acciones</span>
              </div>

              {/* Card-based layout: cada item es una fila (desktop) o tarjeta vertical (móvil) */}
              <div className="space-y-2">
                {group.items.map((item) => {
                  const te = item.turnosExtra?.[0];
                  const isLocked = Boolean(item.lockedAt);
                  const isPPC = !item.plannedGuardiaId;
                  const showReplacementSearch =
                    isPPC ||
                    item.attendanceStatus === "no_asistio" ||
                    (item.attendanceStatus === "reemplazo" && item.replacementGuardia);
                  // Con reemplazo asignado: solo Resetear. Sin reemplazo: Asistió / No asistió
                  const tieneReemplazoAsignado = item.attendanceStatus === "reemplazo" && item.replacementGuardiaId;
                  const showAsistioNoAsistio = !isPPC && item.attendanceStatus !== "asistio" && !tieneReemplazoAsignado;
                  const initialStatus: "pendiente" | "ppc" = item.plannedGuardiaId ? "pendiente" : "ppc";
                  const hasChanges =
                    item.attendanceStatus !== initialStatus || item.replacementGuardiaId != null;
                  const isReplacementOpen = replacementOpenId === item.id;
                  const showAsistenciaPreviaWarning =
                    item.actualGuardiaId != null &&
                    item.attendanceStatus === "asistio" &&
                    (item.plannedGuardiaId !== item.actualGuardiaId || item.plannedGuardiaId == null);
                  const asistenciaPreviaGuardiaName =
                    item.actualGuardia
                      ? `${item.actualGuardia.persona.firstName} ${item.actualGuardia.persona.lastName}`
                      : "Guardia";

                  return (
                    <div
                      key={item.id}
                      className={`rounded-lg border border-border/60 p-3 min-w-0 overflow-hidden ${isLocked ? "opacity-60" : ""} grid grid-cols-1 md:grid md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,180px)_auto] md:gap-x-4 md:gap-y-0 gap-y-2.5 md:items-start`}
                    >
                      {/* Col 1: Puesto + Slot (en desktop va a la izquierda) */}
                      <div className="flex items-start md:items-center justify-between gap-2 min-w-0">
                        <div className="min-w-0">
                          <div className="font-medium text-sm">{item.puesto.name}</div>
                          <div className="text-xs text-muted-foreground">
                            S{item.slotNumber} · {item.puesto.shiftStart}-{item.puesto.shiftEnd}
                            {" "}
                            <span className={isDayShift(item.puesto.shiftStart) ? "text-sky-400" : "text-indigo-400"}>
                              {isDayShift(item.puesto.shiftStart) ? "Día" : "Noche"}
                            </span>
                          </div>
                        </div>
                        <span title={item.attendanceStatus} className="text-lg shrink-0 md:order-first md:mr-2">
                          {STATUS_ICONS[item.attendanceStatus] ?? "—"}
                        </span>
                      </div>

                      {/* Col 2: Planificado */}
                      <div className="flex items-center gap-2 text-sm min-w-0">
                        <span className="text-xs text-muted-foreground shrink-0 md:hidden">Planificado</span>
                        {item.plannedGuardia ? (
                          <span className="truncate flex items-center gap-2">
                            {item.plannedGuardia.persona.firstName} {item.plannedGuardia.persona.lastName}
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
                          <span className="text-amber-400 text-sm">Sin asignar (PPC)</span>
                        )}
                      </div>

                      {/* Col 3: Reemplazo / buscar guardia — en desktop el popover se renderiza en portal para no quedar dentro del contenedor */}
                      <div className="text-sm min-w-0 md:flex md:items-center">
                        <span className="text-xs text-muted-foreground md:hidden">Reemplazo</span>
                        <div className="mt-1 md:mt-0 md:min-w-0 md:w-full">
                          {item.attendanceStatus === "reemplazo" && item.replacementGuardia ? (
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-rose-300">
                                {item.replacementGuardia.persona.firstName} {item.replacementGuardia.persona.lastName}
                              </span>
                              {item.replacementGuardia.lifecycleStatus === "te" && (
                                <span className="inline-flex items-center rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-medium text-violet-400">
                                  TE
                                </span>
                              )}
                              {te && (
                                <span className="text-xs text-amber-400 ml-2">
                                  TE {te.status} (${Number(te.amountClp).toLocaleString("es-CL")})
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
                                  ? guardias.find((g) => g.id === item.replacementGuardiaId)
                                    ? `${guardias.find((g) => g.id === item.replacementGuardiaId)!.persona.firstName} ${guardias.find((g) => g.id === item.replacementGuardiaId)!.persona.lastName}`
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
                                              {g.persona.firstName} {g.persona.lastName}
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

                      {/* Col: Marcación asistencia — muestra horas reales (marcación digital o manual) */}
                      <div className="text-sm min-w-0 md:flex md:items-center">
                        <span className="text-xs text-muted-foreground md:hidden">Marcación</span>
                        <div className="mt-1 md:mt-0">
                          {(item.marcaciones && item.marcaciones.length > 0) ? (
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
                                return (
                                  <>
                                    {primeraEntrada && (
                                      <span
                                        className="inline-flex items-center gap-0.5 text-emerald-500 text-xs"
                                        title={`Entrada ${primeraEntrada.timestamp} · Hash: ${primeraEntrada.hashIntegridad.slice(0, 16)}… · Geo: ${primeraEntrada.geoValidada ? `✓ ${primeraEntrada.geoDistanciaM}m` : "sin validar"}`}
                                      >
                                        <Clock className="h-3.5 w-3.5" />
                                        {new Date(primeraEntrada.timestamp).toLocaleTimeString("es-CL", {
                                          hour: "2-digit",
                                          minute: "2-digit",
                                        })}
                                      </span>
                                    )}
                                    {ultimaSalida && (
                                      <span
                                        className="inline-flex items-center gap-0.5 text-amber-500 text-xs"
                                        title={`Salida ${ultimaSalida.timestamp} · Hash: ${ultimaSalida.hashIntegridad.slice(0, 16)}… · Geo: ${ultimaSalida.geoValidada ? `✓ ${ultimaSalida.geoDistanciaM}m` : "sin validar"}`}
                                      >
                                        <MapPin className="h-3.5 w-3.5" />
                                        {new Date(ultimaSalida.timestamp).toLocaleTimeString("es-CL", {
                                          hour: "2-digit",
                                          minute: "2-digit",
                                        })}
                                      </span>
                                    )}
                                  </>
                                );
                              })()}
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-medium">
                                Marcación asistencia
                              </span>
                              <button
                                type="button"
                                className="text-xs text-primary hover:underline"
                                onClick={() => setMarcacionDetalleOpen(item.marcaciones ?? [])}
                              >
                                Ver detalle
                              </button>
                            </div>
                          ) : (item.checkInAt || item.checkOutAt) && (item.attendanceStatus === "asistio" || item.attendanceStatus === "reemplazo") ? (
                            <span className="inline-flex items-center gap-1.5 text-xs">
                              <span className="text-emerald-500">
                                {timeFromISO(item.checkInAt)}
                              </span>
                              <span className="text-muted-foreground">–</span>
                              <span className="text-amber-500">
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
                        <div className="rounded border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-200">
                          <p className="font-medium">Asistencia registrada ({asistenciaPreviaGuardiaName}).</p>
                          <div className="flex gap-2 mt-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs px-3 border-amber-500/50 text-amber-200 hover:bg-amber-500/20"
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
                              className="h-8 text-xs px-3 border-amber-500/50 text-amber-200 hover:bg-amber-500/20"
                              disabled={savingId === item.id || isLocked || !canExecuteOps}
                              onClick={() => {
                                const te2 = item.turnosExtra?.[0];
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
                              className={`h-8 text-xs px-3 ${
                                item.attendanceStatus === "asistio"
                                  ? "border-emerald-500 bg-emerald-500/25 text-emerald-300"
                                  : "border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300"
                              }`}
                              disabled={savingId === item.id || isLocked || item.attendanceStatus === "no_asistio"}
                              onClick={() => {
                                setAsistioModalItem(item);
                                setAsistioModalHours({
                                  checkIn: timeFromISO(item.checkInAt) || item.puesto.shiftStart,
                                  checkOut: timeFromISO(item.checkOutAt) || item.puesto.shiftEnd,
                                });
                              }}
                            >
                              Asistió
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className={`h-8 text-xs px-3 ${
                                item.attendanceStatus === "no_asistio"
                                  ? "border-rose-500 bg-rose-500/25 text-rose-300"
                                  : "border-rose-500/50 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300"
                              }`}
                              disabled={savingId === item.id || isLocked}
                              onClick={() =>
                                void patchAsistencia(
                                  item.id,
                                  { attendanceStatus: "no_asistio", actualGuardiaId: null },
                                  "No asistió"
                                )
                              }
                            >
                              No asistió
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
                              const te2 = item.turnosExtra?.[0];
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

                      {/* Resumen de horas + Editar horas (solo modal, sin entrada inline) */}
                      {item.plannedGuardiaId && (
                        <div className="md:col-span-5 mt-2 rounded-md border border-border/60 bg-muted/20 p-2.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-foreground">
                              Plan: {item.puesto.shiftStart}-{item.puesto.shiftEnd}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-foreground">
                              Trabajadas: {((item.workedMinutes ?? 0) / 60).toFixed(2)}h
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-foreground">
                              Jornada: {((item.plannedMinutes ?? 0) / 60).toFixed(2)}h
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                              (item.overtimeMinutes ?? 0) > 0 ? "bg-amber-500/20 text-amber-300" : "bg-muted text-muted-foreground"
                            }`}>
                              HE: {((item.overtimeMinutes ?? 0) / 60).toFixed(2)}h
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))
      )}

      {/* Modal detalle marcación */}
      <Dialog open={!!marcacionDetalleOpen} onOpenChange={(open) => !open && setMarcacionDetalleOpen(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Detalle de marcación digital</DialogTitle>
          </DialogHeader>
          {marcacionDetalleOpen && marcacionDetalleOpen.length > 0 && (
            <div className="space-y-4">
              {marcacionDetalleOpen.map((m) => (
                <div key={m.id} className="rounded border border-border/60 p-3 text-sm space-y-2">
                  <div className="font-medium">
                    {m.tipo === "entrada" ? "Entrada" : "Salida"}:{" "}
                    {new Date(m.timestamp).toLocaleString("es-CL")}
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>
                      <span className="font-medium">Hash:</span> <code className="text-[10px] break-all">{m.hashIntegridad}</code>
                    </p>
                    <p>
                      <span className="font-medium">Geo:</span>{" "}
                      {m.geoValidada ? `Válida (${m.geoDistanciaM}m)` : "Sin validar"}
                    </p>
                    {m.lat != null && m.lng != null && (
                      <p>
                        <span className="font-medium">Coordenadas:</span> {m.lat}, {m.lng}
                      </p>
                    )}
                    {m.ipAddress && (
                      <p>
                        <span className="font-medium">IP:</span> {m.ipAddress}
                      </p>
                    )}
                    {m.userAgent && (
                      <p>
                        <span className="font-medium">Dispositivo:</span>{" "}
                        <span className="break-all">{m.userAgent.slice(0, 80)}…</span>
                      </p>
                    )}
                  </div>
                </div>
              ))}
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
                        {g.persona.firstName} {g.persona.lastName}
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
    </div>
  );
}
