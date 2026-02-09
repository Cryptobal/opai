"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/components/cpq/utils";
import type { CpqPosition } from "@/types/cpq";

interface CostBreakdownModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  position: CpqPosition;
}

export function CostBreakdownModal({ open, onOpenChange, position }: CostBreakdownModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);

  const healthPlanPct = useMemo(() => {
    if (position.healthSystem === "fonasa") return 0.07;
    return position.healthPlanPct || 0.07;
  }, [position.healthPlanPct, position.healthSystem]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setData(null);

    const load = async () => {
      try {
        const res = await fetch("/api/payroll/costing/compute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            base_salary_clp: Number(position.baseSalary),
            contract_type: "indefinite",
            afp_name: position.afpName || "modelo",
            health_system: position.healthSystem || "fonasa",
            health_plan_pct: healthPlanPct,
            assumptions: {
              include_vacation_provision: true,
              include_severance_provision: true,
              vacation_provision_pct: 0.0833,
              severance_provision_pct: 0.04166,
            },
          }),
        });
        const payload = await res.json();
        if (!payload.success) throw new Error(payload.error?.message || "Error");
        setData(payload.data);
      } catch (err: any) {
        setError(err?.message || "No se pudo calcular.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [open, position, healthPlanPct]);

  const breakdown = data?.breakdown;
  const worker = data?.worker_breakdown_estimate;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Apertura costo por guardia</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm sm:text-xs">
          <div className="rounded-md border bg-muted/20 p-3 sm:p-2">
            <div className="flex items-center justify-between">
              <span>Base</span>
              <span className="font-mono">{formatCurrency(Number(position.baseSalary))}</span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>AFP</span>
              <span>{(position.afpName || "modelo").toUpperCase()}</span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Salud</span>
              <span>{position.healthSystem === "isapre" ? "Isapre" : "Fonasa"}</span>
            </div>
          </div>

          {loading && <div className="text-muted-foreground">Calculando...</div>}
          {error && <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 sm:p-2">{error}</div>}

          {data && (
            <div className="space-y-3">
              <div className="rounded-md border p-3 sm:p-2">
                <p className="text-xs sm:text-xs font-semibold uppercase text-muted-foreground">Haberes</p>
                <div className="mt-1 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span>Sueldo base</span>
                    <span className="font-mono">{formatCurrency(breakdown.base_salary)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Gratificación</span>
                    <span className="font-mono">{formatCurrency(breakdown.gratification)}</span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Total imponible</span>
                    <span className="font-mono">{formatCurrency(breakdown.total_taxable_income)}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-md border p-3 sm:p-2">
                <p className="text-xs sm:text-xs font-semibold uppercase text-muted-foreground">Aportes empresa</p>
                <div className="mt-1 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span>SIS</span>
                    <span className="font-mono">{formatCurrency(breakdown.sis_employer)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>AFC</span>
                    <span className="font-mono">{formatCurrency(breakdown.afc_employer.total)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Mutual</span>
                    <span className="font-mono">{formatCurrency(breakdown.work_injury_employer.amount)}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-md border p-3 sm:p-2">
                <p className="text-xs sm:text-xs font-semibold uppercase text-muted-foreground">Provisiones</p>
                <div className="mt-1 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span>Vacaciones</span>
                    <span className="font-mono">{formatCurrency(breakdown.vacation_provision)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Indemnización</span>
                    <span className="font-mono">{formatCurrency(breakdown.severance_provision)}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-md border bg-emerald-500/5 p-3 sm:p-2">
                <div className="flex items-center justify-between">
                  <span className="text-emerald-500">Costo empresa</span>
                  <span className="font-mono text-emerald-500">
                    {formatCurrency(data.monthly_employer_cost_clp)}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Costo hora (180h)</span>
                  <span className="font-mono">
                    {formatCurrency(Number(data.monthly_employer_cost_clp) / 180)}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-blue-500">
                  <span>Líquido estimado</span>
                  <span className="font-mono">{formatCurrency(data.worker_net_salary_estimate)}</span>
                </div>
              </div>

              {worker && (
                <div className="rounded-md border p-3 sm:p-2">
                  <p className="text-xs sm:text-xs font-semibold uppercase text-muted-foreground">Descuentos trabajador</p>
                  <div className="mt-1 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span>AFP</span>
                      <span className="font-mono">{formatCurrency(worker.afp.amount)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Salud</span>
                      <span className="font-mono">{formatCurrency(worker.health)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>AFC</span>
                      <span className="font-mono">{formatCurrency(worker.afc)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Impuesto</span>
                      <span className="font-mono">{formatCurrency(worker.tax)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-end">
            <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
