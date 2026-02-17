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
  salarySource: string;
  daysWorked: number;
  grossSalary: string | number;
  netSalary: string | number;
  totalDeductions: string | number;
  employerCost: string | number;
  status: string;
  breakdown: any;
  period?: { year: number; month: number };
}

function formatCLP(val: string | number): string {
  return `$${Number(val).toLocaleString("es-CL")}`;
}

export function GuardiaLiquidacionesTab({ guardiaId }: { guardiaId: string }) {
  const [liquidaciones, setLiquidaciones] = useState<Liquidacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLiq, setSelectedLiq] = useState<Liquidacion | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/payroll/guardias/${guardiaId}/liquidaciones`);
      if (res.ok) {
        const json = await res.json();
        setLiquidaciones(json.data || []);
      }
    } catch (err) {
      console.error("Error loading liquidaciones:", err);
    } finally {
      setLoading(false);
    }
  }, [guardiaId]);

  useEffect(() => { load(); }, [load]);

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
        No hay liquidaciones pagadas para este guardia. Las liquidaciones aparecen aquí cuando el período se marca como pagado.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {liquidaciones.map((liq) => (
        <Card key={liq.id} className="cursor-pointer hover:bg-accent/30 transition-colors" onClick={() => setSelectedLiq(liq)}>
          <CardContent className="pt-3 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {liq.period ? `${MONTHS[liq.period.month - 1]} ${liq.period.year}` : "—"}
                  </span>
                  <Badge variant="outline" className="text-[9px] bg-emerald-500/15 text-emerald-400">
                    PAGADO
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
                  {liq.daysWorked} días · Bruto: {formatCLP(liq.grossSalary)}
                </p>
              </div>
            </div>
            <div className="text-right flex items-center gap-2">
              <div>
                <p className="text-sm font-semibold text-emerald-400">{formatCLP(liq.netSalary)}</p>
                <p className="text-[10px] text-muted-foreground">Líquido</p>
              </div>
              <Eye className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Detail modal */}
      <Dialog open={!!selectedLiq} onOpenChange={(open) => !open && setSelectedLiq(null)}>
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
                  <p className="font-medium">{formatCLP(selectedLiq.grossSalary)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Total Descuentos</p>
                  <p className="font-medium text-destructive">-{formatCLP(selectedLiq.totalDeductions)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Sueldo Líquido</p>
                  <p className="font-semibold text-lg text-emerald-400">{formatCLP(selectedLiq.netSalary)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Costo Empleador</p>
                  <p className="font-medium text-amber-400">{formatCLP(selectedLiq.employerCost)}</p>
                </div>
              </div>

              {selectedLiq.breakdown && (() => {
                const hab = selectedLiq.breakdown.haberes || {};
                const ded = selectedLiq.breakdown.deductions || {};
                const vol = selectedLiq.breakdown.voluntaryDeductions || {};

                return (
                  <>
                    <div className="border-t border-border pt-3">
                      <p className="text-xs font-semibold mb-2">Haberes</p>
                      <div className="space-y-1 text-xs">
                        {hab.base_salary > 0 && <Row label="Sueldo Base" val={hab.base_salary} />}
                        {hab.gratification > 0 && <Row label="Gratificación" val={hab.gratification} />}
                        {hab.meal > 0 && <Row label="Colación" val={hab.meal} />}
                        {hab.transport > 0 && <Row label="Movilización" val={hab.transport} />}
                        {hab.other_taxable > 0 && <Row label="Bonos Imponibles" val={hab.other_taxable} />}
                        {hab.other_non_taxable > 0 && <Row label="Bonos No Imponibles" val={hab.other_non_taxable} />}
                      </div>
                    </div>
                    <div className="border-t border-border pt-3">
                      <p className="text-xs font-semibold mb-2">Descuentos</p>
                      <div className="space-y-1 text-xs">
                        {ded.afp?.amount > 0 && <Row label={`AFP (${(ded.afp.total_rate * 100).toFixed(2)}%)`} val={ded.afp.amount} neg />}
                        {ded.health?.amount > 0 && <Row label={`Salud (${(ded.health.rate * 100).toFixed(1)}%)`} val={ded.health.amount} neg />}
                        {ded.afc?.amount > 0 && <Row label="AFC" val={ded.afc.amount} neg />}
                        {ded.tax?.amount > 0 && <Row label="Impuesto Único" val={ded.tax.amount} neg />}
                        {vol.advance > 0 && <Row label="Anticipo" val={vol.advance} neg />}
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

function Row({ label, val, neg }: { label: string; val: number; neg?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={neg ? "text-destructive" : ""}>{neg ? "-" : ""}${Math.abs(val).toLocaleString("es-CL")}</span>
    </div>
  );
}
