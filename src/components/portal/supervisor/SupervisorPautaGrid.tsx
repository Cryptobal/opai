"use client";

import { useEffect, useMemo, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { EmptyState } from "@/components/opai/EmptyState";
import { SupervisorInstallation } from "@/lib/portal-supervisor";

interface Props {
  installations: SupervisorInstallation[];
}

const WEEKDAY_SHORT: Record<number, string> = {
  0: "Dom", 1: "Lun", 2: "Mar", 3: "Mié", 4: "Jue", 5: "Vie", 6: "Sáb",
};

const SHIFT_COLORS: Record<string, string> = {
  T:   "bg-amber-500/20 text-amber-300 border-amber-500/30",
  "-": "bg-zinc-700/30 text-zinc-500 border-zinc-600/20",
  V:   "bg-green-800/30 text-green-400 border-green-600/30",
  L:   "bg-yellow-800/30 text-yellow-400 border-yellow-600/30",
  P:   "bg-orange-800/30 text-orange-400 border-orange-600/30",
  PCG: "bg-amber-800/30 text-amber-400 border-amber-600/30",
  PSG: "bg-orange-800/30 text-orange-400 border-orange-600/30",
  TE:  "bg-rose-800/30 text-rose-400 border-rose-600/30",
};

function toDateKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

type PautaItem = {
  id: string;
  puestoId: string;
  slotNumber: number;
  date: string;
  shiftCode?: string | null;
  puesto: {
    id: string;
    name: string;
    shiftStart: string;
    shiftEnd: string;
    cargo?: { name: string } | null;
    puestoTrabajo?: { name: string } | null;
  };
  plannedGuardia?: {
    id: string;
    persona: { firstName: string; lastName: string };
  } | null;
};

type ExecutionCell = { executed: boolean; absentType: string | null; state?: string };

type CellData = { item: PautaItem; execution?: ExecutionCell };

type MatrixRow = {
  puestoId: string;
  puestoName: string;
  shiftStart: string;
  slotNumber: number;
  guardiaName: string;
  cells: Map<string, CellData>;
};

export function SupervisorPautaGrid({ installations }: Props) {
  const now = new Date();
  const [selectedId, setSelectedId] = useState(installations[0]?.id ?? "");
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [items, setItems] = useState<PautaItem[]>([]);
  const [executionByCell, setExecutionByCell] = useState<Record<string, ExecutionCell>>({});
  const [loading, setLoading] = useState(false);

  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString("es-CL", {
    month: "long",
    year: "numeric",
  });

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    fetch(`/api/ops/pauta-mensual?installationId=${selectedId}&month=${month}&year=${year}`)
      .then((r) => r.json())
      .then((json) => {
        if (!json.data) { setItems([]); return; }
        setItems(json.data.items ?? []);
        setExecutionByCell(json.data.executionByCell ?? {});
      })
      .catch(() => { setItems([]); setExecutionByCell({}); })
      .finally(() => setLoading(false));
  }, [selectedId, month, year]);

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  }

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const days = useMemo(() => {
    const arr: Date[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      arr.push(new Date(Date.UTC(year, month - 1, d)));
    }
    return arr;
  }, [year, month, daysInMonth]);

  const matrix = useMemo(() => {
    const rows = new Map<string, MatrixRow>();
    for (const item of items) {
      const key = `${item.puestoId}|${item.slotNumber}`;
      if (!rows.has(key)) {
        const puestoName = item.puesto.cargo?.name
          ? `${item.puesto.cargo.name} - ${item.puesto.name}`
          : item.puesto.name;
        const guardia = item.plannedGuardia;
        rows.set(key, {
          puestoId: item.puestoId,
          puestoName,
          shiftStart: item.puesto.shiftStart,
          slotNumber: item.slotNumber,
          guardiaName: guardia
            ? `${guardia.persona.firstName} ${guardia.persona.lastName}`.trim()
            : "Sin asignar",
          cells: new Map(),
        });
      }
      const row = rows.get(key)!;
      const dateStr = typeof item.date === "string" ? item.date.slice(0, 10) : "";
      const execKey = `${item.puestoId}|${item.slotNumber}|${dateStr}`;
      row.cells.set(dateStr, { item, execution: executionByCell[execKey] });

      if (item.plannedGuardia && row.guardiaName === "Sin asignar") {
        const g = item.plannedGuardia;
        row.guardiaName = `${g.persona.firstName} ${g.persona.lastName}`.trim();
      }
    }

    return Array.from(rows.values()).sort((a, b) => {
      if (a.puestoName !== b.puestoName) return a.puestoName.localeCompare(b.puestoName);
      return a.slotNumber - b.slotNumber;
    });
  }, [items, executionByCell]);

  const todayKey = toLocalDateKey(new Date());

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-zinc-500 uppercase tracking-wider">Pauta mensual</p>

      <select
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        {installations.map((i) => (
          <option key={i.id} value={i.id}>{i.name}</option>
        ))}
      </select>

      <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5">
        <button onClick={prevMonth} className="p-1 text-zinc-400 hover:text-white">
          <ChevronLeft size={16} />
        </button>
        <span className="text-xs font-medium capitalize">{monthLabel}</span>
        <button onClick={nextMonth} className="p-1 text-zinc-400 hover:text-white">
          <ChevronRight size={16} />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="animate-spin text-zinc-600" size={20} />
        </div>
      ) : matrix.length === 0 ? (
        <EmptyState
          icon={<Calendar size={20} />}
          title="Sin pauta"
          description="No hay pauta configurada para este período."
          compact
        />
      ) : (
        <div className="rounded-xl border border-zinc-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[10px] border-collapse">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="sticky left-0 z-10 bg-zinc-950 text-left pl-2 pr-1 py-1.5 min-w-[100px] text-[10px] font-medium text-zinc-400">
                    Puesto / Guardia
                  </th>
                  {days.map((d) => {
                    const dayNum = d.getUTCDate();
                    const dayName = WEEKDAY_SHORT[d.getUTCDay()];
                    const isWeekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
                    const isToday = toDateKey(d) === todayKey;
                    return (
                      <th
                        key={dayNum}
                        className={`text-center px-0 py-1 min-w-[28px] ${
                          isToday ? "text-blue-400" : isWeekend ? "text-amber-400" : "text-zinc-500"
                        }`}
                      >
                        <div className="text-[8px] leading-tight">{dayName}</div>
                        <div
                          className={`font-semibold text-[10px] ${
                            isToday
                              ? "bg-blue-500 text-white rounded-full w-5 h-5 inline-flex items-center justify-center"
                              : ""
                          }`}
                        >
                          {dayNum}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {matrix.map((row, idx) => {
                  const isFirst = idx === 0 || matrix[idx - 1].puestoId !== row.puestoId;
                  return (
                    <tr
                      key={`${row.puestoId}-${row.slotNumber}`}
                      className={isFirst ? "border-t border-zinc-800" : ""}
                    >
                      <td className="sticky left-0 z-10 bg-zinc-950 pl-2 pr-1 py-1 align-top min-w-[100px]">
                        {isFirst && (
                          <div className="text-[10px] font-medium text-zinc-200 truncate max-w-[120px] leading-tight">
                            {row.puestoName}
                          </div>
                        )}
                        <div className="text-[9px] text-zinc-500 truncate max-w-[120px] leading-tight flex items-center gap-1">
                          <span className="text-zinc-600 font-mono">S{row.slotNumber}</span>
                          <span className="truncate">
                            {row.guardiaName}
                          </span>
                        </div>
                      </td>
                      {days.map((d) => {
                        const dateKey = toDateKey(d);
                        const cellData = row.cells.get(dateKey);
                        const code = cellData?.item?.shiftCode ?? "";
                        const isEmpty = !cellData || !code;
                        const isTrabajo = code === "T";
                        const h = parseInt(row.shiftStart.split(":")[0], 10);
                        const isNight = h >= 18 || h < 6;
                        const trabajoClass = isNight
                          ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/30"
                          : "bg-amber-500/20 text-amber-300 border-amber-500/30";
                        const colorClass = isTrabajo
                          ? trabajoClass
                          : (SHIFT_COLORS[code] ?? SHIFT_COLORS["-"] ?? "");

                        const exec = cellData?.execution;
                        const execBadge =
                          exec?.state === "te" ? "TE"
                            : exec?.state === "asistio" ? "ASI"
                            : exec?.state === "sin_cobertura" ? "SC"
                            : null;
                        const execClass =
                          exec?.state === "te" ? "bg-rose-600 text-rose-50"
                            : exec?.state === "asistio" ? "bg-emerald-600 text-emerald-50"
                            : exec?.state === "sin_cobertura" ? "bg-amber-500 text-amber-950"
                            : "";

                        return (
                          <td key={dateKey} className="text-center px-0 py-0.5">
                            {cellData ? (
                              <div
                                className={`relative inline-flex items-center justify-center w-6 h-6 rounded text-[9px] font-medium border ${
                                  isEmpty
                                    ? "border-dashed border-zinc-700/40 text-zinc-600"
                                    : colorClass
                                }`}
                                title={
                                  cellData.item?.plannedGuardia
                                    ? `${cellData.item.plannedGuardia.persona.firstName} ${cellData.item.plannedGuardia.persona.lastName}`
                                    : "Sin asignar"
                                }
                              >
                                {isEmpty ? "·" : isTrabajo ? "T" : code}
                                {execBadge && (
                                  <span
                                    className={`absolute -bottom-1 -right-1 rounded px-0.5 text-[7px] leading-none font-bold ${execClass}`}
                                  >
                                    {execBadge}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div className="inline-flex items-center justify-center w-6 h-6 text-zinc-800">
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
          </div>
          {/* Legend */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 px-3 py-2 border-t border-zinc-800 text-[8px] text-zinc-500">
            <span><span className="inline-block w-3 h-3 rounded bg-amber-500/20 border border-amber-500/30 align-middle mr-0.5" /> TD</span>
            <span><span className="inline-block w-3 h-3 rounded bg-indigo-500/20 border border-indigo-500/30 align-middle mr-0.5" /> TN</span>
            <span><span className="inline-block w-3 h-3 rounded bg-zinc-700/30 border border-zinc-600/20 align-middle mr-0.5" /> Descanso</span>
            <span><span className="inline-block w-3 h-3 rounded bg-green-800/30 border border-green-600/30 align-middle mr-0.5" /> Vacaciones</span>
            <span><span className="inline-block w-3 h-3 rounded bg-yellow-800/30 border border-yellow-600/30 align-middle mr-0.5" /> Licencia</span>
          </div>
        </div>
      )}

      <p className="text-[10px] text-zinc-600 text-center">Vista de solo lectura</p>
    </div>
  );
}
