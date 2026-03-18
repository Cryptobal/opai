"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatNumber, parseLocalizedNumber } from "@/lib/utils";
import { formatCurrency } from "@/components/cpq/utils";
import { ChevronDown, Users, Plus, Copy, Trash2, Moon, Sun, Loader2, Sparkles, RefreshCw } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
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

export interface LeadCostItem {
  catalogItemId: string;
  name: string;
  type: string;
  unit: string;
  basePrice: number;
  priceOverride: number | null;
  enabled: boolean;
}

export interface LeadCpqConfig {
  positions: LeadPositionItem[];
  selectedCostGroups: string[];
  costItems: LeadCostItem[];
  additionalLines: AdditionalLineItem[];
  financialCosts: FinancialCostsData;
  marginPercentage: number;
  marginMode: MarginMode;
  conditions: CommercialConditionsData;
  companyDescription?: string;
  serviceDescription?: string;
}

interface LeadInstallationCpqProps {
  config: LeadCpqConfig;
  onChange: (config: LeadCpqConfig) => void;
  proposalTemplates?: { id: string; name: string; slug?: string }[];
  catalogDefaults?: { puestoId: string; puestoName: string; cargoId: string; rolId: string };
  accountName?: string;
  industry?: string;
  installationName?: string;
  installationCity?: string;
  ufValue?: number | null;
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

/* ─── Cost group → catalog type mapping ─── */
const COST_GROUP_TYPES_MAP: Record<string, string[]> = {
  uniform: ["uniform"],
  exam: ["exam"],
  meal: ["meal"],
  equipment: ["phone", "radio", "flashlight"],
  transport: ["transport"],
  vehicle: ["vehicle_rent", "vehicle_fuel", "vehicle_tag"],
  infrastructure: ["infrastructure", "fuel"],
  system: ["system"],
};

/* ─── Cost type → category mapping ─── */
const COST_TYPE_CATEGORY: Record<string, { category: "direct" | "indirect"; group: string }> = {
  uniform: { category: "direct", group: "Uniformes" },
  exam: { category: "direct", group: "Exámenes" },
  meal: { category: "direct", group: "Alimentación" },
  phone: { category: "indirect", group: "Equipos operativos" },
  radio: { category: "indirect", group: "Equipos operativos" },
  flashlight: { category: "indirect", group: "Equipos operativos" },
  transport: { category: "indirect", group: "Transporte" },
  vehicle_rent: { category: "indirect", group: "Vehículos" },
  vehicle_fuel: { category: "indirect", group: "Vehículos" },
  vehicle_tag: { category: "indirect", group: "Vehículos" },
  infrastructure: { category: "indirect", group: "Infraestructura" },
  fuel: { category: "indirect", group: "Infraestructura" },
  system: { category: "indirect", group: "Sistemas" },
};

interface CatalogItem {
  id: string;
  type: string;
  name: string;
  unit: string;
  basePrice: number;
}

/* ─── Component ─── */

export function LeadInstallationCpq({
  config,
  onChange,
  proposalTemplates = [],
  catalogDefaults,
  accountName,
  industry,
  installationName,
  installationCity,
  ufValue,
}: LeadInstallationCpqProps) {
  const [secPuestos, setSecPuestos] = useState(true);
  const [secCostos, setSecCostos] = useState(false);

  // Catalog items for cost accordion
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);

