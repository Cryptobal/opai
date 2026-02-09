/**
 * PAYROLL PARAMETERS
 * Visualización de parámetros legales vigentes
 */

"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/opai";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Calendar, AlertCircle } from "lucide-react";
import Link from "next/link";
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
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-sm text-muted-foreground">Cargando...</div>
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/payroll">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Volver
            </Button>
          </Link>
          <PageHeader title="Parámetros Legales Chile" />
        </div>
        <Badge variant="default" className="gap-1.5 text-xs">
          <Calendar className="h-3 w-3" />
          {parameters.effective_from}
        </Badge>
      </div>

      <div className="grid gap-3 lg:grid-cols-4">
        {/* AFP */}
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">AFP</h3>
          <div className="space-y-2">
            <div className="rounded-md bg-muted/30 px-3 py-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Base:</span>
                <span className="font-mono font-medium">10%</span>
              </div>
            </div>
            <div className="space-y-1 text-xs">
              {Object.entries(data.afp.commissions).map(([name, config]: any) => (
                <div key={name} className="flex justify-between">
                  <span className="capitalize text-muted-foreground">{name}</span>
                  <span className="font-mono">
                    {formatNumber((data.afp.base_rate + config.commission_rate) * 100, { minDecimals: 2, maxDecimals: 2 })}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* SIS + Salud */}
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">SIS / Salud</h3>
          <div className="space-y-3">
            <div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-2">
              <div className="flex justify-between text-xs">
                <span className="text-emerald-400">SIS Empleador:</span>
                <span className="font-mono font-semibold text-emerald-400">
                  {formatNumber(data.sis.employer_rate * 100, { minDecimals: 2, maxDecimals: 2 })}%
                </span>
              </div>
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fonasa:</span>
                <span className="font-mono">7%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Isapre:</span>
                <span className="font-mono">7%+</span>
              </div>
            </div>
          </div>
        </Card>

        {/* AFC */}
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">AFC</h3>
          <div className="space-y-2 text-xs">
            <div className="rounded-md bg-muted/30 p-2">
              <p className="mb-1 text-[10px] font-medium uppercase text-muted-foreground">Indefinido</p>
              <div className="space-y-0.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Trabajador:</span>
                  <span className="font-mono">{formatNumber(data.afc.indefinite.worker.total_rate * 100, { minDecimals: 1, maxDecimals: 1 })}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Empleador:</span>
                  <span className="font-mono">{formatNumber(data.afc.indefinite.employer.total_rate * 100, { minDecimals: 1, maxDecimals: 1 })}%</span>
                </div>
              </div>
            </div>
            <div className="rounded-md bg-muted/30 p-2">
              <p className="mb-1 text-[10px] font-medium uppercase text-muted-foreground">Plazo Fijo</p>
              <div className="space-y-0.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Trabajador:</span>
                  <span className="font-mono">{formatNumber(data.afc.fixed_term.worker.total_rate * 100, { minDecimals: 1, maxDecimals: 1 })}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Empleador:</span>
                  <span className="font-mono">{formatNumber(data.afc.fixed_term.employer.total_rate * 100, { minDecimals: 1, maxDecimals: 1 })}%</span>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Mutual + Topes */}
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">Mutual / Topes</h3>
          <div className="space-y-3">
            <div>
              <p className="mb-1.5 text-[10px] font-medium uppercase text-muted-foreground">Mutual (Ley 16.744)</p>
              <div className="rounded-md border border-blue-500/20 bg-blue-500/10 px-3 py-2">
                <div className="flex justify-between text-xs">
                  <span className="text-blue-400">Tasa Empleador:</span>
                  <span className="font-mono font-semibold text-blue-400">
                    {formatNumber((data.work_injury.base_rate || 0.0093) * 100, { minDecimals: 2, maxDecimals: 2 })}%
                  </span>
                </div>
              </div>
              <p className="mt-1.5 text-[9px] text-muted-foreground">
                Base legal + adicional según siniestralidad empresa
              </p>
            </div>
            
            <div className="border-t pt-2">
              <p className="mb-1.5 text-[10px] font-medium uppercase text-muted-foreground">Topes 2026</p>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pensión:</span>
                  <span className="font-mono">
                    {formatNumber(data.caps.pension_uf, { minDecimals: 2, maxDecimals: 2 })} UF
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

        {/* Asignación Familiar */}
        <Card className="col-span-full p-4 lg:col-span-2">
          <h3 className="mb-3 text-sm font-semibold">Asignación Familiar 2026</h3>
          {data.family_allowance ? (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-[10px] uppercase text-muted-foreground">
                  <th className="pb-2 font-medium">Tramo Ingreso</th>
                  <th className="pb-2 font-medium text-right">Por Carga</th>
                </tr>
              </thead>
              <tbody>
                {data.family_allowance.tranches.map((t: any, i: number) => (
                  <tr key={i} className="border-b border-border/30">
                    <td className="py-1.5 text-muted-foreground">
                      {t.to_clp
                        ? `${formatCLP(t.from_clp)} - ${formatCLP(t.to_clp)}`
                        : `Más de ${formatCLP(t.from_clp)}`
                      }
                    </td>
                    <td className="py-1.5 font-mono text-right">
                      {t.amount_per_dependent > 0 ? formatCLP(t.amount_per_dependent) : "Sin beneficio"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-muted-foreground">No configurado</p>
          )}
        </Card>

        {/* Impuesto Único - Tabla completa */}
        <Card className="col-span-full p-4">
          <h3 className="mb-3 text-sm font-semibold">Tramos Impuesto Único (SII Feb 2026)</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="pb-2 font-medium">Desde (CLP)</th>
                <th className="pb-2 font-medium">Hasta (CLP)</th>
                <th className="pb-2 font-medium">Factor</th>
                <th className="pb-2 font-medium">Rebaja (CLP)</th>
                <th className="pb-2 font-medium">Tasa Efectiva</th>
              </tr>
            </thead>
            <tbody>
              {data.tax_brackets.map((b: any, i: number) => (
                <tr key={i} className="border-b border-border/30">
                  <td className="py-1.5 font-mono text-xs">
                    {formatNumber(b.from_clp / 1000, { minDecimals: 0, maxDecimals: 0 })}k
                  </td>
                  <td className="py-1.5 font-mono text-xs">
                    {b.to_clp
                      ? `${formatNumber(b.to_clp / 1000, { minDecimals: 0, maxDecimals: 0 })}k`
                      : "∞"}
                  </td>
                  <td className="py-1.5 font-mono text-xs">
                    {formatNumber(b.factor * 100, { minDecimals: 0, maxDecimals: 0 })}%
                  </td>
                  <td className="py-1.5 font-mono text-xs">
                    {formatNumber(b.rebate_clp / 1000, { minDecimals: 0, maxDecimals: 0 })}k
                  </td>
                  <td className="py-1.5 font-mono text-xs text-muted-foreground">
                    {formatNumber(b.effective_rate_max * 100, { minDecimals: 1, maxDecimals: 1 })}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
