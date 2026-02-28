"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Download,
  Eye,
  Loader2,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

async function downloadPdf(installationId: string) {
  const res = await fetch(
    `/api/ops/protocols/client-report/pdf?installationId=${installationId}`,
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Error al descargar" }));
    throw new Error(err.error ?? "Error al descargar PDF");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download =
    res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ??
    "reporte.pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ─── Types ───────────────────────────────────────────────────

interface ClientReportData {
  installationName: string;
  reportDate: string;
  stats: {
    totalGuards: number;
    evaluatedGuards: number;
    avgCompliance: number;
    approvedGuards: number;
    lastEvaluation: string | null;
  };
  sectionCompliance: Array<{
    title: string;
    icon: string | null;
    percentage: number;
  }>;
  guardPerformance: Array<{
    guardId: string;
    name: string;
    shiftLabel: string;
    latestScore: number | null;
    avgScore: number | null;
    trend: "up" | "stable" | "down";
    status: "approved" | "improving" | "pending";
  }>;
}

interface ClientReportViewProps {
  installationId: string;
}

// ─── Component ───────────────────────────────────────────────

export function ClientReportView({ installationId }: ClientReportViewProps) {
  const [data, setData] = useState<ClientReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const fetchReport = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/ops/protocols/client-report?installationId=${installationId}`);
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch {
      toast.error("Error al cargar reporte");
    } finally {
      setLoading(false);
    }
  }, [installationId]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Generando reporte...</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12 text-sm text-muted-foreground">
        No se pudo cargar el reporte.
      </div>
    );
  }

  const now = new Date();
  const monthYear = now.toLocaleDateString("es-CL", { month: "long", year: "numeric" });

  const STATUS_CONFIG = {
    approved: { label: "Aprobado", color: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
    improving: { label: "En mejora", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300" },
    pending: { label: "Pendiente", color: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
  };

  return (
    <div className="space-y-5">
      {/* Admin note */}
      <div className="rounded-lg border bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 p-3 flex items-center gap-3">
        <Eye className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
        <span className="text-xs text-blue-800 dark:text-blue-200 flex-1">
          Esta es la vista que vería el cliente. Exporta como PDF o envía directamente.
        </span>
      </div>

      {/* Header */}
      <div className="rounded-xl bg-gradient-to-r from-slate-900 to-slate-700 dark:from-slate-800 dark:to-slate-600 text-white p-6">
        <p className="text-xs uppercase tracking-wider opacity-70 mb-1">Reporte de Seguridad</p>
        <h2 className="text-xl font-bold">{data.installationName}</h2>
        <p className="text-sm opacity-80 mt-1">
          Preparado por Gard Security · {monthYear.charAt(0).toUpperCase() + monthYear.slice(1)}
        </p>
        <div className="flex gap-2 mt-4">
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-xs"
            disabled={downloadingPdf}
            onClick={async () => {
              try {
                setDownloadingPdf(true);
                await downloadPdf(installationId);
                toast.success("PDF descargado");
              } catch (err: unknown) {
                toast.error(
                  err instanceof Error ? err.message : "Error al descargar PDF",
                );
              } finally {
                setDownloadingPdf(false);
              }
            }}
          >
            {downloadingPdf ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <Download className="h-3 w-3 mr-1" />
            )}
            {downloadingPdf ? "Generando..." : "Exportar PDF"}
          </Button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-4 gap-3">
        <div className="border rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Users className="h-4 w-4 text-blue-500" />
            <span className="text-[10px] text-muted-foreground font-medium">Guardias</span>
          </div>
          <div className="text-lg font-bold">{data.stats.totalGuards}</div>
          <p className="text-[10px] text-muted-foreground">{data.stats.evaluatedGuards} evaluados</p>
        </div>
        <div className="border rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <BarChart3 className="h-4 w-4 text-violet-500" />
            <span className="text-[10px] text-muted-foreground font-medium">Cumplimiento</span>
          </div>
          <div className={cn(
            "text-lg font-bold",
            data.stats.avgCompliance >= 80
              ? "text-green-600"
              : data.stats.avgCompliance >= 60
                ? "text-yellow-600"
                : "text-red-600",
          )}>
            {data.stats.avgCompliance}%
          </div>
          <p className="text-[10px] text-muted-foreground">Promedio protocolo</p>
        </div>
        <div className="border rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span className="text-[10px] text-muted-foreground font-medium">Aprobados</span>
          </div>
          <div className="text-lg font-bold">
            {data.stats.approvedGuards}
            <span className="text-xs font-normal text-muted-foreground">/{data.stats.totalGuards}</span>
          </div>
          <p className="text-[10px] text-muted-foreground">≥80% último examen</p>
        </div>
        <div className="border rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <CalendarDays className="h-4 w-4 text-amber-500" />
            <span className="text-[10px] text-muted-foreground font-medium">Última eval.</span>
          </div>
          <div className="text-sm font-bold">
            {data.stats.lastEvaluation
              ? new Date(data.stats.lastEvaluation).toLocaleDateString("es-CL", {
                  day: "2-digit",
                  month: "short",
                })
              : "—"}
          </div>
          <p className="text-[10px] text-muted-foreground">Fecha evaluación</p>
        </div>
      </div>

      {/* Section compliance */}
      {data.sectionCompliance.length > 0 && (
        <div className="border rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3">Cumplimiento por área del protocolo</h3>
          <div className="space-y-3">
            {data.sectionCompliance.map((s) => (
              <div key={s.title}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium flex items-center gap-1">
                    {s.icon && <span className="text-xs">{s.icon}</span>}
                    {s.title}
                  </span>
                  <span className={cn(
                    "text-xs font-semibold",
                    s.percentage >= 80 ? "text-green-600" : s.percentage >= 60 ? "text-yellow-600" : "text-red-600",
                  )}>
                    {s.percentage}%
                  </span>
                </div>
                <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      s.percentage >= 80
                        ? "bg-green-500"
                        : s.percentage >= 60
                          ? "bg-yellow-500"
                          : "bg-red-500",
                    )}
                    style={{ width: `${Math.min(s.percentage, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Guard performance table */}
      {data.guardPerformance.length > 0 && (
        <div className="border rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3">Rendimiento por guardia</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="text-left py-2 pr-4">Guardia</th>
                  <th className="text-left py-2 pr-4">Turno</th>
                  <th className="text-left py-2 pr-4">Nota</th>
                  <th className="text-center py-2 pr-4">Tendencia</th>
                  <th className="text-left py-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.guardPerformance.map((g) => (
                  <tr key={g.guardId} className="border-b last:border-0">
                    <td className="py-2 pr-4 text-xs font-medium">{g.name}</td>
                    <td className="py-2 pr-4">
                      <Badge variant="outline" className="text-[10px]">
                        {g.shiftLabel}
                      </Badge>
                    </td>
                    <td className="py-2 pr-4">
                      {g.latestScore != null ? (
                        <div className="flex items-center gap-2">
                          <div className="w-14 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full",
                                g.latestScore >= 80
                                  ? "bg-green-500"
                                  : g.latestScore >= 60
                                    ? "bg-yellow-500"
                                    : "bg-red-500",
                              )}
                              style={{ width: `${g.latestScore}%` }}
                            />
                          </div>
                          <span className={cn(
                            "text-xs font-semibold",
                            g.latestScore >= 80
                              ? "text-green-600"
                              : g.latestScore >= 60
                                ? "text-yellow-600"
                                : "text-red-600",
                          )}>
                            {g.latestScore}%
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-center">
                      {g.trend === "up" && <TrendingUp className="h-3.5 w-3.5 text-green-500 mx-auto" />}
                      {g.trend === "stable" && <span className="text-xs">➡️</span>}
                      {g.trend === "down" && <TrendingDown className="h-3.5 w-3.5 text-red-500 mx-auto" />}
                    </td>
                    <td className="py-2">
                      <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                        STATUS_CONFIG[g.status].color,
                      )}>
                        {STATUS_CONFIG[g.status].label}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
