"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Eye, Building2, User } from "lucide-react";

const MONTHS = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

interface Liquidacion {
  id: string;
  periodId: string;
  salarySource: string;
  daysWorked: number;
  grossSalary: string | number;
  netSalary: string | number;
  totalDeductions: string | number;
  employerCost: string | number;
  status: string;
  breakdown: any;
  createdAt: string;
  period?: { year: number; month: number };
}

export function GuardiaLiquidacionesTab({ guardiaId }: { guardiaId: string }) {
  const [liquidaciones, setLiquidaciones] = useState<Liquidacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedLiq, setSelectedLiq] = useState<Liquidacion | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/payroll/periodos?guardiaId=${guardiaId}`);
      if (!res.ok) { setLoading(false); return; }

      // Get all periods and filter liquidaciones for this guard
      const periodsRes = await fetch("/api/payroll/periodos");
      if (!periodsRes.ok) { setLoading(false); return; }
      const periodsData = await periodsRes.json();
      const periods = periodsData.data || [];

      const allLiqs: Liquidacion[] = [];
      for (const p of periods) {
        const detailRes = await fetch(`/api/payroll/periodos/${p.id}`);
        if (!detailRes.ok) continue;
        const detail = await detailRes.json();
        const myLiqs = (detail.data?.liquidaciones || [])
          .filter((l: any) => l.guardiaId === guardiaId)
          .map((l: any) => ({ ...l, period: { year: p.year, month: p.month } }));
        allLiqs.push(...myLiqs);
      }

      setLiquidaciones(allLiqs);
    } catch (err) {
      console.error("Error loading liquidaciones:", err);
    } finally {
      setLoading(false);
    }
  }, [guardiaId]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (liq: Liquidacion) => {
    try {
      const res = await fetch(`/api/payroll/liquidaciones/${liq.id}`);
      if (res.ok) {
        const json = await res.json();
        setSelectedLiq({ ...json.data, period: liq.period });
        setDetailOpen(true);
      }
    } catch { /* ignore */ }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (liquidaciones.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No hay liquidaciones generadas para este guardia.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {liquidaciones.map((liq) => (
        <Card key={liq.id} className="cursor-pointer hover:bg-accent/30 transition-colors" onClick={() => openDetail(liq)}>
          <CardContent className="pt-3 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {liq.period ? `${MONTHS[liq.period.month - 1]} ${liq.period.year}` : "—"}
                  </span>
                  <Badge variant="outline" className="text-[9px]">
                    {liq.status}
                  </Badge>
                  {liq.salarySource === "RUT" ? (
                    <Badge className="text-[9px] bg-amber-500/15 text-amber-400 border-amber-500/30">
                      <User className="mr-0.5 h-2.5 w-2.5" />
                      RUT
                    </Badge>
                  ) : (
                    <Badge className="text-[9px] bg-blue-500/15 text-blue-400 border-blue-500/30">
                      <Building2 className="mr-0.5 h-2.5 w-2.5" />
                      Instalación
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {liq.daysWorked} días · Bruto: ${Number(liq.grossSalary).toLocaleString("es-CL")}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-emerald-400">
                ${Number(liq.netSalary).toLocaleString("es-CL")}
              </p>
              <p className="text-[10px] text-muted-foreground">Líquido</p>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Detail modal */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Liquidación {selectedLiq?.period ? `${MONTHS[selectedLiq.period.month - 1]} ${selectedLiq.period.year}` : ""}
            </DialogTitle>
          </DialogHeader>
          {selectedLiq && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-muted-foreground">Total Haberes</p>
                  <p className="font-medium">${Number(selectedLiq.grossSalary).toLocaleString("es-CL")}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Total Descuentos</p>
                  <p className="font-medium text-destructive">-${Number(selectedLiq.totalDeductions).toLocaleString("es-CL")}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Sueldo Líquido</p>
                  <p className="font-semibold text-emerald-400">${Number(selectedLiq.netSalary).toLocaleString("es-CL")}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Costo Empleador</p>
                  <p className="font-medium text-amber-400">${Number(selectedLiq.employerCost).toLocaleString("es-CL")}</p>
                </div>
              </div>

              {selectedLiq.breakdown && (() => {
                const hab = selectedLiq.breakdown.haberes || {};
                const ded = selectedLiq.breakdown.deductions || {};
                const SKIP_KEYS = new Set(["gross_salary", "total_taxable", "total_non_taxable"]);
                const haberesEntries = Object.entries(hab)
                  .filter(([k, v]) => typeof v === "number" && (v as number) > 0 && !SKIP_KEYS.has(k))
                  .slice(0, 10);

                return (
                  <>
                    <div className="border-t border-border pt-3">
                      <p className="text-xs font-semibold mb-2">Haberes</p>
                      <div className="space-y-1 text-xs">
                        {haberesEntries.map(([key, val]) => (
                          <div key={key} className="flex justify-between">
                            <span className="text-muted-foreground">{formatKey(key)}</span>
                            <span>${(val as number).toLocaleString("es-CL")}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="border-t border-border pt-3">
                      <p className="text-xs font-semibold mb-2">Descuentos Legales</p>
                      <div className="space-y-1 text-xs">
                        {ded.afp?.amount > 0 && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">AFP ({(ded.afp.total_rate * 100).toFixed(2)}%)</span>
                            <span className="text-destructive">-${ded.afp.amount.toLocaleString("es-CL")}</span>
                          </div>
                        )}
                        {ded.health?.amount > 0 && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Salud ({(ded.health.rate * 100).toFixed(1)}%)</span>
                            <span className="text-destructive">-${ded.health.amount.toLocaleString("es-CL")}</span>
                          </div>
                        )}
                        {ded.afc?.amount > 0 && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">AFC</span>
                            <span className="text-destructive">-${ded.afc.amount.toLocaleString("es-CL")}</span>
                          </div>
                        )}
                        {ded.tax?.amount > 0 && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Impuesto Único</span>
                            <span className="text-destructive">-${ded.tax.amount.toLocaleString("es-CL")}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
