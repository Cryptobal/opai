"use client";

import { useCallback, useEffect, useState } from "react";
import { Play, Square, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface TurnoData {
  id: string;
  startedAt: string;
  liveStats?: { roundsCompleted: number; alertsGenerated: number };
}

interface Props {
  activeRondasCount: number;
  alertCount: number;
  onOpenCloseTurno: (turnoId: string) => void;
  onToggleAlerts?: () => void;
}

export function MonitoreoTurnoHeader({ activeRondasCount, alertCount, onOpenCloseTurno, onToggleAlerts }: Props) {
  const [turno, setTurno] = useState<TurnoData | null>(null);
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {alertCount > 0 && (
        <button onClick={onToggleAlerts} className="transition-transform hover:scale-105 active:scale-95">
          <Badge variant="outline" className="border-red-500/30 text-red-500 gap-1 cursor-pointer hover:bg-red-500/10">
            <AlertTriangle className="h-3 w-3" /> {alertCount} alertas
          </Badge>
        </button>
      )}
      <div className="flex items-center gap-3">
        {turno ? (
          <>
            <div className="flex items-center gap-2 text-xs">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-muted-foreground">
                Turno activo desde {new Date(turno.startedAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
              </span>
              {turno.liveStats && (
                <span className="text-muted-foreground">
                  · {turno.liveStats.roundsCompleted} rondas · {turno.liveStats.alertsGenerated} alertas
                </span>
              )}
            </div>
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1 text-red-500 border-red-500/30" onClick={() => onOpenCloseTurno(turno.id)}>
              <Square className="h-3 w-3" /> Cerrar turno
            </Button>
          </>
        ) : (
          <Button size="sm" className="h-8 text-xs gap-1" onClick={startTurno} disabled={loading}>
            <Play className="h-3 w-3" /> Iniciar turno de monitoreo
          </Button>
        )}
      </div>
    </div>
  );
}

