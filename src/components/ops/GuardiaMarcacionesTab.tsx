"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, Fingerprint, MapPin, AlertCircle } from "lucide-react";
import { MarcacionModificadaBadge } from "./MarcacionModificadaBadge";
import { cn } from "@/lib/utils";

interface Marcacion {
  id: string;
  tipo: "entrada" | "salida";
  timestamp: string;
  metodoId: string;
  gpsStatus: "dentro_rango" | "fuera_rango" | "sin_gps";
  atrasoMinutos: number | null;
  isModified: boolean;
  modifiedAt: string | null;
  modificationReason: string | null;
  opposedAt: string | null;
  consolidatedAt: string | null;
  installation: { id: string; name: string };
}

interface Stats {
  totalEntradas: number;
  totalSalidas: number;
  diasConMarcacion: number;
  diasEnMes: number;
  conAtraso: number;
  modificadas: number;
  fueraDeRango: number;
}

const METODO_LABEL: Record<string, string> = {
  face_id: "Face ID",
  rut_pin: "RUT+PIN",
  manual: "Manual",
  import: "Importado",
};

const GPS_CONFIG = {
  dentro_rango: { label: "En rango", className: "text-emerald-600" },
  fuera_rango: { label: "Fuera de rango", className: "text-amber-600" },
  sin_gps: { label: "Sin GPS", className: "text-slate-400" },
} as const;

