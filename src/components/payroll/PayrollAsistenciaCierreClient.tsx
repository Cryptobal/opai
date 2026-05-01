"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  CheckCircle2,
  AlertTriangle,
  Lock,
  Unlock,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  UserMinus,
  UserX,
  ShieldAlert,
} from "lucide-react";

interface Summary {
  totalGuardias: number;
  completos: number;
  parciales: number;
  sinMarcacion: number;
  discrepancias: number;
  discrepanciasDetalle?: Array<{
    guardiaId: string;
    date: string;
    tipo: string;
    detalle: string;
  }>;
}

interface PeriodData {
  status: "open" | "closed";
  year: number;
  month: number;
  summary: Summary | null;
  lockedAt?: string | null;
  lockedBy?: string | null;
  lockedByName?: string | null;
}

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function PayrollAsistenciaCierreClient() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [period, setPeriod] = useState<PeriodData | null>(null);
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [showConfirmClose, setShowConfirmClose] = useState(false);
  const [showConfirmReopen, setShowConfirmReopen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPeriod = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/payroll/attendance-period?year=${year}&month=${month}`,
      );
      if (!res.ok) throw new Error("Error al consultar período");
      const json = await res.json();
      setPeriod(json.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    fetchPeriod();
  }, [fetchPeriod]);

  const handlePrev = () => {
    if (month === 1) { setYear(year - 1); setMonth(12); }
    else setMonth(month - 1);
  };
  const handleNext = () => {
    if (month === 12) { setYear(year + 1); setMonth(1); }
    else setMonth(month + 1);
  };

  const handleClose = async () => {
    setClosing(true);
    setError(null);
    try {
      const res = await fetch("/api/payroll/attendance-period/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, month }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Error al cerrar período");
      }
      setShowConfirmClose(false);
      await fetchPeriod();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setClosing(false);
    }
  };

  const handleReopen = async () => {
    setReopening(true);
    setError(null);
    try {
      const res = await fetch("/api/payroll/attendance-period", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, month }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Error al reabrir período");
      }
      setShowConfirmReopen(false);
      await fetchPeriod();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setReopening(false);
    }
  };

  const isClosed = period?.status === "closed";
  const summary = period?.summary as Summary | null;

  return (
    <div className="space-y-4">
      {/* Month selector */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={handlePrev}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium min-w-[140px] text-center">
          {MONTH_NAMES[month - 1]} {year}
        </span>
        <Button variant="outline" size="icon" onClick={handleNext}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            Cargando período...
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Status card */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  Estado del período
                </CardTitle>
                {isClosed ? (
                  <Badge variant="outline" className="border-status-ok-border bg-status-ok-soft text-status-ok-fg gap-1.5">
                    <Lock className="h-3 w-3" /> Cerrado
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-status-warn-border bg-status-warn-soft text-status-warn-fg gap-1.5">
                    <Unlock className="h-3 w-3" /> Abierto
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {isClosed && period?.lockedAt && (
                <p className="text-xs text-muted-foreground">
                  Cerrado por{" "}
                  <span className="text-foreground font-medium">
                    {period.lockedByName ?? "—"}
                  </span>{" "}
                  el{" "}
                  {new Date(period.lockedAt).toLocaleDateString("es-CL", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              )}
              {!isClosed && (
                <p className="text-xs text-muted-foreground">
                  El período de asistencia debe cerrarse antes de procesar
                  liquidaciones.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Summary */}
          {summary && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Resumen de asistencia</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <SummaryTile
                    icon={<UserCheck className="h-4 w-4 text-status-ok-fg" />}
                    label="Completos"
                    value={summary.completos}
                    description="Marcación entrada + salida todos los días"
                    color="emerald"
                  />
                  <SummaryTile
                    icon={<AlertTriangle className="h-4 w-4 text-status-warn-fg" />}
                    label="Parciales"
                    value={summary.parciales}
                    description="Faltan marcaciones algunos días"
                    color="amber"
                  />
                  <SummaryTile
                    icon={<UserX className="h-4 w-4 text-status-danger-fg" />}
                    label="Sin marcación"
                    value={summary.sinMarcacion}
                    description="Solo pauta manual, sin marca electrónica"
                    color="red"
                  />
                  <SummaryTile
                    icon={<ShieldAlert className="h-4 w-4 text-status-warn-fg" />}
                    label="Discrepancias"
                    value={summary.discrepancias}
                    description="Pauta vs marcación no coinciden"
                    color="orange"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  Total guardias programados: {summary.totalGuardias}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Discrepancies detail */}
          {summary &&
            summary.discrepanciasDetalle &&
            summary.discrepanciasDetalle.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">
                    Detalle de discrepancias ({summary.discrepancias})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border text-muted-foreground">
                          <th className="text-left py-2 pr-4 font-medium">Fecha</th>
                          <th className="text-left py-2 pr-4 font-medium">Tipo</th>
                          <th className="text-left py-2 font-medium">Detalle</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.discrepanciasDetalle.map((d, i) => (
                          <tr key={i} className="border-b border-border/50">
                            <td className="py-2 pr-4 whitespace-nowrap">{d.date}</td>
                            <td className="py-2 pr-4">
                              <Badge
                                variant="outline"
                                className={
                                  d.tipo === "pauta_sin_marca"
                                    ? "border-status-warn-border bg-status-warn-soft text-status-warn-fg"
                                    : "border-status-info-border bg-status-info-soft text-status-info-fg"
                                }
                              >
                                {d.tipo === "pauta_sin_marca"
                                  ? "Pauta sin marca"
                                  : "Marca sin pauta"}
                              </Badge>
                            </td>
                            <td className="py-2 text-muted-foreground">{d.detalle}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {summary.discrepancias > 100 && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Mostrando primeras 100 de {summary.discrepancias} discrepancias
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

          {/* Actions */}
          <div className="flex gap-3">
            {!isClosed && (
              <Button onClick={() => setShowConfirmClose(true)}>
                <Lock className="h-4 w-4 mr-2" />
                Cerrar período de asistencia
              </Button>
            )}
            {isClosed && (
              <Button
                variant="outline"
                onClick={() => setShowConfirmReopen(true)}
              >
                <Unlock className="h-4 w-4 mr-2" />
                Reabrir período
              </Button>
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        open={showConfirmClose}
        onOpenChange={setShowConfirmClose}
        title="Cerrar período de asistencia"
        description={`¿Cerrar el período de asistencia de ${MONTH_NAMES[month - 1]} ${year}? Se calculará el resumen y se bloqueará la edición. Podrá reabrirse después si es necesario.`}
        confirmLabel="Cerrar período"
        variant="default"
        onConfirm={handleClose}
        loading={closing}
        loadingLabel="Cerrando..."
      />

      <ConfirmDialog
        open={showConfirmReopen}
        onOpenChange={setShowConfirmReopen}
        title="Reabrir período de asistencia"
        description={`¿Reabrir el período de ${MONTH_NAMES[month - 1]} ${year}? Se desbloqueará y podrá volver a cerrarse.`}
        confirmLabel="Reabrir"
        variant="destructive"
        onConfirm={handleReopen}
        loading={reopening}
        loadingLabel="Reabriendo..."
      />
    </div>
  );
}

function SummaryTile({
  icon,
  label,
  value,
  description,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  description: string;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-border p-3 space-y-1">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
      </div>
      <p className="text-2xl font-bold tracking-tight">{value}</p>
      <p className="text-[11px] text-muted-foreground leading-tight">
        {description}
      </p>
    </div>
  );
}
