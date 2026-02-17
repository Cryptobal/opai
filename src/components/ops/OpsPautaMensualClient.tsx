"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/opai";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CalendarDays, FileDown, Loader2, MoreVertical, Trash2, ExternalLink, RefreshCw, AlertTriangle, ArrowLeft, Building2, Users, CheckCircle2, XCircle, Clock } from "lucide-react";

/* ── constants ─────────────────────────────────── */

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const WEEKDAY_SHORT: Record<number, string> = {
  0: "Dom", 1: "Lun", 2: "Mar", 3: "Mié", 4: "Jue", 5: "Vie", 6: "Sáb",
};

// Fallback patterns if no CPQ roles with pattern are configured
const FALLBACK_PATTERNS = [
  { code: "4x4", work: 4, off: 4, label: "4x4" },
  { code: "5x2", work: 5, off: 2, label: "5x2" },
  { code: "7x7", work: 7, off: 7, label: "7x7" },
  { code: "6x1", work: 6, off: 1, label: "6x1" },
  { code: "2x2", work: 2, off: 2, label: "2x2" },
  { code: "2x5", work: 2, off: 5, label: "2x5" },
];

const SHIFT_COLORS: Record<string, string> = {
  T: "bg-emerald-600/20 text-emerald-300 border-emerald-600/30",
  "-": "bg-zinc-700/30 text-zinc-500 border-zinc-600/20",
  V: "bg-green-800/30 text-green-400 border-green-600/30",
  L: "bg-yellow-800/30 text-yellow-400 border-yellow-600/30",
  P: "bg-orange-800/30 text-orange-400 border-orange-600/30",
  TE: "bg-rose-800/30 text-rose-400 border-rose-600/30",
};

/* ── types ─────────────────────────────────────── */

type ClientOption = {
  id: string;
  name: string;
  rut?: string | null;
  installations: { id: string; name: string }[];
};

type GuardiaOption = {
  id: string;
  code?: string | null;
  persona: { firstName: string; lastName: string; rut?: string | null };
};

type ShiftPatternOption = {
  id: string;
  name: string;
  patternWork: number | null;
  patternOff: number | null;
};

type PautaItem = {
  id: string;
  puestoId: string;
  slotNumber: number;
  date: string;
  shiftCode?: string | null;
  status: string;
  plannedGuardiaId?: string | null;
  puesto: {
    id: string;
    name: string;
    shiftStart: string;
    shiftEnd: string;
    weekdays?: string[];
    requiredGuards?: number;
  };
  plannedGuardia?: {
    id: string;
    code?: string | null;
    persona: { firstName: string; lastName: string; rut?: string | null };
  } | null;
};

type SerieInfo = {
  id: string;
  puestoId: string;
  slotNumber: number;
  guardiaId: string;
  patternCode: string;
  patternWork: number;
  patternOff: number;
  isRotativo?: boolean;
  rotatePuestoId?: string | null;
  rotateSlotNumber?: number | null;
  startShift?: string | null;
  linkedSerieId?: string | null;
  guardia?: {
    id: string;
    code?: string | null;
    persona: { firstName: string; lastName: string };
  } | null;
};

type PuestoInfo = {
  id: string;
  name: string;
  shiftStart: string;
  shiftEnd: string;
  requiredGuards: number;
};

type SlotAsignacion = {
  puestoId: string;
  slotNumber: number;
  guardiaId: string;
  guardia: {
    id: string;
    code?: string | null;
    persona: { firstName: string; lastName: string };
  };
};

type ExecutionState = "asistio" | "te" | "sin_cobertura" | "ppc";
type ExecutionCell = { state: ExecutionState; teStatus?: string };

interface OpsPautaMensualClientProps {
  initialClients: ClientOption[];
  guardias: GuardiaOption[];
  shiftPatterns?: ShiftPatternOption[];
}

/* ── helper ────────────────────────────────────── */