export function GuardiaMarcacionesTab({ guardiaId }: { guardiaId: string }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [marcaciones, setMarcaciones] = useState<Marcacion[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(
        `/api/ops/guardias/${guardiaId}/marcaciones?year=${year}&month=${month}`
      );
      const d = await r.json();
      if (d.success) {
        setMarcaciones(d.data.marcaciones);
        setStats(d.data.stats);
      }
    } catch {}
    setLoading(false);
  }, [guardiaId, year, month]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
    setSelectedDate(null);
  };
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
    setSelectedDate(null);
  };

  // Build calendar data
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const startOffset = (firstDayOfWeek + 6) % 7; // Mon=0

  // Group marcaciones by date
  const byDate = new Map<string, Marcacion[]>();
  for (const m of marcaciones) {
    const dateKey = m.timestamp.slice(0, 10);
    const arr = byDate.get(dateKey) ?? [];
    arr.push(m);
    byDate.set(dateKey, arr);
  }

  const monthLabel = new Date(year, month - 1, 1).toLocaleString("es-CL", {
    month: "long", year: "numeric",
  });

  const selectedDayMarcaciones = selectedDate ? (byDate.get(selectedDate) ?? []) : [];

  return (
    <div className="space-y-4">
      {/* Navegación mes */}
      <div className="flex items-center justify-between">
        <button onClick={prevMonth} className="p-1 rounded hover:bg-accent transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <h3 className="text-sm font-semibold capitalize">{monthLabel}</h3>
        <button onClick={nextMonth} className="p-1 rounded hover:bg-accent transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Entradas", value: stats.totalEntradas },
            { label: "Salidas", value: stats.totalSalidas },
            { label: "Días con marca", value: `${stats.diasConMarcacion}/${stats.diasEnMes}` },
            { label: "Modificadas", value: stats.modificadas, warn: stats.modificadas > 0 },
          ].map((s) => (
            <div key={s.label} className="bg-card rounded-lg border border-border p-2 text-center">
              <p className={cn("text-lg font-bold", s.warn ? "text-amber-600" : "text-foreground")}>
                {s.value}
              </p>
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Calendario */}
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border">
          {["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"].map((d) => (
            <div key={d} className="text-center text-[10px] font-medium text-muted-foreground py-2">
              {d}
            </div>
          ))}
        </div>

        {loading ? (
          <div className="h-40 flex items-center justify-center">
            <div className="animate-spin w-5 h-5 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="grid grid-cols-7">
            {Array.from({ length: startOffset }).map((_, i) => (
              <div key={`empty-${i}`} className="border-b border-r border-border/40 h-14" />
            ))}

            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const dayMarcaciones = byDate.get(dateStr) ?? [];
              const hasEntrada = dayMarcaciones.some((m) => m.tipo === "entrada");
              const hasSalida = dayMarcaciones.some((m) => m.tipo === "salida");
              const hasModificada = dayMarcaciones.some((m) => m.isModified);
              const hasFueraRango = dayMarcaciones.some((m) => m.gpsStatus === "fuera_rango");
              const isSelected = selectedDate === dateStr;
              const isToday = dateStr === new Date().toISOString().slice(0, 10);

              return (
                <button
                  key={dateStr}
                  onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                  className={cn(
                    "border-b border-r border-border/40 h-14 p-1 text-left relative hover:bg-accent/50 transition-colors",
                    isSelected && "bg-primary/10 border-primary/30",
                    isToday && "font-bold"
                  )}
                >
                  <span className={cn("text-xs", isToday && "text-primary")}>{day}</span>
                  <div className="flex flex-wrap gap-0.5 mt-0.5">
                    {hasEntrada && <span className="w-2 h-2 rounded-full bg-emerald-500" title="Entrada" />}
                    {hasSalida && <span className="w-2 h-2 rounded-full bg-orange-500" title="Salida" />}
                    {hasModificada && <span className="w-2 h-2 rounded-full bg-amber-400" title="Modificada" />}
                    {hasFueraRango && <span className="w-2 h-2 rounded-full bg-red-400" title="GPS fuera de rango" />}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Panel de detalle del día seleccionado */}
      {selectedDate && (
        <div className="bg-card rounded-lg border border-border p-4 space-y-3">
          <h4 className="text-sm font-medium text-foreground">
            {new Date(selectedDate + "T12:00:00Z").toLocaleDateString("es-CL", {
              weekday: "long", day: "numeric", month: "long",
            })}
          </h4>

          {selectedDayMarcaciones.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin marcaciones en este día.</p>
          ) : (
            <div className="space-y-2">
              {selectedDayMarcaciones.map((m) => {
                const hora = new Date(m.timestamp).toLocaleTimeString("es-CL", {
                  hour: "2-digit", minute: "2-digit", second: "2-digit",
                  timeZone: "America/Santiago",
                });
                const gps = GPS_CONFIG[m.gpsStatus] ?? GPS_CONFIG.sin_gps;
                return (
                  <div key={m.id} className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
                    <div className={cn(
                      "w-2 h-2 rounded-full mt-1.5 shrink-0",
                      m.tipo === "entrada" ? "bg-emerald-500" : "bg-orange-500"
                    )} />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn(
                          "text-xs font-semibold",
                          m.tipo === "entrada" ? "text-emerald-600" : "text-orange-600"
                        )}>
                          {m.tipo === "entrada" ? "Entrada" : "Salida"}
                        </span>
                        <span className="text-sm font-mono font-bold">{hora}</span>
                        {m.atrasoMinutos && m.atrasoMinutos > 0 && (
                          <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                            +{m.atrasoMinutos}min atraso
                          </span>
                        )}
                        <MarcacionModificadaBadge
                          isModified={m.isModified}
                          consolidatedAt={m.consolidatedAt}
                          opposedAt={m.opposedAt}
                        />
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Fingerprint className="w-3 h-3" />
                          {METODO_LABEL[m.metodoId] ?? m.metodoId}
                        </span>
                        <span className={cn("flex items-center gap-1", gps.className)}>
                          <MapPin className="w-3 h-3" />
                          {gps.label}
                        </span>
                        <span>{m.installation.name}</span>
                      </div>
                      {m.isModified && m.modificationReason && (
                        <p className="text-[11px] text-amber-600 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          Motivo: {m.modificationReason}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Leyenda */}
      <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Entrada</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500" /> Salida</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" /> Modificada</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" /> GPS fuera de rango</span>
      </div>
    </div>
  );
}
