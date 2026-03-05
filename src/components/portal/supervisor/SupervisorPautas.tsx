"use client";

import { useEffect, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight, Loader2, Users } from "lucide-react";
import { EmptyState } from "@/components/opai/EmptyState";
import { SupervisorInstallation } from "@/lib/portal-supervisor";

interface Props {
  installations: SupervisorInstallation[];
}

interface PautaEntry {
  id: string;
  date: string;
  guardiaId: string | null;
  guardiaName: string;
  puestoName: string;
  turnoCode: string;
  executed: boolean;
  absentType: string | null;
}

export function SupervisorPautas({ installations }: Props) {
  const now = new Date();
  const [selectedInstallationId, setSelectedInstallationId] = useState(
    installations[0]?.id ?? ""
  );
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [entries, setEntries] = useState<PautaEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString("es-CL", {
    month: "long",
    year: "numeric",
  });

  useEffect(() => {
    if (!selectedInstallationId) return;
    setLoading(true);
    fetch(
      `/api/ops/pauta-mensual?installationId=${selectedInstallationId}&month=${month}&year=${year}`
    )
      .then((r) => r.json())
      .then((json) => {
        if (json.data) {
          // Flatten pauta entries from the API structure
          const flat: PautaEntry[] = [];
          const items = Array.isArray(json.data) ? json.data : json.data.items ?? [];
          for (const item of items) {
            if (Array.isArray(item.series)) {
              for (const s of item.series) {
                flat.push({
                  id: `${item.id}-${s.date}`,
                  date: s.date,
                  guardiaId: item.guardiaId ?? null,
                  guardiaName: item.guardiaName ?? "Sin asignar",
                  puestoName: item.puestoName ?? item.puesto?.name ?? "Puesto",
                  turnoCode: item.turnoCode ?? item.turno?.code ?? "",
                  executed: s.executed ?? false,
                  absentType: s.absentType ?? null,
                });
              }
            }
          }
          setEntries(flat);
        }
      })
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [selectedInstallationId, month, year]);

  function prevMonth() {
    if (month === 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (month === 12) {
      setMonth(1);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  }

  // Group entries by date
  const byDate = entries.reduce<Record<string, PautaEntry[]>>((acc, e) => {
    if (!acc[e.date]) acc[e.date] = [];
    acc[e.date].push(e);
    return acc;
  }, {});

  const dates = Object.keys(byDate).sort();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-3 px-4 py-4 pb-24">
      <h2 className="text-lg font-semibold">Pautas</h2>

      {/* Installation selector */}
      {installations.length > 1 && (
        <select
          value={selectedInstallationId}
          onChange={(e) => setSelectedInstallationId(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {installations.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
      )}

      {/* Month navigator */}
      <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
        <button onClick={prevMonth} className="p-1 text-zinc-400 hover:text-white">
          <ChevronLeft size={18} />
        </button>
        <span className="text-sm font-medium capitalize">{monthLabel}</span>
        <button onClick={nextMonth} className="p-1 text-zinc-400 hover:text-white">
          <ChevronRight size={18} />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="animate-spin text-zinc-600" size={24} />
        </div>
      ) : dates.length === 0 ? (
        <EmptyState
          icon={<Calendar size={24} />}
          title="Sin pauta"
          description="No hay pauta configurada para este período."
          compact
        />
      ) : (
        <div className="flex flex-col gap-2">
          {dates.map((date) => {
            const isToday = date === today;
            const dayLabel = new Date(date + "T12:00:00").toLocaleDateString("es-CL", {
              weekday: "short",
              day: "numeric",
            });
            return (
              <div
                key={date}
                className={`rounded-xl border overflow-hidden ${
                  isToday ? "border-blue-600/50 bg-blue-950/20" : "border-zinc-800 bg-zinc-900"
                }`}
              >
                <div
                  className={`px-4 py-2 flex items-center gap-2 border-b ${
                    isToday ? "border-blue-600/30" : "border-zinc-800"
                  }`}
                >
                  <Calendar size={12} className={isToday ? "text-blue-400" : "text-zinc-500"} />
                  <span
                    className={`text-xs font-medium capitalize ${
                      isToday ? "text-blue-300" : "text-zinc-300"
                    }`}
                  >
                    {dayLabel}
                  </span>
                  {isToday && (
                    <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">
                      Hoy
                    </span>
                  )}
                </div>
                <div className="divide-y divide-zinc-800/50">
                  {byDate[date].map((e) => (
                    <PautaRow key={e.id} entry={e} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-zinc-600 text-center">Vista de solo lectura</p>
    </div>
  );
}

function PautaRow({ entry }: { entry: PautaEntry }) {
  const absentColor: Record<string, string> = {
    licencia: "text-amber-400",
    vacaciones: "text-blue-400",
    ausente: "text-red-400",
    turno_extra: "text-purple-400",
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center">
        <Users size={12} className="text-zinc-400" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-zinc-200 truncate">{entry.guardiaName}</p>
        <p className="text-[10px] text-zinc-500 truncate">
          {entry.puestoName}
          {entry.turnoCode ? ` · ${entry.turnoCode}` : ""}
        </p>
      </div>
      {entry.absentType ? (
        <span className={`text-[10px] ${absentColor[entry.absentType] ?? "text-zinc-400"} capitalize`}>
          {entry.absentType.replace("_", " ")}
        </span>
      ) : entry.executed ? (
        <span className="text-[10px] text-emerald-400">OK</span>
      ) : null}
    </div>
  );
}