function toDateKey(date: Date | string): string {
  if (typeof date === "string") {
    return date.slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

function daysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (let d = 1; d <= last; d++) {
    days.push(new Date(Date.UTC(year, month - 1, d)));
  }
  return days;
}

/** Get the current week's days within a given month */
function getCurrentWeekDays(monthDays: Date[]): Date[] {
  const now = new Date();
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  // Find which day of the month is closest to today
  let anchorIdx = monthDays.findIndex(
    (d) => d.getTime() === todayUTC
  );
  if (anchorIdx === -1) {
    // Today is not in this month, default to first 7 days
    anchorIdx = 0;
  }

  // Find Monday of anchor's week
  const anchorDay = monthDays[anchorIdx];
  const weekday = anchorDay.getUTCDay(); // 0=Sun
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const startIdx = Math.max(0, anchorIdx + mondayOffset);
  const endIdx = Math.min(monthDays.length, startIdx + 7);

  return monthDays.slice(startIdx, endIdx);
}

/* ── main component ────────────────────────────── */

export function OpsPautaMensualClient({
  initialClients,
  guardias,
  shiftPatterns = [],
}: OpsPautaMensualClientProps) {
  const PATTERNS = useMemo(() => {
    if (shiftPatterns.length > 0) {
      return shiftPatterns
        .filter((sp) => sp.patternWork != null && sp.patternOff != null)
        .map((sp) => ({
          code: sp.name,
          work: sp.patternWork!,
          off: sp.patternOff!,
          label: sp.name,
        }));
    }
    return FALLBACK_PATTERNS;
  }, [shiftPatterns]);
  const searchParams = useSearchParams();
  const urlInstallationId = searchParams.get("installationId");

  // Resolve initial client/installation from URL param or defaults
  const initialIds = useMemo(() => {
    if (urlInstallationId) {
      for (const c of initialClients) {
        const inst = c.installations.find((i) => i.id === urlInstallationId);
        if (inst) return { clientId: c.id, installationId: inst.id };
      }
    }
    return {
      clientId: initialClients[0]?.id ?? "",
      installationId: initialClients[0]?.installations?.[0]?.id ?? "",
    };
  }, [initialClients, urlInstallationId]);

  const today = new Date();
  const [clients] = useState<ClientOption[]>(initialClients);
  const [clientId, setClientId] = useState<string>(initialIds.clientId);
  const [installationId, setInstallationId] = useState<string>(initialIds.installationId);
  const [month, setMonth] = useState<number>(today.getUTCMonth() + 1);
  const [year, setYear] = useState<number>(today.getUTCFullYear());
  const [overwrite, setOverwrite] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  // Overview vs detail view
  const [pageView, setPageView] = useState<"overview" | "detail">(() => {
    return urlInstallationId ? "detail" : "overview";
  });

  type InstallationSummary = {
    id: string;
    name: string;
    clientName: string;
    clientId: string | null;
    puestos: {
      id: string;
      name: string;
      shiftStart: string;
      shiftEnd: string;
      isNight: boolean;
      requiredGuards: number;
      assignedGuards: number;
    }[];
    totalPuestos: number;
    totalRequired: number;
    assignedSlots: number;
    vacantes: number;
    hasPauta: boolean;
    hasPainted: boolean;
    ppcCount: number;
    status: "sin_crear" | "sin_pintar" | "incompleta" | "completa";
  };
  const [overviewData, setOverviewData] = useState<InstallationSummary[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [items, setItems] = useState<PautaItem[]>([]);
  const [series, setSeries] = useState<SerieInfo[]>([]);
  const [slotAsignaciones, setSlotAsignaciones] = useState<SlotAsignacion[]>([]);
  const [executionByCell, setExecutionByCell] = useState<Record<string, ExecutionCell>>({});
  const [allPuestos, setAllPuestos] = useState<PuestoInfo[]>([]);

  // View mode: month on desktop (>=768px), week on mobile; sync on resize
  const [viewMode, setViewMode] = useState<"week" | "month">(() => {
    if (typeof window === "undefined") return "week";
    return window.matchMedia("(min-width: 768px)").matches ? "month" : "week";
  });

  // Mobile: sheet para ver nombre completo del puesto y enlace a Puestos
  const [puestoSheet, setPuestoSheet] = useState<{ puestoId: string; puestoName: string } | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const update = () => setViewMode(media.matches ? "month" : "week");
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  // Serie painting modal
  const [serieModalOpen, setSerieModalOpen] = useState(false);
  const [serieForm, setSerieForm] = useState({
    puestoId: "",
    slotNumber: 1,
    patternCode: "",
    startDate: "",
    startPosition: 1,
    isRotativo: false,
    rotatePuestoId: "",
    rotateSlotNumber: 1,
    startShift: "day" as "day" | "night",
  });
  const [serieSaving, setSerieSaving] = useState(false);

  // Eliminar serie/día modal (clic derecho en celda pintada)
  const [eliminarSerieModalOpen, setEliminarSerieModalOpen] = useState(false);
  const [eliminarSerieContext, setEliminarSerieContext] = useState<{
    puestoId: string;
    slotNumber: number;
    dateKey: string;
    puestoName: string;
  } | null>(null);
  const [eliminarSerieSaving, setEliminarSerieSaving] = useState(false);

  // Pintar opciones modal (clic izquierdo: pintar serie o solo el día)
  const [pintarOpcionesModalOpen, setPintarOpcionesModalOpen] = useState(false);
  const [pintarOpcionesContext, setPintarOpcionesContext] = useState<{
    puestoId: string;
    slotNumber: number;
    dateKey: string;
    puestoName: string;
    guardiaId?: string;
  } | null>(null);
  const [pintarSoloDiaSaving, setPintarSoloDiaSaving] = useState(false);

  // Regenerar pauta (sobrescribir) — modal de confirmación
  const [regenerarConfirmOpen, setRegenerarConfirmOpen] = useState(false);

  // Long-press en móvil: emular clic derecho → eliminar (evitar que el tap abra pintar)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTargetRef = useRef<{ puestoId: string; slotNumber: number; dateKey: string } | null>(null);

  // Client → installations
  const currentClient = useMemo(
    () => clients.find((c) => c.id === clientId),
    [clients, clientId]
  );
  const installations = currentClient?.installations ?? [];

  useEffect(() => {
    setInstallationId(installations[0]?.id ?? "");
  }, [clientId, installations]);

  // Days of the month
  const monthDays = useMemo(() => daysInMonth(year, month), [year, month]);

  // Estado vacío: si la instalación no tiene puestos
  const [emptyReason, setEmptyReason] = useState<"no_puestos" | "generated_empty" | null>(null);

  // Fetch pauta (y auto-generar si hay puestos pero no hay pauta)
  const fetchPauta = useCallback(async () => {
    if (!installationId) return;
    setLoading(true);
    setEmptyReason(null);
    try {
      const res = await fetch(
        `/api/ops/pauta-mensual?installationId=${installationId}&month=${month}&year=${year}`,
        { cache: "no-store" }
      );
      const payload = await res.json();
      if (!res.ok || !payload.success)
        throw new Error(payload.error || "Error cargando pauta");

      const fetchedItems = payload.data.items as PautaItem[];
      if (payload.data.allPuestos) setAllPuestos(payload.data.allPuestos as PuestoInfo[]);

      if (fetchedItems.length === 0) {
        // No hay pauta → intentar auto-generar silenciosamente
        try {
          const genRes = await fetch("/api/ops/pauta-mensual/generar", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ installationId, month, year, overwrite: false }),
          });
          const genPayload = await genRes.json();

          if (genRes.ok && genPayload.success && genPayload.data?.created > 0) {
            // Auto-generación exitosa → re-fetch
            const res2 = await fetch(
              `/api/ops/pauta-mensual?installationId=${installationId}&month=${month}&year=${year}`,
              { cache: "no-store" }
            );
            const payload2 = await res2.json();
            if (res2.ok && payload2.success) {
              setItems(payload2.data.items as PautaItem[]);
              setSeries(payload2.data.series as SerieInfo[]);
              if (payload2.data.asignaciones) setSlotAsignaciones(payload2.data.asignaciones as SlotAsignacion[]);
              setExecutionByCell((payload2.data.executionByCell || {}) as Record<string, ExecutionCell>);
              if (payload2.data.allPuestos) setAllPuestos(payload2.data.allPuestos as PuestoInfo[]);
              setLoading(false);
              return;
            }
          }

          // Si generar falló o creó 0 filas → determinar razón
          if (!genRes.ok && genPayload.error?.includes("puestos")) {
            setEmptyReason("no_puestos");
          } else if (genPayload.data?.created === 0) {
            setEmptyReason("generated_empty");
          } else {
            setEmptyReason("no_puestos");
          }
        } catch {
          setEmptyReason("no_puestos");
        }

        setItems([]);
        setSeries([]);
        setSlotAsignaciones([]);
        setExecutionByCell({});
      } else {
        setItems(fetchedItems);
        setSeries(payload.data.series as SerieInfo[]);
        if (payload.data.asignaciones) {
          setSlotAsignaciones(payload.data.asignaciones as SlotAsignacion[]);
        }
        setExecutionByCell((payload.data.executionByCell || {}) as Record<string, ExecutionCell>);
      }
    } catch (error) {
      console.error(error);
      toast.error("No se pudo cargar la pauta mensual");
    } finally {
      setLoading(false);
    }
  }, [installationId, month, year]);

  useEffect(() => {
    if (pageView === "detail") void fetchPauta();
  }, [fetchPauta, pageView]);

  // Fetch overview data
  const fetchOverview = useCallback(async () => {
    setOverviewLoading(true);
    try {
      const res = await fetch(
        `/api/ops/pauta-mensual/resumen?month=${month}&year=${year}`,
        { cache: "no-store" }
      );
      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload.error || "Error");
      setOverviewData(payload.data.installations as InstallationSummary[]);
    } catch (err) {
      console.error(err);
      toast.error("No se pudo cargar el resumen de instalaciones");
    } finally {
      setOverviewLoading(false);
    }
  }, [month, year]);

  useEffect(() => {
    if (pageView === "overview") void fetchOverview();
  }, [fetchOverview, pageView]);

  // Navigate to a specific installation from the overview
  const goToInstallation = (instId: string) => {
    // Find the client for this installation
    for (const c of clients) {
      const inst = c.installations.find((i) => i.id === instId);
      if (inst) {
        setClientId(c.id);
        setInstallationId(inst.id);
        setPageView("detail");
        return;
      }
    }
  };

  // Build matrix: group by puestoId+slotNumber → map of dateKey → PautaItem
  type RowKey = string; // `${puestoId}|${slotNumber}`
  const matrix = useMemo(() => {
    const rows = new Map<
      RowKey,
      {
        puestoId: string;
        puestoName: string;
        shiftStart: string;
        shiftEnd: string;
        slotNumber: number;
        requiredGuards: number;
        cells: Map<string, PautaItem>;
        guardiaId?: string;
        guardiaName?: string;
        patternCode?: string;
        isRotativo?: boolean;
      }
    >();

    for (const item of items) {
      const key: RowKey = `${item.puestoId}|${item.slotNumber}`;
      if (!rows.has(key)) {
        rows.set(key, {
          puestoId: item.puestoId,
          puestoName: item.puesto.name,
          shiftStart: item.puesto.shiftStart,
          shiftEnd: item.puesto.shiftEnd,
          slotNumber: item.slotNumber,
          requiredGuards: item.puesto.requiredGuards ?? 1,
          cells: new Map(),
        });
      }
      const row = rows.get(key)!;
      row.cells.set(toDateKey(item.date), item);
    }

    // Enrich with serie info (pattern code + rotativo)
    for (const s of series) {
      const key: RowKey = `${s.puestoId}|${s.slotNumber}`;
      const row = rows.get(key);
      if (row) {
        row.patternCode = s.patternCode;
        row.isRotativo = s.isRotativo ?? false;
      }
    }

    // Guard name comes ONLY from active assignments (source of truth)
    for (const a of slotAsignaciones) {
      const key: RowKey = `${a.puestoId}|${a.slotNumber}`;
      const row = rows.get(key);
      if (row && a.guardia) {
        row.guardiaId = a.guardiaId;
        row.guardiaName = `${a.guardia.persona.firstName} ${a.guardia.persona.lastName}`;
      }
    }

    // Sort rows: group by puestoId, then slotNumber
    return Array.from(rows.values()).sort((a, b) => {
      if (a.puestoName !== b.puestoName) return a.puestoName.localeCompare(b.puestoName);
      return a.slotNumber - b.slotNumber;
    });
  }, [items, series, slotAsignaciones]);

  // Generate pauta (forceOverwrite: true para regenerar/sobrescribir)
  const handleGenerate = async (forceOverwrite?: boolean) => {
    if (!installationId) {
      toast.error("Selecciona una instalación");
      return;
    }
    const useOverwrite = forceOverwrite ?? overwrite;
    setLoading(true);
    try {
      const res = await fetch("/api/ops/pauta-mensual/generar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ installationId, month, year, overwrite: useOverwrite }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success)
        throw new Error(payload.error || "Error generando pauta");
      toast.success(`Pauta generada (${payload.data.created} filas)`);
      await fetchPauta();
    } catch (error) {
      console.error(error);
      toast.error("No se pudo generar la pauta mensual");
    } finally {
      setLoading(false);
    }
  };

  const handleExportPdf = () => {
    if (!installationId) {
      toast.error("Selecciona una instalación");
      return;
    }
    const params = new URLSearchParams({
      installationId,
      month: String(month),
      year: String(year),
    });
    window.open(`/api/ops/pauta-mensual/export-pdf?${params.toString()}`, "_blank");
  };

  const handleExportExcel = () => {
    if (!installationId) {
      toast.error("Selecciona una instalación");
      return;
    }
    const params = new URLSearchParams({
      installationId,
      month: String(month),
      year: String(year),
    });
    window.open(`/api/ops/pauta-mensual/export-excel?${params.toString()}`, "_blank");
  };

  const handleRegenerar = async () => {
    setRegenerarConfirmOpen(false);
    await handleGenerate(true);
  };

  // Determine if a puesto is "night" based on its shiftStart hour
  const isPuestoNight = (shiftStart: string) => {
    const h = parseInt(shiftStart.split(":")[0], 10);
    return h >= 18 || h < 6;
  };

  // Get the "opposite" puestos (if current is day, show night puestos and vice versa)
  const getOppositePuestos = (currentPuestoId: string) => {
    const currentPuesto = allPuestos.find((p) => p.id === currentPuestoId);
    if (!currentPuesto) return [];
    const currentIsNight = isPuestoNight(currentPuesto.shiftStart);
    return allPuestos.filter((p) => p.id !== currentPuestoId && isPuestoNight(p.shiftStart) !== currentIsNight);
  };

  // Open serie modal
  const openSerieModal = (puestoId: string, slotNumber: number, dateKey: string) => {
    const currentPuesto = allPuestos.find((p) => p.id === puestoId);
    const currentIsNight = currentPuesto ? isPuestoNight(currentPuesto.shiftStart) : false;
    setSerieForm({
      puestoId,
      slotNumber,
      patternCode: PATTERNS[0]?.code ?? "4x4",
      startDate: dateKey,
      startPosition: 1,
      isRotativo: false,
      rotatePuestoId: "",
      rotateSlotNumber: 1,
      startShift: currentIsNight ? "night" : "day",
    });
    setSerieModalOpen(true);
  };

  // Paint serie
  const handlePaintSerie = async () => {
    const pattern = PATTERNS.find((p) => p.code === serieForm.patternCode);
    if (!pattern) {
      toast.error("Selecciona un patrón de turno");
      return;
    }

    if (serieForm.isRotativo && !serieForm.rotatePuestoId) {
      toast.error("Selecciona el puesto par para el turno rotativo");
      return;
    }

    setSerieSaving(true);
    try {
      const payload_body: Record<string, unknown> = {
        puestoId: serieForm.puestoId,
        slotNumber: serieForm.slotNumber,
        patternCode: pattern.code,
        patternWork: pattern.work,
        patternOff: pattern.off,
        startDate: serieForm.startDate,
        startPosition: serieForm.startPosition,
        month,
        year,
        isRotativo: serieForm.isRotativo,
      };

      if (serieForm.isRotativo) {
        payload_body.rotatePuestoId = serieForm.rotatePuestoId;
        payload_body.rotateSlotNumber = serieForm.rotateSlotNumber;
        payload_body.startShift = serieForm.startShift;
      }

      const res = await fetch("/api/ops/pauta-mensual/pintar-serie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload_body),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success)
        throw new Error(payload.error || "Error pintando serie");
      toast.success(
        serieForm.isRotativo
          ? `Serie rotativa pintada (${payload.data.updated} días en ambos puestos)`
          : `Serie pintada (${payload.data.updated} días)`
      );
      setSerieModalOpen(false);
      await fetchPauta();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "No se pudo pintar la serie";
      console.error(error);
      toast.error(msg);
    } finally {
      setSerieSaving(false);
    }
  };

  // Quick status toggle on cell click (for V, L, P, TE)
  const handleCellStatusChange = async (item: PautaItem, newCode: string) => {
    try {
      await fetch("/api/ops/pauta-mensual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          puestoId: item.puestoId,
          slotNumber: item.slotNumber,
          date: toDateKey(item.date),
          plannedGuardiaId: ["V", "L", "P"].includes(newCode) ? null : item.plannedGuardiaId,
          shiftCode: newCode,
          status: "planificado",
        }),
      });
      await fetchPauta();
    } catch {
      toast.error("No se pudo actualizar la celda");
    }
  };

  const openPintarOpcionesModal = (ctx: {
    puestoId: string;
    slotNumber: number;
    dateKey: string;
    puestoName: string;
    guardiaId?: string;
  }) => {
    setPintarOpcionesContext(ctx);
    setPintarOpcionesModalOpen(true);
  };

  const handlePintarSoloDia = async (shiftCode: "T" | "-") => {
    if (!pintarOpcionesContext) return;
    setPintarSoloDiaSaving(true);
    try {
      await fetch("/api/ops/pauta-mensual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          puestoId: pintarOpcionesContext.puestoId,
          slotNumber: pintarOpcionesContext.slotNumber,
          date: pintarOpcionesContext.dateKey,
          shiftCode,
          plannedGuardiaId: shiftCode === "T" ? pintarOpcionesContext.guardiaId ?? null : null,
          status: "planificado",
        }),
      });
      toast.success(shiftCode === "T" ? "Día marcado como trabajo" : "Día marcado como libre");
      setPintarOpcionesModalOpen(false);
      setPintarOpcionesContext(null);
      await fetchPauta();
    } catch {
      toast.error("No se pudo actualizar el día");
    } finally {
      setPintarSoloDiaSaving(false);
    }
  };

  const openEliminarSerieModal = (ctx: { puestoId: string; slotNumber: number; dateKey: string; puestoName: string }) => {
    setEliminarSerieContext(ctx);
    setEliminarSerieModalOpen(true);
  };

  const handleEliminarSerie = async (mode: "from_forward" | "single_day") => {
    if (!eliminarSerieContext) return;
    setEliminarSerieSaving(true);
    try {
      const res = await fetch("/api/ops/pauta-mensual/eliminar-serie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          puestoId: eliminarSerieContext.puestoId,
          slotNumber: eliminarSerieContext.slotNumber,
          date: eliminarSerieContext.dateKey,
          mode,
        }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        toast.error(payload.error || "No se pudo eliminar");
        return;
      }
      toast.success(payload.message ?? "Listo");
      setEliminarSerieModalOpen(false);
      setEliminarSerieContext(null);
      await fetchPauta();
    } catch {
      toast.error("No se pudo eliminar la serie");
    } finally {
      setEliminarSerieSaving(false);
    }
  };

  // Visible days based on view mode
  const visibleDays = useMemo(() => {
    if (viewMode === "week") return getCurrentWeekDays(monthDays);
    return monthDays;
  }, [viewMode, monthDays]);

  /* ── render ── */

  // ── OVERVIEW VIEW ──
  if (pageView === "overview") {
    const STATUS_CONFIG = {
      completa: { label: "Completa", icon: CheckCircle2, cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
      incompleta: { label: "Incompleta", icon: AlertTriangle, cls: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
      sin_pintar: { label: "Sin pintar", icon: Clock, cls: "text-blue-400 bg-blue-500/10 border-blue-500/30" },
      sin_crear: { label: "Sin crear", icon: XCircle, cls: "text-zinc-500 bg-zinc-500/10 border-zinc-500/30" },
    };

    return (
      <div className="space-y-4">
        {/* Month/Year selector for overview */}
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
              <div className="flex gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Mes</Label>
                  <select
                    className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                    value={month}
                    onChange={(e) => setMonth(Number(e.target.value))}
                  >
                    {MESES.map((nombre, idx) => (
                      <option key={idx} value={idx + 1}>{nombre}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Año</Label>
                  <Input
                    type="number"
                    min={2020}
                    max={2100}
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value) || year)}
                    className="h-8 text-sm w-24"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
                {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                  <span key={key} className="flex items-center gap-1">
                    <cfg.icon className={`h-3 w-3 ${cfg.cls.split(" ")[0]}`} />
                    {cfg.label}
                  </span>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Installation cards */}
        {overviewLoading ? (
          <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Cargando resumen…
          </div>
        ) : overviewData.length === 0 ? (
          <Card>
            <CardContent className="pt-6 pb-6">
              <EmptyState
                icon={<Building2 className="h-8 w-8" />}
                title="Sin instalaciones"
                description="No hay instalaciones activas configuradas."
                compact
              />
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {overviewData.map((inst) => {
              const cfg = STATUS_CONFIG[inst.status];
              const StatusIcon = cfg.icon;
              return (
                <Card
                  key={inst.id}
                  className="cursor-pointer hover:border-primary/40 transition-colors group"
                  onClick={() => goToInstallation(inst.id)}
                >
                  <CardContent className="pt-4 pb-3 space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                          {inst.name}
                        </h3>
                        <p className="text-[10px] text-muted-foreground truncate">{inst.clientName}</p>
                      </div>
                      <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium border ${cfg.cls}`}>
                        <StatusIcon className="h-3 w-3" />
                        {cfg.label}
                      </span>
                    </div>

                    {/* Stats row */}
                    <div className="flex items-center gap-4 text-xs">
                      <div className="flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                        <span><span className="font-medium text-foreground">{inst.totalPuestos}</span> <span className="text-muted-foreground">puestos</span></span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>
                          <span className="font-medium text-foreground">{inst.assignedSlots}</span>
                          <span className="text-muted-foreground">/{inst.totalRequired}</span>
                          <span className="text-muted-foreground"> guardias</span>
                        </span>
                      </div>
                      {inst.vacantes > 0 && (
                        <span className="text-[10px] font-medium text-amber-400">
                          {inst.vacantes} vacante{inst.vacantes > 1 ? "s" : ""}
                        </span>
                      )}
                      {inst.ppcCount > 0 && (
                        <span className="text-[10px] font-medium text-rose-400">
                          PPC: {inst.ppcCount}
                        </span>
                      )}
                    </div>

                    {/* Puestos mini-table */}
                    {inst.puestos.length > 0 && (
                      <div className="rounded border border-border/50 overflow-hidden">
                        <table className="w-full text-[10px]">
                          <thead>
                            <tr className="bg-muted/20 text-muted-foreground">
                              <th className="text-left px-2 py-1 font-medium">Puesto</th>
                              <th className="text-center px-1 py-1 font-medium w-10">Turno</th>
                              <th className="text-center px-1 py-1 font-medium w-16">Guardias</th>
                            </tr>
                          </thead>
                          <tbody>
                            {inst.puestos.map((p) => (
                              <tr key={p.id} className="border-t border-border/30">
                                <td className="px-2 py-1 text-foreground truncate max-w-[160px]">{p.name}</td>
                                <td className="text-center px-1 py-1">
                                  <span className={`inline-block rounded-full px-1.5 py-px text-[8px] font-semibold border ${
                                    p.isNight
                                      ? "bg-indigo-500/15 text-indigo-300 border-indigo-500/30"
                                      : "bg-amber-500/15 text-amber-300 border-amber-500/30"
                                  }`}>
                                    {p.isNight ? "N" : "D"}
                                  </span>
                                </td>
                                <td className="text-center px-1 py-1">
                                  <span className={`font-medium ${p.assignedGuards >= p.requiredGuards ? "text-emerald-400" : "text-amber-400"}`}>
                                    {p.assignedGuards}
                                  </span>
                                  <span className="text-muted-foreground">/{p.requiredGuards}</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── DETAIL VIEW ──
  return (
    <div className="space-y-3">
      {/* Controls — filtros siempre visibles, layout compacto */}
      <Card>
        <CardContent className="pt-4 pb-3 space-y-3">
          <div className="flex flex-col gap-3">
            {/* Back button + Filtros */}
            <div className="flex items-center gap-2 mb-1">
              <button
                type="button"
                onClick={() => setPageView("overview")}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Volver al resumen
              </button>
            </div>
            {/* Filtros: Cliente + Instalación (fila 1), Mes + Año (fila 2 en móvil) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              <div className="space-y-1 col-span-2 sm:col-span-1">
                <Label className="text-xs">Cliente</Label>
                <select
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1 col-span-2 sm:col-span-1">
                <Label className="text-xs">Instalación</Label>
                <select
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={installationId}
                  onChange={(e) => setInstallationId(e.target.value)}
                >
                  {installations.map((inst) => (
                    <option key={inst.id} value={inst.id}>{inst.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Mes</Label>
                <select
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={month}
                  onChange={(e) => setMonth(Number(e.target.value))}
                >
                  {MESES.map((nombre, idx) => (
                    <option key={idx} value={idx + 1}>{nombre}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Año</Label>
                <Input
                  type="number"
                  min={2020}
                  max={2100}
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value) || year)}
                  className="h-8 text-sm"
                />
              </div>
            </div>
            {/* Status + Exportar + Regenerar */}
            <div className="flex items-center gap-2 flex-wrap">
              {loading ? (
                <div className="flex items-center gap-2 text-xs text-emerald-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Cargando…
                </div>
              ) : items.length > 0 ? (
                <div className="flex items-center gap-1 text-xs text-emerald-400">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {items.length} registros
                </div>
              ) : null}
              <div className="flex items-center gap-1.5 ml-auto">
                <Button variant="outline" onClick={handleExportPdf} disabled={loading || items.length === 0} size="sm" className="text-[10px] h-7 px-2">
                  <FileDown className="h-3 w-3 sm:mr-1" />
                  <span className="hidden sm:inline">PDF</span>
                </Button>
                <Button variant="outline" onClick={handleExportExcel} disabled={loading || items.length === 0} size="sm" className="text-[10px] h-7 px-2">
                  <FileDown className="h-3 w-3 sm:mr-1" />
                  <span className="hidden sm:inline">Excel</span>
                </Button>
                {items.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground">
                        <MoreVertical className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setRegenerarConfirmOpen(true)}>
                        <RefreshCw className="mr-2 h-3.5 w-3.5" />
                        Regenerar pauta
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          </div>

          {/* View mode toggle: Semana / Mes */}
          {matrix.length > 0 && (
            <div className="flex items-center gap-1 rounded-lg border border-border p-0.5 w-fit">
              <button
                type="button"
                onClick={() => setViewMode("week")}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === "week"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Semana
              </button>
              <button
                type="button"
                onClick={() => setViewMode("month")}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === "month"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Mes completo
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Matrix */}
      {!loading && matrix.length === 0 ? (
        <Card>
          <CardContent className="pt-4 pb-3">
            {emptyReason === "no_puestos" ? (
              <EmptyState
                icon={<CalendarDays className="h-8 w-8" />}
                title="Sin puestos configurados"
                description={`${installations.find((i) => i.id === installationId)?.name ?? "Esta instalación"} no tiene puestos activos. Configura puestos desde el CRM o desde Puestos operativos.`}
                action={
                  installationId && (
                    <div className="flex items-center gap-2 mt-2">
                      <Link href={`/crm/installations/${installationId}`}>
                        <Button variant="outline" size="sm">
                          <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                          Configurar en CRM
                        </Button>
                      </Link>
                      <Link href="/crm/installations">
                        <Button variant="outline" size="sm">
                          Ir a Instalaciones
                        </Button>
                      </Link>
                    </div>
                  )
                }
                compact
              />
            ) : (
              <EmptyState
                icon={<CalendarDays className="h-8 w-8" />}
                title="Sin pauta"
                description={
                  installationId
                    ? `No se pudo generar pauta para ${installations.find((i) => i.id === installationId)?.name ?? "esta instalación"} en ${MESES[month - 1]} ${year}. Verifica que los puestos tengan días de la semana configurados.`
                    : "Selecciona un cliente e instalación."
                }
                compact
              />
            )}
          </CardContent>
        </Card>
      ) : (
      <Card>
        <CardContent className="pt-4 pb-3">
          {loading && matrix.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Cargando pauta…
            </div>
          ) : (
            <div className="overflow-hidden sm:overflow-x-auto -mx-4 px-4 sm:-mx-6 sm:px-6">
              <table className="w-full text-xs border-collapse table-fixed sm:table-auto">
                <colgroup>
                  <col style={{ width: "22%" }} />
                  {visibleDays.map((d, i) => (
                    <col key={`${d.getUTCDate()}-${i}`} />
                  ))}
                </colgroup>
                <thead>
                  <tr className="border-b border-border">
                    <th className="sticky left-0 z-10 bg-card text-left pl-1 pr-2 py-2 w-[22%] sm:min-w-[200px] sm:w-auto shadow-[4px_0_6px_-2px_rgba(0,0,0,0.15)]">
                      <span className="hidden sm:inline">Puesto / Guardia</span>
                      <span className="sm:hidden text-xs">Puesto</span>
                    </th>
                    {visibleDays.map((d) => {
                      const dayNum = d.getUTCDate();
                      const dayName = WEEKDAY_SHORT[d.getUTCDay()];
                      const isWeekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
                      const isToday = toDateKey(d) === toDateKey(new Date());
                      return (
                        <th
                          key={dayNum}
                          className={`text-center px-0.5 py-1 ${
                            isToday ? "text-primary" : isWeekend ? "text-amber-400" : "text-muted-foreground"
                          }`}
                        >
                          <div className="text-[11px] sm:text-[10px] leading-tight">{dayName}</div>
                          <div className={`font-semibold text-sm sm:text-xs ${isToday ? "bg-primary text-primary-foreground rounded-full w-6 h-6 inline-flex items-center justify-center mx-auto" : ""}`}>
                            {dayNum}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {matrix.map((row, rowIdx) => {
                    const isFirstSlot = rowIdx === 0 || matrix[rowIdx - 1]?.puestoId !== row.puestoId;
                    return (
                      <tr
                        key={`${row.puestoId}-${row.slotNumber}`}
                        className={`${isFirstSlot ? "border-t border-border" : ""} hover:bg-muted/10`}
                      >
                        {/* Row header: alineado a la izquierda, sombra para no ver días detrás; en móvil nombre clicable → Sheet */}
                        <td className="sticky left-0 z-10 bg-card pl-1 pr-2 py-1 sm:py-1.5 align-top w-[22%] sm:w-auto shadow-[4px_0_6px_-2px_rgba(0,0,0,0.15)]">
                          {isFirstSlot && (
                            <div className="font-medium text-foreground leading-tight flex items-center gap-1 text-xs sm:text-sm min-w-0">
                              <span className="truncate min-w-0 flex-1 sm:flex-none sm:truncate sm:max-w-[calc(100%-2rem)]">
                                <button
                                  type="button"
                                  onClick={() => setPuestoSheet({ puestoId: row.puestoId, puestoName: row.puestoName })}
                                  className="sm:hidden text-left w-full truncate block hover:text-primary hover:underline underline-offset-2 transition-colors"
                                >
                                  {row.puestoName}
                                </button>
                                <span className="hidden sm:inline truncate">{row.puestoName}</span>
                              </span>
                              {(() => {
                                const h = parseInt(row.shiftStart.split(":")[0], 10);
                                const night = h >= 18 || h < 6;
                                return (
                                  <span className={`shrink-0 rounded-full px-1 py-0 text-[9px] sm:text-[8px] font-semibold border ${
                                    night
                                      ? "bg-indigo-500/15 text-indigo-300 border-indigo-500/30"
                                      : "bg-amber-500/15 text-amber-300 border-amber-500/30"
                                  }`}>
                                    {night ? "N" : "D"}
                                  </span>
                                );
                              })()}
                            </div>
                          )}
                          {isFirstSlot && (
                            <div className="text-[11px] sm:text-[10px] text-muted-foreground hidden sm:block">
                              {row.shiftStart}-{row.shiftEnd}
                            </div>
                          )}
                          <div className="text-[11px] sm:text-[10px] mt-0.5 flex items-center gap-1">
                            <span className="text-muted-foreground font-mono">
                              S{row.slotNumber}
                            </span>
                            {row.guardiaName ? (
                              row.guardiaId ? (
                                <Link
                                  href={`/personas/guardias/${row.guardiaId}`}
                                  className="text-foreground font-medium truncate max-w-[60px] sm:max-w-[120px] hover:text-primary hover:underline underline-offset-2 transition-colors"
                                >
                                  {row.guardiaName}
                                </Link>
                              ) : (
                                <span className="text-foreground font-medium truncate max-w-[60px] sm:max-w-[120px]">
                                  {row.guardiaName}
                                </span>
                              )
                            ) : (
                              <span className="text-amber-400/60 italic text-[10px]">sin asignar</span>
                            )}
                            {row.patternCode && (
                              <span className="text-primary/50 text-[10px] hidden sm:inline">
                                {row.patternCode}
                                {row.isRotativo && (
                                  <span className="ml-0.5 inline-flex items-center rounded px-1 py-px text-[8px] font-semibold bg-violet-500/20 text-violet-300 border border-violet-500/30">
                                    rot
                                  </span>
                                )}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Day cells */}
                        {visibleDays.map((d) => {
                          const dateKey = toDateKey(d);
                          const cell = row.cells.get(dateKey);
                          const code = cell?.shiftCode ?? "";
                          const isEmpty = !code;
                          const colorClass = SHIFT_COLORS[code] ?? "";
                          const execution = executionByCell[`${row.puestoId}|${row.slotNumber}|${dateKey}`];
                          const executionBadge =
                            execution?.state === "te"
                              ? "TE"
                              : execution?.state === "asistio"
                                ? "✓"
                                : execution?.state === "sin_cobertura"
                                  ? "✗"
                                  : null;
                          const executionBadgeClass =
                            execution?.state === "te"
                              ? "bg-rose-600 text-rose-50"
                              : execution?.state === "asistio"
                                ? "bg-emerald-600 text-emerald-50"
                                : execution?.state === "sin_cobertura"
                                  ? "bg-amber-500 text-amber-950"
                                  : "";

                          return (
                            <td
                              key={dateKey}
                              className="text-center px-0.5 py-0.5"
                            >
                              {cell ? (
                                <div
                                  className={`relative inline-flex items-center justify-center w-7 h-7 min-w-7 sm:w-7 sm:h-6 rounded text-[10px] sm:text-[10px] font-medium border cursor-pointer transition-colors active:scale-95 ${
                                    isEmpty
                                      ? "border-dashed border-border/40 text-muted-foreground/30 hover:border-primary/50 hover:text-primary/50"
                                      : colorClass
                                  }`}
                                  title={
                                    cell.plannedGuardia
                                      ? `${cell.plannedGuardia.persona.firstName} ${cell.plannedGuardia.persona.lastName}`
                                      : "Sin asignar"
                                  }
                                  onPointerDown={() => {
                                    longPressTargetRef.current = {
                                      puestoId: row.puestoId,
                                      slotNumber: row.slotNumber,
                                      dateKey,
                                    };
                                    longPressTimerRef.current = setTimeout(() => {
                                      longPressTimerRef.current = null;
                                      openEliminarSerieModal({
                                        puestoId: row.puestoId,
                                        slotNumber: row.slotNumber,
                                        dateKey,
                                        puestoName: row.puestoName,
                                      });
                                    }, 450);
                                  }}
                                  onPointerUp={() => {
                                    if (longPressTimerRef.current) {
                                      clearTimeout(longPressTimerRef.current);
                                      longPressTimerRef.current = null;
                                      longPressTargetRef.current = null;
                                    }
                                  }}
                                  onPointerLeave={() => {
                                    if (longPressTimerRef.current) {
                                      clearTimeout(longPressTimerRef.current);
                                      longPressTimerRef.current = null;
                                      longPressTargetRef.current = null;
                                    }
                                  }}
                                  onClick={() => {
                                    const wasLongPress =
                                      longPressTargetRef.current &&
                                      longPressTargetRef.current.puestoId === row.puestoId &&
                                      longPressTargetRef.current.slotNumber === row.slotNumber &&
                                      longPressTargetRef.current.dateKey === dateKey;
                                    if (wasLongPress) {
                                      longPressTargetRef.current = null;
                                      return;
                                    }
                                    openPintarOpcionesModal({
                                      puestoId: row.puestoId,
                                      slotNumber: row.slotNumber,
                                      dateKey,
                                      puestoName: row.puestoName,
                                      guardiaId: row.guardiaId,
                                    });
                                  }}
                                  onContextMenu={(e) => {
                                    e.preventDefault();
                                    if (!cell) return;
                                    openEliminarSerieModal({
                                      puestoId: row.puestoId,
                                      slotNumber: row.slotNumber,
                                      dateKey,
                                      puestoName: row.puestoName,
                                    });
                                  }}
                                >
                                  {code || "·"}
                                  {executionBadge ? (
                                    <span
                                      className={`absolute -bottom-1 -right-1 rounded px-0.5 py-[1px] text-[9px] sm:text-[8px] leading-none font-semibold ${executionBadgeClass}`}
                                    >
                                      {executionBadge}
                                    </span>
                                  ) : null}
                                </div>
                              ) : (
                                <div
                                  className="inline-flex items-center justify-center w-9 h-8 sm:w-7 sm:h-6 rounded text-xs sm:text-[10px] border border-dashed border-border/20 text-muted-foreground/20 cursor-pointer hover:border-primary/40 active:scale-95"
                                  onClick={() =>
                                    openPintarOpcionesModal({
                                      puestoId: row.puestoId,
                                      slotNumber: row.slotNumber,
                                      dateKey,
                                      puestoName: row.puestoName,
                                      guardiaId: row.guardiaId,
                                    })
                                  }
                                >
                                  ·
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Legend — serie (T, -, V, L, P) + segunda capa (asistencia: ✓, TE, ✗) */}
              <div className="mt-3 flex flex-wrap gap-2 sm:gap-3 text-[11px] sm:text-[10px] text-muted-foreground border-t border-border pt-3">
                {[
                  { code: "T", label: "Trabaja", cls: "bg-emerald-600/20 border-emerald-600/30" },
                  { code: "-", label: "Descanso", cls: "bg-zinc-700/30 border-zinc-600/20" },
                  { code: "V", label: "Vacaciones", cls: "bg-green-800/30 border-green-600/30" },
                  { code: "L", label: "Licencia", cls: "bg-yellow-800/30 border-yellow-600/30" },
                  { code: "P", label: "Permiso", cls: "bg-orange-800/30 border-orange-600/30" },
                ].map((l) => (
                  <span key={l.code} className="flex items-center gap-1">
                    <span className={`inline-block w-4 h-3 rounded border ${l.cls}`} />
                    <span className="hidden sm:inline">{l.code} = {l.label}</span>
                    <span className="sm:hidden">{l.code}</span>
                  </span>
                ))}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] sm:text-[10px] text-muted-foreground">
                <span>Segunda capa (asistencia):</span>
                <span className="flex items-center gap-1"><span className="rounded px-0.5 py-px bg-emerald-600 text-emerald-50 text-[9px] font-semibold">✓</span> Asistió</span>
                <span className="flex items-center gap-1"><span className="rounded px-0.5 py-px bg-rose-600 text-rose-50 text-[9px] font-semibold">TE</span> Turno extra</span>
                <span className="flex items-center gap-1"><span className="rounded px-0.5 py-px bg-amber-500 text-amber-950 text-[9px] font-semibold">✗</span> Sin cobertura</span>
              </div>
              <div className="mt-1.5 text-[11px] sm:text-[10px] text-muted-foreground/50">
                <span className="hidden sm:inline">Click izquierdo = pintar · Click derecho / mantener presionado = eliminar</span>
                <span className="sm:hidden">Toca = pintar · Mantén presionado = eliminar</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* Serie painting modal */}
      <Dialog open={serieModalOpen} onOpenChange={setSerieModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Pintar serie de turnos</DialogTitle>
            <DialogDescription>
              Asigna un guardia y define la rotación desde el día seleccionado.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Patrón de turno</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={serieForm.patternCode}
                onChange={(e) => setSerieForm((p) => ({ ...p, patternCode: e.target.value, startPosition: 1 }))}
              >
                {PATTERNS.map((pat) => (
                  <option key={pat.code} value={pat.code}>
                    {pat.label} ({pat.work} trabajo, {pat.off} descanso)
                  </option>
                ))}
              </select>
            </div>

            {/* Cycle selector: click to pick start day */}
            {(() => {
              const pattern = PATTERNS.find((p) => p.code === serieForm.patternCode);
              if (!pattern) return null;
              const cycleLength = pattern.work + pattern.off;
              return (
                <div className="rounded-md border border-border p-3">
                  <p className="text-xs font-medium mb-1">
                    Selecciona el día del ciclo donde inicia el guardia
                  </p>
                  <p className="text-[10px] text-muted-foreground mb-3">
                    Pincha el día del ciclo que corresponde al primer día en la pauta.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: cycleLength }, (_, i) => {
                      const pos = i + 1;
                      const isWork = i < pattern.work;
                      const isSelected = pos === serieForm.startPosition;
                      return (
                        <button
                          key={pos}
                          type="button"
                          onClick={() => setSerieForm((p) => ({ ...p, startPosition: pos }))}
                          className={`relative flex flex-col items-center justify-center rounded-md w-10 h-12 text-[10px] font-medium border-2 transition-all ${
                            isSelected
                              ? "border-primary ring-2 ring-primary/30 scale-105"
                              : "border-transparent hover:border-muted-foreground/30"
                          } ${
                            isWork
                              ? "bg-emerald-600/20 text-emerald-300"
                              : "bg-zinc-700/30 text-zinc-500"
                          }`}
                        >
                          <span className="text-[9px] text-muted-foreground/60">
                            {isWork ? `T${i + 1}` : `D${i - pattern.work + 1}`}
                          </span>
                          <span className="font-semibold text-sm">{pos}</span>
                          <span>{isWork ? "T" : "-"}</span>
                          {isSelected && (
                            <span className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-primary rounded-full border-2 border-card" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-2">
                    Día seleccionado: <span className="text-foreground font-medium">{serieForm.startPosition}</span>
                    {" — "}
                    {serieForm.startPosition <= pattern.work
                      ? `Día ${serieForm.startPosition} de trabajo`
                      : `Día ${serieForm.startPosition - pattern.work} de descanso`
                    }
                  </p>
                </div>
              );
            })()}

            {/* Turno rotativo toggle */}
            {(() => {
              const oppositePuestos = getOppositePuestos(serieForm.puestoId);
              const currentPuesto = allPuestos.find((p) => p.id === serieForm.puestoId);
              const currentIsNight = currentPuesto ? isPuestoNight(currentPuesto.shiftStart) : false;
              const selectedRotatePuesto = allPuestos.find((p) => p.id === serieForm.rotatePuestoId);

              return (
                <div className="rounded-md border border-border p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium">Turno rotativo</p>
                      <p className="text-[10px] text-muted-foreground">
                        Alterna entre turno diurno y nocturno cada ciclo
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={serieForm.isRotativo}
                      onClick={() =>
                        setSerieForm((p) => ({
                          ...p,
                          isRotativo: !p.isRotativo,
                          rotatePuestoId: !p.isRotativo ? (oppositePuestos[0]?.id ?? "") : "",
                          rotateSlotNumber: 1,
                          startShift: currentIsNight ? "night" : "day",
                        }))
                      }
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                        serieForm.isRotativo ? "bg-violet-500" : "bg-zinc-600"
                      }`}
                    >
                      <span
                        className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform ${
                          serieForm.isRotativo ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>

                  {serieForm.isRotativo && (
                    <>
                      {oppositePuestos.length === 0 ? (
                        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-xs font-medium text-amber-300">
                                No hay puesto con turno {currentIsNight ? "diurno" : "nocturno"}
                              </p>
                              <p className="text-[10px] text-amber-400/80 mt-0.5">
                                Para usar turno rotativo necesitas crear un puesto con horario {currentIsNight ? "diurno" : "nocturno"} en esta instalación.
                              </p>
                            </div>
                          </div>
                          {installationId && (
                            <Link
                              href={`/crm/installations/${installationId}`}
                              className="inline-flex items-center gap-1.5 text-[10px] font-medium text-amber-300 hover:text-amber-200 transition-colors"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Ir a configurar puestos de esta instalación
                            </Link>
                          )}
                        </div>
                      ) : (
                        <>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Puesto par ({currentIsNight ? "diurno" : "nocturno"})</Label>
                            <select
                              className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                              value={serieForm.rotatePuestoId}
                              onChange={(e) => setSerieForm((p) => ({ ...p, rotatePuestoId: e.target.value, rotateSlotNumber: 1 }))}
                            >
                              {oppositePuestos.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name} ({p.shiftStart}-{p.shiftEnd})
                                </option>
                              ))}
                            </select>
                          </div>

                          {selectedRotatePuesto && selectedRotatePuesto.requiredGuards > 1 && (
                            <div className="space-y-1.5">
                              <Label className="text-xs">Slot en puesto par</Label>
                              <select
                                className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                                value={serieForm.rotateSlotNumber}
                                onChange={(e) => setSerieForm((p) => ({ ...p, rotateSlotNumber: Number(e.target.value) }))}
                              >
                                {Array.from({ length: selectedRotatePuesto.requiredGuards }, (_, i) => (
                                  <option key={i + 1} value={i + 1}>Slot {i + 1}</option>
                                ))}
                              </select>
                            </div>
                          )}

                          <div className="space-y-1.5">
                            <Label className="text-xs">El primer ciclo de trabajo es</Label>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => setSerieForm((p) => ({ ...p, startShift: "day" }))}
                                className={`flex-1 rounded-md px-3 py-2 text-xs font-medium border-2 transition-all ${
                                  serieForm.startShift === "day"
                                    ? "border-amber-400 bg-amber-500/15 text-amber-300"
                                    : "border-transparent bg-muted/30 text-muted-foreground hover:border-muted-foreground/30"
                                }`}
                              >
                                Diurno (D)
                              </button>
                              <button
                                type="button"
                                onClick={() => setSerieForm((p) => ({ ...p, startShift: "night" }))}
                                className={`flex-1 rounded-md px-3 py-2 text-xs font-medium border-2 transition-all ${
                                  serieForm.startShift === "night"
                                    ? "border-indigo-400 bg-indigo-500/15 text-indigo-300"
                                    : "border-transparent bg-muted/30 text-muted-foreground hover:border-muted-foreground/30"
                                }`}
                              >
                                Nocturno (N)
                              </button>
                            </div>
                          </div>

                          {/* Visual preview of rotative cycle */}
                          {(() => {
                            const pattern = PATTERNS.find((p) => p.code === serieForm.patternCode);
                            if (!pattern) return null;
                            return (
                              <div className="rounded border border-violet-500/20 bg-violet-500/5 p-2">
                                <p className="text-[10px] font-medium text-violet-300 mb-1.5">Vista previa del ciclo completo</p>
                                <div className="flex flex-wrap gap-1 text-[9px]">
                                  <span className={`rounded px-1.5 py-0.5 font-medium ${serieForm.startShift === "day" ? "bg-amber-500/20 text-amber-300" : "bg-indigo-500/20 text-indigo-300"}`}>
                                    {pattern.work}T {serieForm.startShift === "day" ? "Día" : "Noche"}
                                  </span>
                                  <span className="rounded px-1.5 py-0.5 bg-zinc-700/30 text-zinc-500">{pattern.off}D</span>
                                  <span className={`rounded px-1.5 py-0.5 font-medium ${serieForm.startShift === "day" ? "bg-indigo-500/20 text-indigo-300" : "bg-amber-500/20 text-amber-300"}`}>
                                    {pattern.work}T {serieForm.startShift === "day" ? "Noche" : "Día"}
                                  </span>
                                  <span className="rounded px-1.5 py-0.5 bg-zinc-700/30 text-zinc-500">{pattern.off}D</span>
                                  <span className="text-muted-foreground/50">y repite…</span>
                                </div>
                              </div>
                            );
                          })()}
                        </>
                      )}
                    </>
                  )}
                </div>
              );
            })()}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSerieModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handlePaintSerie} disabled={serieSaving}>
              {serieSaving ? "Pintando..." : "Pintar serie"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pintar opciones (clic izquierdo en celda) */}
      <Dialog open={pintarOpcionesModalOpen} onOpenChange={setPintarOpcionesModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              Pintar en pauta
            </DialogTitle>
            <DialogDescription>
              {pintarOpcionesContext && (
                <>
                  Puesto <span className="font-medium text-foreground">{pintarOpcionesContext.puestoName}</span>, slot {pintarOpcionesContext.slotNumber}, día {pintarOpcionesContext.dateKey}.
                  <br />
                  Elige una opción:
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            <Button
              variant="outline"
              className="justify-start"
              disabled={pintarSoloDiaSaving}
              onClick={() => {
                if (!pintarOpcionesContext) return;
                setPintarOpcionesModalOpen(false);
                setPintarOpcionesContext(null);
                openSerieModal(
                  pintarOpcionesContext.puestoId,
                  pintarOpcionesContext.slotNumber,
                  pintarOpcionesContext.dateKey
                );
              }}
            >
              Pintar la serie (desde este día en adelante)
            </Button>
            <div className="rounded-md border border-border bg-muted/20 p-2 space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Pintar solo este día</p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-[10px]"
                  disabled={pintarSoloDiaSaving}
                  onClick={() => void handlePintarSoloDia("T")}
                >
                  Día de trabajo (T)
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-[10px]"
                  disabled={pintarSoloDiaSaving}
                  onClick={() => void handlePintarSoloDia("-")}
                >
                  Día libre (-)
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPintarOpcionesModalOpen(false)}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Eliminar serie / día (clic derecho en celda) */}
      <Dialog open={eliminarSerieModalOpen} onOpenChange={setEliminarSerieModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4" />
              Eliminar serie
            </DialogTitle>
            <DialogDescription>
              {eliminarSerieContext && (
                <>
                  Puesto <span className="font-medium text-foreground">{eliminarSerieContext.puestoName}</span>, slot {eliminarSerieContext.slotNumber}, día {eliminarSerieContext.dateKey}.
                  <br />
                  Elige qué desea eliminar:
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            <Button
              variant="outline"
              className="justify-start"
              disabled={eliminarSerieSaving}
              onClick={() => void handleEliminarSerie("from_forward")}
            >
              Eliminar la serie de acá en adelante
            </Button>
            <Button
              variant="outline"
              className="justify-start"
              disabled={eliminarSerieSaving}
              onClick={() => void handleEliminarSerie("single_day")}
            >
              Eliminar solamente este día de la serie
            </Button>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEliminarSerieModalOpen(false)}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmación Regenerar pauta (sobrescribir) */}
      <Dialog open={regenerarConfirmOpen} onOpenChange={setRegenerarConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Regenerar pauta</DialogTitle>
            <DialogDescription>
              Se sobrescribirán todas las celdas de la pauta actual para {installations.find((i) => i.id === installationId)?.name ?? "esta instalación"} en {MESES[month - 1]} {year}. ¿Continuar?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegenerarConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void handleRegenerar()} disabled={loading}>
              {loading ? "Regenerando…" : "Regenerar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mobile: sheet al tocar nombre del puesto — nombre completo y enlace a Puestos */}
      <Sheet open={!!puestoSheet} onOpenChange={(open) => !open && setPuestoSheet(null)}>
        <SheetContent side="bottom" className="sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>Puesto</SheetTitle>
            <SheetDescription className="text-base text-foreground font-medium break-words">
              {puestoSheet?.puestoName}
            </SheetDescription>
          </SheetHeader>
          <div className="pt-4">
            <Button variant="outline" className="w-full justify-center gap-2" asChild>
              <Link href="/crm/installations">
                <ExternalLink className="h-4 w-4" />
                Ver en Instalaciones
              </Link>
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
