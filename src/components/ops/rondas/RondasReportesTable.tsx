"use client";

import { Fragment, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Camera, Mic, Clock, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ReporteRow {
  id: string;
  scheduledAt: string;
  startedAt: string | null;
  completedAt: string | null;
  installation: string;
  installationId: string;
  template: string;
  guardiaId: string | null;
  guardia: string;
  guardiaCode: string;
  rut: string;
  status: string;
  checkpointsTotal: number;
  checkpointsCompletados: number;
  porcentajeCompletado: number;
  trustScore: number;
  trustBreakdown: TrustBreakdown | null;
  durationMinutes: number | null;
  marcaciones: MarcacionRow[];
}

interface TrustBreakdown {
  completion?: { score: number; weight: number };
  time?: { score: number; weight: number };
  speed?: { score: number; weight: number };
  sequence?: { score: number; weight: number };
  punctuality?: { score: number; weight: number };
}

interface MarcacionRow {
  id: string;
  checkpointName: string;
  timestamp: string;
  status: string;
  hasPhoto: boolean;
  hasAudio: boolean;
  distanceM: number | null;
}

interface Props {
  rows: ReporteRow[];
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  sortKey: string;
  sortDir: "asc" | "desc";
  onSort: (key: string) => void;
}

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  completada: { label: "Completada", cls: "bg-emerald-500/15 text-emerald-400" },
  incompleta: { label: "Incompleta", cls: "bg-amber-500/15 text-amber-400" },
  no_realizada: { label: "No realizada", cls: "bg-red-500/15 text-red-400" },
  pendiente: { label: "Pendiente", cls: "bg-zinc-500/15 text-zinc-400" },
  en_curso: { label: "En curso", cls: "bg-blue-500/15 text-blue-400" },
};

function trustColor(score: number): string {
  if (score >= 85) return "text-emerald-400";
  if (score >= 70) return "text-blue-400";
  if (score >= 50) return "text-amber-400";
  return "text-red-400";
}

function trustBg(score: number): string {
  if (score >= 85) return "bg-emerald-500/15 border-emerald-500/25";
  if (score >= 70) return "bg-blue-500/15 border-blue-500/25";
  if (score >= 50) return "bg-amber-500/15 border-amber-500/25";
  return "bg-red-500/15 border-red-500/25";
}

const SORT_COLS = [
  { key: "scheduledAt", label: "Fecha" },
  { key: "installation", label: "Instalación" },
  { key: "template", label: "Plantilla" },
  { key: "guardia", label: "Guardia" },
  { key: "status", label: "Estado" },
  { key: "porcentajeCompletado", label: "Cump. %" },
  { key: "trustScore", label: "Trust" },
  { key: "durationMinutes", label: "Duración" },
];

const BREAKDOWN_LABELS: Record<string, string> = {
  completion: "Completitud",
  time: "Tiempo",
  speed: "Velocidad",
  sequence: "Secuencia",
  punctuality: "Puntualidad",
};

const BREAKDOWN_COLORS: Record<string, string> = {
  completion: "bg-emerald-500",
  time: "bg-blue-500",
  speed: "bg-purple-500",
  sequence: "bg-amber-500",
  punctuality: "bg-teal-500",
};

function TrustBreakdownBars({ breakdown }: { breakdown: TrustBreakdown }) {
  const entries = Object.entries(breakdown).filter(
    ([, v]) => v && typeof v === "object" && "score" in v,
  ) as [string, { score: number; weight: number }][];

  if (entries.length === 0) return null;

  return (
    <div className="space-y-1.5 mt-2">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
        Trust Score Breakdown
      </p>
      {entries.map(([key, val]) => (
        <div key={key} className="flex items-center gap-2">
          <span className="w-20 text-[11px] text-muted-foreground shrink-0">
            {BREAKDOWN_LABELS[key] ?? key} ({Math.round(val.weight * 100)}%)
          </span>
          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", BREAKDOWN_COLORS[key] ?? "bg-primary")}
              style={{ width: `${Math.max(val.score, 2)}%` }}
            />
          </div>
          <span className="text-[11px] font-medium tabular-nums w-8 text-right">{val.score}</span>
        </div>
      ))}
    </div>
  );
}

