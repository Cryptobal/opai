"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatNumber, parseLocalizedNumber } from "@/lib/utils";
import { formatCurrency } from "@/components/cpq/utils";
import { ChevronDown, Users, Plus, Copy, Trash2, Moon, Sun } from "lucide-react";
import { ServiceTemplateButtons } from "@/components/cpq/ServiceTemplateButtons";
import MarginSection from "@/components/cpq/MarginSection";
import { FinancialCostsSection, type FinancialCostsData } from "@/components/cpq/FinancialCostsSection";
import { AdditionalLinesSection, type AdditionalLineItem } from "@/components/cpq/AdditionalLinesSection";
import { CommercialConditionsSection, type CommercialConditionsData } from "@/components/cpq/CommercialConditionsSection";
import type { ServiceTemplate } from "@/lib/cpq/service-templates";
import type { MarginMode } from "@/types/cpq";

/* ─── Types ─── */

export interface LeadPositionItem {
  puestoTrabajoId?: string;
  puesto: string;
  customName?: string;
  cargoId?: string;
  rolId?: string;
  baseSalary?: number;
  shiftType?: "day" | "night";
  cantidad: number;
  numPuestos?: number;
  horaInicio: string;
  horaFin: string;
  dias: string[];
}

export interface LeadCpqConfig {
  positions: LeadPositionItem[];
  selectedCostGroups: string[];
  additionalLines: AdditionalLineItem[];
  financialCosts: FinancialCostsData;
  marginPercentage: number;
  marginMode: MarginMode;
  conditions: CommercialConditionsData;
}

interface LeadInstallationCpqProps {
  config: LeadCpqConfig;
  onChange: (config: LeadCpqConfig) => void;
  proposalTemplates?: { id: string; name: string; slug?: string }[];
  catalogDefaults?: { puestoId: string; puestoName: string; cargoId: string; rolId: string };
}

/* ─── Cost group constants ─── */
const COST_GROUPS_DIRECTOS = [
  { id: "uniform", label: "Uniformes", icon: "\uD83E\uDDE5" },
  { id: "exam", label: "Exámenes", icon: "\uD83D\uDD2C" },
  { id: "meal", label: "Alimentación", icon: "\uD83C\uDF7D\uFE0F" },
] as const;
const COST_GROUPS_INDIRECTOS = [
  { id: "equipment", label: "Equipos operativos", icon: "\uD83D\uDCE6" },
  { id: "transport", label: "Costos de transporte", icon: "\uD83D\uDE9A" },
  { id: "vehicle", label: "Vehículos", icon: "\uD83D\uDE97" },
  { id: "infrastructure", label: "Infraestructura", icon: "\uD83C\uDFD7\uFE0F" },
  { id: "system", label: "Sistemas", icon: "\uD83D\uDCBB" },
] as const;

const WEEKDAYS_SHORT: Record<string, string> = {
  lunes: "Lu", martes: "Ma", miercoles: "Mi", jueves: "Ju", viernes: "Vi", sabado: "Sa", domingo: "Do",
};

/* ─── Component ─── */

