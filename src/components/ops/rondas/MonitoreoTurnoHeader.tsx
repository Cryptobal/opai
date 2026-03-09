"use client";

import { useCallback, useEffect, useState } from "react";
import { Play, Square, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TurnoData {
  id: string;
  startedAt: string;
  liveStats?: { roundsCompleted: number; alertsGenerated: number };
}

interface Props {
  activeRondasCount: number;
  alertCount: number;
  completedCount: number;
  missedCount: number;
  trustAvg: number;
  operatorName: string;
  onOpenCloseTurno?: (turnoId: string) => void;
  onToggleAlerts?: () => void;
  isReadOnly?: boolean;
}

function formatDuration(startedAt: string): string {
  const diff = Date.now() - new Date(startedAt).getTime();
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function MonitoreoTurnoHeader({
  activeRondasCount,
  alertCount,
  completedCount,
  missedCount,
  trustAvg,
  operatorName,
  onOpenCloseTurno,
  onToggleAlerts,
  isReadOnly,
}: Props) {
  const [turno, setTurno] = useState<TurnoData | null>(null);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState("");

  const fetchTurno = useCallback(async () => {
    try {
      const res = await fetch("/api/ops/rondas/monitoreo/turno/active");
      const json = await res.json();
      if (json.success) setTurno(json.data);
      else setTurno(null);
    } catch {
      setTurno(null);
    }
  }, []);

  useEffect(() => {
    void fetchTurno();
  }, [fetchTurno]);

  // Update elapsed time every minute
  useEffect(() => {
    if (!turno) return;
    setElapsed(formatDuration(turno.startedAt));
    const interval = setInterval(() => setElapsed(formatDuration(turno.startedAt)), 60000);
    return () => clearInterval(interval);
  }, [turno]);

  const startTurno = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ops/rondas/monitoreo/turno/start", { method: "POST" });
      const json = await res.json();
      if (json.success) setTurno(json.data);
    } finally {
      setLoading(false);
    }
  };

  if (!turno) {
    if (isReadOnly) return null;
    return (
      <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5">
        <Button size="sm" className="h-8 text-xs gap-1.5" onClick={startTurno} disabled={loading}>
          <Play className="h-3 w-3" /> Iniciar turno de monitoreo
        </Button>
      </div>
    );
  }

  const startTime = new Date(turno.startedAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-[#1e293b] bg-[#111827] px-4 py-2">
      {/* Live indicator + turno info */}
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">En vivo</span>
        <span className="text-[11px] text-[#475569]">·</span>
        <span className="text-[11px] text-[#94a3b8]">Turno {startTime}</span>
        <span className="text-[11px] text-[#475569]">·</span>
        <span className="text-[11px] font-mono text-[#94a3b8]">{elapsed}</span>
        <span className="text-[11px] text-[#475569]">·</span>
        <span className="text-[11px] text-[#94a3b8]">Op: {operatorName}</span>
      </div>

      {/* KPI badges */}
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
          {activeRondasCount} en curso
        </span>
        <span className="rounded-full bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 text-[10px] font-semibold text-blue-400">
          {completedCount} completadas
        </span>
        {missedCount > 0 && (
          <span className="rounded-full bg-red-500/10 border border-red-500/20 px-2 py-0.5 text-[10px] font-semibold text-red-400">
            {missedCount} omitidas
          </span>
        )}
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
          trustAvg >= 80 ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
          : trustAvg >= 60 ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
          : "bg-red-500/10 border-red-500/20 text-red-400"
        }`}>
          Trust {trustAvg}
        </span>
      </div>

      {/* Alerts + close turno */}
      <div className="flex items-center gap-2 ml-auto">
        {alertCount > 0 && (
          <button onClick={onToggleAlerts} className="transition-transform hover:scale-105 active:scale-95">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 border border-red-500/30 px-2.5 py-1 text-[10px] font-semibold text-red-400 animate-pulse">
              <AlertTriangle className="h-3 w-3" /> {alertCount} alerta{alertCount !== 1 ? "s" : ""}
            </span>
          </button>
        )}
        {!isReadOnly && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px] gap-1 text-red-400 border-red-500/30 hover:bg-red-500/10"
            onClick={() => onOpenCloseTurno?.(turno.id)}
          >
            <Square className="h-3 w-3" /> Cerrar turno
          </Button>
        )}
      </div>
    </div>
  );
}
