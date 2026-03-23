"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Trophy,
  Camera,
  Mic,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  FileSpreadsheet,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface RondaCell {
  id: string;
  scheduledAt: string;
  template: string;
  isAdHoc: boolean;
  guardia: string;
  status: string;
  completion: { completados: number; total: number; porcentaje: number };
  durationMinutes: number | null;
  evidencia: { photos: number; audio: number };
  trustScore: number;
}

interface InstalacionRow {
  installationId: string;
  installationName: string;
  rondas: RondaCell[];
  resumen: {
    total: number;
    completadas: number;
    incompletas: number;
    noRealizadas: number;
    porcentajeCumplimiento: number;
  };
}

interface ResumenGlobal {
  totalRondas: number;
  completadas: number;
  incompletas: number;
  noRealizadas: number;
  porcentajeCumplimiento: number;
  instalacionesCriticas: { installationId: string; installationName: string }[];
  mejorGuardia: { nombre: string; porcentaje: number; duracionPromedio: number | null } | null;
  peorGuardia: { nombre: string; porcentaje: number } | null;
}

interface DashboardData {
  fecha: string;
  ciclo: { inicio: string; fin: string };
  instalaciones: InstalacionRow[];
  resumenGlobal: ResumenGlobal;
}

const STATUS_BG: Record<string, string> = {
  completada: "bg-emerald-500/20 border-emerald-500/40 hover:bg-emerald-500/30",
  incompleta: "bg-amber-500/20 border-amber-500/40 hover:bg-amber-500/30",
  no_realizada: "bg-red-500/20 border-red-500/40 hover:bg-red-500/30",
  pendiente: "bg-zinc-700/30 border-zinc-600/40 hover:bg-zinc-700/40",
  en_curso: "bg-blue-500/20 border-blue-500/40 hover:bg-blue-500/30",
};

const STATUS_ICON: Record<string, typeof CheckCircle2> = {
  completada: CheckCircle2,
  incompleta: AlertTriangle,
  no_realizada: XCircle,
  pendiente: Clock,
  en_curso: Loader2,
};

const STATUS_ICON_COLOR: Record<string, string> = {
  completada: "text-emerald-400",
  incompleta: "text-amber-400",
  no_realizada: "text-red-400",
  pendiente: "text-zinc-500",
  en_curso: "text-blue-400",
};

function formatHour(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function RondaCellBlock({
  ronda,
  onClick,
  isSelected,
}: {
  ronda: RondaCell;
  onClick: () => void;
  isSelected: boolean;
}) {
  const Icon = STATUS_ICON[ronda.status] ?? Clock;
  const iconColor = STATUS_ICON_COLOR[ronda.status] ?? "text-zinc-400";
  const bg = STATUS_BG[ronda.status] ?? STATUS_BG.pendiente;

  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex flex-col items-center rounded-lg border px-3 py-2 min-w-[72px] transition-all cursor-pointer",
        bg,
        isSelected && "ring-2 ring-cyan-400/60",
      )}
    >
      {ronda.isAdHoc && (
        <span className="absolute -top-1.5 -right-1.5 text-[8px] font-bold uppercase bg-purple-500/90 text-white px-1 py-px rounded leading-tight">
          Libre
        </span>
      )}
      <span className="text-[11px] font-semibold text-[#f1f5f9] tabular-nums">
        {formatHour(ronda.scheduledAt)}
      </span>
      <Icon
        className={cn("h-4 w-4 mt-1", iconColor, ronda.status === "en_curso" && "animate-spin")}
      />
      <span className="text-[10px] text-[#94a3b8] mt-0.5 tabular-nums">
        {ronda.completion.completados}/{ronda.completion.total}
      </span>
    </button>
  );
}