function ExpandedRow({ row }: { row: ReporteRow }) {
  return (
    <tr>
      <td colSpan={9} className="px-4 py-3 bg-muted/20 border-b border-border/50">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Timeline de checkpoints
            </p>
            {row.marcaciones.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin marcaciones</p>
            ) : (
              <div className="space-y-1">
                {row.marcaciones.map((m, i) => {
                  const isCompleted = m.status === "COMPLETED";
                  const isMissed = m.status === "MISSED";
                  return (
                    <div
                      key={m.id}
                      className="flex items-center gap-2 text-xs"
                    >
                      <span className="text-muted-foreground w-5 text-right tabular-nums">{i + 1}</span>
                      {isCompleted ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      ) : isMissed ? (
                        <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                      )}
                      <span className="text-foreground">{m.checkpointName}</span>
                      <span className="text-muted-foreground">
                        {new Date(m.timestamp).toLocaleTimeString("es-CL", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {m.hasPhoto && <Camera className="h-3 w-3 text-blue-400" />}
                      {m.hasAudio && <Mic className="h-3 w-3 text-purple-400" />}
                      {m.distanceM != null && (
                        <span className="text-[10px] text-muted-foreground">
                          {Math.round(m.distanceM)}m
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div>
            {row.trustBreakdown && <TrustBreakdownBars breakdown={row.trustBreakdown} />}
            {row.startedAt && row.completedAt && (
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <span>
                  {new Date(row.startedAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                  {" → "}
                  {new Date(row.completedAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

export function RondasReportesTable({
  rows,
  page,
  pageSize,
  onPageChange,
  sortKey,
  sortDir,
  onSort,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      const aVal = (a as unknown as Record<string, unknown>)[sortKey];
      const bVal = (b as unknown as Record<string, unknown>)[sortKey];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === "number" && typeof bVal === "number") return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      return sortDir === "asc"
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);

  const headerCls =
    "px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider bg-muted/50 border-b-2 border-border cursor-pointer hover:bg-muted/70 select-none transition-colors";
  const cellCls = "px-3 py-2 text-sm text-foreground border-b border-border/50";

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full">
          <thead>
            <tr>
              <th className="w-8 bg-muted/50 border-b-2 border-border" />
              {SORT_COLS.map((col) => (
                <th key={col.key} className={headerCls} onClick={() => onSort(col.key)}>
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {sortKey === col.key && (
                      <span className="text-[10px]">{sortDir === "asc" ? "▲" : "▼"}</span>
                    )}
                  </span>
                </th>
              ))}
              <th className={headerCls}>Evidencias</th>
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-12 text-center text-sm text-muted-foreground">
                  Sin resultados
                </td>
              </tr>
            ) : (
              paged.map((row) => {
                const isExpanded = expandedId === row.id;
                const st = STATUS_CONFIG[row.status] ?? STATUS_CONFIG.pendiente;
                const photoCount = row.marcaciones.filter((m) => m.hasPhoto).length;
                const audioCount = row.marcaciones.filter((m) => m.hasAudio).length;
                return (
                  <Fragment key={row.id}>
                    <tr
                      className="hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : row.id)}
                    >
                      <td className={cn(cellCls, "w-8 text-center")}>
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground inline" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground inline" />
                        )}
                      </td>
                      <td className={cellCls}>
                        {new Date(row.scheduledAt).toLocaleDateString("es-CL", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className={cn(cellCls, "max-w-[160px] truncate")}>{row.installation}</td>
                      <td className={cn(cellCls, "max-w-[140px] truncate")}>{row.template}</td>
                      <td className={cellCls}>{row.guardia || "—"}</td>
                      <td className={cellCls}>
                        <Badge className={cn("text-[10px]", st.cls)}>{st.label}</Badge>
                      </td>
                      <td className={cn(cellCls, "text-right tabular-nums")}>
                        {Math.round(row.porcentajeCompletado)}%
                      </td>
                      <td className={cn(cellCls, "text-center")}>
                        <span
                          className={cn(
                            "inline-flex items-center justify-center w-8 h-8 rounded-full border text-xs font-bold",
                            trustBg(row.trustScore),
                            trustColor(row.trustScore),
                          )}
                        >
                          {row.trustScore}
                        </span>
                      </td>
                      <td className={cn(cellCls, "text-right tabular-nums text-muted-foreground")}>
                        {row.durationMinutes != null ? `${row.durationMinutes} min` : "—"}
                      </td>
                      <td className={cellCls}>
                        <span className="flex items-center gap-1.5">
                          <span className="text-xs text-foreground tabular-nums">
                            {row.checkpointsCompletados}/{row.checkpointsTotal}
                          </span>
                          {photoCount > 0 && (
                            <span className="flex items-center gap-0.5 text-blue-400">
                              <Camera className="h-3 w-3" />
                              <span className="text-[10px]">{photoCount}</span>
                            </span>
                          )}
                          {audioCount > 0 && (
                            <span className="flex items-center gap-0.5 text-purple-400">
                              <Mic className="h-3 w-3" />
                              <span className="text-[10px]">{audioCount}</span>
                            </span>
                          )}
                        </span>
                      </td>
                    </tr>
                    {isExpanded && <ExpandedRow row={row} />}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
          <span>
            Mostrando {page * pageSize + 1}-{Math.min((page + 1) * pageSize, sorted.length)} de{" "}
            {sorted.length}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => onPageChange(Math.max(0, page - 1))}
              disabled={page === 0}
              className="px-2.5 py-1 rounded bg-muted hover:bg-muted/80 disabled:opacity-40 transition-colors"
            >
              Anterior
            </button>
            <button
              onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="px-2.5 py-1 rounded bg-muted hover:bg-muted/80 disabled:opacity-40 transition-colors"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

