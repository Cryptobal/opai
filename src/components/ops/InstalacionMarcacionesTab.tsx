"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, CheckCircle, AlertCircle } from "lucide-react";
import { MarcacionModificadaBadge } from "./MarcacionModificadaBadge";
import { cn } from "@/lib/utils";

interface MarcacionEntry {
  id: string;
  timestamp: string;
  metodoId: string;
  gpsStatus: string;
  atrasoMinutos?: number | null;
  isModified: boolean;
  modificationReason: string | null;
  opposedAt: string | null;
  consolidatedAt: string | null;
}

interface GuardiaRow {
  guardiaId: string;
  guardiaName: string;
  entrada: MarcacionEntry | null;
  salida: MarcacionEntry | null;
}

interface Summary {
  totalGuardias: number;
  conEntrada: number;
  conSalida: number;
  sinSalida: number;
  conAtraso: number;
  modificadas: number;
}

function fmtHora(iso: string) {
  return new Date(iso).toLocaleTimeString("es-CL", {
    hour: "2-digit", minute: "2-digit", timeZone: "America/Santiago",
  });
}

export function InstalacionMarcacionesTab({ installationId }: { installationId: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [rows, setRows] = useState<GuardiaRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(
        `/api/ops/installations/${installationId}/marcaciones?date=${date}`
      );
      const d = await r.json();
      if (d.success) {
        setRows(d.data.rows);
        setSummary(d.data.summary);
      }
    } catch {}
    setLoading(false);
  }, [installationId, date]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const prevDay = () => {
    const d = new Date(date + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    setDate(d.toISOString().slice(0, 10));
  };
  const nextDay = () => {
    const d = new Date(date + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1);
    setDate(d.toISOString().slice(0, 10));
  };

  const dateLabel = new Date(date + "T12:00:00Z").toLocaleDateString("es-CL", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div className="space-y-4">
      {/* Navegación día */}
      <div className="flex items-center justify-between">
        <button onClick={prevDay} className="p-1 rounded hover:bg-accent transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold capitalize">{dateLabel}</h3>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="text-xs border border-border rounded px-2 py-1 bg-background"
          />
        </div>
        <button onClick={nextDay} className="p-1 rounded hover:bg-accent transition-colors"
          disabled={date >= today}>
          <ChevronRight className={cn("w-4 h-4", date >= today && "opacity-30")} />
        </button>
      </div>

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Con entrada", value: summary.conEntrada, of: summary.totalGuardias },
            { label: "Con salida", value: summary.conSalida, of: summary.totalGuardias },
            { label: "Sin salida", value: summary.sinSalida, warn: summary.sinSalida > 0 },
          ].map((s) => (
            <div key={s.label} className="bg-card rounded-lg border border-border p-2 text-center">
              <p className={cn("text-lg font-bold", s.warn ? "text-status-warn-fg" : "text-foreground")}>
                {s.value}{s.of !== undefined ? `/${s.of}` : ""}
              </p>
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabla */}
      {loading ? (
        <div className="h-32 flex items-center justify-center">
          <div className="animate-spin w-5 h-5 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground">
          Sin marcaciones registradas en este día.
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border text-left">
                <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Guardia</th>
                <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Entrada</th>
                <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Salida</th>
                <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.guardiaId} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                  <td className="px-3 py-2">
                    <p className="font-medium text-foreground text-xs">{row.guardiaName}</p>
                  </td>
                  <td className="px-3 py-2">
                    {row.entrada ? (
                      <div className="space-y-0.5">
                        <p className="font-mono text-xs text-status-ok-fg font-bold">
                          {fmtHora(row.entrada.timestamp)}
                        </p>
                        {row.entrada.atrasoMinutos && row.entrada.atrasoMinutos > 0 && (
                          <p className="text-[10px] text-status-danger-fg">+{row.entrada.atrasoMinutos}min</p>
                        )}
                        <MarcacionModificadaBadge
                          isModified={row.entrada.isModified}
                          consolidatedAt={row.entrada.consolidatedAt}
                          opposedAt={row.entrada.opposedAt}
                        />
                      </div>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {row.salida ? (
                      <div className="space-y-0.5">
                        <p className="font-mono text-xs text-status-warn-fg font-bold">
                          {fmtHora(row.salida.timestamp)}
                        </p>
                        <MarcacionModificadaBadge
                          isModified={row.salida.isModified}
                          consolidatedAt={row.salida.consolidatedAt}
                          opposedAt={row.salida.opposedAt}
                        />
                      </div>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {!row.entrada && !row.salida ? (
                      <span className="text-[10px] text-slate-400">Sin marcas</span>
                    ) : row.entrada && row.salida ? (
                      <span title="Completo"><CheckCircle className="w-4 h-4 text-status-ok-fg" /></span>
                    ) : (
                      <span title="Incompleto"><AlertCircle className="w-4 h-4 text-status-warn-fg" /></span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
