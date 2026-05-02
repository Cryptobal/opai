"use client";

import { useCallback, useEffect, useState } from "react";
import { Play, Square, AlertTriangle, Moon, Sun, Loader2, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  onTurnoStarted?: () => void;
  isReadOnly?: boolean;
  canCloseTurno?: boolean;
  activeTurnoId?: string;
  orphanCount?: number;
  onCloseOrphans?: () => void;
  closingOrphans?: boolean;
  onOpenCoberturaSheet?: (turno: "nocturno" | "diurno") => void;
  onSendCoberturaEmail?: (turnoFilter: "nocturno" | "diurno") => void;
  sendingCoberturaEmail?: "nocturno" | "diurno" | null;
}

function formatDuration(startedAt: string): string {
  const diff = Date.now() - new Date(startedAt).getTime();
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function trustColor(score: number): string {
  if (score >= 80) return "text-status-ok-fg";
  if (score >= 60) return "text-status-warn-fg";
  return "text-status-danger-fg";
}

function trustBorder(score: number): string {
  if (score >= 80) return "border-status-ok-border bg-status-ok-soft";
  if (score >= 60) return "border-status-warn-border bg-status-warn-soft";
  return "border-status-danger-border bg-status-danger-soft";
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
  onTurnoStarted,
  isReadOnly,
  canCloseTurno,
  activeTurnoId,
  orphanCount,
  onCloseOrphans,
  closingOrphans,
  onOpenCoberturaSheet,
  onSendCoberturaEmail,
  sendingCoberturaEmail,
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
      if (json.success) {
        setTurno(json.data);
        onTurnoStarted?.();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCoberturaClick = (turnoFilter: "nocturno" | "diurno") => {
    if (onOpenCoberturaSheet) {
      onOpenCoberturaSheet(turnoFilter);
    } else {
      onSendCoberturaEmail?.(turnoFilter);
    }
  };

  // Effective turno ID: from own fetch or from parent (for admin override)
  const effectiveTurnoId = turno?.id ?? activeTurnoId;

  // ── Sin turno state ──
  if (!turno && !effectiveTurnoId) {
    if (isReadOnly) return null;
    return (
      <div className="flex items-center justify-center gap-3 h-14 bg-[#0a0f1c]/95 backdrop-blur border-b border-[#1a1f2e] px-4">
        <Radio className="h-4 w-4 text-[#64748b]" />
        <span className="text-[12px] text-[#64748b]">Sin turno activo</span>
        <Button
          size="sm"
          className="h-8 text-xs gap-1.5 bg-status-info hover:brightness-110 text-white"
          onClick={startTurno}
          disabled={loading}
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
          Iniciar turno
        </Button>
      </div>
    );
  }

  const startTime = turno ? new Date(turno.startedAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }) : null;
  const isSending = !!sendingCoberturaEmail;

  return (
    <div className="flex items-center h-14 bg-[#0a0f1c]/95 backdrop-blur border-b border-[#1a1f2e] px-4 gap-4">
      {/* ── Left: EN VIVO + turno info ── */}
      <div className="flex items-center gap-2.5 shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-status-ok opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-status-ok" />
          </span>
          <span className="text-[11px] font-bold text-status-ok-fg uppercase tracking-widest">En vivo</span>
        </div>
        <span className="text-[#1a1f2e]">|</span>
        {startTime && (
          <>
            <span className="text-[11px] text-[#94a3b8]">{startTime}</span>
            <span className="text-[10px] text-[#475569]">·</span>
            <span className="text-[13px] font-mono font-semibold text-[#f1f5f9] tabular-nums">{elapsed}</span>
            <span className="text-[9px] text-[#475569] -ml-1">hrs</span>
          </>
        )}
        <span className="text-[10px] text-[#64748b] truncate max-w-[120px]">{operatorName}</span>
      </div>

      {/* ── Center: KPI chips ── */}
      <div className="flex items-center gap-2 mx-auto">
        <KpiChip
          label="EN CURSO"
          value={activeRondasCount}
          className="border-status-info-border bg-status-info-soft text-status-info-fg"
        />
        <KpiChip
          label="COMPLETADAS"
          value={completedCount}
          className="border-status-ok-border bg-status-ok-soft text-status-ok-fg"
        />
        <KpiChip
          label="OMITIDAS"
          value={missedCount}
          className={cn(
            "border-status-danger-border bg-status-danger-soft text-status-danger-fg",
            missedCount > 0 && "animate-pulse",
          )}
          hide={missedCount === 0}
        />
        <KpiChip
          label="TRUST"
          value={trustAvg}
          className={cn("border", trustBorder(trustAvg), trustColor(trustAvg))}
        />
      </div>

      {/* ── Right: Actions ── */}
      <div className="flex items-center gap-1.5 shrink-0 ml-auto">
        {(orphanCount ?? 0) > 0 && !isReadOnly && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-[11px] gap-1 text-status-warn-fg hover:bg-status-warn-soft"
            onClick={onCloseOrphans}
            disabled={closingOrphans}
          >
            <AlertTriangle className="h-3 w-3" />
            {closingOrphans ? "..." : orphanCount}
          </Button>
        )}
        {!isReadOnly && (
          <>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-status-info-fg hover:bg-status-info-soft"
              onClick={() => handleCoberturaClick("nocturno")}
              disabled={isSending}
              title="Cobertura nocturna"
            >
              {sendingCoberturaEmail === "nocturno" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Moon className="h-3.5 w-3.5" />}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-status-warn-fg hover:bg-status-warn-soft"
              onClick={() => handleCoberturaClick("diurno")}
              disabled={isSending}
              title="Cobertura diurna"
            >
              {sendingCoberturaEmail === "diurno" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sun className="h-3.5 w-3.5" />}
            </Button>
          </>
        )}
        {alertCount > 0 && (
          <button
            onClick={onToggleAlerts}
            className="relative transition-transform hover:scale-105 active:scale-95"
          >
            <span className="inline-flex items-center gap-1 rounded-full bg-status-danger-soft border border-status-danger-border px-2.5 py-1 text-[10px] font-bold text-status-danger-fg tabular-nums">
              <AlertTriangle className="h-3 w-3" />
              {alertCount}
            </span>
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-status-danger animate-ping" />
          </button>
        )}
        {(canCloseTurno || !isReadOnly) && effectiveTurnoId && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-[11px] gap-1 text-status-danger-fg/70 hover:text-status-danger-fg hover:bg-status-danger-soft ml-1"
            onClick={() => onOpenCloseTurno?.(effectiveTurnoId)}
          >
            <Square className="h-3 w-3" /> Cerrar
          </Button>
        )}
      </div>
    </div>
  );
}

function KpiChip({
  label,
  value,
  className,
  hide,
}: {
  label: string;
  value: number;
  className: string;
  hide?: boolean;
}) {
  if (hide) return null;
  return (
    <div className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1", className)}>
      <span className="text-[10px] font-semibold tracking-wider opacity-70">{label}</span>
      <span className="text-[13px] font-bold tabular-nums">{value}</span>
    </div>
  );
}