export function LeadInstallationCpq({
  config,
  onChange,
  proposalTemplates = [],
  catalogDefaults,
}: LeadInstallationCpqProps) {
  const [secPuestos, setSecPuestos] = useState(true);
  const [secCostos, setSecCostos] = useState(false);
  const [secLineas, setSecLineas] = useState(false);
  const [secFinancieros, setSecFinancieros] = useState(false);
  const [secMargen, setSecMargen] = useState(true);
  const [secCondiciones, setSecCondiciones] = useState(false);

  const update = (patch: Partial<LeadCpqConfig>) => onChange({ ...config, ...patch });

  // ─── Position helpers ───
  const totalGuards = config.positions.reduce(
    (s, p) => s + (p.cantidad || 1) * (p.numPuestos || 1), 0
  );

  const applyTemplate = (template: ServiceTemplate) => {
    const newPositions: LeadPositionItem[] = template.positions.map((pos) => ({
      puestoTrabajoId: catalogDefaults?.puestoId,
      puesto: catalogDefaults?.puestoName || pos.name,
      customName: pos.name,
      cargoId: catalogDefaults?.cargoId,
      rolId: catalogDefaults?.rolId,
      baseSalary: pos.baseSalary,
      shiftType: pos.shiftStart === "20:00" ? "night" as const : "day" as const,
      cantidad: pos.guardsCount,
      numPuestos: 1,
      horaInicio: pos.shiftStart,
      horaFin: pos.shiftEnd,
      dias: [...pos.daysOfWeek],
    }));
    update({ positions: newPositions });
  };

  const addPosition = () => {
    update({
      positions: [
        ...config.positions,
        {
          puestoTrabajoId: catalogDefaults?.puestoId,
          puesto: catalogDefaults?.puestoName || "Control de Acceso",
          customName: "Control de Acceso",
          cargoId: catalogDefaults?.cargoId,
          rolId: catalogDefaults?.rolId,
          baseSalary: 550000,
          shiftType: "day",
          cantidad: 2,
          numPuestos: 1,
          horaInicio: "08:00",
          horaFin: "20:00",
          dias: ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"],
        },
      ],
    });
  };

  const updatePosition = (idx: number, patch: Partial<LeadPositionItem>) => {
    const updated = [...config.positions];
    updated[idx] = { ...updated[idx], ...patch };
    update({ positions: updated });
  };

  const removePosition = (idx: number) => {
    update({ positions: config.positions.filter((_, i) => i !== idx) });
  };

  const clonePosition = (idx: number) => {
    const clone = { ...config.positions[idx], dias: [...config.positions[idx].dias] };
    const next = [...config.positions];
    next.splice(idx + 1, 0, clone);
    update({ positions: next });
  };

  // ─── Cost group toggle ───
  const toggleCostGroup = (id: string) => {
    const groups = config.selectedCostGroups.includes(id)
      ? config.selectedCostGroups.filter((g) => g !== id)
      : [...config.selectedCostGroups, id];
    update({ selectedCostGroups: groups });
  };

  // ─── Quick estimate ───
  const estimate = useMemo(() => {
    const IMM = 500000;
    const totalCostoManoObra = config.positions.reduce((sum, p) => {
      const salary = p.baseSalary || 550000;
      const guards = (p.cantidad || 1) * (p.numPuestos || 1);
      const gratificacion = Math.min(salary * 0.25, (4.75 * IMM) / 12);
      const baseConGrat = salary + gratificacion;
      const cargasSociales = baseConGrat * 0.2435;
      const costoGuardia = salary + gratificacion + cargasSociales;
      return sum + costoGuardia * guards;
    }, 0);
    const totalLineas = config.additionalLines.reduce((sum, l) => {
      const base = Number(l.precio || 0) * Number(l.cantidad || 1);
      const m = Number(l.marginPct || 0);
      const venta = m > 0 && m < 100 ? base / (1 - m / 100) : base;
      return sum + (l.recurrencia === "unico" && config.conditions.contractDuration > 0 ? venta / config.conditions.contractDuration : venta);
    }, 0);
    const precioVenta = totalCostoManoObra * (1 + config.marginPercentage / 100) + totalLineas;
    const marginAmount = totalCostoManoObra * (config.marginPercentage / 100);
    return { costoEmpresa: totalCostoManoObra, precioVenta, totalLineas, marginAmount };
  }, [config.positions, config.additionalLines, config.marginPercentage, config.conditions.contractDuration]);

  return (
    <div className="space-y-2">
      {/* ── Puestos ── */}
      <Card className="shadow-sm overflow-hidden">
        <button type="button" onClick={() => setSecPuestos((v) => !v)} className="flex items-center justify-between w-full px-3 py-2.5 hover:bg-muted/10 transition-colors">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-bold shrink-0">Puestos</h2>
            {!secPuestos && config.positions.length > 0 && (
              <span className="text-[11px] text-muted-foreground">{config.positions.length} puestos · {totalGuards} guardias</span>
            )}
          </div>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", secPuestos && "rotate-180")} />
        </button>
        {secPuestos && (
          <div className="px-3 pb-3 space-y-2">
            <ServiceTemplateButtons
              compact
              onSelect={applyTemplate}
              existingPositionsCount={config.positions.length}
            />
            {config.positions.map((pos, idx) => (
              <div key={idx} className="rounded-md border border-border/60 bg-background p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold">{pos.customName || pos.puesto || `Posición ${idx + 1}`}</span>
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="h-5 text-[10px] gap-0.5">
                      {pos.shiftType === "night" ? <Moon className="h-2.5 w-2.5" /> : <Sun className="h-2.5 w-2.5" />}
                      {pos.shiftType === "night" ? "Noche" : "Día"}
                    </Badge>
                    <Button type="button" variant="outline" size="sm" className="h-6 px-1.5 text-[10px]" onClick={() => clonePosition(idx)}>
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removePosition(idx)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-4">
                  <div className="space-y-1">
                    <Label className="text-[10px]">Nombre</Label>
                    <Input value={pos.customName || ""} onChange={(e) => updatePosition(idx, { customName: e.target.value })} className="h-7 text-xs" placeholder="Control de Acceso" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Guardias</Label>
                    <select
                      className="flex h-7 w-full rounded-md border border-border bg-card px-2 text-xs"
                      value={pos.cantidad || 1}
                      onChange={(e) => updatePosition(idx, { cantidad: Number(e.target.value) })}
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Sueldo bruto</Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={formatNumber(pos.baseSalary || 550000)}
                      onChange={(e) => updatePosition(idx, { baseSalary: parseLocalizedNumber(e.target.value) || 550000 })}
                      className="h-7 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Turno</Label>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        className={cn("flex-1 h-7 rounded-md border text-[10px] font-medium", pos.shiftType !== "night" ? "border-amber-500/40 bg-amber-500/10 text-amber-400" : "border-border text-muted-foreground")}
                        onClick={() => {
                          const patch: Partial<LeadPositionItem> = { shiftType: "day", horaInicio: "08:00", horaFin: "20:00" };
                          // Auto-set salary for 5x2 day shift if not manually edited
                          const allWeekdays = pos.dias?.length === 5 && !pos.dias.includes("sabado");
                          if (allWeekdays) patch.baseSalary = 400000;
                          else patch.baseSalary = 600000;
                          updatePosition(idx, patch);
                        }}
                      >
                        Día
                      </button>
                      <button
                        type="button"
                        className={cn("flex-1 h-7 rounded-md border text-[10px] font-medium", pos.shiftType === "night" ? "border-purple-500/40 bg-purple-500/10 text-purple-400" : "border-border text-muted-foreground")}
                        onClick={() => updatePosition(idx, { shiftType: "night", horaInicio: "20:00", horaFin: "08:00", baseSalary: 600000 })}
                      >
                        Noche
                      </button>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-[10px] text-muted-foreground mr-1">Días:</span>
                  {["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"].map((d) => {
                    const active = pos.dias?.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        className={cn(
                          "h-5 w-7 rounded text-[9px] font-bold transition-colors",
                          active ? "bg-primary/15 text-primary border border-primary/30" : "bg-muted text-muted-foreground border border-transparent"
                        )}
                        onClick={() => {
                          const dias = active ? pos.dias.filter((x) => x !== d) : [...(pos.dias || []), d];
                          updatePosition(idx, { dias });
                        }}
                      >
                        {WEEKDAYS_SHORT[d]}
                      </button>
                    );
                  })}
                </div>
                {(() => {
                  const salary = pos.baseSalary || 550000;
                  const guards = (pos.cantidad || 1) * (pos.numPuestos || 1);
                  const IMM = 500000;
                  const gratificacion = Math.min(salary * 0.25, (4.75 * IMM) / 12);
                  const baseConGrat = salary + gratificacion;
                  const cargasSociales = baseConGrat * 0.2435;
                  const costoGuardia = salary + gratificacion + cargasSociales;
                  const costoTotal = costoGuardia * guards;
                  return (
                    <div className="text-[10px] space-y-0.5">
                      <div className="text-muted-foreground">
                        {pos.horaInicio}-{pos.horaFin} · {guards} guardia(s)
                      </div>
                      <div className="text-emerald-400 font-semibold">
                        Costo empresa: {formatCurrency(Math.round(costoTotal))}/mes
                        <span className="text-muted-foreground font-normal ml-1">
                          ({formatCurrency(Math.round(costoGuardia))}/guardia)
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-full text-xs gap-1" onClick={addPosition}>
              <Plus className="h-3 w-3" /> Agregar posición
            </Button>
          </div>
        )}
      </Card>

      {/* ── Costos adicionales (acordeón CPQ-style) ── */}
      <Card className="shadow-sm overflow-hidden">
        <button type="button" onClick={() => setSecCostos((v) => !v)} className="flex items-center justify-between w-full px-3 py-2.5 hover:bg-muted/10 transition-colors">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-bold shrink-0">Costos adicionales</h2>
            {!secCostos && config.selectedCostGroups.length > 0 && (
              <span className="text-[11px] text-muted-foreground">
                {config.selectedCostGroups.length} categorías activas
              </span>
            )}
          </div>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", secCostos && "rotate-180")} />
        </button>
        {secCostos && (
          <div className="px-3 pb-3 space-y-1">
            {/* DIRECTOS */}
            <div className="rounded-md border border-border/40 overflow-hidden">
              <div className="px-2.5 py-1.5 bg-muted/20 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase text-muted-foreground">Directos</span>
              </div>
              {COST_GROUPS_DIRECTOS.map((g) => {
                const active = config.selectedCostGroups.includes(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => toggleCostGroup(g.id)}
                    className="flex items-center justify-between w-full px-2.5 py-1.5 hover:bg-muted/10 transition-colors border-t border-border/20"
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn("h-2 w-2 rounded-full transition-colors", active ? "bg-emerald-500" : "bg-muted-foreground/30")} />
                      <span className={cn("text-xs", active ? "text-foreground font-medium" : "text-muted-foreground")}>{g.icon} {g.label}</span>
                    </div>
                    <span className="text-xs font-mono text-muted-foreground">
                      {active ? "Incluido" : "—"}
                    </span>
                  </button>
                );
              })}
            </div>
            {/* INDIRECTOS */}
            <div className="rounded-md border border-border/40 overflow-hidden">
              <div className="px-2.5 py-1.5 bg-muted/20 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase text-muted-foreground">Indirectos</span>
              </div>
              {COST_GROUPS_INDIRECTOS.map((g) => {
                const active = config.selectedCostGroups.includes(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => toggleCostGroup(g.id)}
                    className="flex items-center justify-between w-full px-2.5 py-1.5 hover:bg-muted/10 transition-colors border-t border-border/20"
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn("h-2 w-2 rounded-full transition-colors", active ? "bg-emerald-500" : "bg-muted-foreground/30")} />
                      <span className={cn("text-xs", active ? "text-foreground font-medium" : "text-muted-foreground")}>{g.icon} {g.label}</span>
                    </div>
                    <span className="text-xs font-mono text-muted-foreground">
                      {active ? "Incluido" : "—"}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-[9px] text-muted-foreground/70 pt-1">Los montos exactos se cargan del catálogo al aprobar. Haz clic para incluir/excluir.</p>
          </div>
        )}
      </Card>

      {/* ── Líneas adicionales ── */}
      <Card className="shadow-sm overflow-hidden">
        <button type="button" onClick={() => setSecLineas((v) => !v)} className="flex items-center justify-between w-full px-3 py-2.5 hover:bg-muted/10 transition-colors">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-bold shrink-0">Líneas adicionales</h2>
            {!secLineas && config.additionalLines.length > 0 && (
              <span className="text-[11px] text-muted-foreground">{config.additionalLines.length} líneas</span>
            )}
          </div>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", secLineas && "rotate-180")} />
        </button>
        {secLineas && (
          <div className="px-3 pb-3">
            <AdditionalLinesSection
              lines={config.additionalLines}
              onChange={(lines) => update({ additionalLines: lines })}
              contractDuration={config.conditions.contractDuration}
            />
          </div>
        )}
      </Card>

      {/* ── Gastos financieros ── */}
      <Card className="shadow-sm overflow-hidden">
        <button type="button" onClick={() => setSecFinancieros((v) => !v)} className="flex items-center justify-between w-full px-3 py-2.5 hover:bg-muted/10 transition-colors">
          <h2 className="text-sm font-bold shrink-0">Gastos financieros</h2>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", secFinancieros && "rotate-180")} />
        </button>
        {secFinancieros && (
          <div className="px-3 pb-3">
            <FinancialCostsSection
              value={config.financialCosts}
              onChange={(fc) => update({ financialCosts: fc })}
            />
          </div>
        )}
      </Card>

      {/* ── Margen de venta ── */}
      <Card className="shadow-sm overflow-hidden">
        <button type="button" onClick={() => setSecMargen((v) => !v)} className="flex items-center justify-between w-full px-3 py-2.5 hover:bg-muted/10 transition-colors">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-bold shrink-0">Margen de venta</h2>
            {!secMargen && <span className="text-[11px] text-muted-foreground font-mono">{config.marginPercentage}%</span>}
          </div>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", secMargen && "rotate-180")} />
        </button>
        {secMargen && (
          <div className="px-3 pb-3">
            <MarginSection
              marginPct={config.marginPercentage}
              onMarginChange={(m) => update({ marginPercentage: m })}
              marginAmount={estimate.marginAmount}
              marginMode={config.marginMode}
              onMarginModeChange={(mode) => update({ marginMode: mode })}
            />
          </div>
        )}
      </Card>

      {/* ── Condiciones comerciales ── */}
      <Card className="shadow-sm overflow-hidden">
        <button type="button" onClick={() => setSecCondiciones((v) => !v)} className="flex items-center justify-between w-full px-3 py-2.5 hover:bg-muted/10 transition-colors">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-bold shrink-0">Condiciones comerciales</h2>
            {!secCondiciones && (
              <span className="text-[11px] text-muted-foreground">
                {config.conditions.paymentTerms === "contrafactura" ? "Contrafactura" : config.conditions.paymentTerms === "30_dias" ? "30 días" : "Anticipado"} · {config.conditions.contractDuration}m
              </span>
            )}
          </div>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", secCondiciones && "rotate-180")} />
        </button>
        {secCondiciones && (
          <div className="px-3 pb-3">
            <CommercialConditionsSection
              value={config.conditions}
              onChange={(c) => update({ conditions: c })}
              proposalTemplates={proposalTemplates}
            />
          </div>
        )}
      </Card>

      {/* ── Estimación rápida ── */}
      {config.positions.length > 0 && (
        <Card className="shadow-sm p-3 space-y-1.5 border-dashed">
          <span className="text-[10px] font-medium text-muted-foreground uppercase">Estimación rápida</span>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <span className="text-muted-foreground">Costo empresa:</span>
            <span className="font-mono font-semibold text-right">{formatCurrency(Math.round(estimate.costoEmpresa))}</span>
            <span className="text-muted-foreground">Precio venta:</span>
            <span className="font-mono font-semibold text-right text-emerald-400">{formatCurrency(Math.round(estimate.precioVenta))}</span>
            <span className="text-muted-foreground">Margen bruto:</span>
            <span className="font-mono font-semibold text-right">{config.marginPercentage}%</span>
            {estimate.totalLineas > 0 && (
              <>
                <span className="text-muted-foreground">Líneas adicionales:</span>
                <span className="font-mono font-semibold text-right text-purple-400">{formatCurrency(Math.round(estimate.totalLineas))}</span>
              </>
            )}
          </div>
          <p className="text-[9px] text-muted-foreground/70">Estimación. El valor final se calcula al aprobar.</p>
        </Card>
      )}
    </div>
  );
}

export function createDefaultLeadCpqConfig(): LeadCpqConfig {
  return {
    positions: [],
    selectedCostGroups: ["uniform", "system", "equipment"],
    additionalLines: [],
    financialCosts: {
      financialEnabled: false,
      financialRatePct: 2.5,
      salePriceBase: 0,
      policyEnabled: false,
      policyRatePct: 2.5,
      policyContractMonths: 12,
      policyContractPct: 100,
    },
    marginPercentage: 13,
    marginMode: "margin_on_sale",
    conditions: {
      paymentTerms: "contrafactura",
      serviceStartDays: 5,
      contractDuration: 12,
      proposalTemplateId: null,
    },
  };
}
