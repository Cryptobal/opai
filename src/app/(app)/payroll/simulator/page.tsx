/**
 * PAYROLL SIMULATOR COMPLETO
 * Todos los conceptos según legislación chilena
 */

"use client";

import { useState, useEffect } from "react";
import { PageHeader } from "@/components/opai";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ArrowLeft, Calculator, Info, Settings } from "lucide-react";
import Link from "next/link";

export default function PayrollSimulator() {
  // Estados
  const [baseSalary, setBaseSalary] = useState("550000");
  const [includeGrat, setIncludeGrat] = useState(true);
  const [overtimeHours, setOvertimeHours] = useState("");
  const [commissions, setCommissions] = useState("");
  const [bonuses, setBonuses] = useState("");
  const [transport, setTransport] = useState("");
  const [meal, setMeal] = useState("");
  const [numDependents, setNumDependents] = useState("");
  const [contractType, setContractType] = useState<"indefinite" | "fixed_term">("indefinite");
  const [afpName, setAfpName] = useState("capital");
  const [healthSystem, setHealthSystem] = useState<"fonasa" | "isapre">("fonasa");
  const [isapre_additional, setIsapreAdditional] = useState("");
  const [apv, setApv] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [parameters, setParameters] = useState<any>(null);

  // Cargar parámetros al iniciar (para UF/UTM y modal)
  useEffect(() => {
    fetchParameters();
  }, []);

  const fetchParameters = async () => {
    try {
      const response = await fetch("/api/payroll/parameters?active_only=true");
      const data = await response.json();
      if (data.success) {
        setParameters(data.data.current_version);
      }
    } catch (err) {
      console.error("Error loading parameters:", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const base = Number(baseSalary);
      const overtime = overtimeHours ? Math.round(Number(overtimeHours) * base * 0.0077777) : 0;
      const baseForGratification = base + overtime;
      const gratification = includeGrat ? Math.round(baseForGratification * 0.25) : 0;
      
      const totalIncome = base + gratification + overtime + (commissions ? Number(commissions) : 0) + (bonuses ? Number(bonuses) : 0);
      let familyAllowance = 0;
      if (numDependents && Number(numDependents) > 0) {
        const deps = Number(numDependents);
        if (totalIncome <= 631976) familyAllowance = deps * 22007;
        else if (totalIncome <= 923067) familyAllowance = deps * 13505;
        else if (totalIncome <= 1439668) familyAllowance = deps * 4267;
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
          additional_deductions: { other: apv ? Number(apv) : 0 },
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

  const fmt = (v: number) => `$${Math.round(v).toLocaleString("es-CL")}`;
  const baseNum = Number(baseSalary || 0);
  const overtimeNum = overtimeHours ? Math.round(Number(overtimeHours) * baseNum * 0.0077777) : 0;
  const gratPreview = includeGrat ? Math.round((baseNum + overtimeNum) * 0.25) : 0;

  // UF/UTM desde parámetros
  const ufValue = parameters?.parameters_snapshot?.references_at_calculation?.uf_clp || 39703.50;
  const utmValue = parameters?.parameters_snapshot?.references_at_calculation?.utm_clp || 69611;
  const ufDate = parameters?.parameters_snapshot?.references_at_calculation?.uf_date || "2026-02-01";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/payroll">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <PageHeader title="Simulador de Liquidación" description="Cálculo completo según ley chilena" />
        </div>

        {/* Botón Modal Parámetros + UF/UTM */}
        <div className="flex items-center gap-2">
          {/* UF/UTM Badge */}
          <div className="rounded-lg border border-border bg-card px-3 py-1.5">
            <div className="flex items-center gap-3 text-[10px]">
              <div>
                <span className="text-muted-foreground">UF:</span>
                <span className="ml-1 font-mono font-medium">${ufValue.toLocaleString("es-CL")}</span>
              </div>
              <div className="h-3 w-px bg-border" />
              <div>
                <span className="text-muted-foreground">UTM:</span>
                <span className="ml-1 font-mono font-medium">${utmValue.toLocaleString("es-CL")}</span>
              </div>
            </div>
          </div>

          {/* Modal Parámetros */}
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Settings className="h-4 w-4" />
                Parámetros
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Parámetros Legales Vigentes</DialogTitle>
              </DialogHeader>
              
              {parameters && (
                <div className="space-y-4">
                  <Badge variant="default" className="text-xs">
                    {parameters.effective_from}
                  </Badge>

                  <div className="grid gap-3 md:grid-cols-3">
                    {/* AFP */}
                    <div className="rounded-lg border bg-card p-3">
                      <h4 className="mb-2 text-xs font-semibold">AFP</h4>
                      <div className="space-y-1 text-[10px]">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Base:</span>
                          <span className="font-mono">10%</span>
                        </div>
                        <div className="mt-2 space-y-0.5 border-t pt-1">
                          {Object.entries(parameters.data.afp.commissions).map(([name, config]: any) => (
                            <div key={name} className="flex justify-between">
                              <span className="capitalize text-muted-foreground">{name}</span>
                              <span className="font-mono">{((parameters.data.afp.base_rate + config.commission_rate) * 100).toFixed(2).replace(".", ",")}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* SIS */}
                    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                      <h4 className="mb-2 text-xs font-semibold">SIS (Empleador)</h4>
                      <div className="text-[10px]">
                        <div className="flex justify-between">
                          <span className="text-emerald-400">Tasa:</span>
                          <span className="font-mono font-semibold text-emerald-400">
                            {(parameters.data.sis.employer_rate * 100).toFixed(2).replace(".", ",")}%
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Mutual */}
                    <div className="rounded-lg border bg-card p-3">
                      <h4 className="mb-2 text-xs font-semibold">Mutual</h4>
                      <div className="text-[10px]">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Base legal:</span>
                          <span className="font-mono">{(parameters.data.work_injury.base_rate * 100).toFixed(2).replace(".", ",")}%</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Topes */}
                  <div className="rounded-lg border bg-card p-3">
                    <h4 className="mb-2 text-xs font-semibold">Topes Imponibles 2026</h4>
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Pensiones:</span>
                        <span className="font-mono">{parameters.data.caps.pension_uf} UF</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">AFC:</span>
                        <span className="font-mono">{parameters.data.caps.afc_uf} UF</span>
                      </div>
                    </div>
                  </div>

                  {/* Referencias */}
                  <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
                    <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold text-blue-400">
                      <Info className="h-3 w-3" />
                      Referencias Vigentes
                    </h4>
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">UF ({ufDate}):</span>
                        <span className="font-mono">${ufValue.toLocaleString("es-CL")}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">UTM:</span>
                        <span className="font-mono">${utmValue.toLocaleString("es-CL")}</span>
                      </div>
                    </div>
                    <p className="mt-2 text-[9px] text-muted-foreground">
                      💡 UF se actualiza diariamente (SBIF). UTM mensualmente (SII). 
                      Valores capturados en snapshot inmutable.
                    </p>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
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
                <Input type="number" value={baseSalary} onChange={(e) => setBaseSalary(e.target.value)} className="h-8 bg-background font-mono text-sm" required />
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
                  <select value={contractType} onChange={(e) => setContractType(e.target.value as any)} className="flex h-8 w-full appearance-none rounded-md border border-input bg-card px-3 text-xs text-foreground">
                    <option value="indefinite">Indefinido</option>
                    <option value="fixed_term">Plazo Fijo</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Salud</Label>
                  <select value={healthSystem} onChange={(e) => setHealthSystem(e.target.value as any)} className="flex h-8 w-full appearance-none rounded-md border border-input bg-card px-3 text-xs text-foreground">
                    <option value="fonasa">Fonasa 7%</option>
                    <option value="isapre">Isapre</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[10px]">AFP</Label>
                <select value={afpName} onChange={(e) => setAfpName(e.target.value)} className="flex h-8 w-full appearance-none rounded-md border border-input bg-card px-3 text-xs text-foreground">
                  <option value="capital">Capital (11,44%)</option>
                  <option value="cuprum">Cuprum (11,44%)</option>
                  <option value="habitat">Habitat (11,27%)</option>
                  <option value="modelo">Modelo (10,58%)</option>
                  <option value="planvital">PlanVital (11,16%)</option>
                  <option value="provida">Provida (11,45%)</option>
                  <option value="uno">Uno (10,46%)</option>
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

                  <div className="rounded-lg border-2 border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
                    <div className="flex items-baseline justify-between">
                      <span className="text-[10px] font-semibold uppercase text-emerald-300">Líquido</span>
                      <span className="font-mono text-2xl font-bold text-emerald-400">{fmt(result.net_salary)}</span>
                    </div>
                  </div>

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
