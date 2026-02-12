"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { CalendarDays, RefreshCw } from "lucide-react";

/* ── constants ─────────────────────────────────── */

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const WEEKDAY_SHORT: Record<number, string> = {
  0: "Dom", 1: "Lun", 2: "Mar", 3: "Mié", 4: "Jue", 5: "Vie", 6: "Sáb",
};

const PATTERNS = [
  { code: "4x4", work: 4, off: 4, label: "4x4" },
  { code: "5x2", work: 5, off: 2, label: "5x2" },
  { code: "7x7", work: 7, off: 7, label: "7x7" },
  { code: "6x1", work: 6, off: 1, label: "6x1" },
  { code: "2x2", work: 2, off: 2, label: "2x2" },
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
  guardia?: {
    id: string;
    code?: string | null;
    persona: { firstName: string; lastName: string };
  } | null;
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

interface OpsPautaMensualClientProps {
  initialClients: ClientOption[];
  guardias: GuardiaOption[];
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

/* ── main component ────────────────────────────── */

export function OpsPautaMensualClient({
  initialClients,
  guardias,
}: OpsPautaMensualClientProps) {
  const today = new Date();
  const [clients] = useState<ClientOption[]>(initialClients);
  const [clientId, setClientId] = useState<string>(initialClients[0]?.id ?? "");
  const [installationId, setInstallationId] = useState<string>(
    initialClients[0]?.installations?.[0]?.id ?? ""
  );
  const [month, setMonth] = useState<number>(today.getUTCMonth() + 1);
  const [year, setYear] = useState<number>(today.getUTCFullYear());
  const [overwrite, setOverwrite] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [items, setItems] = useState<PautaItem[]>([]);
  const [series, setSeries] = useState<SerieInfo[]>([]);
  const [slotAsignaciones, setSlotAsignaciones] = useState<SlotAsignacion[]>([]);

  // Serie painting modal
  const [serieModalOpen, setSerieModalOpen] = useState(false);
  const [serieForm, setSerieForm] = useState({
    puestoId: "",
    slotNumber: 1,
    guardiaId: "",
    patternCode: "4x4",
    startDate: "",
    startPosition: 1,
  });
  const [serieSaving, setSerieSaving] = useState(false);

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

  // Fetch pauta
  const fetchPauta = useCallback(async () => {
    if (!installationId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/ops/pauta-mensual?installationId=${installationId}&month=${month}&year=${year}`,
        { cache: "no-store" }
      );
      const payload = await res.json();
      if (!res.ok || !payload.success)
        throw new Error(payload.error || "Error cargando pauta");
      setItems(payload.data.items as PautaItem[]);
      setSeries(payload.data.series as SerieInfo[]);
      if (payload.data.asignaciones) {
        setSlotAsignaciones(payload.data.asignaciones as SlotAsignacion[]);
      }
    } catch (error) {
      console.error(error);
      toast.error("No se pudo cargar la pauta mensual");
    } finally {
      setLoading(false);
    }
  }, [installationId, month, year]);

  useEffect(() => {
    void fetchPauta();
  }, [fetchPauta]);

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

    // Enrich with serie info (pattern code only)
    for (const s of series) {
      const key: RowKey = `${s.puestoId}|${s.slotNumber}`;
      const row = rows.get(key);
      if (row) {
        row.patternCode = s.patternCode;
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

  // Generate pauta
  const handleGenerate = async () => {
    if (!installationId) {
      toast.error("Selecciona una instalación");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/ops/pauta-mensual/generar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ installationId, month, year, overwrite }),
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

  // Open serie modal
  const openSerieModal = (puestoId: string, slotNumber: number, dateKey: string) => {
    setSerieForm({
      puestoId,
      slotNumber,
      guardiaId: "",
      patternCode: "4x4",
      startDate: dateKey,
      startPosition: 1,
    });
    setSerieModalOpen(true);
  };

  // Paint serie
  const handlePaintSerie = async () => {
    if (!serieForm.guardiaId) {
      toast.error("Selecciona un guardia");
      return;
    }
    const pattern = PATTERNS.find((p) => p.code === serieForm.patternCode);
    if (!pattern) return;

    setSerieSaving(true);
    try {
      const res = await fetch("/api/ops/pauta-mensual/pintar-serie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          puestoId: serieForm.puestoId,
          slotNumber: serieForm.slotNumber,
          guardiaId: serieForm.guardiaId,
          patternCode: pattern.code,
          patternWork: pattern.work,
          patternOff: pattern.off,
          startDate: serieForm.startDate,
          startPosition: serieForm.startPosition,
          month,
          year,
        }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success)
        throw new Error(payload.error || "Error pintando serie");
      toast.success(`Serie pintada (${payload.data.updated} días)`);
      setSerieModalOpen(false);
      await fetchPauta();
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || "No se pudo pintar la serie");
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

  /* ── render ── */
  return (
    <div className="space-y-4">
      {/* Controls */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Cliente</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Instalación</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={installationId}
                onChange={(e) => setInstallationId(e.target.value)}
              >
                {installations.map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {inst.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Mes</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
              >
                {MESES.map((nombre, idx) => (
                  <option key={idx} value={idx + 1}>
                    {nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Año</Label>
              <Input
                type="number"
                min={2020}
                max={2100}
                value={year}
                onChange={(e) => setYear(Number(e.target.value) || year)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={overwrite}
                onChange={(e) => setOverwrite(e.target.checked)}
              />
              Sobrescribir planificación existente
            </label>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => void fetchPauta()} disabled={loading} size="sm">
                <RefreshCw className="mr-2 h-4 w-4" />
                Recargar
              </Button>
              <Button onClick={handleGenerate} disabled={loading} size="sm">
                <CalendarDays className="mr-2 h-4 w-4" />
                {loading ? "Generando..." : "Generar pauta"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Matrix */}
      <Card>
        <CardContent className="pt-5">
          {matrix.length === 0 ? (
            <EmptyState
              icon={<CalendarDays className="h-8 w-8" />}
              title="Sin pauta mensual"
              description="Genera la pauta para comenzar a planificar."
              compact
            />
          ) : (
            <div className="overflow-x-auto -mx-6 px-6">
              <table className="w-full text-xs border-collapse min-w-[800px]">
                <thead>
                  <tr className="border-b border-border">
                    <th className="sticky left-0 z-10 bg-card text-left px-2 py-2 w-[200px] min-w-[200px]">
                      Puesto / Guardia
                    </th>
                    {monthDays.map((d) => {
                      const dayNum = d.getUTCDate();
                      const dayName = WEEKDAY_SHORT[d.getUTCDay()];
                      const isWeekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
                      return (
                        <th
                          key={dayNum}
                          className={`text-center px-0.5 py-1 min-w-[32px] ${
                            isWeekend ? "text-amber-400" : "text-muted-foreground"
                          }`}
                        >
                          <div className="text-[10px] leading-tight">{dayName}</div>
                          <div className="font-semibold">{dayNum}</div>
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
                        {/* Row header */}
                        <td className="sticky left-0 z-10 bg-card px-2 py-1.5 align-top">
                          {isFirstSlot && (
                            <div className="font-medium text-foreground leading-tight flex items-center gap-1.5">
                              {row.puestoName}
                              {(() => {
                                const h = parseInt(row.shiftStart.split(":")[0], 10);
                                const night = h >= 18 || h < 6;
                                return (
                                  <span className={`rounded-full px-1 py-0 text-[8px] font-semibold border ${
                                    night
                                      ? "bg-indigo-500/15 text-indigo-300 border-indigo-500/30"
                                      : "bg-amber-500/15 text-amber-300 border-amber-500/30"
                                  }`}>
                                    {night ? "Noche" : "Día"}
                                  </span>
                                );
                              })()}
                            </div>
                          )}
                          {isFirstSlot && (
                            <div className="text-[10px] text-muted-foreground">
                              {row.shiftStart}-{row.shiftEnd}
                            </div>
                          )}
                          <div className="text-[10px] mt-0.5 flex items-center gap-1">
                            <span className="text-muted-foreground font-mono">
                              S{row.slotNumber}
                            </span>
                            {row.guardiaName ? (
                              row.guardiaId ? (
                                <Link
                                  href={`/personas/guardias/${row.guardiaId}`}
                                  className="text-foreground font-medium truncate max-w-[120px] hover:text-primary hover:underline underline-offset-2 transition-colors"
                                >
                                  {row.guardiaName}
                                </Link>
                              ) : (
                                <span className="text-foreground font-medium truncate max-w-[120px]">
                                  {row.guardiaName}
                                </span>
                              )
                            ) : (
                              <span className="text-amber-400/60 italic text-[9px]">sin asignar</span>
                            )}
                            {row.patternCode && (
                              <span className="text-primary/50 text-[9px]">{row.patternCode}</span>
                            )}
                          </div>
                        </td>

                        {/* Day cells */}
                        {monthDays.map((d) => {
                          const dateKey = toDateKey(d);
                          const cell = row.cells.get(dateKey);
                          const code = cell?.shiftCode ?? "";
                          const isEmpty = !code;
                          const colorClass = SHIFT_COLORS[code] ?? "";

                          return (
                            <td
                              key={dateKey}
                              className="text-center px-0.5 py-0.5"
                            >
                              {cell ? (
                                <div
                                  className={`inline-flex items-center justify-center w-7 h-6 rounded text-[10px] font-medium border cursor-pointer transition-colors ${
                                    isEmpty
                                      ? "border-dashed border-border/40 text-muted-foreground/30 hover:border-primary/50 hover:text-primary/50"
                                      : colorClass
                                  }`}
                                  title={
                                    cell.plannedGuardia
                                      ? `${cell.plannedGuardia.persona.firstName} ${cell.plannedGuardia.persona.lastName}`
                                      : "Sin asignar"
                                  }
                                  onClick={() => {
                                    if (isEmpty) {
                                      openSerieModal(row.puestoId, row.slotNumber, dateKey);
                                    }
                                  }}
                                  onContextMenu={(e) => {
                                    e.preventDefault();
                                    if (!cell) return;
                                    // Right-click: cycle through special codes
                                    const codes = ["T", "-", "V", "L", "P"];
                                    const currentIdx = codes.indexOf(code);
                                    const nextCode = codes[(currentIdx + 1) % codes.length];
                                    void handleCellStatusChange(cell, nextCode);
                                  }}
                                >
                                  {code || "·"}
                                </div>
                              ) : (
                                <div
                                  className="inline-flex items-center justify-center w-7 h-6 rounded text-[10px] border border-dashed border-border/20 text-muted-foreground/20 cursor-pointer hover:border-primary/40"
                                  onClick={() => openSerieModal(row.puestoId, row.slotNumber, dateKey)}
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

              {/* Legend */}
              <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-muted-foreground border-t border-border pt-3">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-4 h-3 rounded bg-emerald-600/20 border border-emerald-600/30" />
                  T = Trabaja
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-4 h-3 rounded bg-zinc-700/30 border border-zinc-600/20" />
                  - = Descanso
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-4 h-3 rounded bg-green-800/30 border border-green-600/30" />
                  V = Vacaciones
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-4 h-3 rounded bg-yellow-800/30 border border-yellow-600/30" />
                  L = Licencia
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-4 h-3 rounded bg-orange-800/30 border border-orange-600/30" />
                  P = Permiso
                </span>
                <span className="text-muted-foreground/50">
                  Click en celda vacía = pintar serie · Click derecho = cambiar estado
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

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
              <Label>Guardia</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={serieForm.guardiaId}
                onChange={(e) => setSerieForm((p) => ({ ...p, guardiaId: e.target.value }))}
              >
                <option value="">Seleccionar guardia...</option>
                {guardias.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.persona.firstName} {g.persona.lastName}
                    {g.code ? ` (${g.code})` : ""}
                    {g.persona.rut ? ` - ${g.persona.rut}` : ""}
                  </option>
                ))}
              </select>
            </div>

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
    </div>
  );
}