  useEffect(() => {
    if (catalogLoaded) return;
    fetch("/api/cpq/catalog?active=true")
      .then((r) => r.json())
      .then((res) => {
        if (res?.success && Array.isArray(res.data)) {
          setCatalogItems(res.data.map((item: any) => ({
            id: item.id,
            type: item.type,
            name: item.name,
            unit: item.unit,
            basePrice: Number(item.basePrice) || 0,
          })));
          setCatalogLoaded(true);
          // Auto-populate costItems from catalog if empty
          if (config.costItems.length === 0 && config.selectedCostGroups.length > 0) {
            const enabledTypes = new Set<string>();
            for (const g of config.selectedCostGroups) {
              const types = COST_GROUP_TYPES_MAP[g];
              if (types) types.forEach((t) => enabledTypes.add(t));
            }
            const items: LeadCostItem[] = res.data.map((item: any) => ({
              catalogItemId: item.id,
              name: item.name,
              type: item.type,
              unit: item.unit,
              basePrice: Number(item.basePrice) || 0,
              priceOverride: null,
              enabled: enabledTypes.has(item.type),
            }));
            onChange({ ...config, costItems: items });
          }
        }
      })
      .catch(() => {});
  }, [catalogLoaded]); // eslint-disable-line react-hooks/exhaustive-deps
  const [secLineas, setSecLineas] = useState(false);
  const [secFinancieros, setSecFinancieros] = useState(false);
  const [secMargen, setSecMargen] = useState(true);
  const [secCondiciones, setSecCondiciones] = useState(false);
  const [secDescripciones, setSecDescripciones] = useState(false);
  const [generatingCompany, setGeneratingCompany] = useState(false);
  const [generatingService, setGeneratingService] = useState(false);
  const [aiInstruction, setAiInstruction] = useState("");

  const update = (patch: Partial<LeadCpqConfig>) => onChange({ ...config, ...patch });

  // ─── Cost item helpers ───
  const toggleCostItem = (catalogItemId: string) => {
    const items = config.costItems.map((item) =>
      item.catalogItemId === catalogItemId ? { ...item, enabled: !item.enabled } : item
    );
    update({ costItems: items });
  };

  const updateCostItemPrice = (catalogItemId: string, price: number) => {
    const items = config.costItems.map((item) =>
      item.catalogItemId === catalogItemId ? { ...item, priceOverride: price, enabled: true } : item
    );
    update({ costItems: items });
  };

  // Group cost items by category → group
  const groupedCostsDirect = useMemo(() => {
    const groups: Record<string, LeadCostItem[]> = {};
    for (const item of config.costItems) {
      const cat = COST_TYPE_CATEGORY[item.type];
      if (!cat || cat.category !== "direct") continue;
      if (!groups[cat.group]) groups[cat.group] = [];
      groups[cat.group].push(item);
    }
    return groups;
  }, [config.costItems]);

  const groupedCostsIndirect = useMemo(() => {
    const groups: Record<string, LeadCostItem[]> = {};
    for (const item of config.costItems) {
      const cat = COST_TYPE_CATEGORY[item.type];
      if (!cat || cat.category !== "indirect") continue;
      if (!groups[cat.group]) groups[cat.group] = [];
      groups[cat.group].push(item);
    }
    return groups;
  }, [config.costItems]);

  const costTotals = useMemo(() => {
    let directos = 0;
    let indirectos = 0;
    for (const item of config.costItems) {
      if (!item.enabled) continue;
      const price = item.priceOverride ?? item.basePrice;
      const cat = COST_TYPE_CATEGORY[item.type];
      if (cat?.category === "direct") directos += price;
      else if (cat?.category === "indirect") indirectos += price;
    }
    return { directos, indirectos, total: directos + indirectos };
  }, [config.costItems]);

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

