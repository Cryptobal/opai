/**
 * PAYROLL SIMULATOR
 * Simulador de liquidación completo según legislación chilena
 */

"use client";

import { useState, useEffect, useMemo } from "react";
import { PageHeader } from "@/components/opai";
import { PayrollSubnav } from "@/components/payroll/PayrollSubnav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatCLP, formatNumber, parseLocalizedNumber } from "@/lib/utils";
import {
  Calculator,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Building2,
  User,
  Info,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const selectClass =
  "flex h-9 w-full appearance-none rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

// AFP options con comisiones reales
const AFP_OPTIONS = [
  { value: "uno", label: "AFP Uno", total: "10,46%", commission: 0.0046 },
  { value: "modelo", label: "AFP Modelo", total: "10,58%", commission: 0.0058 },
  { value: "planvital", label: "AFP PlanVital", total: "11,16%", commission: 0.0116 },
  { value: "habitat", label: "AFP Habitat", total: "11,27%", commission: 0.0127 },
  { value: "capital", label: "AFP Capital", total: "11,44%", commission: 0.0144 },
  { value: "cuprum", label: "AFP Cuprum", total: "11,44%", commission: 0.0144 },
  { value: "provida", label: "AFP Provida", total: "11,45%", commission: 0.0145 },
];

export default function PayrollSimulator() {
  // ── State: Inputs ──
  const [baseSalary, setBaseSalary] = useState("550000");
  const [includeGrat, setIncludeGrat] = useState(true);
  const [overtimeHours, setOvertimeHours] = useState("");
  const [commissions, setCommissions] = useState("");
  const [bonuses, setBonuses] = useState("");
  const [numDependents, setNumDependents] = useState("");
  const [transport, setTransport] = useState("");
  const [meal, setMeal] = useState("");
  const [contractType, setContractType] = useState<"indefinite" | "fixed_term">("indefinite");
  const [afpName, setAfpName] = useState("habitat");
  const [healthSystem, setHealthSystem] = useState<"fonasa" | "isapre">("fonasa");
  const [isapreAdditional, setIsapreAdditional] = useState("");
  const [apv, setApv] = useState("");

  // ── State: UI ──
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [parameters, setParameters] = useState<any>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    fetchParameters();
  }, []);

  const fetchParameters = async () => {
    try {
      const response = await fetch("/api/payroll/parameters?active_only=true");
      const data = await response.json();
      if (data.success) setParameters(data.data.current_version);
    } catch (err) {
      console.error("Error loading parameters:", err);
    }
  };

  // ── Helpers ──
  const fmt = (v: number) => formatCLP(Math.round(v));
  const fmtPct = (v: number, d = 2) =>
    `${formatNumber(v * 100, { minDecimals: d, maxDecimals: d })}%`;
  const parse = (v: string) => (v ? parseLocalizedNumber(v) : 0);

  // ── Preview calculations (before API call) ──
  const baseNum = parse(baseSalary);
  const imm = parameters?.data?.imm?.value_clp || 500000;
  const gratPreview = useMemo(() => {
    if (!includeGrat || baseNum <= 0) return 0;
    const monthly = baseNum * 0.25;
    const cap = (imm * 4.75) / 12;
    return Math.min(monthly, cap);
  }, [baseNum, includeGrat, imm]);

  const totalImponiblePreview = useMemo(() => {
    return baseNum + gratPreview + parse(commissions) + parse(bonuses);
  }, [baseNum, gratPreview, commissions, bonuses]);

  // References
  const ufValue = parameters?.data ? 39703.5 : 39703.5;
  const utmValue = parameters?.data ? 69611 : 69611;

  // ── Submit ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const base = parse(baseSalary);
      if (base <= 0) throw new Error("El sueldo base debe ser mayor a 0");

      // Enviar datos correctamente al engine:
      // - gratification_clp: undefined = engine calcula, 0 = desactivada
      // - overtime_hours_50: número de HORAS (no monto)
      // - commissions: monto directo
      // - other_taxable_allowances: bonos y otros
      const response = await fetch("/api/payroll/simulator/compute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base_salary_clp: base,
          gratification_clp: includeGrat ? undefined : 0,
          overtime_hours_50: parse(overtimeHours),
          commissions: parse(commissions),
          other_taxable_allowances: parse(bonuses),
          non_taxable_allowances: {
            transport: parse(transport),
            meal: parse(meal),
          },
          num_dependents: parse(numDependents),
          contract_type: contractType,
          afp_name: afpName,
          health_system: healthSystem,
          health_plan_pct:
            healthSystem === "isapre" && isapreAdditional
              ? 0.07 + parse(isapreAdditional) / 100
              : 0.07,
          additional_deductions: {
            apv: parse(apv),
          },
          save_simulation: true,
        }),
      });

      const data = await response.json();
      if (!data.success) throw new Error(data.error?.message || "Error al calcular");
      setResult(data.data);
    } catch (err: any) {
      setError(err.message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const selectedAfp = AFP_OPTIONS.find((a) => a.value === afpName);

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <PageHeader
          title="Simulador de Liquidación"
          description="Cálculo completo según ley chilena"
        />
        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs sm:flex">
            <span className="text-muted-foreground">UF</span>
            <span className="font-mono font-medium">{fmt(ufValue)}</span>
            <span className="mx-1 text-border">|</span>
            <span className="text-muted-foreground">UTM</span>
            <span className="font-mono font-medium">{fmt(utmValue)}</span>
          </div>
          <Link href="/payroll/parameters">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <Info className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Parámetros</span>
            </Button>
          </Link>
        </div>
      </div>

      <PayrollSubnav />

      <div className="grid gap-5 lg:grid-cols-5">
        {/* ══════════════════════════════════════
            FORMULARIO (2/5 del ancho)
           ══════════════════════════════════════ */}
        <form onSubmit={handleSubmit} className="space-y-4 lg:col-span-2">
          {/* Sueldo Base */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-emerald-400" />
              <h3 className="text-sm font-semibold">Remuneración</h3>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Sueldo Base Mensual</Label>
              <Input
                type="text"
                inputMode="numeric"
                value={baseSalary}
                onChange={(e) => setBaseSalary(e.target.value)}
                className="font-mono text-base"
                required
              />
            </div>

            {/* Gratificación */}
            <div className="flex items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={includeGrat}
                  onChange={(e) => setIncludeGrat(e.target.checked)}
                  className="h-4 w-4 rounded border-input accent-primary"
                />
                Gratificación Legal 25%
              </label>
              {includeGrat && gratPreview > 0 && (
                <span className="font-mono text-xs text-emerald-400">+{fmt(gratPreview)}</span>
              )}
            </div>

            {/* Comisiones + Bonos */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Comisiones</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={commissions}
                  onChange={(e) => setCommissions(e.target.value)}
                  placeholder="0"
                  className="font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Bonos imponibles</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={bonuses}
                  onChange={(e) => setBonuses(e.target.value)}
                  placeholder="0"
                  className="font-mono"
                />
              </div>
            </div>

            {/* Preview imponible */}
            {baseNum > 0 && (
              <div className="flex justify-between rounded-md bg-muted/30 px-3 py-1.5 text-xs">
                <span className="text-muted-foreground">Total imponible estimado</span>
                <span className="font-mono font-medium">{fmt(totalImponiblePreview)}</span>
              </div>
            )}
          </Card>

          {/* Configuración previsional */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-blue-400" />
              <h3 className="text-sm font-semibold">Previsión</h3>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">AFP</Label>
              <select value={afpName} onChange={(e) => setAfpName(e.target.value)} className={selectClass}>
                {AFP_OPTIONS.map((afp) => (
                  <option key={afp.value} value={afp.value}>
                    {afp.label} ({afp.total})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Contrato</Label>
                <select
                  value={contractType}
                  onChange={(e) => setContractType(e.target.value as any)}
                  className={selectClass}
                >
                  <option value="indefinite">Indefinido</option>
                  <option value="fixed_term">Plazo Fijo</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Salud</Label>
                <select
                  value={healthSystem}
                  onChange={(e) => setHealthSystem(e.target.value as any)}
                  className={selectClass}
                >
                  <option value="fonasa">Fonasa 7%</option>
                  <option value="isapre">Isapre</option>
                </select>
              </div>
            </div>

            {healthSystem === "isapre" && (
              <div className="space-y-1">
                <Label className="text-xs">Cotización adicional Isapre (%)</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={isapreAdditional}
                  onChange={(e) => setIsapreAdditional(e.target.value)}
                  placeholder="0"
                  className="font-mono"
                />
              </div>
            )}
          </Card>

          {/* Sección avanzada (colapsable) */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex w-full items-center justify-between rounded-md border border-border bg-card px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <span>Opciones adicionales</span>
            {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {showAdvanced && (
            <Card className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Horas Extra 50%</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={overtimeHours}
                    onChange={(e) => setOvertimeHours(e.target.value)}
                    placeholder="0 hrs"
                    className="font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Cargas familiares</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={numDependents}
                    onChange={(e) => setNumDependents(e.target.value)}
                    placeholder="0"
                    className="font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Colación</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={meal}
                    onChange={(e) => setMeal(e.target.value)}
                    placeholder="0"
                    className="font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Movilización</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={transport}
                    onChange={(e) => setTransport(e.target.value)}
                    placeholder="0"
                    className="font-mono"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">APV Régimen B (rebaja impuesto)</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={apv}
                  onChange={(e) => setApv(e.target.value)}
                  placeholder="0"
                  className="font-mono"
                />
              </div>
            </Card>
          )}

          {/* Submit */}
          <Button type="submit" disabled={loading} className="w-full gap-2">
            {loading ? (
              "Calculando..."
            ) : (
              <>
                <Calculator className="h-4 w-4" />
                Calcular Liquidación
              </>
            )}
          </Button>

          {error && (
            <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-xs text-red-400">
              {error}
            </div>
          )}
        </form>

        {/* ══════════════════════════════════════
            RESULTADOS (3/5 del ancho)
           ══════════════════════════════════════ */}
        <div className="lg:col-span-3">
          {!result ? (
            <Card className="flex min-h-[400px] flex-col items-center justify-center gap-3 text-muted-foreground">
              <Calculator className="h-8 w-8 opacity-30" />
              <p className="text-sm">Ingresa los datos y presiona Calcular</p>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* KPIs principales */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Card className="border-emerald-500/20 bg-emerald-500/5 p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Líquido
                  </p>
                  <p className="mt-1 font-mono text-xl font-bold text-emerald-400">
                    {fmt(result.net_salary)}
                  </p>
                </Card>
                <Card className="border-blue-500/20 bg-blue-500/5 p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Costo Empresa
                  </p>
                  <p className="mt-1 font-mono text-xl font-bold text-blue-400">
                    {fmt(result.total_employer_cost)}
                  </p>
                </Card>
                <Card className="p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Descuentos
                  </p>
                  <p className="mt-1 font-mono text-xl font-bold text-red-400">
                    {fmt(result.total_deductions)}
                  </p>
                </Card>
              </div>

              {/* Desglose completo */}
              <Card className="divide-y divide-border">
                {/* ── HABERES ── */}
                <div className="p-4">
                  <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-400">
                    <User className="h-3.5 w-3.5" />
                    Haberes
                  </h4>
                  <div className="space-y-1.5 text-sm">
                    <Row label="Sueldo Base" value={fmt(result.haberes.base_salary)} />
                    {result.haberes.gratification > 0 && (
                      <Row label="Gratificación 25%" value={`+${fmt(result.haberes.gratification)}`} valueClass="text-emerald-400" />
                    )}
                    {result.haberes.overtime_50 > 0 && (
                      <Row label={`Horas Extra 50%`} value={`+${fmt(result.haberes.overtime_50)}`} valueClass="text-emerald-400" />
                    )}
                    {result.haberes.overtime_100 > 0 && (
                      <Row label="Horas Extra 100%" value={`+${fmt(result.haberes.overtime_100)}`} valueClass="text-emerald-400" />
                    )}
                    {result.haberes.commissions > 0 && (
                      <Row label="Comisiones" value={`+${fmt(result.haberes.commissions)}`} valueClass="text-emerald-400" />
                    )}
                    {result.haberes.other_taxable > 0 && (
                      <Row label="Bonos / Otros" value={`+${fmt(result.haberes.other_taxable)}`} valueClass="text-emerald-400" />
                    )}
                    <RowBold label="Total Imponible" value={fmt(result.haberes.total_taxable)} />

                    {result.haberes.total_non_taxable > 0 && (
                      <>
                        <div className="pt-1" />
                        {result.haberes.transport > 0 && (
                          <Row label="Movilización" value={`+${fmt(result.haberes.transport)}`} muted />
                        )}
                        {result.haberes.meal > 0 && (
                          <Row label="Colación" value={`+${fmt(result.haberes.meal)}`} muted />
                        )}
                        {result.haberes.family_allowance > 0 && (
                          <Row label="Asignación Familiar" value={`+${fmt(result.haberes.family_allowance)}`} muted />
                        )}
                        <RowBold label="Total Bruto" value={fmt(result.haberes.gross_salary)} />
                      </>
                    )}
                  </div>
                </div>

                {/* ── DESCUENTOS LEGALES ── */}
                <div className="p-4">
                  <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-red-400">
                    Descuentos Legales
                  </h4>
                  <div className="space-y-1.5 text-sm">
                    <Row
                      label={`AFP ${selectedAfp?.label?.split(" ")[1] || ""} (${fmtPct(result.deductions.afp.total_rate)})`}
                      sublabel={`10% + ${fmtPct(result.deductions.afp.commission_rate)} comisión`}
                      value={`-${fmt(result.deductions.afp.amount)}`}
                      valueClass="text-red-400"
                    />
                    <Row
                      label={`Salud ${healthSystem === "fonasa" ? "Fonasa" : "Isapre"} (${fmtPct(result.deductions.health.rate, 1)})`}
                      value={`-${fmt(result.deductions.health.amount)}`}
                      valueClass="text-red-400"
                    />
                    <Row
                      label={`AFC Trabajador (${fmtPct(result.deductions.afc.total_rate, 1)})`}
                      value={`-${fmt(result.deductions.afc.amount)}`}
                      valueClass="text-red-400"
                    />
                    {result.deductions.apv.amount > 0 && (
                      <Row
                        label="APV Régimen B"
                        sublabel="Rebaja base tributable"
                        value={`-${fmt(result.deductions.apv.amount)}`}
                        valueClass="text-red-400"
                      />
                    )}
                    <div className="pt-1">
                      <Row
                        label={`Impuesto Único (tramo ${result.deductions.tax.bracket_index + 1}, ${fmtPct(result.deductions.tax.factor, 1)})`}
                        sublabel={`Base tributable: ${fmt(result.deductions.tax.base_clp)}`}
                        value={result.deductions.tax.amount > 0 ? `-${fmt(result.deductions.tax.amount)}` : "$0"}
                        valueClass={result.deductions.tax.amount > 0 ? "text-red-400" : "text-muted-foreground"}
                      />
                    </div>
                    <RowBold
                      label="Total Descuentos"
                      value={`-${fmt(result.deductions.total_legal)}`}
                      valueClass="text-red-400"
                    />
                  </div>
                </div>

                {/* ── LÍQUIDO ── */}
                <div className="bg-emerald-500/5 px-4 py-4">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-semibold uppercase tracking-wider text-emerald-400">
                      Sueldo Líquido
                    </span>
                    <span className="font-mono text-2xl font-bold text-emerald-400">
                      {fmt(result.net_salary)}
                    </span>
                  </div>
                </div>

                {/* ── APORTES EMPLEADOR ── */}
                <div className="p-4">
                  <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-400">
                    <Building2 className="h-3.5 w-3.5" />
                    Aportes Empleador
                  </h4>
                  <div className="space-y-1.5 text-sm">
                    <Row
                      label={`SIS (${fmtPct(result.employer_cost.sis.rate)})`}
                      value={`+${fmt(result.employer_cost.sis.amount)}`}
                      valueClass="text-blue-400"
                    />
                    <Row
                      label={`AFC Empleador (${fmtPct(result.employer_cost.afc.total_rate, 1)})`}
                      sublabel={`CIC ${fmtPct(result.employer_cost.afc.cic_rate, 1)} + FCS ${fmtPct(result.employer_cost.afc.fcs_rate, 1)}`}
                      value={`+${fmt(result.employer_cost.afc.total_amount)}`}
                      valueClass="text-blue-400"
                    />
                    <Row
                      label={`Mutual (${fmtPct(result.employer_cost.work_injury.total_rate)})`}
                      value={`+${fmt(result.employer_cost.work_injury.amount)}`}
                      valueClass="text-blue-400"
                    />
                    <RowBold
                      label="Total Aportes"
                      value={`+${fmt(result.employer_cost.total)}`}
                      valueClass="text-blue-400"
                    />
                  </div>

                  <div className="mt-3 flex items-baseline justify-between rounded-md bg-blue-500/10 px-3 py-2">
                    <span className="text-xs font-medium text-blue-400">Costo Total Empresa</span>
                    <span className="font-mono text-lg font-bold text-blue-400">
                      {fmt(result.total_employer_cost)}
                    </span>
                  </div>
                </div>
              </Card>

              {/* Footer: metadata */}
              {result.simulation_id && (
                <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
                  <span>ID: {result.simulation_id.slice(0, 8)}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">Snapshot inmutable</Badge>
                    <span>{new Date(result.computed_at).toLocaleString("es-CL")}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Row Components ──

function Row({
  label,
  sublabel,
  value,
  valueClass,
  muted,
}: {
  label: string;
  sublabel?: string;
  value: string;
  valueClass?: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <span className={cn("text-sm", muted ? "text-muted-foreground/70" : "text-muted-foreground")}>
          {label}
        </span>
        {sublabel && <p className="text-[11px] text-muted-foreground/50">{sublabel}</p>}
      </div>
      <span className={cn("shrink-0 font-mono text-sm", valueClass)}>{value}</span>
    </div>
  );
}

function RowBold({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex justify-between border-t border-border pt-1.5">
      <span className="text-sm font-medium">{label}</span>
      <span className={cn("font-mono text-sm font-semibold", valueClass)}>{value}</span>
    </div>
  );
}
