/**
 * PAYROLL PARAMETERS
 * Visualización completa de parámetros legales vigentes
 */

"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/opai";
import { PayrollSubnav } from "@/components/payroll/PayrollSubnav";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, AlertCircle, Info } from "lucide-react";
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
        <PageHeader title="Parámetros Legales" />
        <Card className="border-red-500/20 bg-red-500/10 p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-red-400" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <PageHeader title="Parámetros Legales Chile" />
        <Badge variant="default" className="gap-1.5 text-xs">
          <Calendar className="h-3 w-3 text-white" />
          {parameters.effective_from}
        </Badge>
      </div>
      <PayrollSubnav />

      {/* Row 1: AFP, SIS/Salud, AFC, Mutual/Topes */}
      <div className="grid gap-3 lg:grid-cols-4">
        {/* ── AFP ─────────────────────────────── */}
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">AFP</h3>
          <div className="space-y-2">
            <div className="rounded-md bg-muted/30 px-3 py-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Base cotización:</span>
                <span className="font-mono font-medium">
                  {fmtPct(data.afp.base_rate, 0)}%
                </span>
              </div>
            </div>
            <div className="space-y-1 text-xs">
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
        </Card>

        {/* ── SIS / Salud ────────────────────── */}
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">SIS / Salud</h3>
          <div className="space-y-3">
            <div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-2">
              <div className="flex justify-between text-xs">
                <span className="text-emerald-400">SIS Empleador:</span>
                <span className="font-mono font-semibold text-emerald-400">
                  {fmtPct(data.sis.employer_rate)}%
                </span>
              </div>
            </div>
            <div className="space-y-1 text-xs">
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
        </Card>

        {/* ── AFC ────────────────────────────── */}
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">AFC (Seguro Cesantía)</h3>
          <div className="space-y-2 text-xs">
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
        </Card>

        {/* ── Mutual / Topes ─────────────────── */}
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">Mutual / Topes</h3>
          <div className="space-y-3">
            {/* Mutual */}
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase text-muted-foreground">Mutual (Ley 16.744)</p>
              <div className="rounded-md border border-blue-500/20 bg-blue-500/10 px-3 py-2">
                <div className="flex justify-between text-xs">
                  <span className="text-blue-400">Base legal:</span>
                  <span className="font-mono font-semibold text-blue-400">
                    {fmtPct(data.work_injury.base_rate)}%
                  </span>
                </div>
              </div>
              {data.work_injury.risk_levels && (
                <div className="mt-1.5 space-y-0.5 text-xs">
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
              <div className="space-y-1 text-xs">
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
        </Card>
      </div>

      {/* Row 2: Gratificación + IMM */}
      <div className="grid gap-3 lg:grid-cols-2">
        {/* ── Gratificación Legal ────────────── */}
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">Gratificación Legal</h3>
          <div className="space-y-3">
            {data.gratification?.regime_25_monthly ? (
              <div className="rounded-md bg-muted/30 p-3">
                <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                  Art. 50 CT - Régimen 25% Mensual
                </p>
                <div className="space-y-1 text-xs">
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
                    <span className="font-mono text-emerald-400">Sí (previsional + tributario)</span>
                  </div>
                </div>
              </div>
            ) : data.gratification?.monthly_rate ? (
              /* Fallback para estructura plana legacy */
              <div className="rounded-md bg-muted/30 p-3">
                <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                  Art. 50 CT - Régimen 25% Mensual
                </p>
                <div className="space-y-1 text-xs">
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
              <p className="text-xs text-muted-foreground">No configurado</p>
            )}
          </div>
        </Card>

        {/* ── IMM + Referencias ──────────────── */}
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">Ingreso Mínimo Mensual (IMM)</h3>
          <div className="space-y-3">
            {data.imm ? (
              <>
                <div className="rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-amber-400">IMM vigente:</span>
                    <span className="font-mono font-semibold text-amber-400">
                      {formatCLP(data.imm.value_clp)}
                    </span>
                  </div>
                </div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Vigente desde:</span>
                    <span className="font-mono">{data.imm.effective_from}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Imponible:</span>
                    <span className="font-mono text-emerald-400">Sí</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-start gap-2 rounded-md bg-amber-500/10 p-3">
                <Info className="mt-0.5 h-3.5 w-3.5 text-amber-400" />
                <p className="text-xs text-amber-400">
                  IMM no configurado en esta versión de parámetros. Se usará $500.000 como fallback.
                </p>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Row 3: Asignación Familiar */}
      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold">Asignación Familiar 2026 (IPS)</h3>
        {data.family_allowance?.tranches ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="pb-2 font-medium">Tramo</th>
                  <th className="pb-2 font-medium">Renta Desde</th>
                  <th className="pb-2 font-medium">Renta Hasta</th>
                  <th className="pb-2 font-medium text-right">Por Carga</th>
                  <th className="pb-2 font-medium text-right">Maternal</th>
                  <th className="pb-2 font-medium text-right">Invalidez</th>
                </tr>
              </thead>
              <tbody>
                {data.family_allowance.tranches.map((t: any, i: number) => (
                  <tr key={i} className="border-b border-border/30">
                    <td className="py-1.5 font-mono font-medium">{String.fromCharCode(65 + i)}</td>
                    <td className="py-1.5 font-mono text-muted-foreground">
                      {formatCLP(t.from_clp)}
                    </td>
                    <td className="py-1.5 font-mono text-muted-foreground">
                      {t.to_clp ? formatCLP(t.to_clp) : "Sin límite"}
                    </td>
                    <td className="py-1.5 font-mono text-right">
                      {t.amount_per_dependent > 0 ? formatCLP(t.amount_per_dependent) : "—"}
                    </td>
                    <td className="py-1.5 font-mono text-right">
                      {t.amount_maternal > 0 ? formatCLP(t.amount_maternal) : "—"}
                    </td>
                    <td className="py-1.5 font-mono text-right">
                      {t.amount_invalidity > 0 ? formatCLP(t.amount_invalidity) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No configurado</p>
        )}
      </Card>

      {/* Row 4: Impuesto Único */}
      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold">
          Tramos Impuesto Único de Segunda Categoría (SII)
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="pb-2 font-medium">Tramo</th>
                <th className="pb-2 font-medium">Desde (CLP)</th>
                <th className="pb-2 font-medium">Hasta (CLP)</th>
                <th className="pb-2 font-medium text-right">Factor</th>
                <th className="pb-2 font-medium text-right">Rebaja (CLP)</th>
                <th className="pb-2 font-medium text-right">Tasa Efectiva Máx.</th>
              </tr>
            </thead>
            <tbody>
              {data.tax_brackets.map((b: any, i: number) => (
                <tr
                  key={i}
                  className={`border-b border-border/30 ${
                    b.factor === 0 ? "text-muted-foreground" : ""
                  }`}
                >
                  <td className="py-1.5 font-mono font-medium">{i + 1}</td>
                  <td className="py-1.5 font-mono">{formatCLP(b.from_clp)}</td>
                  <td className="py-1.5 font-mono">
                    {b.to_clp ? formatCLP(b.to_clp) : "Sin límite"}
                  </td>
                  <td className="py-1.5 font-mono text-right">
                    {fmtPct(b.factor, 1)}%
                  </td>
                  <td className="py-1.5 font-mono text-right">
                    {b.rebate_clp > 0 ? formatCLP(b.rebate_clp) : "—"}
                  </td>
                  <td className="py-1.5 font-mono text-right text-muted-foreground">
                    {b.effective_rate_max > 0
                      ? `${fmtPct(b.effective_rate_max, 1)}%`
                      : "Exento"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Footer: fuente */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
