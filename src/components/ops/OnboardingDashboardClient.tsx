"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users,
  MailOpen,
  Check,
  X,
  Clock,
  ExternalLink,
  Send,
  AlertTriangle,
  Loader2,
} from "lucide-react";

type OnboardingEstado = "PENDIENTE" | "ENVIADO" | "EN_PROGRESO" | "COMPLETADO";

type OnboardingItem = {
  id: string;
  guardiaId: string;
  guardiaNombre: string;
  guardiaCode: string | null;
  estado: OnboardingEstado;
  emailEnviado: boolean;
  fechaEnvio: string | null;
  emailAbierto: boolean;
  accesoPortalGuardia: boolean;
  fechaAccesoGuardia: string | null;
  accesoPortalRondas: boolean;
  fechaAccesoRondas: string | null;
  accesoPortalAcceso: boolean;
  fechaAccesoAcceso: string | null;
  recordatorioEnviado: boolean;
  fechaRecordatorio: string | null;
};

type Metrics = {
  totalActivos: number;
  onboardingCompletado: number;
  onboardingCompletadoPct: number;
  pendientesAcceso: number;
  emailsRebotados: number;
};

interface OnboardingDashboardClientProps {
  tenantId: string;
  userRole: string;
}

const ESTADO_BADGE: Record<string, { label: string; cls: string }> = {
  PENDIENTE: { label: "Pendiente", cls: "bg-muted text-muted-foreground" },
  ENVIADO: { label: "Enviado", cls: "bg-status-warn-soft text-status-warn-fg" },
  EN_PROGRESO: { label: "En Progreso", cls: "bg-status-info-soft text-status-info-fg" },
  COMPLETADO: { label: "Completado", cls: "bg-status-ok-soft text-status-ok-fg" },
};

function formatDate(s: string | null): string {
  if (!s) return "–";
  const d = new Date(s);
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "2-digit" });
}

function MetricCard({
  title,
  value,
  icon: Icon,
  color,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
              {title}
            </p>
            <p className="text-2xl font-bold tabular-nums">{value}</p>
          </div>
          <div className={`shrink-0 rounded-lg p-2 ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PortalAccessCell({
  accessed,
  date,
}: {
  accessed: boolean;
  date: string | null;
}) {
  if (accessed) {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <Check className="h-4 w-4 text-status-ok-fg" />
        <span className="text-xs text-muted-foreground">{formatDate(date)}</span>
      </div>
    );
  }
  return <X className="h-4 w-4 text-red-500/80" />;
}

export function OnboardingDashboardClient({ tenantId }: OnboardingDashboardClientProps) {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [items, setItems] = useState<OnboardingItem[]>([]);
  const [estadoFilter, setEstadoFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [resendingId, setResendingId] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/personas/onboarding/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Error al cargar");
      setMetrics(json.metrics);
      setItems(json.items ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al cargar dashboard");
      setMetrics(null);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, [tenantId]);

  const filteredItems = useMemo(() => {
    let list = items;
    if (estadoFilter !== "all") {
      list = list.filter((i) => i.estado === estadoFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();

      list = list.filter(
        (i) =>
          i.guardiaNombre.toLowerCase().includes(q) ||
          (i.guardiaCode?.toLowerCase().includes(q) ?? false)
      );
    }
    return list;
  }, [items, estadoFilter, search]);

  const handleResend = async (guardiaId: string) => {
    setResendingId(guardiaId);
    try {
      const res = await fetch("/api/personas/onboarding/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guardiaId }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Error al reenviar");
      toast.success("Email de onboarding reenviado");
      void fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al reenviar");
    } finally {
      setResendingId(null);
    }
  };

  if (loading && !metrics) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Cargando...</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Metric cards */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total activos"
          value={metrics?.totalActivos ?? 0}
          icon={Users}
          color="bg-status-ok-soft text-status-ok-fg"
        />
        <MetricCard
          title="Onboarding completado"
          value={`${metrics?.onboardingCompletado ?? 0} (${metrics?.onboardingCompletadoPct ?? 0}%)`}
          icon={Check}
          color="bg-status-ok-soft text-status-ok-fg"
        />
        <MetricCard
          title="Pendientes de acceso"
          value={metrics?.pendientesAcceso ?? 0}
          icon={Clock}
          color="bg-status-warn-soft text-status-warn-fg"
        />
        <MetricCard
          title="Emails rebotados"
          value={metrics?.emailsRebotados ?? 0}
          icon={AlertTriangle}
          color="bg-status-danger-soft text-status-danger-fg"
        />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={estadoFilter} onValueChange={setEstadoFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="PENDIENTE">Pendiente</SelectItem>
            <SelectItem value="ENVIADO">Enviado</SelectItem>
            <SelectItem value="EN_PROGRESO">En Progreso</SelectItem>
            <SelectItem value="COMPLETADO">Completado</SelectItem>
          </SelectContent>
        </Select>
        <Input
          placeholder="Buscar por nombre o código..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-[240px]"
        />
      </div>

      {/* Data table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">
                    Guardia
                  </th>
                  <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">
                    Estado
                  </th>
                  <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">
                    Email enviado
                  </th>
                  <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">
                    Portal Guardia
                  </th>
                  <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">
                    Portal Rondas
                  </th>
                  <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">
                    Portal Acceso
                  </th>
                  <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">
                    Recordatorio
                  </th>
                  <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                      No hay registros
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((row) => {
                    const badge = ESTADO_BADGE[row.estado] ?? {
                      label: row.estado,
                      cls: "bg-muted text-muted-foreground",
                    };
                    return (
                      <tr
                        key={row.id}
                        className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium">{row.guardiaNombre}</p>
                            {row.guardiaCode && (
                              <p className="text-xs text-muted-foreground">{row.guardiaCode}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.cls}`}
                          >
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {row.emailEnviado ? (
                              <>
                                <span className="text-muted-foreground">
                                  {formatDate(row.fechaEnvio)}
                                </span>
                                {row.emailAbierto && (
                                  <MailOpen className="h-3.5 w-3.5 text-status-ok-fg" />
                                )}
                              </>
                            ) : (
                              <span className="text-muted-foreground">–</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <PortalAccessCell
                            accessed={row.accesoPortalGuardia}
                            date={row.fechaAccesoGuardia}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <PortalAccessCell
                            accessed={row.accesoPortalRondas}
                            date={row.fechaAccesoRondas}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <PortalAccessCell
                            accessed={row.accesoPortalAcceso}
                            date={row.fechaAccesoAcceso}
                          />
                        </td>
                        <td className="px-4 py-3">
                          {row.recordatorioEnviado ? (
                            formatDate(row.fechaRecordatorio)
                          ) : (
                            <span className="text-muted-foreground">–</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => handleResend(row.guardiaId)}
                              disabled={resendingId === row.guardiaId}
                            >
                              {resendingId === row.guardiaId ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Send className="h-3.5 w-3.5" />
                              )}
                            </Button>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" asChild>
                              <Link href={`/personas/guardias/${row.guardiaId}`}>
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Link>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
