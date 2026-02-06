/**
 * PAYROLL SIMULATOR COMPLETO
 * Todos los conceptos según legislación chilena
 */

"use client";

import { useState } from "react";
import { PageHeader } from "@/components/opai";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Calculator } from "lucide-react";
import Link from "next/link";

export default function PayrollSimulator() {
  // Haberes
  const [baseSalary, setBaseSalary] = useState("550000");
  const [includeGrat, setIncludeGrat] = useState(true);
  const [overtimeHours, setOvertimeHours] = useState("");
  const [commissions, setCommissions] = useState("");
  const [bonuses, setBonuses] = useState("");
  const [transport, setTransport] = useState("");
  const [meal, setMeal] = useState("");
  const [numDependents, setNumDependents] = useState("");
  
  // Descuentos
  const [contractType, setContractType] = useState<"indefinite" | "fixed_term">("indefinite");
  const [afpName, setAfpName] = useState("capital");
  const [healthSystem, setHealthSystem] = useState<"fonasa" | "isapre">("fonasa");
  const [isapre_additional, setIsapreAdditional] = useState("");
  const [apv, setApv] = useState("");
  
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const base = Number(baseSalary);
      
      // HE - Fórmula OFICIAL Dirección del Trabajo (jornada 45h)
      // (Sueldo ÷ 30) × 28 ÷ 180 × 1,5 = Sueldo × 0,0077777
      const overtime = overtimeHours ? Math.round(Number(overtimeHours) * base * 0.0077777) : 0;
      
      // Gratificación se calcula sobre (Base + HE)
      const baseForGratification = base + overtime;
      const gratification = includeGrat ? Math.round(baseForGratification * 0.25) : 0;
      
      // Calcular asignación familiar (tramos 2026) - sobre total imponible
      const totalIncome = base + gratification + overtime + (commissions ? Number(commissions) : 0) + (bonuses ? Number(bonuses) : 0);
      let familyAllowance = 0;
      if (numDependents && Number(numDependents) > 0) {
        const deps = Number(numDependents);
        if (totalIncome <= 631976) {
          familyAllowance = deps * 22007;
        } else if (totalIncome <= 923067) {
          familyAllowance = deps * 13505;
        } else if (totalIncome <= 1439668) {
          familyAllowance = deps * 4267;
        }
      }

      const response = await fetch("/api/payroll/simulator/compute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base_salary_clp: base,
          other_taxable_allowances: gratification + overtime + (commissions ? Number(commissions) : 0) + (bonuses ? Number(bonuses) : 0),
          non_taxable_allowances: {
            transport: transport ? Number(transport) : 0,
            meal: meal ? Number(meal) : 0,
            family: familyAllowance,
          },
          contract_type: contractType,
          afp_name: afpName,
          health_system: healthSystem,
          health_plan_pct: healthSystem === "isapre" && isapre_additional ? 0.07 + Number(isapre_additional) / 100 : 0.07,
          additional_deductions: {
            other: apv ? Number(apv) : 0,
          },
          save_simulation: true,
        }),
      });

      const data = await response.json();
      if (!data.success) throw new Error(data.error?.message || "Error");
      setResult(data.data);
    } catch (err: any) {
      setError(err.message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  // Formato chileno: punto para miles, SIN decimales
  const fmt = (v: number) => {
    const formatted = Math.round(v).toLocaleString("es-CL");
    return `$${formatted}`;
  };
  
  // Preview de gratificación: 25% de (Base + HE)
  const baseNum = Number(baseSalary || 0);
  // HE con fórmula oficial DT: Sueldo × 0,0077777 × horas (jornada 45h)
  const overtimeNum = overtimeHours ? Math.round(Number(overtimeHours) * baseNum * 0.0077777) : 0;
  const gratPreview = includeGrat ? Math.round((baseNum + overtimeNum) * 0.25) : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Link href="/payroll">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <PageHeader title="Simulador de Liquidación" description="Cálculo completo según ley chilena" />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* FORMULARIO */}
        <Card className="p-4">
          <form onSubmit={handleSubmit} className="space-y-3">
            {/* HABERES */}
            <div className="space-y-2">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">+ Haberes</h3>
              
              <div className="space-y-1">
                <Label className="text-[10px]">Sueldo Base</Label>
                <Input 
                  type="number" 
                  value={baseSalary} 
                  onChange={(e) => setBaseSalary(e.target.value)} 
                  className="h-8 bg-background font-mono text-sm" 
                  placeholder="550000"
                  required 
                />
              </div>

              <div className="flex items-center justify-between rounded-md border bg-muted/30 px-2 py-1.5">
                <Label className="flex cursor-pointer items-center gap-1.5 text-[10px]">
                  <input type="checkbox" checked={includeGrat} onChange={(e) => setIncludeGrat(e.target.checked)} className="h-3 w-3" />
                  Gratificación 25%
                </Label>
                {includeGrat && <span className="font-mono text-[10px] text-emerald-400">+{fmt(gratPreview)}</span>}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px]">Horas Extra 50%</Label>
                  <Input type="number" value={overtimeHours} onChange={(e) => setOvertimeHours(e.target.value)} placeholder="0" className="h-8 bg-background font-mono text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Comisiones</Label>
                  <Input type="number" value={commissions} onChange={(e) => setCommissions(e.target.value)} placeholder="0" className="h-8 bg-background font-mono text-xs" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px]">Bonos</Label>
                  <Input type="number" value={bonuses} onChange={(e) => setBonuses(e.target.value)} placeholder="0" className="h-8 bg-background font-mono text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Asig. Familiar (cargas)</Label>
                  <Input type="number" value={numDependents} onChange={(e) => setNumDependents(e.target.value)} placeholder="0" className="h-8 bg-background font-mono text-xs" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px]">Colación</Label>
                  <Input type="number" value={meal} onChange={(e) => setMeal(e.target.value)} placeholder="0" className="h-8 bg-background font-mono text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Movilización</Label>
                  <Input type="number" value={transport} onChange={(e) => setTransport(e.target.value)} placeholder="0" className="h-8 bg-background font-mono text-xs" />
                </div>
              </div>
            </div>

            {/* DESCUENTOS */}
            <div className="space-y-2 border-t pt-2">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-red-400">− Descuentos</h3>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px]">Contrato</Label>
                  <select 
                    value={contractType} 
                    onChange={(e) => setContractType(e.target.value as any)} 
                    className="flex h-8 w-full appearance-none rounded-md border border-input bg-card px-3 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="indefinite" className="bg-card">Indefinido</option>
                    <option value="fixed_term" className="bg-card">Plazo Fijo</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Salud</Label>
                  <select 
                    value={healthSystem} 
                    onChange={(e) => setHealthSystem(e.target.value as any)} 
                    className="flex h-8 w-full appearance-none rounded-md border border-input bg-card px-3 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="fonasa" className="bg-card">Fonasa 7%</option>
                    <option value="isapre" className="bg-card">Isapre</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[10px]">AFP</Label>
                <select 
                  value={afpName} 
                  onChange={(e) => setAfpName(e.target.value)} 
                  className="flex h-8 w-full appearance-none rounded-md border border-input bg-card px-3 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="capital" className="bg-card">Capital (11.44%)</option>
                  <option value="cuprum" className="bg-card">Cuprum (11.44%)</option>
                  <option value="habitat" className="bg-card">Habitat (11.27%)</option>
                  <option value="modelo" className="bg-card">Modelo (10.58%)</option>
                  <option value="planvital" className="bg-card">PlanVital (11.16%)</option>
                  <option value="provida" className="bg-card">Provida (11.45%)</option>
                  <option value="uno" className="bg-card">Uno (10.46%)</option>
                </select>
              </div>

              {healthSystem === "isapre" && (
                <div className="space-y-1">
                  <Label className="text-[10px]">Isapre Adicional (%)</Label>
                  <Input type="number" value={isapre_additional} onChange={(e) => setIsapreAdditional(e.target.value)} placeholder="0" step="0.1" className="h-8 bg-background font-mono text-xs" />
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-[10px]">APV (opcional)</Label>
                <Input type="number" value={apv} onChange={(e) => setApv(e.target.value)} placeholder="0" className="h-8 bg-background font-mono text-xs" />
              </div>
            </div>

            <Button type="submit" disabled={loading} className="w-full gap-2" size="sm">
              {loading ? "..." : <><Calculator className="h-3 w-3" />Calcular</>}
            </Button>
          </form>

          {error && <div className="mt-2 rounded-md border border-red-500/20 bg-red-500/10 p-2 text-[10px] text-red-400">{error}</div>}
        </Card>

        {/* RESULTADOS */}
        <div className="space-y-3">
          {!result ? (
            <Card className="flex h-full min-h-[400px] items-center justify-center">
              <p className="text-xs text-muted-foreground">Completa el formulario</p>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Card className="border-emerald-500/20 bg-emerald-500/5 p-3">
                  <p className="text-[9px] uppercase text-emerald-400/70">Líquido</p>
                  <p className="mt-1 font-mono text-xl font-bold text-emerald-400">{fmt(result.net_salary)}</p>
                </Card>
                <Card className="border-blue-500/20 bg-blue-500/5 p-3">
                  <p className="text-[9px] uppercase text-blue-400/70">Costo Empresa</p>
                  <p className="mt-1 font-mono text-xl font-bold text-blue-400">{fmt(result.total_employer_cost)}</p>
                </Card>
              </div>

              <Card className="p-4">
                <div className="space-y-3">
                  {/* Haberes */}
                  <div>
                    <h4 className="mb-2 text-[10px] font-semibold uppercase text-emerald-400">+ Haberes</h4>
                    <div className="space-y-0.5 text-[11px]">
                      <div className="flex justify-between"><span className="text-muted-foreground">Base</span><span className="font-mono">{fmt(baseNum)}</span></div>
                      {overtimeHours && Number(overtimeHours) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">HE 50% ({overtimeHours}h)</span><span className="font-mono text-emerald-400">+{fmt(overtimeNum)}</span></div>}
                      {includeGrat && <div className="flex justify-between"><span className="text-muted-foreground">Gratif. 25%</span><span className="font-mono text-emerald-400">+{fmt(gratPreview)}</span></div>}
                      {commissions && Number(commissions) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Comisiones</span><span className="font-mono text-emerald-400">+{fmt(Number(commissions))}</span></div>}
                      {bonuses && Number(bonuses) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Bonos</span><span className="font-mono text-emerald-400">+{fmt(Number(bonuses))}</span></div>}
                      <div className="flex justify-between border-t pt-1 font-medium"><span>Imponible</span><span className="font-mono">{fmt(result.total_taxable_income)}</span></div>
                      {(transport || meal || numDependents) && (
                        <>
                          {transport && Number(transport) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Movilización</span><span className="font-mono">+{fmt(Number(transport))}</span></div>}
                          {meal && Number(meal) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Colación</span><span className="font-mono">+{fmt(Number(meal))}</span></div>}
                          {numDependents && Number(numDependents) > 0 && result.total_non_taxable_income > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Asig. Familiar</span><span className="font-mono">+{fmt(result.total_non_taxable_income - (transport ? Number(transport) : 0) - (meal ? Number(meal) : 0))}</span></div>}
                          <div className="flex justify-between border-t pt-1 font-medium"><span>Bruto Total</span><span className="font-mono">{fmt(result.gross_salary)}</span></div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Descuentos */}
                  <div>
                    <h4 className="mb-2 text-[10px] font-semibold uppercase text-red-400">− Descuentos</h4>
                    <div className="space-y-0.5 text-[11px]">
                      <div className="flex justify-between"><span className="text-muted-foreground">AFP {(result.deductions.afp.total_rate * 100).toFixed(2).replace(".", ",")}%</span><span className="font-mono text-red-400">-{fmt(result.deductions.afp.amount)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Salud {(result.deductions.health.rate * 100).toFixed(1).replace(".", ",")}%</span><span className="font-mono text-red-400">-{fmt(result.deductions.health.amount)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">AFC {(result.deductions.afc.total_rate * 100).toFixed(1).replace(".", ",")}%</span><span className="font-mono text-red-400">-{fmt(result.deductions.afc.amount)}</span></div>
                      {apv && Number(apv) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">APV</span><span className="font-mono text-red-400">-{fmt(Number(apv))}</span></div>}
                      <div className="flex justify-between"><span className="text-muted-foreground">Impuesto</span><span className="font-mono text-red-400">{result.deductions.tax.amount > 0 ? '-' : ''}{fmt(result.deductions.tax.amount)}</span></div>
                    </div>
                  </div>

                  {/* Líquido */}
                  <div className="rounded-lg border-2 border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
                    <div className="flex items-baseline justify-between">
                      <span className="text-[10px] font-semibold uppercase text-emerald-300">Líquido</span>
                      <span className="font-mono text-2xl font-bold text-emerald-400">{fmt(result.net_salary)}</span>
                    </div>
                  </div>

                  {/* Costo Empleador */}
                  <div className="border-t pt-2">
                    <h4 className="mb-1.5 text-[10px] font-semibold uppercase text-blue-400">Aportes Empleador</h4>
                    <div className="space-y-0.5 text-[11px]">
                      <div className="flex justify-between"><span className="text-muted-foreground">SIS {(result.employer_cost.sis.rate * 100).toFixed(2).replace(".", ",")}%</span><span className="font-mono text-blue-400">+{fmt(result.employer_cost.sis.amount)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">AFC {(result.employer_cost.afc.total_rate * 100).toFixed(1).replace(".", ",")}%</span><span className="font-mono text-blue-400">+{fmt(result.employer_cost.afc.total_amount)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Mutual {(result.employer_cost.work_injury.rate * 100).toFixed(2).replace(".", ",")}%</span><span className="font-mono text-blue-400">+{fmt(result.employer_cost.work_injury.amount)}</span></div>
                      <div className="flex justify-between border-t pt-1 font-semibold"><span>Total Empresa</span><span className="font-mono text-blue-400">{fmt(result.total_employer_cost)}</span></div>
                    </div>
                  </div>

                  {result.simulation_id && (
                    <div className="rounded-md bg-muted/30 px-2 py-1.5 text-[9px] text-muted-foreground">
                      ID: {result.simulation_id.slice(0, 8)} <Badge variant="outline" className="ml-2 h-4 text-[8px]">Inmutable</Badge>
                    </div>
                  )}
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
