/**
 * PAYROLL PARAMETERS
 * Visualización completa de parámetros legales vigentes
 */

"use client";

import { useEffect, useState } from "react";
import { DataTable, EmptyState, ModuleSubNav, PageHero, type DataTableColumn } from "@/components/opai-ds";
import { FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, AlertCircle, Info, Inbox } from "lucide-react";
import { formatCLP, formatNumber } from "@/lib/utils";

export default function PayrollParameters() {
  const [parameters, setParameters] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchParameters();
  }, []);

  const fetchParameters = async () => {
    try {
      const response = await fetch("/api/payroll/parameters?active_only=true");
      const data = await response.json();
      if (!data.success) throw new Error(data.error?.message || "Error");
      setParameters(data.data.current_version);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 min-w-0">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded bg-muted animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-48 rounded bg-muted animate-pulse" />
            <div className="h-3 w-64 rounded bg-muted/60 animate-pulse" />
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 rounded-lg border border-border bg-muted/20 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <PageHero
          icon={<FileText />}
          iconTone="amber"
          title="Parámetros Legales"
          subtitle="versiones legales vigentes"
        />
        <Card className="border-status-danger-border bg-status-danger-soft">
          <CardContent>
            <div className="flex items-start gap-2 pt-4">
              <AlertCircle className="h-4 w-4 text-status-danger-fg" />
              <p className="text-sm text-status-danger-fg">{error}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!parameters) return null;

  const data = parameters.data;

  // Helper para formatear porcentaje
  const fmtPct = (v: number, decimals = 2) =>
    formatNumber(v * 100, { minDecimals: decimals, maxDecimals: decimals });

  return (
    <div className="space-y-6 min-w-0">
      <ModuleSubNav moduleKey="payroll" />
      {/* Header */}
      <PageHero
        icon={<FileText />}
        iconTone="amber"
        title="Parámetros Legales Chile"
        subtitle="versiones vigentes"
        description={`Vigencia desde ${parameters.effective_from}`}
        actions={
          <Badge variant="default" className="gap-1.5 text-xs">
            <Calendar className="h-3 w-3" />
            {parameters.effective_from}
          </Badge>
        }
      />

      {/* Row 1: AFP, SIS/Salud, AFC, Mutual/Topes */}
      <div className="grid gap-3 lg:grid-cols-4">
        {/* ── AFP ─────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">AFP</CardTitle>
          </CardHeader>
          <CardContent>
          <div className="space-y-2">
            <div className="rounded-md bg-muted/30 px-3 py-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Base cotización:</span>
                <span className="font-mono font-medium">
                  {fmtPct(data.afp.base_rate, 0)}%
                </span>
              </div>
            </div>
            <div className="space-y-1 text-sm">
              {Object.entries(data.afp.commissions)
                .sort(([, a]: any, [, b]: any) => a.commission_rate - b.commission_rate)
                .map(([name, config]: any) => (
                  <div key={name} className="flex justify-between">
                    <span className="capitalize text-muted-foreground">{name}</span>
                    <span className="font-mono">
                      {fmtPct(data.afp.base_rate + config.commission_rate)}%
                      <span className="ml-1 text-muted-foreground/60">
                        ({fmtPct(config.commission_rate)}%)
                      </span>
                    </span>
                  </div>
                ))}
            </div>
          </div>
          </CardContent>
        </Card>

        {/* ── SIS / Salud ────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">SIS / Salud</CardTitle>
          </CardHeader>
          <CardContent>
          <div className="space-y-3">
            <div className="rounded-md border border-status-ok-border bg-status-ok-soft px-3 py-2">
              <div className="flex justify-between text-sm">
                <span className="text-status-ok-fg">SIS Empleador:</span>
                <span className="font-mono font-semibold text-status-ok-fg">
                  {fmtPct(data.sis.employer_rate)}%
                </span>
              </div>
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fonasa:</span>
                <span className="font-mono">
                  {fmtPct(data.health.fonasa.rate, 0)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Isapre:</span>
                <span className="font-mono">
                  {fmtPct(data.health.isapre.min_rate, 0)}%+
                </span>
              </div>
            </div>
          </div>
          </CardContent>
        </Card>

        {/* ── AFC ────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">AFC (Seguro Cesantía)</CardTitle>
          </CardHeader>
          <CardContent>
          <div className="space-y-2 text-sm">
            <div className="rounded-md bg-muted/30 p-2">
              <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">Indefinido</p>
              <div className="space-y-0.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Trabajador:</span>
                  <span className="font-mono">
                    {fmtPct(data.afc.indefinite.worker.total_rate, 1)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Empleador:</span>
                  <span className="font-mono">
                    {fmtPct(data.afc.indefinite.employer.total_rate, 1)}%
                    <span className="ml-1 text-muted-foreground/60">
                      (CIC {fmtPct(data.afc.indefinite.employer.cic_rate, 1)}% + FCS {fmtPct(data.afc.indefinite.employer.fcs_rate, 1)}%)
                    </span>
                  </span>
                </div>
              </div>
            </div>
            <div className="rounded-md bg-muted/30 p-2">
              <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">Plazo Fijo</p>
              <div className="space-y-0.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Trabajador:</span>
                  <span className="font-mono">
                    {fmtPct(data.afc.fixed_term.worker.total_rate, 1)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Empleador:</span>
                  <span className="font-mono">
                    {fmtPct(data.afc.fixed_term.employer.total_rate, 1)}%
                    <span className="ml-1 text-muted-foreground/60">
                      (CIC {fmtPct(data.afc.fixed_term.employer.cic_rate, 1)}% + FCS {fmtPct(data.afc.fixed_term.employer.fcs_rate, 1)}%)
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </div>
          </CardContent>
        </Card>

        {/* ── Mutual / Topes ─────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Mutual / Topes</CardTitle>
          </CardHeader>
          <CardContent>
          <div className="space-y-3">
            {/* Mutual */}
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase text-muted-foreground">Mutual (Ley 16.744)</p>
              <div className="rounded-md border border-status-info-border bg-status-info-soft px-3 py-2">
                <div className="flex justify-between text-sm">
                  <span className="text-status-info-fg">Base legal:</span>
                  <span className="font-mono font-semibold text-status-info-fg">
                    {fmtPct(data.work_injury.base_rate)}%
                  </span>
                </div>
              </div>
              {data.work_injury.risk_levels && (
                <div className="mt-1.5 space-y-0.5 text-sm">
                  {Object.entries(data.work_injury.risk_levels).map(([level, rate]: any) => (
                    <div key={level} className="flex justify-between">
                      <span className="capitalize text-muted-foreground">
                        {level === "low" ? "Bajo" : level === "medium" ? "Medio" : level === "high" ? "Alto" : "Seguridad"}
                      </span>
                      <span className="font-mono">{fmtPct(rate)}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {/* Topes */}
            <div className="border-t pt-2">
              <p className="mb-1.5 text-xs font-medium uppercase text-muted-foreground">Topes Imponibles</p>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pensión:</span>
                  <span className="font-mono">
                    {formatNumber(data.caps.pension_uf, { minDecimals: 2, maxDecimals: 2 })} UF
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Salud:</span>
                  <span className="font-mono">
                    {formatNumber(data.caps.health_uf, { minDecimals: 2, maxDecimals: 2 })} UF
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Mutual:</span>
                  <span className="font-mono">
                    {formatNumber(data.caps.work_injury_uf, { minDecimals: 2, maxDecimals: 2 })} UF
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">AFC:</span>
                  <span className="font-mono">
                    {formatNumber(data.caps.afc_uf, { minDecimals: 2, maxDecimals: 2 })} UF
                  </span>
                </div>
              </div>
            </div>
          </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Gratificación + IMM */}
      <div className="grid gap-3 lg:grid-cols-2">
        {/* ── Gratificación Legal ────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Gratificación Legal</CardTitle>
          </CardHeader>
          <CardContent>
          <div className="space-y-3">
            {data.gratification?.regime_25_monthly ? (
              <div className="rounded-md bg-muted/30 p-3">
                <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                  Art. 50 CT - Régimen 25% Mensual
                </p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tasa mensual:</span>
                    <span className="font-mono font-medium">
                      {fmtPct(data.gratification.regime_25_monthly.monthly_rate, 0)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tope anual:</span>
                    <span className="font-mono">
                      {formatNumber(data.gratification.regime_25_monthly.annual_cap_imm_multiple, { minDecimals: 2, maxDecimals: 2 })} IMM
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tope mensual:</span>
                    <span className="font-mono">
                      {data.imm?.value_clp
                        ? formatCLP(Math.round(data.imm.value_clp * data.gratification.regime_25_monthly.annual_cap_imm_multiple / 12))
                        : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Imponible:</span>
                    <span className="font-mono text-status-ok-fg">Sí (previsional + tributario)</span>
                  </div>
                </div>
              </div>
            ) : data.gratification?.monthly_rate ? (
              /* Fallback para estructura plana legacy */
              <div className="rounded-md bg-muted/30 p-3">
                <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                  Art. 50 CT - Régimen 25% Mensual
                </p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tasa mensual:</span>
                    <span className="font-mono font-medium">
                      {fmtPct(data.gratification.monthly_rate, 0)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tope anual:</span>
                    <span className="font-mono">
                      {formatNumber(data.gratification.annual_cap_imm_multiple, { minDecimals: 2, maxDecimals: 2 })} IMM
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No configurado</p>
            )}
          </div>
          </CardContent>
        </Card>

        {/* ── IMM + Referencias ──────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Ingreso Mínimo Mensual (IMM)</CardTitle>
          </CardHeader>
          <CardContent>
          <div className="space-y-3">
            {data.imm ? (
              <>
                <div className="rounded-md border border-status-warn-border bg-status-warn-soft px-3 py-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-status-warn-fg">IMM vigente:</span>
                    <span className="font-mono font-semibold text-status-warn-fg">
                      {formatCLP(data.imm.value_clp)}
                    </span>
                  </div>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Vigente desde:</span>
                    <span className="font-mono">{data.imm.effective_from}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Imponible:</span>
                    <span className="font-mono text-status-ok-fg">Sí</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-start gap-2 rounded-md bg-status-warn-soft p-3">
                <Info className="mt-0.5 h-3.5 w-3.5 text-status-warn-fg" />
                <p className="text-sm text-status-warn-fg">
                  IMM no configurado en esta versión de parámetros. Se usará $500.000 como fallback.
                </p>
              </div>
            )}
          </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Asignación Familiar */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Asignación Familiar 2026 (IPS)</CardTitle>
        </CardHeader>
        <CardContent>
          {data.family_allowance?.tranches ? (() => {
            const familyRows = data.family_allowance.tranches.map((t: any, i: number) => ({ ...t, tramo: String.fromCharCode(65 + i) }));
            const familyColumns: DataTableColumn<any>[] = [
              {
                id: "tramo",
                header: "Tramo",
                cell: (row) => row.tramo,
              },
              {
                id: "from_clp",
                header: "Renta Desde",
                cell: (row) => <span className="font-mono">{formatCLP(row.from_clp)}</span>,
              },
              {
                id: "to_clp",
                header: "Renta Hasta",
                cell: (row) => <span className="font-mono">{row.to_clp ? formatCLP(row.to_clp) : "Sin límite"}</span>,
              },
              {
                id: "amount_per_dependent",
                header: "Por Carga",
                align: "right",
                cell: (row) => <span className="font-mono">{row.amount_per_dependent > 0 ? formatCLP(row.amount_per_dependent) : "—"}</span>,
              },
              {
                id: "amount_maternal",
                header: "Maternal",
                align: "right",
                cell: (row) => <span className="font-mono">{row.amount_maternal > 0 ? formatCLP(row.amount_maternal) : "—"}</span>,
              },
              {
                id: "amount_invalidity",
                header: "Invalidez",
                align: "right",
                cell: (row) => <span className="font-mono">{row.amount_invalidity > 0 ? formatCLP(row.amount_invalidity) : "—"}</span>,
              },
            ];
            return (
              <DataTable
                columns={familyColumns}
                rows={familyRows}
                rowKey={(r) => r.tramo}
                empty={<EmptyState icon={Inbox} title="No configurado" compact />}
              />
            );
          })() : (
            <p className="text-sm text-muted-foreground">No configurado</p>
          )}
        </CardContent>
      </Card>

      {/* Row 4: Impuesto Único */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Tramos Impuesto Único de Segunda Categoría (SII)</CardTitle>
        </CardHeader>
        <CardContent>
          {(() => {
            const taxRows = data.tax_brackets.map((b: any, i: number) => ({ ...b, tramo: i + 1 }));
            const taxColumns: DataTableColumn<any>[] = [
              {
                id: "tramo",
                header: "Tramo",
                cell: (row) => row.tramo,
              },
              {
                id: "from_clp",
                header: "Desde (CLP)",
                cell: (row) => <span className="font-mono">{formatCLP(row.from_clp)}</span>,
              },
              {
                id: "to_clp",
                header: "Hasta (CLP)",
                cell: (row) => <span className="font-mono">{row.to_clp ? formatCLP(row.to_clp) : "Sin límite"}</span>,
              },
              {
                id: "factor",
                header: "Factor",
                align: "right",
                cell: (row) => <span className="font-mono">{fmtPct(row.factor, 1)}%</span>,
              },
              {
                id: "rebate_clp",
                header: "Rebaja (CLP)",
                align: "right",
                cell: (row) => <span className="font-mono">{row.rebate_clp > 0 ? formatCLP(row.rebate_clp) : "—"}</span>,
              },
              {
                id: "effective_rate_max",
                header: "Tasa Efectiva Máx.",
                align: "right",
                cell: (row) => <span className="font-mono text-muted-foreground">{row.effective_rate_max > 0 ? `${fmtPct(row.effective_rate_max, 1)}%` : "Exento"}</span>,
              },
            ];
            return (
              <DataTable
                columns={taxColumns}
                rows={taxRows}
                rowKey={(r) => String(r.tramo)}
                empty={<EmptyState icon={Inbox} title="No hay tramos configurados" compact />}
              />
            );
          })()}
        </CardContent>
      </Card>

      {/* Footer: fuente */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Info className="h-3.5 w-3.5" />
        <span>
          Fuente: {data.version_metadata?.source || "SII, Previred, Superintendencia de Pensiones, IPS"}
          {" · "}
          Versión: {parameters.name}
        </span>
      </div>
    </div>
  );
}