  // ─── AI description generation ───
  const generateDescription = async (type: "company" | "service") => {
    if (config.positions.length === 0) return;
    const setter = type === "company" ? setGeneratingCompany : setGeneratingService;
    setter(true);
    try {
      const res = await fetch("/api/ai/lead-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          accountName: accountName || "",
          industry: industry || "",
          installationName: installationName || "",
          city: installationCity || "",
          positions: config.positions,
          costItems: config.costItems,
          customInstruction: aiInstruction || undefined,
        }),
      });
      const data = await res.json();
      if (data?.success && data.data?.description) {
        if (type === "company") update({ companyDescription: data.data.description });
        else update({ serviceDescription: data.data.description });
      }
    } catch {
      // silent fail
    } finally {
      setter(false);
    }
  };

  // ─── Auto-generate AI descriptions when first position is added ───
  const [autoGenTriggered, setAutoGenTriggered] = useState(false);
  useEffect(() => {
    if (autoGenTriggered) return;
    if (config.positions.length === 0) return;
    if (config.companyDescription || config.serviceDescription) return;
    if (generatingCompany || generatingService) return;
    setAutoGenTriggered(true);
    const timer = setTimeout(() => {
      generateDescription("company");
      generateDescription("service");
    }, 800);
    return () => clearTimeout(timer);
  }, [config.positions.length]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const costosAdicionales = costTotals.total;
    const costoBase = totalCostoManoObra + costosAdicionales;
    const financiero = config.financialCosts.financialEnabled
      ? costoBase * (config.financialCosts.financialRatePct / 100)
      : 0;
    const costoConFinanciero = costoBase + financiero;
    const marginPct = config.marginPercentage / 100;
    const marginAmount = config.marginMode === "margin_on_sale" && marginPct < 1
      ? costoConFinanciero / (1 - marginPct) - costoConFinanciero
      : costoConFinanciero * marginPct;
    const precioVenta = costoConFinanciero + marginAmount + totalLineas;
    const totalGuardias = config.positions.reduce((s, p) => s + (p.cantidad || 1) * (p.numPuestos || 1), 0);
    const totalPuestos = config.positions.reduce((s, p) => s + (p.numPuestos || 1), 0);
    return {
      manoDeObra: totalCostoManoObra,
      directos: costTotals.directos,
      indirectos: costTotals.indirectos,
      financiero,
      marginAmount,
      totalLineas,
      precioVenta,
      totalGuardias,
      totalPuestos,
    };
  }, [config.positions, config.additionalLines, config.marginPercentage, config.marginMode, config.conditions.contractDuration, config.financialCosts, costTotals]);

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
                <div className="grid gap-2 sm:grid-cols-5">
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
                    <Label className="text-[10px]">N° Puestos</Label>
                    <select
                      className="flex h-7 w-full rounded-md border border-border bg-card px-2 text-xs"
                      value={pos.numPuestos || 1}
                      onChange={(e) => updatePosition(idx, { numPuestos: Number(e.target.value) })}
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
                        {pos.horaInicio}-{pos.horaFin} · {pos.cantidad || 1} guardia(s){(pos.numPuestos || 1) > 1 ? ` × ${pos.numPuestos} puestos = ${guards} guardias totales` : ""}
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

      {/* ── Costos adicionales (acordeón con ítems reales del catálogo) ── */}
      <Card className="shadow-sm overflow-hidden">
        <button type="button" onClick={() => setSecCostos((v) => !v)} className="flex items-center justify-between w-full px-3 py-2.5 hover:bg-muted/10 transition-colors">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-bold shrink-0">Costos adicionales</h2>
            {!secCostos && costTotals.total > 0 && (
              <span className="text-[11px] text-muted-foreground">
                <span className="font-mono font-semibold text-amber-400">{formatCurrency(costTotals.total)}</span>
              </span>
            )}
          </div>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", secCostos && "rotate-180")} />
        </button>
        {secCostos && (
          <div className="px-3 pb-3 space-y-1">
            {/* DIRECTOS */}
            <CostCategoryBlock
              title="DIRECTOS"
              total={costTotals.directos}
              groups={groupedCostsDirect}
              costItems={config.costItems}
              onToggleItem={toggleCostItem}
              onPriceChange={updateCostItemPrice}
            />
            {/* INDIRECTOS */}
            <CostCategoryBlock
              title="INDIRECTOS"
              total={costTotals.indirectos}
              groups={groupedCostsIndirect}
              costItems={config.costItems}
              onToggleItem={toggleCostItem}
              onPriceChange={updateCostItemPrice}
            />
            <div className="flex justify-between items-center pt-1 border-t border-amber-500/20">
              <span className="text-[11px] font-medium text-amber-300">Total costos adicionales</span>
              <span className="text-sm font-bold font-mono text-amber-300">{formatCurrency(costTotals.total)}</span>
            </div>
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

      {/* ── Descripciones IA ── */}
      <Card className="shadow-sm overflow-hidden">
        <button type="button" onClick={() => setSecDescripciones((v) => !v)} className="flex items-center justify-between w-full px-3 py-2.5 hover:bg-muted/10 transition-colors">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-bold shrink-0">Descripciones IA</h2>
            {!secDescripciones && (config.companyDescription || config.serviceDescription) && (
              <span className="text-[11px] text-muted-foreground">Generadas</span>
            )}
          </div>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", secDescripciones && "rotate-180")} />
        </button>
        {secDescripciones && (
          <div className="px-3 pb-3 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              {/* Company description */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px]">Descripción empresa</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] gap-1 px-2"
                    disabled={generatingCompany || config.positions.length === 0}
                    onClick={() => generateDescription("company")}
                  >
                    {generatingCompany ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    {config.companyDescription ? "Regenerar" : "Generar"}
                  </Button>
                </div>
                <Textarea
                  value={config.companyDescription || ""}
                  onChange={(e) => update({ companyDescription: e.target.value })}
                  placeholder="Se genera automáticamente al hacer clic en Generar..."
                  className="text-xs min-h-[100px] resize-y"
                />
              </div>
              {/* Service detail */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px]">Detalle servicio</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] gap-1 px-2"
                    disabled={generatingService || config.positions.length === 0}
                    onClick={() => generateDescription("service")}
                  >
                    {generatingService ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    {config.serviceDescription ? "Regenerar" : "Generar"}
                  </Button>
                </div>
                <Textarea
                  value={config.serviceDescription || ""}
                  onChange={(e) => update({ serviceDescription: e.target.value })}
                  placeholder="Se genera automáticamente al hacer clic en Generar..."
                  className="text-xs min-h-[100px] resize-y"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Instrucción IA (opcional)</Label>
              <Input
                value={aiInstruction}
                onChange={(e) => setAiInstruction(e.target.value)}
                placeholder="Ej: Enfocarse en el rubro minero..."
                className="h-7 text-xs"
              />
            </div>
          </div>
        )}
      </Card>

      {/* ── Vista previa de la propuesta (HTML) ── */}
      {config.positions.length > 0 && (
        <Card className="shadow-sm overflow-hidden">
          <div className="px-3 py-2 bg-muted/20 border-b border-border/40 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground">Vista previa de la propuesta</span>
            {proposalTemplates.length > 0 && (
              <div className="flex gap-1">
                {proposalTemplates.filter((t) => !((t.name || "").toLowerCase().includes("presentación") && (t.name || "").toLowerCase().includes("empresa"))).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => update({ conditions: { ...config.conditions, proposalTemplateId: t.id } })}
                    className={cn(
                      "h-5 rounded px-2 text-[9px] font-medium border transition-colors",
                      config.conditions.proposalTemplateId === t.id
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-transparent bg-muted/40 text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="p-4 space-y-4 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 max-h-[500px] overflow-y-auto text-xs">
            {/* Header */}
            <div className="text-center space-y-1 pb-3 border-b">
              <div className="text-sm font-bold tracking-wide">GARD SECURITY</div>
              <div className="text-[10px] text-zinc-500">Propuesta Comercial</div>
              {accountName && <div className="text-[11px] font-semibold mt-1">{accountName}</div>}
              {installationName && <div className="text-[10px] text-zinc-500">{installationName}{installationCity ? `, ${installationCity}` : ""}</div>}
            </div>

            {/* Company description */}
            {config.companyDescription && (
              <p className="text-[11px] whitespace-pre-wrap leading-relaxed text-zinc-700 dark:text-zinc-300">{config.companyDescription}</p>
            )}

            {/* Positions table */}
            <div>
              <div className="text-[10px] font-bold text-zinc-500 uppercase mb-2">
                Puestos de trabajo · {estimate.totalGuardias} guardia(s)
              </div>
              <table className="w-full text-[10px] border-collapse">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-700">
                    <th className="text-left py-1.5 font-semibold">Puesto</th>
                    <th className="text-center py-1.5 font-semibold w-16">Guardias</th>
                    <th className="text-center py-1.5 font-semibold w-16">Puestos</th>
                    <th className="text-center py-1.5 font-semibold w-20">Horario</th>
                    <th className="text-center py-1.5 font-semibold w-16">Turno</th>
                  </tr>
                </thead>
                <tbody>
                  {config.positions.map((pos, i) => (
                    <tr key={i} className="border-b border-zinc-100 dark:border-zinc-800">
                      <td className="py-1.5">{pos.customName || pos.puesto}</td>
                      <td className="text-center">{pos.cantidad || 1}</td>
                      <td className="text-center">{pos.numPuestos || 1}</td>
                      <td className="text-center">{pos.horaInicio}-{pos.horaFin}</td>
                      <td className="text-center">{pos.shiftType === "night" ? "Nocturno" : "Diurno"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Economic evaluation */}
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 p-3 text-center">
              <div className="text-[9px] text-emerald-600 dark:text-emerald-400 uppercase font-semibold">Precio venta mensual neto</div>
              <div className="text-xl font-bold text-emerald-700 dark:text-emerald-300 font-mono">{formatCurrency(Math.round(estimate.precioVenta))}</div>
              {ufValue && ufValue > 0 && <div className="text-[11px] text-emerald-600 dark:text-emerald-400">{(estimate.precioVenta / ufValue).toFixed(2)} UF</div>}
            </div>

            {/* Service detail */}
            {config.serviceDescription && (
              <div>
                <div className="text-[10px] font-bold text-zinc-500 uppercase mb-1">Detalle del servicio</div>
                <p className="text-[11px] whitespace-pre-wrap leading-relaxed text-zinc-700 dark:text-zinc-300">{config.serviceDescription}</p>
              </div>
            )}

            {/* Conditions footer */}
            <div className="text-[9px] text-zinc-400 border-t border-zinc-200 dark:border-zinc-700 pt-2 space-y-0.5">
              <div>Forma de pago: {config.conditions.paymentTerms === "contrafactura" ? "Contrafactura" : config.conditions.paymentTerms === "30_dias" ? "30 días" : "Pago anticipado"}</div>
              <div>Duración del contrato: {config.conditions.contractDuration} meses</div>
              <div>Inicio de servicios: {config.conditions.serviceStartDays} días hábiles desde la firma</div>
            </div>
          </div>
        </Card>
      )}

      {/* ── Resumen de costos (desglose) ── */}
      {config.positions.length > 0 && (
        <Card className="shadow-sm overflow-hidden">
          <div className="px-3 py-2.5 bg-emerald-500/5 border-b border-emerald-500/20">
            <div className="text-center">
              <div className="text-lg font-bold text-emerald-400 font-mono">{formatCurrency(Math.round(estimate.precioVenta))}</div>
              {ufValue && ufValue > 0 && (
                <div className="text-sm text-emerald-300/80 font-mono">{(estimate.precioVenta / ufValue).toFixed(2)} UF</div>
              )}
              <div className="text-[10px] text-muted-foreground">
                Precio de venta mensual · {estimate.totalPuestos} puesto(s) · {estimate.totalGuardias} guardia(s) · {config.marginPercentage}%
              </div>
            </div>
          </div>
          <div className="px-3 py-2 space-y-1">
            {[
              { label: "Mano de obra", value: estimate.manoDeObra, color: "bg-blue-500" },
              { label: "Directos", value: estimate.directos, color: "bg-amber-500" },
              { label: "Indirectos", value: estimate.indirectos, color: "bg-orange-500" },
              { label: "Financiero", value: estimate.financiero, color: "bg-red-400" },
              { label: "Margen", value: estimate.marginAmount, color: "bg-emerald-500" },
              ...(estimate.totalLineas > 0 ? [{ label: "Líneas adicionales", value: estimate.totalLineas, color: "bg-purple-500" }] : []),
            ].map((row) => {
              const pct = estimate.precioVenta > 0 ? (row.value / estimate.precioVenta) * 100 : 0;
              return (
                <div key={row.label} className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground w-24 shrink-0">{row.label}</span>
                  <div className="flex-1 h-2 rounded-full bg-muted/30 overflow-hidden">
                    <div className={cn("h-full rounded-full", row.color)} style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                  <span className="text-[10px] font-mono font-semibold text-right w-24 shrink-0">{formatCurrency(Math.round(row.value))}</span>
                </div>
              );
            })}
          </div>
          <div className="px-3 py-1.5 border-t border-border/40 text-center">
            <p className="text-[9px] text-muted-foreground/70">Estimación. Valores finales se calculan al aprobar.</p>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ─── Cost Category Block sub-component ─── */

function CostCategoryBlock({
  title,
  total,
  groups,
  costItems,
  onToggleItem,
  onPriceChange,
}: {
  title: string;
  total: number;
  groups: Record<string, LeadCostItem[]>;
  costItems: LeadCostItem[];
  onToggleItem: (id: string) => void;
  onPriceChange: (id: string, price: number) => void;
}) {
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const groupNames = Object.keys(groups);

  return (
    <div className="rounded-md border border-border/40 overflow-hidden">
      <div className="px-2.5 py-1.5 bg-muted/20 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase text-muted-foreground">{title}</span>
        <span className="text-[11px] font-mono font-semibold text-muted-foreground">
          {formatCurrency(total)}
        </span>
      </div>
      {groupNames.map((groupName) => {
        const items = groups[groupName];
        const enabledCount = items.filter((i) => i.enabled).length;
        const groupTotal = items.filter((i) => i.enabled).reduce((s, i) => s + (i.priceOverride ?? i.basePrice), 0);
        const isExpanded = expandedGroup === groupName;

        return (
          <div key={groupName} className="border-t border-border/20">
            <button
              type="button"
              onClick={() => setExpandedGroup(isExpanded ? null : groupName)}
              className="flex items-center justify-between w-full px-2.5 py-1.5 hover:bg-muted/10 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className={cn("text-xs", enabledCount > 0 ? "text-foreground font-medium" : "text-muted-foreground")}>
                  {groupName}{enabledCount > 0 ? ` (${enabledCount})` : ""}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-muted-foreground">
                  {groupTotal > 0 ? formatCurrency(groupTotal) : "$0"}
                </span>
                <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition-transform", isExpanded && "rotate-180")} />
              </div>
            </button>
            {isExpanded && (
              <div className="px-2.5 pb-2 space-y-1">
                {items.map((item) => (
                  <div key={item.catalogItemId} className="flex items-center gap-2 rounded border border-border/30 bg-background px-2 py-1">
                    <button
                      type="button"
                      onClick={() => onToggleItem(item.catalogItemId)}
                      className={cn(
                        "h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                        item.enabled ? "bg-emerald-500 border-emerald-500 text-white" : "border-border"
                      )}
                    >
                      {item.enabled && <span className="text-[8px]">✓</span>}
                    </button>
                    <span className={cn("text-[11px] flex-1 truncate", item.enabled ? "text-foreground" : "text-muted-foreground")}>{item.name}</span>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={formatNumber(item.priceOverride ?? item.basePrice)}
                      onChange={(e) => onPriceChange(item.catalogItemId, parseLocalizedNumber(e.target.value) || 0)}
                      className="h-6 w-20 text-[10px] text-right bg-card border-border"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {groupNames.length === 0 && (
        <div className="px-2.5 py-2 text-[10px] text-muted-foreground">Cargando catálogo...</div>
      )}
    </div>
  );
}

export function createDefaultLeadCpqConfig(): LeadCpqConfig {
  return {
    positions: [],
    selectedCostGroups: ["uniform", "system", "equipment"],
    costItems: [],
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
