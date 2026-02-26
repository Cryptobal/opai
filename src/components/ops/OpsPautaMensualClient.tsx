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
import { NotesSection } from "@/components/crm/NotesSection";
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
import { CalendarDays, FileDown, Loader2, MoreVertical, Trash2, ExternalLink, RefreshCw, AlertTriangle, ArrowLeft, Building2, Users, CheckCircle2, XCircle, Clock, Search, ChevronDown, ChevronRight, Sun, Moon, RotateCw } from "lucide-react";

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
type ShiftType = "day" | "night" | "rotativo";

/** Merged row for rotativo: one row showing Td/Tn per date */
type RotativoMergedRow = {
  kind: "rotativo";
  puestoId: string;
  puestoName: string;
  shiftStart: string;
  shiftEnd: string;
  shiftDisplay: string;
  slotNumber: number;
  patternCode?: string;
  guardiaId?: string;
  guardiaName?: string;
  dayPuestoId: string;
  daySlotNumber: number;
  nightPuestoId: string;
  nightSlotNumber: number;
  cells: Map<string, {
    displayCode: "Td" | "Tn" | "-";
    item?: PautaItem;
    execution?: ExecutionCell;
    clickPuestoId: string;
    clickSlotNumber: number;
  }>;
};

interface OpsPautaMensualClientProps {
  initialClients: ClientOption[];
  guardias: GuardiaOption[];
  shiftPatterns?: ShiftPatternOption[];
  currentUserId?: string;
  globalSearchSlot?: React.ReactNode;
}

/* ── helper ────────────────────────────────────── */

