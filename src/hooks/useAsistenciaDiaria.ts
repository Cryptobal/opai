"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { formatPersonName } from "@/lib/personas";
import type {
  AsistenciaItem,
  AsistenciaMetrics,
  ClientOption,
  GuardiaOption,
  InstallationGroup,
} from "@/types/ops-asistencia";
import { isDayShift } from "@/types/ops-asistencia";

// ── Date helpers ────────────────────────────────────────────────────────

const DATE_INPUT_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function toDateInput(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDateLocal(dateStr: string): Date {
  if (!dateStr || !DATE_INPUT_REGEX.test(dateStr)) return new Date();
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

// ── Patch result type ───────────────────────────────────────────────────

export type PatchResult = {
  ok: boolean;
  data?: AsistenciaItem;
  error?: string;
  code?: string;
};

// ── Hook ────────────────────────────────────────────────────────────────

export interface UseAsistenciaDiariaOptions {
  initialClients: ClientOption[];
  guardias: GuardiaOption[];
}

export function useAsistenciaDiaria({ initialClients, guardias }: UseAsistenciaDiariaOptions) {
  const searchParams = useSearchParams();
  const urlDate = searchParams.get("date");
  const urlGuardiaId = searchParams.get("guardiaId");

  // ── Core state ────────────────────────────────────────────────────────

  const [clients] = useState<ClientOption[]>(initialClients);
  const [clientId, setClientId] = useState<string>("all");
  const [installationId, setInstallationId] = useState<string>("all");
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    if (urlDate && DATE_INPUT_REGEX.test(urlDate)) return urlDate;
    return toDateInput(new Date());
  });
  const [shiftFilter, setShiftFilter] = useState<"todos" | "dia" | "noche">("todos");
  const [kpiFilter, setKpiFilter] = useState<"todos" | "cubiertos" | "ppc" | "te">("todos");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [items, setItems] = useState<AsistenciaItem[]>([]);

  // ── Sync date from URL ────────────────────────────────────────────────

  useEffect(() => {
    if (urlDate && DATE_INPUT_REGEX.test(urlDate)) setSelectedDate(urlDate);
  }, [urlDate]);

  // ── Derived: installations from selected client ───────────────────────

  const installations = useMemo(() => {
    if (clientId === "all") return clients.flatMap((c) => c.installations);
    return clients.find((c) => c.id === clientId)?.installations ?? [];
  }, [clients, clientId]);

  // ── Fetch data ────────────────────────────────────────────────────────

  const fetchAsistencia = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ date: selectedDate });
      if (installationId !== "all") params.set("installationId", installationId);
      const res = await fetch(`/api/ops/asistencia?${params.toString()}`, { cache: "no-store" });
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        throw new Error(
          (payload as { errorDetail?: string }).errorDetail ||
            (payload as { error?: string }).error ||
            "Error cargando asistencia"
        );
      }
      setItems(payload.data.items as AsistenciaItem[]);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "No se pudo cargar la asistencia diaria");
    } finally {
      setLoading(false);
    }
  }, [installationId, selectedDate]);

  useEffect(() => {
    void fetchAsistencia();
  }, [fetchAsistencia]);

  // ── Date navigation ───────────────────────────────────────────────────

  const navigateDate = useCallback((dir: -1 | 1) => {
    setSelectedDate((prev) => {
      const d = parseDateLocal(prev);
      d.setDate(d.getDate() + dir);
      return toDateInput(d);
    });
  }, []);

  const isToday = selectedDate === toDateInput(new Date());

  // ── Filtering ─────────────────────────────────────────────────────────

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

  const filteredItems = useMemo(() => {
    if (kpiFilter === "todos") return shiftFilteredItems;
    return shiftFilteredItems.filter((item) => {
      if (kpiFilter === "cubiertos")
        return item.attendanceStatus === "asistio" || item.attendanceStatus === "reemplazo";
      if (kpiFilter === "ppc") return !item.plannedGuardiaId;
      if (kpiFilter === "te")
        return item.turnosExtra?.some((t) => t.status !== "rejected");
      return true;
    });
  }, [shiftFilteredItems, kpiFilter]);

  // ── Grouped by installation ───────────────────────────────────────────

  const groupedByInstallation = useMemo(() => {
    const map = new Map<string, InstallationGroup>();
    for (const item of filteredItems) {
      const key = item.installation.id;
      if (!map.has(key)) map.set(key, { name: item.installation.name, items: [] });
      map.get(key)!.items.push(item);
    }
    return Array.from(map.entries()).sort(([, a], [, b]) => a.name.localeCompare(b.name));
  }, [filteredItems]);

  // ── Metrics (without KPI filter, to keep numbers stable) ──────────────

  const metrics: AsistenciaMetrics = useMemo(() => {
    let total = 0,
      cubiertos = 0,
      ppc = 0,
      te = 0;
    for (const item of shiftFilteredItems) {
      total++;
      if (item.attendanceStatus === "asistio" || item.attendanceStatus === "reemplazo") cubiertos++;
      if (!item.plannedGuardiaId) ppc++;
      if (item.turnosExtra?.some((t) => t.status !== "rejected")) te++;
    }
    const coberturaPct = total > 0 ? Math.round((cubiertos / total) * 100) : 0;
    return { total, cubiertos, ppc, te, coberturaPct };
  }, [shiftFilteredItems]);

  // ── KPI click handler ─────────────────────────────────────────────────

  const handleKpiClick = useCallback(
    (kpi: "todos" | "cubiertos" | "ppc" | "te") => {
      const finalKpi = kpiFilter === kpi && kpi !== "todos" ? "todos" : kpi;
      setLoading(true);
      setTimeout(() => {
        setKpiFilter(finalKpi);
        setLoading(false);
      }, 150);
    },
    [kpiFilter]
  );

  // ── Patch asistencia ──────────────────────────────────────────────────

  const patchAsistencia = useCallback(
    async (id: string, payload: Record<string, unknown>): Promise<PatchResult> => {
      setSavingId(id);
      try {
        const res = await fetch(`/api/ops/asistencia/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();

        if (res.status === 409 && data.code === "CONTRADICCION_MARCACION_ELECTRONICA") {
          return { ok: false, error: data.error as string, code: data.code as string };
        }

        if (!res.ok || !data.success) {
          const errMsg = data.error || "Error actualizando asistencia";
          toast.error(errMsg);
          return { ok: false, error: errMsg };
        }

        const updatedItem = data.data as AsistenciaItem;
        setItems((prev) => prev.map((row) => (row.id === id ? updatedItem : row)));
        return { ok: true, data: updatedItem };
      } catch (error) {
        const msg = error instanceof Error ? error.message : "No se pudo actualizar la asistencia";
        toast.error(msg);
        return { ok: false, error: msg };
      } finally {
        setSavingId(null);
      }
    },
    []
  );

  // ── Replacement guard filtering ───────────────────────────────────────

  const filterGuardias = useCallback(
    (query: string): GuardiaOption[] => {
      const q = query.trim().toLowerCase();
      if (!q) return guardias.slice(0, 20);
      return guardias
        .filter((g) => {
          const hay = `${formatPersonName(g.persona.firstName, g.persona.lastName)} ${g.code ?? ""} ${g.persona.rut ?? ""}`.toLowerCase();
          return hay.includes(q);
        })
        .slice(0, 20);
    },
    [guardias]
  );

  // ── Return ────────────────────────────────────────────────────────────

  return {
    // Data
    items,
    loading,
    savingId,

    // Date nav
    selectedDate,
    setSelectedDate,
    navigateDate,
    isToday,

    // Filters
    shiftFilter,
    setShiftFilter,
    kpiFilter,
    handleKpiClick,
    clientId,
    setClientId,
    installationId,
    setInstallationId,

    // Derived
    clients,
    installations,
    groupedByInstallation,
    metrics,
    filteredItems,
    guardias,

    // Actions
    patchAsistencia,
    refetch: fetchAsistencia,
    filterGuardias,
  };
}
