"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Shield,
  Users,
  BarChart3,
  CheckCircle2,
  CalendarDays,
  FileDown,
  Mail,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  Eye,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface Props {
  installationId: string;
  installationName: string;
  companyName?: string;
}

interface ProtocolSection {
  id: string;
  title: string;
  icon: string;
  order: number;
  items: { id: string; title: string; sectionId: string }[];
}

interface ProtocolData {
  sections: ProtocolSection[];
  stats: { sectionCount: number; itemCount: number };
}

interface ExamStats {
  totalGuards: number;
  compliancePercent: number;
  approvedCount: number;
  lastExamDate: string | null;
  sectionCompliance: Record<string, { correct: number; total: number }>;
}

interface GuardScore {
  guardId: string;
  guardName: string;
  shift: string | null;
  lastExamDate: string | null;
  score: number | null;
  previousScore: number | null;
  status: "aprobado" | "reprobado" | "pendiente" | "sin_evaluar";
}

const dateFormatter = new Intl.DateTimeFormat("es-CL", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

function formatDate(d: string | Date | null): string {
  if (!d) return "—";
  return dateFormatter.format(new Date(d));
}

function complianceColor(pct: number): string {
  if (pct >= 80) return "text-emerald-400";
  if (pct >= 60) return "text-amber-400";
  return "text-red-400";
}

function complianceBg(pct: number): string {
  if (pct >= 80) return "bg-emerald-500";
  if (pct >= 60) return "bg-amber-500";
  return "bg-red-500";
}

function complianceTrack(pct: number): string {
  if (pct >= 80) return "bg-emerald-500/20";
  if (pct >= 60) return "bg-amber-500/20";
  return "bg-red-500/20";
}

function ProgressBar({ value, className }: { value: number; className?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={`h-2 w-full rounded-full ${complianceTrack(clamped)} ${className ?? ""}`}>
      <div
        className={`h-full rounded-full transition-all duration-500 ${complianceBg(clamped)}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

function TrendIcon({ current, previous }: { current: number | null; previous: number | null }) {
  if (current == null || previous == null) {
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  }
  if (current > previous) return <TrendingUp className="h-4 w-4 text-emerald-400" />;
  if (current < previous) return <TrendingDown className="h-4 w-4 text-red-400" />;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
}

function StatusBadge({ status }: { status?: GuardScore["status"] }) {
  const map: Record<string, { label: string; variant: "success" | "destructive" | "warning" | "secondary" }> = {
    aprobado: { label: "Aprobado", variant: "success" },
    reprobado: { label: "Reprobado", variant: "destructive" },
    pendiente: { label: "Pendiente", variant: "warning" },
    sin_evaluar: { label: "Sin evaluar", variant: "secondary" },
  };
  const entry = status ? map[status] : map.sin_evaluar;
  if (!entry) return <Badge variant="secondary">—</Badge>;
  const { label, variant } = entry;
  return <Badge variant={variant}>{label}</Badge>;
}

export function ClientViewSubTab({ installationId, installationName, companyName = "" }: Props) {
  const [protocol, setProtocol] = useState<ProtocolData | null>(null);
  const [stats, setStats] = useState<ExamStats | null>(null);
  const [guards, setGuards] = useState<GuardScore[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [protocolRes, statsRes, guardsRes] = await Promise.all([
        fetch(`/api/installations/${installationId}/protocol`),
        fetch(`/api/installations/${installationId}/exams/stats`),
        fetch(`/api/installations/${installationId}/exams/guards`),
      ]);

      if (protocolRes.ok) {
        const pJson = await protocolRes.json();
        if (pJson.success) setProtocol(pJson.data);
      }

      if (statsRes.ok) {
        const sJson = await statsRes.json();
        if (sJson.success) {
          const d = sJson.data;
          setStats({
            totalGuards: d?.totalGuards ?? 0,
            compliancePercent: d?.avgScore ?? 0,
            approvedCount: d?.evaluatedGuards ? Math.max(0, (d.evaluatedGuards ?? 0) - (d.lowPerformanceCount ?? 0)) : 0,
            lastExamDate: null,
            sectionCompliance: d?.sectionCompliance ?? {},
          });
        }
      }

      if (guardsRes.ok) {
        const gJson = await guardsRes.json();
        const raw = gJson?.success ? (gJson.data ?? []) : [];
        const arr = Array.isArray(raw) ? raw : [];
        setGuards(
          arr.map((g: { guardId: string; name: string; completedCount: number; avgScore: number | null; lastExamDate: string | null; pendingCount: number }) => {
            let status: GuardScore["status"] = "sin_evaluar";
            if (g.pendingCount > 0) status = "pendiente";
            else if (g.completedCount > 0) {
              status = (g.avgScore ?? 0) >= 80 ? "aprobado" : "reprobado";
            }
            return {
              guardId: g.guardId,
              guardName: g.name,
              shift: null as string | null,
              lastExamDate: g.lastExamDate,
              score: g.avgScore,
              previousScore: null,
              status,
            };
          })
        );
      }
    } catch {
      toast.error("Error al cargar los datos del reporte");
    } finally {
      setLoading(false);
    }
  }, [installationId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleDownloadPdf = () => {
    window.open(`/api/installations/${installationId}/protocol/client-report/pdf`, "_blank");
  };

  const hasExamData = stats !== null && (stats.totalGuards > 0 || guards.length > 0);
  const today = formatDate(new Date());

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Cargando reporte...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Info banner */}
      <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2">
        <Eye className="h-4 w-4 shrink-0 text-primary/60" />
        <p className="text-xs text-muted-foreground">
          Esta es la vista que vería tu cliente. Exporta como PDF o envía por correo.
        </p>
      </div>

      {/* Header */}
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-primary/10 to-transparent">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1.5">
                <CardDescription className="text-xs font-medium uppercase tracking-wider text-primary/70">
                  Reporte de Seguridad
                </CardDescription>
                <CardTitle className="text-xl font-bold">{installationName}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {companyName} · {today}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={handleDownloadPdf}>
                  <FileDown className="mr-1.5 h-3.5 w-3.5" />
                  Descargar PDF
                </Button>
                <Button size="sm" variant="outline" disabled title="Próximamente">
                  <Mail className="mr-1.5 h-3.5 w-3.5" />
                  Enviar por correo
                </Button>
              </div>
            </div>
          </CardHeader>
        </div>
      </Card>

      {!hasExamData && !protocol?.sections.length ? (
        /* Empty state */
        <Card>
          <CardContent className="py-12 text-center">
            <Shield className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">
              Aún no hay evaluaciones
            </p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              Crea un examen en la pestaña Exámenes para generar este reporte.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              icon={<Users className="h-4 w-4" />}
              label="Guardias activos"
              value={stats?.totalGuards ?? 0}
            />
            <StatCard
              icon={<BarChart3 className="h-4 w-4" />}
              label="Cumplimiento general"
              value={stats ? `${stats.compliancePercent}%` : "—"}
              valueClassName={stats ? complianceColor(stats.compliancePercent) : undefined}
            />
            <StatCard
              icon={<CheckCircle2 className="h-4 w-4" />}
              label="Aprobados (≥80%)"
              value={stats?.approvedCount ?? 0}
            />
            <StatCard
              icon={<CalendarDays className="h-4 w-4" />}
              label="Última evaluación"
              value={stats?.lastExamDate ? formatDate(stats.lastExamDate) : "—"}
              small
            />
          </div>

          {/* Protocol compliance */}
          {protocol && protocol.sections.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Shield className="h-4 w-4 text-primary" />
                  Cumplimiento por área del protocolo
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {protocol.sections.map((section) => {
                  const compliance = stats?.sectionCompliance?.[section.id];
                  const pct = compliance && compliance.total > 0
                    ? Math.round((compliance.correct / compliance.total) * 100)
                    : null;

                  return (
                    <div key={section.id} className="flex items-center gap-3">
                      <span className="shrink-0 text-base">{section.icon}</span>
                      <span className="min-w-0 flex-shrink-0 text-sm font-medium text-foreground w-48 truncate">
                        {section.title}
                      </span>
                      <div className="mx-2 hidden h-px flex-1 bg-border/50 sm:block" />
                      {pct !== null ? (
                        <>
                          <div className="w-32 shrink-0">
                            <ProgressBar value={pct} />
                          </div>
                          <span className={`w-12 shrink-0 text-right text-sm font-semibold tabular-nums ${complianceColor(pct)}`}>
                            {pct}%
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground/60">Sin datos</span>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Guards table */}
          {guards.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="h-4 w-4 text-primary" />
                  Desempeño por guardia
                </CardTitle>
              </CardHeader>
              <CardContent className="-mx-4 sm:-mx-5">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/60 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        <th className="px-4 py-2.5 sm:px-5">Guardia</th>
                        <th className="px-4 py-2.5 sm:px-5">Turno</th>
                        <th className="px-4 py-2.5 sm:px-5">Último examen</th>
                        <th className="px-4 py-2.5 sm:px-5 w-48">Nota</th>
                        <th className="px-4 py-2.5 sm:px-5 text-center">Tendencia</th>
                        <th className="px-4 py-2.5 sm:px-5 text-right">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {guards.map((g) => (
                        <tr key={g.guardId} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 font-medium sm:px-5">{g.guardName}</td>
                          <td className="px-4 py-3 text-muted-foreground sm:px-5">
                            {g.shift ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground sm:px-5">
                            {formatDate(g.lastExamDate)}
                          </td>
                          <td className="px-4 py-3 sm:px-5">
                            {g.score !== null ? (
                              <div className="flex items-center gap-2">
                                <div className="w-20">
                                  <ProgressBar value={g.score} />
                                </div>
                                <span className={`text-xs font-semibold tabular-nums ${complianceColor(g.score)}`}>
                                  {Math.round(g.score)}%
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground/60">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center sm:px-5">
                            <TrendIcon current={g.score} previous={g.previousScore} />
                          </td>
                          <td className="px-4 py-3 text-right sm:px-5">
                            <StatusBadge status={g.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  valueClassName,
  small,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  valueClassName?: string;
  small?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-4">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          {icon}
          <span className="text-[11px] font-medium uppercase tracking-wider">{label}</span>
        </div>
        <span
          className={`${small ? "text-sm" : "text-xl"} font-bold tabular-nums ${valueClassName ?? "text-foreground"}`}
        >
          {value}
        </span>
      </CardContent>
    </Card>
  );
}