function RondaDetail({ ronda }: { ronda: RondaCell }) {
  return (
    <div className="rounded-lg border border-[#1a1f2e] bg-[#0a0e1a] p-3 mt-2 text-xs space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div>
          <p className="text-[10px] uppercase text-[#64748b] font-semibold">Tipo</p>
          {ronda.isAdHoc ? (
            <span className="text-[10px] font-bold uppercase bg-purple-500/80 text-white px-1.5 py-0.5 rounded">Libre</span>
          ) : (
            <span className="text-[10px] font-bold uppercase bg-cyan-500/80 text-white px-1.5 py-0.5 rounded">Programada</span>
          )}
        </div>
        <div>
          <p className="text-[10px] uppercase text-[#64748b] font-semibold">Plantilla</p>
          <p className="text-[#f1f5f9]">{ronda.template}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-[#64748b] font-semibold">Guardia</p>
          <p className="text-[#f1f5f9]">{ronda.guardia || "—"}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-[#64748b] font-semibold">Duración</p>
          <p className="text-[#f1f5f9]">
            {ronda.durationMinutes != null ? `${ronda.durationMinutes} min` : "—"}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-[#64748b] font-semibold">Trust Score</p>
          <p
            className={cn(
              "font-bold",
              ronda.trustScore >= 85
                ? "text-emerald-400"
                : ronda.trustScore >= 70
                  ? "text-blue-400"
                  : ronda.trustScore >= 50
                    ? "text-amber-400"
                    : "text-red-400",
            )}
          >
            {ronda.trustScore}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 text-[#94a3b8]">
        <span>
          Cumplimiento: {ronda.completion.completados}/{ronda.completion.total} (
          {ronda.completion.porcentaje}%)
        </span>
        {ronda.evidencia.photos > 0 && (
          <span className="inline-flex items-center gap-0.5 text-blue-400">
            <Camera className="h-3 w-3" />
            {ronda.evidencia.photos}
          </span>
        )}
        {ronda.evidencia.audio > 0 && (
          <span className="inline-flex items-center gap-0.5 text-purple-400">
            <Mic className="h-3 w-3" />
            {ronda.evidencia.audio}
          </span>
        )}
      </div>
    </div>
  );
}

function InstalacionGridRow({ inst }: { inst: InstalacionRow }) {
  const [expanded, setExpanded] = useState(false);
  const [selectedRonda, setSelectedRonda] = useState<string | null>(null);

  const pct = inst.resumen.porcentajeCumplimiento;
  const barColor =
    pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : pct > 0 ? "bg-red-500" : "bg-zinc-600";

  const selected = inst.rondas.find((r) => r.id === selectedRonda);

  return (
    <div className="rounded-xl border border-[#1a1f2e] bg-[#111827] overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Chevron toggle — separate clickable area */}
        <button
          onClick={() => {
            setExpanded(!expanded);
            if (expanded) setSelectedRonda(null);
          }}
          className="shrink-0 p-1 -m-1 rounded hover:bg-[#1a1f2e] transition-colors"
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-[#64748b]" />
          ) : (
            <ChevronRight className="h-4 w-4 text-[#64748b]" />
          )}
        </button>

        {/* Installation name — also toggles expand */}
        <button
          onClick={() => {
            setExpanded(!expanded);
            if (expanded) setSelectedRonda(null);
          }}
          className="w-40 shrink-0 text-left hover:bg-[#1a1f2e]/50 rounded px-1 -mx-1 py-0.5 transition-colors"
        >
          <p className="text-sm font-semibold text-[#f1f5f9] truncate">{inst.installationName}</p>
          <p className="text-[10px] text-[#64748b]">
            {inst.resumen.total} rondas
          </p>
        </button>

        {/* Timeline cells */}
        <div className="flex-1 flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-thin">
          {inst.rondas.map((ronda) => (
            <RondaCellBlock
              key={ronda.id}
              ronda={ronda}
              isSelected={selectedRonda === ronda.id}
              onClick={() => {
                if (selectedRonda === ronda.id) {
                  setSelectedRonda(null);
                } else {
                  setSelectedRonda(ronda.id);
                  setExpanded(true);
                }
              }}
            />
          ))}
        </div>

        {/* Summary */}
        <div className="w-24 shrink-0 text-right">
          <p className="text-sm font-bold text-[#f1f5f9] tabular-nums">
            {inst.resumen.completadas}/{inst.resumen.total}
          </p>
          <div className="flex items-center gap-1.5 justify-end mt-1">
            <div className="w-16 h-1.5 bg-[#1a1f2e] rounded-full overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all", barColor)}
                style={{ width: `${Math.max(pct, 2)}%` }}
              />
            </div>
            <span className="text-[10px] text-[#94a3b8] tabular-nums w-8 text-right">{pct}%</span>
          </div>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-3 space-y-2 border-t border-[#1a1f2e]">
          {selected ? (
            <RondaDetail ronda={selected} />
          ) : (
            <div className="pt-2 space-y-1">
              {inst.rondas.map((ronda) => {
                const st = STATUS_ICON_COLOR[ronda.status] ?? "text-zinc-400";
                const Icon = STATUS_ICON[ronda.status] ?? Clock;
                return (
                  <button
                    key={ronda.id}
                    onClick={() => setSelectedRonda(ronda.id)}
                    className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-xs hover:bg-[#1a1f2e]/60 transition-colors text-left"
                  >
                    <Icon className={cn("h-3.5 w-3.5 shrink-0", st)} />
                    <span className="text-[#f1f5f9] font-medium tabular-nums w-12">
                      {formatHour(ronda.scheduledAt)}
                    </span>
                    {ronda.isAdHoc ? (
                      <span className="text-[9px] font-bold uppercase bg-purple-500/80 text-white px-1 py-px rounded shrink-0">Libre</span>
                    ) : (
                      <span className="text-[9px] font-bold uppercase bg-cyan-500/80 text-white px-1 py-px rounded shrink-0">Prog.</span>
                    )}
                    <span className="text-[#94a3b8] truncate flex-1">{ronda.template}</span>
                    <span className="text-[#94a3b8] truncate max-w-[140px]">{ronda.guardia || "—"}</span>
                    <span className="text-[#94a3b8] tabular-nums">
                      {ronda.completion.completados}/{ronda.completion.total}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface Props {
  initialDate?: string;
}

function getLocalDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function RondasDashboardGlobal({ initialDate }: Props) {
  // Start with initialDate or empty; set local date in useEffect to avoid SSR/UTC mismatch
  const [fecha, setFecha] = useState(initialDate ?? "");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData | null>(null);

  // Set today's date on the client to avoid UTC issues from SSR
  useEffect(() => {
    if (!initialDate) {
      setFecha(getLocalDate());
    }
  }, [initialDate]);

  const fetchData = useCallback(async (d: string) => {
    if (!d) return; // Skip if date not yet initialized
    setLoading(true);
    try {
      const res = await fetch(`/api/ops/rondas/reportes/dashboard-diario?fecha=${d}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        toast.error(json.error ?? "Error cargando dashboard");
      }
    } catch {
      toast.error("Error cargando dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(fecha);
  }, [fecha, fetchData]);

  // Auto-refresh if viewing today
  useEffect(() => {
    const today = getLocalDate();
    if (fecha !== today) return;
    const interval = setInterval(() => void fetchData(fecha), 60_000);
    return () => clearInterval(interval);
  }, [fecha, fetchData]);

  const resumen = data?.resumenGlobal;

  return (
    <div className="space-y-4">
      {/* Date picker + cycle info + day nav */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#1a1f2e] bg-[#111827] px-4 py-3">
        <button
          onClick={() => {
            const d = new Date(fecha);
            d.setDate(d.getDate() - 1);
            setFecha(d.toISOString().slice(0, 10));
          }}
          className="p-1.5 rounded-lg border border-[#1a1f2e] bg-[#0a0e1a] hover:bg-[#1a1f2e] transition-colors"
        >
          <ChevronLeft className="h-4 w-4 text-[#94a3b8]" />
        </button>
        <input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className="h-9 rounded-lg border border-[#1a1f2e] bg-[#0a0e1a] text-[13px] text-[#f1f5f9] px-3 w-40"
        />
        <button
          onClick={() => {
            const d = new Date(fecha);
            d.setDate(d.getDate() + 1);
            setFecha(d.toISOString().slice(0, 10));
          }}
          className="p-1.5 rounded-lg border border-[#1a1f2e] bg-[#0a0e1a] hover:bg-[#1a1f2e] transition-colors"
        >
          <ChevronRight className="h-4 w-4 text-[#94a3b8]" />
        </button>

        {data?.ciclo && (
          <div className="text-xs text-[#94a3b8]">
            Ciclo:{" "}
            <span className="text-[#f1f5f9] font-medium">
              {formatHour(data.ciclo.inicio)} → {formatHour(data.ciclo.fin)} (+1)
            </span>
          </div>
        )}

        {resumen && (
          <div className="flex items-center gap-4 text-xs text-[#94a3b8] ml-auto">
            <span>
              <span className="text-[#f1f5f9] font-semibold">{resumen.totalRondas}</span> rondas
            </span>
            <span>
              <span className="text-emerald-400 font-semibold">{resumen.completadas}</span> completadas
            </span>
            {resumen.incompletas > 0 && (
              <span>
                <span className="text-amber-400 font-semibold">{resumen.incompletas}</span> incompletas
              </span>
            )}
            {resumen.noRealizadas > 0 && (
              <span>
                <span className="text-red-400 font-semibold">{resumen.noRealizadas}</span> no realizadas
              </span>
            )}
            <span>
              <span className="text-[#06b6d4] font-semibold">{resumen.porcentajeCumplimiento}%</span> cumplimiento
            </span>
          </div>
        )}

        <button
          onClick={() => {
            const params = new URLSearchParams({ format: "xlsx", from: fecha, to: fecha });
            window.open(`/api/ops/rondas/reportes/export?${params}`, "_blank");
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#1a1f2e] bg-[#0a0e1a] hover:bg-[#1a1f2e] text-xs text-[#94a3b8] hover:text-[#f1f5f9] transition-colors"
        >
          <FileSpreadsheet className="h-3.5 w-3.5" />
          Excel
        </button>

        {loading && (
          <div className="flex items-center gap-1.5 text-[#64748b]">
            <div className="w-3.5 h-3.5 rounded-full border-2 border-[#06b6d4] border-t-transparent animate-spin" />
            <span className="text-[11px]">Cargando...</span>
          </div>
        )}
      </div>

      {/* Grid of installations */}
      {data && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#64748b]">
            Grilla de rondas por instalación
          </p>
          {data.instalaciones.length === 0 ? (
            <div className="rounded-xl border border-[#1a1f2e] bg-[#111827] p-8 text-center text-sm text-[#64748b]">
              Sin rondas programadas para este día
            </div>
          ) : (
            data.instalaciones.map((inst) => (
              <InstalacionGridRow key={inst.installationId} inst={inst} />
            ))
          )}
        </div>
      )}

      {/* Footer alerts */}
      {resumen && (
        <div className="space-y-2">
          {resumen.instalacionesCriticas.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2">
              <XCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
              <div className="text-xs">
                <span className="font-semibold text-red-400">0% cumplimiento: </span>
                <span className="text-red-300">
                  {resumen.instalacionesCriticas.map((i) => i.installationName).join(", ")}
                </span>
              </div>
            </div>
          )}

          {resumen.mejorGuardia && (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-950/20 px-3 py-2">
              <Trophy className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
              <div className="text-xs">
                <span className="font-semibold text-emerald-400">Mejor guardia: </span>
                <span className="text-emerald-300">
                  {resumen.mejorGuardia.nombre} ({resumen.mejorGuardia.porcentaje}%
                  {resumen.mejorGuardia.duracionPromedio != null &&
                    `, ${resumen.mejorGuardia.duracionPromedio} min prom`}
                  )
                </span>
              </div>
            </div>
          )}

          {resumen.peorGuardia &&
            resumen.peorGuardia.nombre !== resumen.mejorGuardia?.nombre && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2">
                <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                <div className="text-xs">
                  <span className="font-semibold text-amber-400">Peor guardia: </span>
                  <span className="text-amber-300">
                    {resumen.peorGuardia.nombre} ({resumen.peorGuardia.porcentaje}%)
                  </span>
                </div>
              </div>
            )}
        </div>
      )}
    </div>
  );
}