function toDateKey(date: Date | string): string {
  if (typeof date === "string") return date.slice(0, 10);
  const d = date as Date;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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
  currentUserId,
  globalSearchSlot,
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
  const [overviewSearch, setOverviewSearch] = useState("");
  const [items, setItems] = useState<PautaItem[]>([]);
  const [series, setSeries] = useState<SerieInfo[]>([]);
  const [slotAsignaciones, setSlotAsignaciones] = useState<SlotAsignacion[]>([]);
  const [executionByCell, setExecutionByCell] = useState<Record<string, ExecutionCell>>({});
  const [allPuestos, setAllPuestos] = useState<PuestoInfo[]>([]);
  const [holidayDates, setHolidayDates] = useState<Map<string, string>>(new Map());

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

  // Puestos contraíbles: Set de puestoIds colapsados
  const [collapsedPuestos, setCollapsedPuestos] = useState<Set<string>>(new Set());

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
      let res: Response;
      try {
        res = await fetch(
          `/api/ops/pauta-mensual?installationId=${installationId}&month=${month}&year=${year}`,
          { cache: "no-store" }
        );
      } catch (fetchErr) {
        const msg = fetchErr instanceof TypeError && String(fetchErr).includes("fetch")
          ? "Error de red. Verifica que el servidor esté corriendo y vuelve a intentar."
          : "No se pudo conectar con el servidor.";
        toast.error(msg);
        throw fetchErr;
      }
      let payload: { success?: boolean; error?: string; data?: Record<string, unknown> };
      try {
        payload = await res.json();
      } catch {
        toast.error("Respuesta inválida del servidor");
        throw new Error("Invalid JSON response");
      }
      if (!res.ok || !payload.success)
        throw new Error(payload.error || "Error cargando pauta");

      const data = payload.data;
      if (!data) throw new Error("Sin datos en la respuesta");

      const fetchedItems = data.items as PautaItem[];
      if (data.allPuestos) setAllPuestos(data.allPuestos as PuestoInfo[]);

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
            if (res2.ok && payload2.success && payload2.data) {
              const d2 = payload2.data;
              setItems((d2.items as PautaItem[]) ?? []);
              setSeries((d2.series as SerieInfo[]) ?? []);
              if (d2.asignaciones) setSlotAsignaciones(d2.asignaciones as SlotAsignacion[]);
              setExecutionByCell((d2.executionByCell || {}) as Record<string, ExecutionCell>);
              if (d2.allPuestos) setAllPuestos(d2.allPuestos as PuestoInfo[]);
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
        setSeries(data.series as SerieInfo[]);
        if (data.asignaciones) {
          setSlotAsignaciones(data.asignaciones as SlotAsignacion[]);
        }
        setExecutionByCell((data.executionByCell || {}) as Record<string, ExecutionCell>);
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

  // Load holidays for the current month/year
  useEffect(() => {
    fetch(`/api/payroll/holidays?year=${year}`)
      .then((r) => r.json())
      .then((json) => {
        const map = new Map<string, string>();
        for (const h of json.data || []) {
          const dateStr = typeof h.date === "string" ? h.date.slice(0, 10) : "";
          if (dateStr) map.set(dateStr, h.name);
        }
        setHolidayDates(map);
      })
      .catch(() => setHolidayDates(new Map()));
  }, [year]);

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

  /** Filtrar instalaciones por búsqueda (instalación o cliente) */
  const filteredOverviewData = useMemo(() => {
    const q = overviewSearch.trim().toLowerCase();
    if (!q) return overviewData;
    return overviewData.filter(
      (inst) =>
        inst.name.toLowerCase().includes(q) ||
        (inst.clientName && inst.clientName.toLowerCase().includes(q))
    );
  }, [overviewData, overviewSearch]);

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

  // Build matrix: group by puestoId+slotNumber → map of dateKey → { item, execution }
  // executionByCell se integra aquí para que los badges de asistencia (ASI/TE/SC/PPC) siempre se muestren
  type RowKey = string; // `${puestoId}|${slotNumber}`
  type CellData = { item: PautaItem; execution?: ExecutionCell };
  type MatrixRow = {
    puestoId: string;
    puestoName: string;
    shiftStart: string;
    shiftEnd: string;
    slotNumber: number;
    requiredGuards: number;
    cells: Map<string, CellData>;
    guardiaId?: string;
    guardiaName?: string;
    patternCode?: string;
    isRotativo?: boolean;
    rotatePuestoId?: string | null;
    rotateSlotNumber?: number | null;
  };
  const matrix = useMemo(() => {
    const rows = new Map<RowKey, MatrixRow>();

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
      const dateKey = toDateKey(item.date);
      const execKey = `${item.puestoId}|${item.slotNumber}|${dateKey}`;
      const execution = executionByCell[execKey];
      row.cells.set(dateKey, { item, execution });
    }

    // Enrich with serie info (pattern code + rotativo)
    for (const s of series) {
      const key: RowKey = `${s.puestoId}|${s.slotNumber}`;
      const row = rows.get(key);
      if (row) {
        row.patternCode = s.patternCode;
        row.isRotativo = s.isRotativo ?? false;
        row.rotatePuestoId = s.rotatePuestoId ?? null;
        row.rotateSlotNumber = s.rotateSlotNumber ?? null;
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
  }, [items, series, slotAsignaciones, executionByCell]);

  /** Agrupar por tipo de turno (día/noche/rotativo) y luego por puesto */
  const groupedByShiftType = useMemo(() => {
    type GroupedPuesto = {
      puestoId: string;
      puestoName: string;
      shiftStart: string;
      shiftEnd: string;
      shiftType: ShiftType;
      rows: MatrixRow[];
    };

    const rowByKey = new Map<string, MatrixRow>();
    for (const row of matrix) {
      rowByKey.set(`${row.puestoId}|${row.slotNumber}`, row);
    }

    // Build rotativo pairs and merged rows
    const rotativoRowKeys = new Set<string>();
    const rotativoMergedRows: RotativoMergedRow[] = [];

    for (const row of matrix) {
      if (!row.isRotativo || !row.rotatePuestoId || row.rotateSlotNumber == null) continue;
      const otherKey = `${row.rotatePuestoId}|${row.rotateSlotNumber}`;
      const otherRow = rowByKey.get(otherKey);
      if (!otherRow) continue;

      const myKey = `${row.puestoId}|${row.slotNumber}`;
      if (rotativoRowKeys.has(myKey) || rotativoRowKeys.has(otherKey)) continue;

      rotativoRowKeys.add(myKey);
      rotativoRowKeys.add(otherKey);

      const h = parseInt(row.shiftStart.split(":")[0], 10);
      const isDay = h >= 6 && h < 18;
      const dayRow = isDay ? row : otherRow;
      const nightRow = isDay ? otherRow : row;

      const mergedCells = new Map<string, {
        displayCode: "Td" | "Tn" | "-";
        item?: PautaItem;
        execution?: ExecutionCell;
        clickPuestoId: string;
        clickSlotNumber: number;
      }>();
      const allDateKeys = new Set<string>();
      for (const [dk] of dayRow.cells) allDateKeys.add(dk);
      for (const [dk] of nightRow.cells) allDateKeys.add(dk);

      for (const dateKey of allDateKeys) {
        const dayCell = dayRow.cells.get(dateKey);
        const nightCell = nightRow.cells.get(dateKey);
        const dayT = dayCell?.item?.shiftCode === "T";
        const nightT = nightCell?.item?.shiftCode === "T";

        let displayCode: "Td" | "Tn" | "-" = "-";
        let item: PautaItem | undefined;
        let execution: ExecutionCell | undefined;
        let clickPuestoId: string;
        let clickSlotNumber: number;

        if (dayT) {
          displayCode = "Td";
          item = dayCell?.item;
          execution = dayCell?.execution;
          clickPuestoId = dayRow.puestoId;
          clickSlotNumber = dayRow.slotNumber;
        } else if (nightT) {
          displayCode = "Tn";
          item = nightCell?.item;
          execution = nightCell?.execution;
          clickPuestoId = nightRow.puestoId;
          clickSlotNumber = nightRow.slotNumber;
        } else {
          item = dayCell?.item ?? nightCell?.item;
          execution = dayCell?.execution ?? nightCell?.execution;
          clickPuestoId = dayRow.puestoId;
          clickSlotNumber = dayRow.slotNumber;
        }

        mergedCells.set(dateKey, {
          displayCode,
          item,
          execution,
          clickPuestoId,
          clickSlotNumber,
        });
      }

      rotativoMergedRows.push({
        kind: "rotativo",
        puestoId: dayRow.puestoId,
        puestoName: dayRow.puestoName,
        shiftStart: `${dayRow.shiftStart}-${dayRow.shiftEnd}`,
        shiftEnd: `${nightRow.shiftStart}-${nightRow.shiftEnd}`,
        shiftDisplay: `${dayRow.shiftStart}-${dayRow.shiftEnd} / ${nightRow.shiftStart}-${nightRow.shiftEnd}`,
        slotNumber: dayRow.slotNumber,
        patternCode: dayRow.patternCode,
        guardiaId: dayRow.guardiaId ?? nightRow.guardiaId,
        guardiaName: dayRow.guardiaName ?? nightRow.guardiaName,
        dayPuestoId: dayRow.puestoId,
        daySlotNumber: dayRow.slotNumber,
        nightPuestoId: nightRow.puestoId,
        nightSlotNumber: nightRow.slotNumber,
        cells: mergedCells,
      });
    }

    const byPuesto = new Map<string, GroupedPuesto>();
    for (const row of matrix) {
      const key = `${row.puestoId}|${row.slotNumber}`;
      if (rotativoRowKeys.has(key)) continue;

      const h = parseInt(row.shiftStart.split(":")[0], 10);
      const shiftType: ShiftType = h >= 18 || h < 6 ? "night" : "day";
      if (!byPuesto.has(row.puestoId)) {
        byPuesto.set(row.puestoId, {
          puestoId: row.puestoId,
          puestoName: row.puestoName,
          shiftStart: row.shiftStart,
          shiftEnd: row.shiftEnd,
          shiftType,
          rows: [],
        });
      }
      byPuesto.get(row.puestoId)!.rows.push(row);
    }

    const sortedGroups = Array.from(byPuesto.values())
      .map((g) => ({
        ...g,
        rows: [...g.rows].sort((a, b) => a.slotNumber - b.slotNumber),
      }))
      .sort((a, b) => {
        const aMinutes = parseInt(a.shiftStart.split(":")[0], 10) * 60 + parseInt(a.shiftStart.split(":")[1], 10);
        const bMinutes = parseInt(b.shiftStart.split(":")[0], 10) * 60 + parseInt(b.shiftStart.split(":")[1], 10);
        if (aMinutes !== bMinutes) return aMinutes - bMinutes;
        return a.puestoName.localeCompare(b.puestoName);
      });

    const rotativoGroups = rotativoMergedRows.length > 0
      ? [{
          puestoId: "rotativo",
          puestoName: "Rotativos",
          shiftStart: "",
          shiftEnd: "",
          shiftType: "rotativo" as const,
          rows: rotativoMergedRows,
        }]
      : [];

    return {
      day: sortedGroups.filter((g) => g.shiftType === "day"),
      night: sortedGroups.filter((g) => g.shiftType === "night"),
      rotativo: rotativoGroups,
    };
  }, [matrix]);

  const shiftSummary = useMemo(() => {
    const summarize = (groups: Array<{ rows: unknown[] }>) => {
      const puestos = groups.length;
      const requiredSlots = groups.reduce((acc, g) => acc + g.rows.length, 0);
      const assignedSlots = groups.reduce(
        (acc, g) => acc + g.rows.filter((r) => Boolean((r as { guardiaId?: string }).guardiaId)).length,
        0
      );
      const vacantes = Math.max(0, requiredSlots - assignedSlots);
      return { puestos, requiredSlots, assignedSlots, vacantes };
    };

    const day = summarize(groupedByShiftType.day);
    const night = summarize(groupedByShiftType.night);
    const rotativo = summarize(groupedByShiftType.rotativo);

    return {
      day,
      night,
      rotativo,
      totalRequiredSlots: day.requiredSlots + night.requiredSlots + rotativo.requiredSlots,
      totalAssignedSlots: day.assignedSlots + night.assignedSlots + rotativo.assignedSlots,
      totalVacantes: day.vacantes + night.vacantes + rotativo.vacantes,
    };
  }, [groupedByShiftType]);

  const daySectionIds = useMemo(
    () => groupedByShiftType.day.map((g) => g.puestoId),
    [groupedByShiftType.day]
  );
  const nightSectionIds = useMemo(
    () => groupedByShiftType.night.map((g) => g.puestoId),
    [groupedByShiftType.night]
  );
  const rotativoSectionIds = useMemo(
    () => groupedByShiftType.rotativo.map((g) => g.puestoId),
    [groupedByShiftType.rotativo]
  );

  const collapseKeyRef = useRef<string>("");
  useEffect(() => {
    const key = `${installationId}|${month}|${year}`;
    const allIds = [...daySectionIds, ...nightSectionIds, ...rotativoSectionIds];
    if (allIds.length === 0) return;
    if (collapseKeyRef.current !== key) {
      setCollapsedPuestos(new Set(allIds));
      collapseKeyRef.current = key;
    }
  }, [installationId, month, year, daySectionIds, nightSectionIds, rotativoSectionIds]);

  const toggleSectionCollapsed = useCallback((section: ShiftType) => {
    const targetIds = section === "day" ? daySectionIds : section === "night" ? nightSectionIds : rotativoSectionIds;
    setCollapsedPuestos((prev) => {
      const next = new Set(prev);
      const allCollapsed = targetIds.every((id) => next.has(id));
      if (allCollapsed) {
        targetIds.forEach((id) => next.delete(id));
      } else {
        targetIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }, [daySectionIds, nightSectionIds, rotativoSectionIds]);

  const togglePuestoCollapsed = useCallback((puestoId: string) => {
    setCollapsedPuestos((prev) => {
      const next = new Set(prev);
      if (next.has(puestoId)) next.delete(puestoId);
      else next.add(puestoId);
      return next;
    });
  }, []);

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
          ? `Línea rotativa pintada (${payload.data.updated} celdas actualizadas)`
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
      <div className="space-y-3">
        {/* Month/Year selector + búsquedas (instalación/cliente + guardia) */}
        <Card>
          <CardContent className="pt-3 pb-2.5">
            <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
              <div className="flex gap-2 flex-wrap">
                <div key="overview-month" className="space-y-1">
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
                <div key="overview-year" className="space-y-1">
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
                <div key="overview-search-inst" className="space-y-1 flex-1 min-w-[200px]">
                  <Label className="text-xs">Buscar instalación o cliente</Label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Ej: BTX, Berlintexx, CIMS..."
                      value={overviewSearch}
                      onChange={(e) => setOverviewSearch(e.target.value)}
                      className="h-8 pl-8 text-sm"
                    />
                  </div>
                </div>
                {globalSearchSlot && (
                  <div key="overview-guardia-search" className="space-y-1">
                    <Label className="text-xs">Buscar guardia</Label>
                    {globalSearchSlot}
                  </div>
                )}
              </div>
              <div key="overview-status" className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
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
            <CardContent className="pt-8 pb-8">
              <EmptyState
                icon={<Building2 className="h-8 w-8" />}
                title="Sin instalaciones"
                description="No hay instalaciones activas configuradas."
                compact
              />
            </CardContent>
          </Card>
        ) : filteredOverviewData.length === 0 ? (
          <Card>
            <CardContent className="pt-8 pb-8">
              <EmptyState
                icon={<Search className="h-8 w-8" />}
                title="Sin resultados"
                description={overviewSearch.trim() ? `No hay instalaciones ni clientes que coincidan con "${overviewSearch.trim()}".` : "No hay instalaciones activas configuradas."}
                compact
              />
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredOverviewData.map((inst) => {
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
                        <span className="text-[10px] font-medium text-rose-400" title="Slots (puesto+guardia) sin cobertura o con V/L/P">
                          {inst.ppcCount} slot{inst.ppcCount > 1 ? "s" : ""} sin cubrir
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
                              <th className="text-center px-1 py-1 font-medium w-20">Horario</th>
                              <th className="text-center px-1 py-1 font-medium w-16">Guardias</th>
                            </tr>
                          </thead>
                          <tbody>
                            {inst.puestos.map((p) => (
                              <tr key={p.id} className="border-t border-border/30">
                                <td className="px-2 py-1 text-foreground truncate max-w-[160px]">{p.name}</td>
                                <td className="text-center px-1 py-1">
                                  <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-[8px] font-semibold border ${
                                    p.isNight
                                      ? "bg-indigo-500/15 text-indigo-300 border-indigo-500/30"
                                      : "bg-amber-500/15 text-amber-300 border-amber-500/30"
                                  }`}>
                                    {p.isNight ? "N" : "D"}
                                    <span className="font-normal ml-0.5">{p.shiftStart}-{p.shiftEnd}</span>
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
        <CardContent className="pt-3 pb-2.5 space-y-2">
          <div className="flex flex-col gap-2">
            {/* Back button + Filtros */}
            <div className="flex items-center gap-2 mb-0.5">
              <button
                type="button"
                onClick={() => setPageView("overview")}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Volver al resumen
              </button>
            </div>
            {/* Filtros: Cliente + Instalación + Mes + Año + Buscar guardia */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3">
              <div key="filter-client" className="space-y-1 col-span-2 sm:col-span-1">
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
              <div key="filter-installation" className="space-y-1 col-span-2 sm:col-span-1">
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
              <div key="filter-month" className="space-y-1">
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
              <div key="filter-year" className="space-y-1">
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
              {globalSearchSlot && (
                <div key="filter-guardia-search" className="space-y-1 col-span-2 sm:col-span-1">
                  <Label className="text-xs">Buscar guardia</Label>
                  {globalSearchSlot}
                </div>
              )}
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
                  <CalendarDays className="h-3.5 w-3.5 text-white" />
                  {items.length} registros
                </div>
              ) : null}
              <div className="flex items-center gap-1.5 ml-auto">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-[10px] h-7 px-2"
                  disabled={loading || !installationId}
                  onClick={() => void fetchPauta()}
                  title="Recargar pauta de esta instalación sin recargar la página"
                >
                  <RefreshCw className={`h-3 w-3 sm:mr-1 ${loading ? "animate-spin" : ""}`} />
                  <span className="hidden sm:inline">Recargar</span>
                </Button>
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
                icon={<CalendarDays className="h-8 w-8 text-white" />}
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
                icon={<CalendarDays className="h-8 w-8 text-white" />}
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
        <CardContent className="pt-3 pb-2.5">
          {loading && matrix.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Cargando pauta…
            </div>
          ) : (
            <>
              <div className="mb-3 rounded-md border border-border bg-muted/10 px-3 py-2 text-[11px] sm:text-[10px]">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="font-medium text-foreground">Total cobertura</span>
                  <span className="text-muted-foreground">
                    {shiftSummary.totalAssignedSlots}/{shiftSummary.totalRequiredSlots} guardias
                  </span>
                  <span className={`font-medium ${shiftSummary.totalVacantes > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                    {shiftSummary.totalVacantes > 0
                      ? `${shiftSummary.totalVacantes} vacante${shiftSummary.totalVacantes !== 1 ? "s" : ""}`
                      : "Cobertura completa"}
                  </span>
                </div>
              </div>

              <div className="-mx-4 px-4 sm:-mx-6 sm:px-6 overflow-x-auto overflow-y-auto max-h-[calc(100vh-280px)]">
              <table className="w-full text-xs border-collapse table-fixed sm:table-auto">
                <colgroup>
                  <col style={{ width: "22%" }} />
                  {visibleDays.map((d, i) => (
                    <col key={`${d.getUTCDate()}-${i}`} />
                  ))}
                </colgroup>
                <thead className="sticky top-0 z-20 bg-card shadow-[0_2px_4px_-1px_rgba(0,0,0,0.2)]">
                  <tr className="border-b border-border">
                    <th className="sticky left-0 z-30 bg-card text-left pl-1 pr-2 py-2 w-[22%] sm:min-w-[200px] sm:w-auto shadow-[4px_0_6px_-2px_rgba(0,0,0,0.15)]">
                      <span className="hidden sm:inline">Puesto / Guardia</span>
                      <span className="sm:hidden text-xs">Puesto</span>
                    </th>
                    {visibleDays.map((d) => {
                      const dayNum = d.getUTCDate();
                      const dayName = WEEKDAY_SHORT[d.getUTCDay()];
                      const isWeekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
                      const isToday = toDateKey(d) === toLocalDateKey(new Date());
                      const dateKey = toDateKey(d);
                      const holidayName = holidayDates.get(dateKey);
                      const isHoliday = !!holidayName;
                      return (
                        <th
                          key={dayNum}
                          className={`sticky top-0 z-20 bg-card text-center px-0.5 py-1 ${
                            isToday ? "text-primary" : isHoliday ? "text-rose-400" : isWeekend ? "text-amber-400" : "text-muted-foreground"
                          }`}
                          title={holidayName || undefined}
                        >
                          <div className="text-[11px] sm:text-[10px] leading-tight">{dayName}</div>
                          <div className={`font-semibold text-sm sm:text-xs ${
                            isToday
                              ? "bg-primary text-primary-foreground rounded-full w-6 h-6 inline-flex items-center justify-center mx-auto"
                              : isHoliday
                                ? "bg-rose-500/20 text-rose-400 rounded-full w-6 h-6 inline-flex items-center justify-center mx-auto"
                                : ""
                          }`}>
                            {dayNum}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {([
                    { key: "day" as const, label: "TURNOS DIURNOS", badgeClass: "bg-amber-500/15 text-amber-300 border-amber-500/30", icon: Sun },
                    { key: "rotativo" as const, label: "TURNOS ROTATIVOS", badgeClass: "bg-violet-500/15 text-violet-300 border-violet-500/30", icon: RotateCw },
                    { key: "night" as const, label: "TURNOS NOCTURNOS", badgeClass: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30", icon: Moon },
                  ]).flatMap((section) => {
                    const groups = groupedByShiftType[section.key];
                    if (groups.length === 0) return [];
                    const SectionIcon = section.icon;
                    const sectionIds = section.key === "day" ? daySectionIds : section.key === "night" ? nightSectionIds : rotativoSectionIds;
                    const allSectionCollapsed = sectionIds.length > 0 && sectionIds.every((id) => collapsedPuestos.has(id));

                    return [
                      <tr key={`${section.key}-header`} className="sticky top-[42px] sm:top-[44px] z-10 border-y border-border">
                        <td colSpan={1 + visibleDays.length} className="bg-card/95 backdrop-blur px-2 py-1">
                          <div className="flex items-center gap-2 text-[11px] sm:text-[10px]">
                            <button
                              type="button"
                              onClick={() => toggleSectionCollapsed(section.key)}
                              className="shrink-0 p-0.5 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                              aria-label={allSectionCollapsed ? "Abrir todos" : "Contraer todos"}
                            >
                              {allSectionCollapsed
                                ? <ChevronRight className="h-3.5 w-3.5" />
                                : <ChevronDown className="h-3.5 w-3.5" />}
                            </button>
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium ${section.badgeClass}`}>
                              <SectionIcon className="h-3 w-3" />
                              {section.label}
                            </span>
                            <span className="text-muted-foreground">
                              {groups.length} puesto{groups.length !== 1 ? "s" : ""}
                            </span>
                          </div>
                        </td>
                      </tr>,
                      ...groups.flatMap((group) => {
                        const isCollapsed = collapsedPuestos.has(group.puestoId);
                        if (isCollapsed) {
                          return [
                            <tr
                              key={group.puestoId}
                              onClick={() => togglePuestoCollapsed(group.puestoId)}
                              className="cursor-pointer hover:bg-muted/20 border-t border-border"
                            >
                              <td
                                colSpan={1 + visibleDays.length}
                                className="sticky left-0 z-10 bg-card pl-1 pr-2 py-1.5 sm:py-2 shadow-[4px_0_6px_-2px_rgba(0,0,0,0.15)]"
                              >
                                <div className="flex items-center gap-2">
                                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                                  <span className="font-medium text-foreground text-xs sm:text-sm">{group.puestoName}</span>
                                  <span className="text-muted-foreground text-[10px]">
                                    ({group.rows.length} slot{group.rows.length > 1 ? "s" : ""})
                                  </span>
                                </div>
                              </td>
                            </tr>,
                          ];
                        }

                        return group.rows.map((row, slotIdx) => {
                          const isFirstSlot = slotIdx === 0;
                          return (
                            <tr
                              key={`${row.puestoId}-${row.slotNumber}`}
                              className={`${isFirstSlot ? "border-t border-border" : ""} hover:bg-muted/10`}
                            >
                              {/* Row header: chevron + puesto/guardia */}
                              <td className="sticky left-0 z-10 bg-card pl-1 pr-2 py-1 sm:py-1.5 align-top w-[22%] sm:w-auto shadow-[4px_0_6px_-2px_rgba(0,0,0,0.15)]">
                                {isFirstSlot && (
                                  <div className="font-medium text-foreground leading-tight flex items-center gap-1 text-xs sm:text-sm min-w-0">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        togglePuestoCollapsed(group.puestoId);
                                      }}
                                      className="shrink-0 p-0.5 -ml-0.5 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                                      aria-label="Contraer puesto"
                                    >
                                      <ChevronDown className="h-3.5 w-3.5" />
                                    </button>
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
                                    <span className="shrink-0 text-[10px] text-muted-foreground hidden sm:inline">
                                      {"shiftDisplay" in row ? row.shiftDisplay : `${row.shiftStart}-${row.shiftEnd}`}
                                    </span>
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
                                      {("kind" in row && row.kind === "rotativo") || ("isRotativo" in row && (row as { isRotativo?: boolean }).isRotativo) ? (
                                        <span className="ml-0.5 inline-flex items-center rounded px-1 py-px text-[8px] font-semibold bg-violet-500/20 text-violet-300 border border-violet-500/30">
                                          rot
                                        </span>
                                      ) : null}
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* Day cells */}
                              {visibleDays.map((d) => {
                                const dateKey = toDateKey(d);
                                const cellData = row.cells.get(dateKey);
                                const isRotativoRow = "kind" in row && row.kind === "rotativo";
                                const rotativoCell = isRotativoRow ? (cellData as { displayCode: "Td" | "Tn" | "-"; item?: PautaItem; execution?: ExecutionCell; clickPuestoId: string; clickSlotNumber: number } | undefined) : undefined;
                                const cell = isRotativoRow ? rotativoCell?.item : (cellData as { item?: PautaItem; execution?: ExecutionCell } | undefined)?.item;
                                const execution = isRotativoRow ? rotativoCell?.execution : (cellData as { item?: PautaItem; execution?: ExecutionCell } | undefined)?.execution;
                                const code = isRotativoRow ? (rotativoCell?.displayCode ?? "") : ((cell as PautaItem | undefined)?.shiftCode ?? "");
                                const isEmpty = isRotativoRow ? !rotativoCell : !code;
                                const isTrabajo = isRotativoRow ? (rotativoCell?.displayCode === "Td" || rotativoCell?.displayCode === "Tn") : code === "T";
                                const trabajoClass = isRotativoRow
                                  ? (rotativoCell?.displayCode === "Tn" ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/30" : "bg-amber-500/20 text-amber-300 border-amber-500/30")
                                  : (group.shiftType === "night"
                                    ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/30"
                                    : "bg-amber-500/20 text-amber-300 border-amber-500/30");
                                const colorClass = isTrabajo ? trabajoClass : (SHIFT_COLORS[code] ?? SHIFT_COLORS["-"] ?? "");
                                const executionBadge =
                                  execution?.state === "te"
                                    ? "TE"
                                    : execution?.state === "asistio"
                                      ? "ASI"
                                      : execution?.state === "sin_cobertura"
                                        ? "SC"
                                        : execution?.state === "ppc"
                                          ? "PPC"
                                          : null;
                                const executionBadgeClass =
                                  execution?.state === "te"
                                    ? "bg-rose-600 text-rose-50"
                                    : execution?.state === "asistio"
                                      ? "bg-emerald-600 text-emerald-50"
                                      : execution?.state === "sin_cobertura"
                                        ? "bg-amber-500 text-amber-950"
                                        : execution?.state === "ppc"
                                          ? "bg-zinc-600 text-zinc-100"
                                          : "";

                                const clickPuestoId = isRotativoRow && rotativoCell ? rotativoCell.clickPuestoId : row.puestoId;
                                const clickSlotNumber = isRotativoRow && rotativoCell ? rotativoCell.clickSlotNumber : row.slotNumber;
                                const displayCode = isRotativoRow
                                  ? (rotativoCell?.displayCode ?? "·")
                                  : (isTrabajo ? "T" : (code || "·"));
                                const displayBadge = isRotativoRow ? null : (isTrabajo ? (group.shiftType === "night" ? "N" : "D") : null);

                                return (
                                  <td
                                    key={dateKey}
                                    className="text-center px-0.5 py-0.5"
                                  >
                                    {(cell || (isRotativoRow && rotativoCell)) ? (
                                      <div
                                        className={`relative inline-flex items-center justify-center w-7 h-7 min-w-7 sm:w-7 sm:h-6 rounded text-[10px] sm:text-[10px] font-medium border cursor-pointer transition-colors active:scale-95 ${
                                          isEmpty
                                            ? "border-dashed border-border/40 text-muted-foreground/30 hover:border-primary/50 hover:text-primary/50"
                                            : colorClass
                                        }`}
                                        title={
                                          cell?.plannedGuardia
                                            ? `${cell.plannedGuardia.persona.firstName} ${cell.plannedGuardia.persona.lastName}`
                                            : "Sin asignar"
                                        }
                                        onPointerDown={() => {
                                          longPressTargetRef.current = {
                                            puestoId: clickPuestoId,
                                            slotNumber: clickSlotNumber,
                                            dateKey,
                                          };
                                          longPressTimerRef.current = setTimeout(() => {
                                            longPressTimerRef.current = null;
                                            openEliminarSerieModal({
                                              puestoId: clickPuestoId,
                                              slotNumber: clickSlotNumber,
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
                                            longPressTargetRef.current.puestoId === clickPuestoId &&
                                            longPressTargetRef.current.slotNumber === clickSlotNumber &&
                                            longPressTargetRef.current.dateKey === dateKey;
                                          if (wasLongPress) {
                                            longPressTargetRef.current = null;
                                            return;
                                          }
                                          openPintarOpcionesModal({
                                            puestoId: clickPuestoId,
                                            slotNumber: clickSlotNumber,
                                            dateKey,
                                            puestoName: row.puestoName,
                                            guardiaId: row.guardiaId,
                                          });
                                        }}
                                        onContextMenu={(e) => {
                                          e.preventDefault();
                                          if (!cell && !rotativoCell) return;
                                          openEliminarSerieModal({
                                            puestoId: clickPuestoId,
                                            slotNumber: clickSlotNumber,
                                            dateKey,
                                            puestoName: row.puestoName,
                                          });
                                        }}
                                      >
                                        {displayCode}
                                        {displayBadge ? (
                                          <span
                                            className={`absolute -top-1 -right-1 rounded px-0.5 py-[1px] text-[8px] leading-none font-semibold ${
                                              displayBadge === "N"
                                                ? "bg-indigo-700 text-indigo-100"
                                                : "bg-amber-600 text-amber-50"
                                            }`}
                                          >
                                            {displayBadge}
                                          </span>
                                        ) : null}
                                        {executionBadge ? (
                                          <span
                                            className={`absolute -bottom-0.5 -right-0.5 rounded px-1 py-px text-[9px] leading-none font-bold shadow-sm ${executionBadgeClass}`}
                                            title={
                                              execution?.state === "asistio"
                                                ? "Asistió"
                                                : execution?.state === "te"
                                                  ? "Turno extra / Reemplazo"
                                                  : execution?.state === "sin_cobertura"
                                                    ? "Sin cobertura"
                                                    : "PPC"
                                            }
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
                                            puestoId: clickPuestoId,
                                            slotNumber: clickSlotNumber,
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
                        });
                      }),
                      <tr key={`${section.key}-summary`} className="border-t border-border bg-muted/5">
                        <td className="sticky left-0 z-10 bg-card pl-1 pr-2 py-1 text-[9px] text-muted-foreground shadow-[4px_0_6px_-2px_rgba(0,0,0,0.15)]">
                          {section.key === "day" ? <Sun className="inline h-3 w-3 text-amber-400 mr-0.5" /> : section.key === "rotativo" ? <RotateCw className="inline h-3 w-3 text-violet-400 mr-0.5" /> : <Moon className="inline h-3 w-3 text-indigo-400 mr-0.5" />}
                          <span className="hidden sm:inline">Slots {section.key === "day" ? "día" : section.key === "rotativo" ? "rot" : "noche"}</span>
                          <span className="sm:hidden">#</span>
                        </td>
                        {visibleDays.map((d) => {
                          const dk = toDateKey(d);
                          let slots = 0;
                          for (const g of groups) {
                            for (const r of g.rows) {
                              if ("kind" in r && r.kind === "rotativo") {
                                const rc = r.cells.get(dk);
                                if (rc?.displayCode === "Td" || rc?.displayCode === "Tn") slots += 1;
                              } else {
                                const c = (r as MatrixRow).cells.get(dk)?.item;
                                if (c?.shiftCode === "T") slots += 1;
                              }
                            }
                          }
                          return (
                            <td key={dk} className="text-center px-0.5 py-0.5">
                              {slots > 0 ? (
                                <span className="text-[9px] font-medium text-muted-foreground">{slots}</span>
                              ) : (
                                <span className="text-[9px] text-muted-foreground/30">-</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>,
                    ];
                  })}
                  <tr key="total-slots" className="border-t-2 border-border bg-muted/10">
                    <td className="sticky left-0 z-10 bg-card pl-1 pr-2 py-1 text-[9px] font-semibold text-foreground shadow-[4px_0_6px_-2px_rgba(0,0,0,0.15)]">
                      <span className="hidden sm:inline">Total slots</span>
                      <span className="sm:hidden">Tot</span>
                    </td>
                    {visibleDays.map((d) => {
                      const dk = toDateKey(d);
                      let slots = 0;
                      const allGroups = [...groupedByShiftType.day, ...groupedByShiftType.rotativo, ...groupedByShiftType.night];
                      for (const g of allGroups) {
                        for (const r of g.rows) {
                          if ("kind" in r && r.kind === "rotativo") {
                            const rc = r.cells.get(dk);
                            if (rc?.displayCode === "Td" || rc?.displayCode === "Tn") slots += 1;
                          } else {
                            const c = (r as MatrixRow).cells.get(dk)?.item;
                            if (c?.shiftCode === "T") slots += 1;
                          }
                        }
                      }
                      return (
                        <td key={dk} className="text-center px-0.5 py-0.5">
                          {slots > 0 ? (
                            <span className="text-[9px] font-semibold text-foreground">{slots}</span>
                          ) : (
                            <span className="text-[9px] text-muted-foreground/30">-</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>

              {/* Legend — serie (T, -, V, L, P) + segunda capa (asistencia: ✓, TE, ✗) */}
              <div className="mt-3 flex flex-wrap gap-2 sm:gap-3 text-[11px] sm:text-[10px] text-muted-foreground border-t border-border pt-3">
                {[
                  { code: "TD", label: "Trabajo diurno", cls: "bg-amber-500/20 border-amber-500/30" },
                  { code: "TN", label: "Trabajo nocturno", cls: "bg-indigo-500/20 border-indigo-500/30" },
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
                <span className="flex items-center gap-1"><span className="rounded px-0.5 py-px bg-emerald-600 text-emerald-50 text-[9px] font-semibold">ASI</span> Asistió</span>
                <span className="flex items-center gap-1"><span className="rounded px-0.5 py-px bg-rose-600 text-rose-50 text-[9px] font-semibold">TE</span> Turno extra</span>
                <span className="flex items-center gap-1"><span className="rounded px-0.5 py-px bg-amber-500 text-amber-950 text-[9px] font-semibold">SC</span> Sin cobertura</span>
                <span className="flex items-center gap-1"><span className="rounded px-0.5 py-px bg-zinc-600 text-zinc-100 text-[9px] font-semibold">PPC</span> Slot PPC</span>
              </div>
              <div className="mt-1.5 text-[11px] sm:text-[10px] text-muted-foreground/50">
                <span className="hidden sm:inline">Click izquierdo = pintar · Click derecho / mantener presionado = eliminar</span>
                <span className="sm:hidden">Toca = pintar · Mantén presionado = eliminar</span>
              </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      )}

      {/* Notas de la pauta */}
      {installationId && currentUserId && (
        <Card>
          <CardContent className="pt-3 pb-3">
            <NotesSection
              entityType="installation_pauta"
              entityId={`${installationId}_${year}-${String(month).padStart(2, "0")}`}
              currentUserId={currentUserId}
            />
          </CardContent>
        </Card>
      )}

      {/* Serie painting modal */}
      <Dialog open={serieModalOpen} onOpenChange={setSerieModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Pintar serie de turnos</DialogTitle>
            <DialogDescription>
              Define la rotación para este guardia desde el día seleccionado. Cada línea se pinta de forma independiente.
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
                  <p className="text-xs font-medium mb-1.5">
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
                        Alterna entre turno {currentIsNight ? "nocturno" : "diurno"} y {currentIsNight ? "diurno" : "nocturno"} cada ciclo. Solo pinta la línea de este guardia, sin tomar automáticamente el guardia del puesto par.
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
                          {/* Puesto par selector - clear visual card */}
                          <div className="space-y-2">
                            <div>
                              <Label className="text-xs">Puesto donde rotará en turno {currentIsNight ? "diurno" : "nocturno"}</Label>
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                El guardia alternará entre el puesto actual y este puesto cada ciclo. El guardia del puesto par se asigna por separado.
                              </p>
                            </div>

                            {oppositePuestos.length === 1 ? (
                              /* Si solo hay un puesto opuesto, mostrarlo como card fija */
                              <div className="rounded-md border border-border bg-muted/20 p-2.5">
                                <div className="flex items-center gap-2">
                                  <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold border ${
                                    isPuestoNight(oppositePuestos[0].shiftStart)
                                      ? "bg-indigo-500/15 text-indigo-300 border-indigo-500/30"
                                      : "bg-amber-500/15 text-amber-300 border-amber-500/30"
                                  }`}>
                                    {isPuestoNight(oppositePuestos[0].shiftStart) ? "N" : "D"}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-xs font-medium text-foreground truncate">{oppositePuestos[0].name}</p>
                                    <p className="text-[10px] text-muted-foreground">{oppositePuestos[0].shiftStart} - {oppositePuestos[0].shiftEnd}</p>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              /* Si hay múltiples puestos opuestos, dropdown */
                              <select
                                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                                value={serieForm.rotatePuestoId}
                                onChange={(e) => setSerieForm((p) => ({ ...p, rotatePuestoId: e.target.value, rotateSlotNumber: 1 }))}
                              >
                                {oppositePuestos.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name} ({p.shiftStart}-{p.shiftEnd})
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>

                          {/* Slot selection in the paired puesto - only if multiple guards */}
                          {selectedRotatePuesto && selectedRotatePuesto.requiredGuards > 1 && (
                            <div className="space-y-2">
                              <Label className="text-xs">Posición en {selectedRotatePuesto.name}</Label>
                              <p className="text-[10px] text-muted-foreground">
                                Elige en qué posición del puesto par quedará este guardia cuando rote.
                              </p>
                              <div className="grid gap-1.5">
                                {Array.from({ length: selectedRotatePuesto.requiredGuards }, (_, i) => {
                                  const slotNum = i + 1;
                                  const slotAsig = slotAsignaciones.find(
                                    (a) => a.puestoId === serieForm.rotatePuestoId && a.slotNumber === slotNum
                                  );
                                  const isSelected = serieForm.rotateSlotNumber === slotNum;
                                  return (
                                    <button
                                      key={slotNum}
                                      type="button"
                                      onClick={() => setSerieForm((p) => ({ ...p, rotateSlotNumber: slotNum }))}
                                      className={`flex items-center gap-2 rounded-md border-2 px-3 py-2 text-left transition-all ${
                                        isSelected
                                          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                                          : "border-transparent bg-muted/20 hover:border-muted-foreground/20"
                                      }`}
                                    >
                                      <span className={`text-xs font-mono font-medium ${isSelected ? "text-primary" : "text-muted-foreground"}`}>
                                        S{slotNum}
                                      </span>
                                      <div className="flex-1 min-w-0">
                                        {slotAsig ? (
                                          <span className="text-xs text-foreground font-medium truncate block">
                                            {slotAsig.guardia.persona.firstName} {slotAsig.guardia.persona.lastName}
                                          </span>
                                        ) : (
                                          <span className="text-xs text-amber-400/60 italic">Sin guardia asignado</span>
                                        )}
                                      </div>
                                      {isSelected && (
                                        <span className="shrink-0 w-2 h-2 rounded-full bg-primary" />
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Start shift: which puesto goes first */}
                          <div className="space-y-2">
                            <div>
                              <Label className="text-xs">¿Comienza de día o de noche?</Label>
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                Indica en qué puesto arranca el primer ciclo de trabajo.
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => setSerieForm((p) => ({ ...p, startShift: "day" }))}
                                className={`flex-1 rounded-md px-3 py-2.5 text-left border-2 transition-all ${
                                  serieForm.startShift === "day"
                                    ? "border-amber-400 bg-amber-500/10"
                                    : "border-transparent bg-muted/20 hover:border-muted-foreground/20"
                                }`}
                              >
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <span className="rounded-full px-1 py-px text-[8px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">D</span>
                                  <span className={`text-xs font-medium ${serieForm.startShift === "day" ? "text-amber-300" : "text-muted-foreground"}`}>Diurno</span>
                                </div>
                                <p className="text-[9px] text-muted-foreground truncate">
                                  {currentIsNight
                                    ? (selectedRotatePuesto?.name ?? "Puesto diurno")
                                    : (currentPuesto?.name ?? "Puesto actual")}
                                </p>
                              </button>
                              <button
                                type="button"
                                onClick={() => setSerieForm((p) => ({ ...p, startShift: "night" }))}
                                className={`flex-1 rounded-md px-3 py-2.5 text-left border-2 transition-all ${
                                  serieForm.startShift === "night"
                                    ? "border-indigo-400 bg-indigo-500/10"
                                    : "border-transparent bg-muted/20 hover:border-muted-foreground/20"
                                }`}
                              >
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <span className="rounded-full px-1 py-px text-[8px] font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">N</span>
                                  <span className={`text-xs font-medium ${serieForm.startShift === "night" ? "text-indigo-300" : "text-muted-foreground"}`}>Nocturno</span>
                                </div>
                                <p className="text-[9px] text-muted-foreground truncate">
                                  {currentIsNight
                                    ? (currentPuesto?.name ?? "Puesto actual")
                                    : (selectedRotatePuesto?.name ?? "Puesto nocturno")}
                                </p>
                              </button>
                            </div>
                          </div>

                          {/* Visual preview of rotative cycle with puesto names */}
                          {(() => {
                            const pattern = PATTERNS.find((p) => p.code === serieForm.patternCode);
                            if (!pattern) return null;
                            const dayPuesto = currentIsNight ? selectedRotatePuesto : currentPuesto;
                            const nightPuesto = currentIsNight ? currentPuesto : selectedRotatePuesto;
                            const firstPuesto = serieForm.startShift === "day" ? dayPuesto : nightPuesto;
                            const secondPuesto = serieForm.startShift === "day" ? nightPuesto : dayPuesto;
                            return (
                              <div className="rounded-md border border-violet-500/20 bg-violet-500/5 p-3 space-y-2">
                                <p className="text-[10px] font-semibold text-violet-300">Resumen del ciclo rotativo</p>
                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[9px] text-muted-foreground w-12 shrink-0">Ciclo 1</span>
                                    <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
                                      serieForm.startShift === "day"
                                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/20"
                                        : "bg-indigo-500/20 text-indigo-300 border border-indigo-500/20"
                                    }`}>
                                      {pattern.work} días trabajo
                                    </span>
                                    <span className="text-[9px] text-muted-foreground truncate">
                                      en {firstPuesto?.name ?? "—"}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[9px] text-muted-foreground w-12 shrink-0" />
                                    <span className="rounded px-1.5 py-0.5 text-[9px] bg-zinc-700/30 text-zinc-500 border border-zinc-600/20">
                                      {pattern.off} días descanso
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[9px] text-muted-foreground w-12 shrink-0">Ciclo 2</span>
                                    <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
                                      serieForm.startShift === "day"
                                        ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/20"
                                        : "bg-amber-500/20 text-amber-300 border border-amber-500/20"
                                    }`}>
                                      {pattern.work} días trabajo
                                    </span>
                                    <span className="text-[9px] text-muted-foreground truncate">
                                      en {secondPuesto?.name ?? "—"}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[9px] text-muted-foreground w-12 shrink-0" />
                                    <span className="rounded px-1.5 py-0.5 text-[9px] bg-zinc-700/30 text-zinc-500 border border-zinc-600/20">
                                      {pattern.off} días descanso
                                    </span>
                                  </div>
                                  <p className="text-[9px] text-muted-foreground/50 italic pt-0.5">y repite…</p>
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
              <CalendarDays className="h-4 w-4 text-white" />
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
