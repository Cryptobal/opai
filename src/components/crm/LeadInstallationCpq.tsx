"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatNumber, parseLocalizedNumber } from "@/lib/utils";
import { formatCurrency } from "@/components/cpq/utils";
import { ChevronDown, Users, Plus, Copy, Trash2, Moon, Sun, Loader2, Sparkles, RefreshCw, FileText } from "lucide-react";
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
  technicalSpecs?: string | null;
  priceLogic?: string;
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
  uniformChangesPerYear?: number;
  avgStayMonths?: number;
  quoteName?: string;
  currency?: "CLP" | "UF";
}

export interface CpqCatalogOption {
  id: string;
  name: string;
}

interface LeadInstallationCpqProps {
  config: LeadCpqConfig;
  onChange: (config: LeadCpqConfig) => void;
  proposalTemplates?: { id: string; name: string; slug?: string }[];
  catalogDefaults?: { puestoId: string; puestoName: string; cargoId: string; rolId: string };
  cpqPuestos?: CpqCatalogOption[];
  cpqCargos?: CpqCatalogOption[];
  cpqRoles?: CpqCatalogOption[];
  leadId?: string;
  accountName?: string;
  industry?: string;
  installationName?: string;
  installationCity?: string;
  ufValue?: number | null;
}

/** Normaliza technicalSpecs a string | null (la API puede devolver objeto) */
function toTechnicalSpecs(val: unknown): string | null {
  if (val == null) return null;
  if (typeof val === "string") return val;
  return JSON.stringify(val);
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

/* ─── Unit price normalizer (matches CPQ compute-quote-costs) ─── */
function normalizeUnitPrice(value: number, unit?: string | null, contractMonths?: number): number {
  if (!unit) return value;
  const n = unit.toLowerCase();
  if (n.includes("contrato") || n.includes("contract")) {
    const months = contractMonths && contractMonths > 0 ? contractMonths : 12;
    return value / months;
  }
  if (n.includes("año") || n.includes("year")) return value / 12;
  if (n.includes("semestre") || n.includes("semester")) return value / 6;
  return value;
}

/* ─── Group name → emoji (for cost categories) ─── */
const GROUP_ICON: Record<string, string> = {
  Uniformes: "\uD83E\uDDE5",
  Exámenes: "\uD83D\uDD2C",
  Alimentación: "\uD83C\uDF7D\uFE0F",
  "Equipos operativos": "\uD83D\uDCE6",
  Transporte: "\uD83D\uDE9A",
  Vehículos: "\uD83D\uDE97",
  Infraestructura: "\uD83C\uDFD7\uFE0F",
  Sistemas: "\uD83D\uDCBB",
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
  defaultTechnicalSpecs?: string | null;
  priceLogic?: string;
}

/* ─── Component ─── */

export function LeadInstallationCpq({
  config,
  onChange,
  proposalTemplates = [],
  catalogDefaults,
  cpqPuestos = [],
  cpqCargos = [],
  cpqRoles = [],
  leadId,
  accountName,
  industry,
  installationName,
  installationCity,
  ufValue,
}: LeadInstallationCpqProps) {
  const [secPuestos, setSecPuestos] = useState(true);
  const [secCostos, setSecCostos] = useState(true);

  // Catalog items for cost accordion
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);

  useEffect(() => {
    if (catalogLoaded) return;
    fetch(`/api/cpq/catalog?active=true&_=${Date.now()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((res) => {
        if (res?.success && Array.isArray(res.data)) {
          setCatalogItems(res.data.map((item: any) => ({
            id: item.id,
            type: item.type,
            name: item.name,
            unit: item.unit,
            basePrice: Number(item.basePrice) || 0,
            defaultTechnicalSpecs: item.defaultTechnicalSpecs || null,
            priceLogic: item.priceLogic ?? "uniform",
          })));
          setCatalogLoaded(true);
          // Hidratar costItems existentes con catálogo (specs si faltan, priceLogic y unit siempre)
          const catalogById = new Map(res.data.map((c: any) => [c.id, c]));
          if (config.costItems.length > 0) {
            const hydrated: LeadCostItem[] = config.costItems.map((item) => {
              const def = catalogById.get(item.catalogItemId) as { defaultTechnicalSpecs?: string | null; priceLogic?: string; unit?: string } | undefined;
              if (!def) return item;
              const specs = item.technicalSpecs ?? (def.defaultTechnicalSpecs != null ? toTechnicalSpecs(def.defaultTechnicalSpecs) : null);
              const priceLogic = def.priceLogic ?? item.priceLogic ?? "uniform";
              const unit = def.unit ?? item.unit;
              return { ...item, technicalSpecs: specs ?? item.technicalSpecs, priceLogic, unit };
            });
            if (hydrated.some((h, i) => h.technicalSpecs !== config.costItems[i]?.technicalSpecs || h.priceLogic !== config.costItems[i]?.priceLogic || h.unit !== config.costItems[i]?.unit)) {
              onChange({ ...config, costItems: hydrated });
            }
          }
          // Auto-populate costItems from catalog if empty
          if (config.costItems.length === 0) {
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
              enabled: Boolean(item.isDefault) && enabledTypes.has(item.type),
              technicalSpecs: toTechnicalSpecs(item.defaultTechnicalSpecs) ?? null,
              priceLogic: item.priceLogic ?? "uniform",
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

  const updateCostItemSpecs = (catalogItemId: string, specs: string | null) => {
    const items = config.costItems.map((item) =>
      item.catalogItemId === catalogItemId ? { ...item, technicalSpecs: specs } : item
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
    const uniformChangesPerYear = config.uniformChangesPerYear ?? 3;
    const avgStayMonths = config.avgStayMonths ?? 4;
    const contractMonths = config.conditions?.contractDuration ?? 12;
    const guards = config.positions.reduce(
      (s, p) => s + (p.cantidad || 1) * (p.numPuestos || 1), 0
    );

    let uniformRotatingCost = 0;
    let uniformProratedCost = 0;
    let examSetCost = 0;
    let otherDirectos = 0;
    let indirectos = 0;

    for (const item of config.costItems) {
      if (!item.enabled) continue;
      const cat = COST_TYPE_CATEGORY[item.type];
      if (!cat) continue;

      if (item.type === "uniform") {
        const price = item.priceOverride ?? item.basePrice;
        const logic = item.priceLogic ?? "uniform";
        if (logic === "prorated") {
          uniformProratedCost += normalizeUnitPrice(price, item.unit, contractMonths);
        } else {
          uniformRotatingCost += normalizeUnitPrice(price, item.unit, contractMonths);
        }
      } else if (item.type === "exam") {
        examSetCost += normalizeUnitPrice(item.priceOverride ?? item.basePrice, item.unit);
      } else if (cat.category === "direct") {
        otherDirectos += normalizeUnitPrice(item.priceOverride ?? item.basePrice, item.unit);
      } else {
        indirectos += normalizeUnitPrice(item.priceOverride ?? item.basePrice, item.unit);
      }
    }

    const monthlyUniforms = guards > 0
      ? (((uniformRotatingCost * uniformChangesPerYear) / 12) + uniformProratedCost) * guards : 0;

    const examEntriesPerYear = avgStayMonths > 0 ? 12 / avgStayMonths : 0;
    const examFrequency = Math.max(examEntriesPerYear, uniformChangesPerYear);
    const monthlyExams = guards > 0
      ? ((examSetCost * examFrequency) / 12) * guards : 0;

    const uniformSetCost = uniformRotatingCost + uniformProratedCost;
    const directos = monthlyUniforms + monthlyExams + otherDirectos;
    return {
      directos,
      indirectos,
      total: directos + indirectos,
      monthlyUniforms,
      monthlyExams,
      uniformSetCost,
      examSetCost,
    };
  }, [config.costItems, config.positions, config.uniformChangesPerYear, config.avgStayMonths, config.conditions?.contractDuration]);

  // ─── Position helpers ───
  const totalGuards = config.positions.reduce(
    (s, p) => s + (p.cantidad || 1) * (p.numPuestos || 1), 0
  );

  const applyTemplate = (template: ServiceTemplate) => {
    const newPositions: LeadPositionItem[] = template.positions.map((pos) => ({
      puestoTrabajoId: catalogDefaults?.puestoId,
      puesto: catalogDefaults?.puestoName || pos.name,
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
      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.error || `Error ${res.status} al generar descripción`);
      }
      const data = await res.json();
      if (data?.success && data.data?.description) {
        if (type === "company") update({ companyDescription: data.data.description });
        else update({ serviceDescription: data.data.description });
      } else {
        throw new Error(data?.error || "La IA no generó descripción");
      }
    } catch (err) {
      console.error("[Lead IA] Error generating description:", err);
    } finally {
      setter(false);
    }
  };

  // ─── Auto-generate AI descriptions when first position is added ───
  const autoGenTriggered = useRef(false);
  useEffect(() => {
    if (autoGenTriggered.current) return;
    if (config.positions.length === 0) return;
    if (config.companyDescription || config.serviceDescription) return;
    if (generatingCompany || generatingService) return;
    autoGenTriggered.current = true;
    const timer = setTimeout(() => {
      generateDescription("company");
      generateDescription("service");
    }, 800);
    return () => clearTimeout(timer);
  }, [config.positions.length, config.companyDescription, config.serviceDescription]); // eslint-disable-line react-hooks/exhaustive-deps

  const payrollPreviewSig = useMemo(
    () =>
      JSON.stringify({
        uf: ufValue ?? null,
        salaries: config.positions.map((p) => Number(p.baseSalary) || 550000),
      }),
    [config.positions, ufValue]
  );

  const [payrollPreview, setPayrollPreview] = useState<
    Array<{ employerCostPerGuard: number; netSalary: number }>
  >([]);

  useEffect(() => {
    if (config.positions.length === 0) {
      setPayrollPreview([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch("/api/crm/leads/employer-cost-preview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              positions: config.positions.map((p) => ({
                baseSalary: Number(p.baseSalary) || 550000,
              })),
              ufValue: ufValue ?? undefined,
            }),
          });
          const json = await res.json();
          if (cancelled || !json.success || !Array.isArray(json.data?.items)) return;
          setPayrollPreview(
            json.data.items.map(
              (it: { employerCostPerGuard: number; netSalary: number }) => ({
                employerCostPerGuard: it.employerCostPerGuard,
                netSalary: it.netSalary,
              })
            )
          );
        } catch {
          if (!cancelled) setPayrollPreview([]);
        }
      })();
    }, 320);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [payrollPreviewSig, config.positions.length, ufValue]);

  // ─── Quick estimate (mirrors CPQ compute-quote-costs; mano de obra = payroll engine) ───
  const estimate = useMemo(() => {
    const laborPayrollReady =
      payrollPreview.length === config.positions.length && config.positions.length > 0;

    const totalCostoManoObra = laborPayrollReady
      ? config.positions.reduce((sum, p, i) => {
          const per = payrollPreview[i].employerCostPerGuard;
          const guards = (p.cantidad || 1) * (p.numPuestos || 1);
          return sum + per * guards;
        }, 0)
      : 0;

    // Holiday adjustment (same as CPQ: (positions/30) * 0.5 * holidays/12 * (1+buffer%))
    const holidayAnnualCount = 12;
    const holidayBufferPct = 10;
    const holidayAdjustment = totalCostoManoObra > 0
      ? (totalCostoManoObra / 30) * 0.5 * (holidayAnnualCount / 12) * (1 + holidayBufferPct / 100)
      : 0;

    const totalLineas = config.additionalLines.reduce((sum, l) => {
      const base = Number(l.precio || 0) * Number(l.cantidad || 1);
      const m = Number(l.marginPct || 0);
      const venta = m > 0 && m < 100 ? base / (1 - m / 100) : base;
      return sum + (l.recurrencia === "unico" && config.conditions.contractDuration > 0 ? venta / config.conditions.contractDuration : venta);
    }, 0);

    const costosAdicionales = costTotals.total;
    // costsBase mirrors CPQ: labor + holidayAdj + all cost items
    const costoBase = totalCostoManoObra + holidayAdjustment + costosAdicionales;
    const marginPct = config.marginPercentage / 100;
    // laborCost = positions + holidays (same as CPQ)
    const laborCost = totalCostoManoObra + holidayAdjustment;
    const nonLaborCost = costosAdicionales;
    let baseConMargen: number;
    if (config.marginMode === "markup") {
      baseConMargen = costoBase * (1 + marginPct);
    } else if (config.marginMode === "margin_on_labor") {
      const laborWithMargin = marginPct < 1 ? laborCost / (1 - marginPct) : laborCost;
      baseConMargen = laborWithMargin + nonLaborCost;
    } else {
      baseConMargen = marginPct < 1 ? costoBase / (1 - marginPct) : costoBase;
    }
    const salePriceBaseManual = config.financialCosts.salePriceBase;
    const effectiveBase = salePriceBaseManual > 0 ? salePriceBaseManual : baseConMargen;
    const financiero = config.financialCosts.financialEnabled
      ? effectiveBase * (config.financialCosts.financialRatePct / 100)
      : 0;

    // Policy (same as CPQ)
    const policyEnabled = config.financialCosts.policyEnabled ?? false;
    const policyRatePct = (config.financialCosts.policyRatePct ?? 0) / 100;
    const policyContractMonths = config.financialCosts.policyContractMonths ?? 12;
    const policyContractPct = (config.financialCosts.policyContractPct ?? 100) / 100;
    const montoAnual = effectiveBase * policyContractMonths;
    const valorGarantia = montoAnual * policyContractPct;
    const poliza = policyEnabled && effectiveBase > 0
      ? (valorGarantia * policyRatePct) / 12 : 0;

    const marginAmount = baseConMargen - costoBase;
    const precioVenta = baseConMargen + financiero + poliza + totalLineas;
    const totalGuardias = config.positions.reduce((s, p) => s + (p.cantidad || 1) * (p.numPuestos || 1), 0);
    const totalPuestos = config.positions.reduce((s, p) => s + (p.numPuestos || 1), 0);
    return {
      manoDeObra: totalCostoManoObra,
      laborPayrollReady,
      holidayAdjustment,
      directos: costTotals.directos,
      indirectos: costTotals.indirectos,
      financiero,
      poliza,
      marginAmount,
      totalLineas,
      precioVenta,
      totalGuardias,
      totalPuestos,
      baseConMargen,
    };
  }, [config.positions, config.additionalLines, config.marginPercentage, config.marginMode, config.conditions.contractDuration, config.financialCosts, costTotals, payrollPreview]);

  return (
    <div className="space-y-2">
      {/* ── Nombre cotización + Moneda ── */}
      <div className="flex gap-2 items-end">
        <div className="flex-1 space-y-1">
          <Label className="text-[10px] text-muted-foreground">Nombre cotización</Label>
          <Input
            value={config.quoteName || ""}
            onChange={(e) => update({ quoteName: e.target.value })}
            className="h-7 text-xs"
            placeholder="Ej: Propuesta Control de Acceso"
          />
        </div>
        <div className="w-24 space-y-1">
          <Label className="text-[10px] text-muted-foreground">Moneda</Label>
          <select
            className="flex h-7 w-full rounded-md border border-border bg-card px-2 text-xs"
            value={config.currency || "CLP"}
            onChange={(e) => update({ currency: e.target.value as "CLP" | "UF" })}
          >
            <option value="CLP">CLP</option>
            <option value="UF">UF</option>
          </select>
        </div>
      </div>

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
              <div key={idx} className="rounded-md border border-border/60 bg-[#0a0a0a] p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold">{
                    (() => {
                      const pName = cpqPuestos.find(p => p.id === (pos.puestoTrabajoId || catalogDefaults?.puestoId))?.name;
                      const cName = cpqCargos.find(c => c.id === (pos.cargoId || catalogDefaults?.cargoId))?.name;
                      const rName = cpqRoles.find(r => r.id === (pos.rolId || catalogDefaults?.rolId))?.name;
                      const label = [pName, cName, rName].filter(Boolean).join(" · ");
                      return label || pos.puesto || `Posición ${idx + 1}`;
                    })()
                  }</span>
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
                <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
                  <div className="space-y-1">
                    <Label className="text-[10px]">Guardias</Label>
                    <select
                      className="flex h-7 w-full rounded-md border border-border/60 bg-[#1a1a1a] px-2 text-xs"
                      value={pos.cantidad || 1}
                      onChange={(e) => updatePosition(idx, { cantidad: Number(e.target.value) })}
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">N° Puestos</Label>
                    <select
                      className="flex h-7 w-full rounded-md border border-border/60 bg-[#1a1a1a] px-2 text-xs"
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
                      className="h-7 text-xs bg-[#1a1a1a] border-border/60"
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
                  <div className="space-y-1">
                    <Label className="text-[10px]">Inicio</Label>
                    <select
                      className="flex h-7 w-full rounded-md border border-border/60 bg-[#1a1a1a] px-2 text-xs font-mono"
                      value={pos.horaInicio || (pos.shiftType === "night" ? "20:00" : "08:00")}
                      onChange={(e) => updatePosition(idx, { horaInicio: e.target.value })}
                    >
                      {Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`).map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Término</Label>
                    <select
                      className="flex h-7 w-full rounded-md border border-border/60 bg-[#1a1a1a] px-2 text-xs font-mono"
                      value={pos.horaFin || (pos.shiftType === "night" ? "08:00" : "20:00")}
                      onChange={(e) => updatePosition(idx, { horaFin: e.target.value })}
                    >
                      {Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`).map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {/* Tipo de Puesto, Cargo, Rol */}
                {(cpqPuestos.length > 0 || cpqCargos.length > 0 || cpqRoles.length > 0) && (
                  <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                    {cpqPuestos.length > 0 && (
                      <div className="space-y-1">
                        <Label className="text-[10px]">Tipo de Puesto</Label>
                        <select
                          className="flex h-7 w-full rounded-md border border-border/60 bg-[#1a1a1a] px-2 text-xs"
                          value={pos.puestoTrabajoId || catalogDefaults?.puestoId || ""}
                          onChange={(e) => {
                            const selected = cpqPuestos.find((p) => p.id === e.target.value);
                            updatePosition(idx, { puestoTrabajoId: e.target.value, puesto: selected?.name || pos.puesto });
                          }}
                        >
                          <option value="">Seleccionar...</option>
                          {cpqPuestos.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </div>
                    )}
                    {cpqCargos.length > 0 && (
                      <div className="space-y-1">
                        <Label className="text-[10px]">Cargo</Label>
                        <select
                          className="flex h-7 w-full rounded-md border border-border/60 bg-[#1a1a1a] px-2 text-xs"
                          value={pos.cargoId || catalogDefaults?.cargoId || ""}
                          onChange={(e) => updatePosition(idx, { cargoId: e.target.value })}
                        >
                          <option value="">Seleccionar...</option>
                          {cpqCargos.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                    )}
                    {cpqRoles.length > 0 && (
                      <div className="space-y-1">
                        <Label className="text-[10px]">Rol</Label>
                        <select
                          className="flex h-7 w-full rounded-md border border-border/60 bg-[#1a1a1a] px-2 text-xs"
                          value={pos.rolId || catalogDefaults?.rolId || ""}
                          onChange={(e) => updatePosition(idx, { rolId: e.target.value })}
                        >
                          <option value="">Seleccionar...</option>
                          {cpqRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                )}
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
                  const guards = (pos.cantidad || 1) * (pos.numPuestos || 1);
                  const row = payrollPreview[idx];
                  if (!row) {
                    return (
                      <div className="text-[10px] text-muted-foreground">
                        Calculando costo empresa (nómina)…
                      </div>
                    );
                  }
                  const costoTotal = row.employerCostPerGuard * guards;
                  return (
                    <div className="text-[10px] space-y-0.5">
                      <div className="text-muted-foreground">
                        {pos.horaInicio}-{pos.horaFin} · {pos.cantidad || 1} guardia(s){(pos.numPuestos || 1) > 1 ? ` × ${pos.numPuestos} puestos = ${guards} guardias totales` : ""}
                      </div>
                      <div className="text-emerald-400 font-semibold">
                        Costo empresa: {formatCurrency(Math.round(costoTotal))}/mes
                        <span className="text-muted-foreground font-normal ml-1">
                          ({formatCurrency(Math.round(row.employerCostPerGuard))}/guardia)
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
              catalogItems={catalogItems}
              onToggleItem={toggleCostItem}
              onPriceChange={updateCostItemPrice}
              onTechnicalSpecsChange={updateCostItemSpecs}
              groupMonthlyOverrides={{
                "Uniformes": costTotals.monthlyUniforms,
                "Exámenes": costTotals.monthlyExams,
              }}
              uniformCalcParams={{
                uniformChangesPerYear: config.uniformChangesPerYear ?? 3,
                totalGuards,
                contractMonths: config.conditions?.contractDuration ?? 12,
              }}
            />
            {/* INDIRECTOS */}
            <CostCategoryBlock
              title="INDIRECTOS"
              total={costTotals.indirectos}
              groups={groupedCostsIndirect}
              costItems={config.costItems}
              catalogItems={catalogItems}
              onToggleItem={toggleCostItem}
              onPriceChange={updateCostItemPrice}
              onTechnicalSpecsChange={updateCostItemSpecs}
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
              onSaveToCatalog={async (payload) => {
                const res = await fetch("/api/cpq/catalog", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    type: payload.type || "other",
                    name: payload.name.trim(),
                    unit: payload.unit || "mes",
                    basePrice: payload.basePrice ?? 0,
                    isDefault: false,
                    active: true,
                  }),
                });
                const data = await res.json();
                if (!data?.success) throw new Error("Error al guardar");
              }}
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
              calculatedBase={estimate.baseConMargen}
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

      {/* ── Vista previa de la propuesta (PDF real) ── */}
      {config.positions.length > 0 && (
        <PdfPreviewSection
          leadId={leadId}
          config={config}
          accountName={accountName}
          installationName={installationName}
          proposalTemplates={proposalTemplates}
          ufValue={ufValue}
        />
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
              {!estimate.laborPayrollReady && (
                <div className="text-[10px] text-amber-500/90 font-medium">
                  Calculando mano de obra (motor nómina)…
                </div>
              )}
              <div className="text-[10px] text-muted-foreground">
                Precio de venta mensual · {estimate.totalPuestos} puesto(s) · {estimate.totalGuardias} guardia(s) · {config.marginPercentage}%
              </div>
            </div>
          </div>
          <div className="px-3 py-2 space-y-1">
            {[
              { label: "Mano de obra", value: estimate.manoDeObra, color: "bg-blue-500" },
              ...(estimate.holidayAdjustment > 0 ? [{ label: "Ajuste feriados", value: estimate.holidayAdjustment, color: "bg-blue-400" }] : []),
              { label: "Directos", value: estimate.directos, color: "bg-amber-500" },
              { label: "Indirectos", value: estimate.indirectos, color: "bg-orange-500" },
              { label: "Financiero", value: estimate.financiero, color: "bg-red-400" },
              ...(estimate.poliza > 0 ? [{ label: "Póliza", value: estimate.poliza, color: "bg-red-300" }] : []),
              { label: "Margen", value: estimate.marginAmount, color: "bg-emerald-500" },
              ...(estimate.totalLineas > 0 ? [{ label: "Líneas adicionales", value: estimate.totalLineas, color: "bg-purple-500" }] : []),
            ].map((row) => {
              const pct = estimate.precioVenta > 0 ? (row.value / estimate.precioVenta) * 100 : 0;
              const displayAmount =
                row.label === "Mano de obra" && !estimate.laborPayrollReady
                  ? "…"
                  : formatCurrency(Math.round(row.value));
              return (
                <div key={row.label} className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground w-24 shrink-0">{row.label}</span>
                  <div className="flex-1 min-w-0 h-2 rounded-full bg-muted/30 overflow-hidden">
                    <div className={cn("h-full rounded-full", row.color)} style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                  <span className="text-[10px] font-mono font-semibold text-right w-24 shrink-0">{displayAmount}</span>
                </div>
              );
            })}
          </div>
          <div className="px-3 py-1.5 border-t border-border/40 text-center">
            <p className="text-[9px] text-muted-foreground/70">
              Mano de obra con el mismo motor de nómina que CPQ (parámetros UF/UTM/IMM vigentes). Total actualizado al aprobar con la cotización generada.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ─── PDF Preview sub-component ─── */

const TEMPLATE_SLUGS = [
  { slug: "standard", label: "Estándar" },
  { slug: "detailed", label: "Detallado" },
  { slug: "tender", label: "Licitación" },
] as const;

type PdfPreviewMode = "cotizacion" | "presentacion";

function PdfPreviewSection({
  leadId,
  config,
  accountName,
  installationName,
  proposalTemplates,
  ufValue,
}: {
  leadId?: string;
  config: LeadCpqConfig;
  accountName?: string;
  installationName?: string;
  proposalTemplates?: { id: string; name: string; slug?: string }[];
  ufValue?: number | null;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [selectedSlug, setSelectedSlug] = useState("standard");
  const [mode, setMode] = useState<PdfPreviewMode>("cotizacion");

  const commonPayload = {
    accountName: accountName || "Cliente",
    installationName: installationName || "",
    positions: config.positions,
    costItems: config.costItems,
    additionalLines: config.additionalLines,
    marginPercentage: config.marginPercentage,
    marginMode: config.marginMode,
    financialCosts: config.financialCosts,
    companyDescription: config.companyDescription,
    serviceDescription: config.serviceDescription,
    conditions: config.conditions,
    uniformChangesPerYear: config.uniformChangesPerYear ?? 3,
    avgStayMonths: config.avgStayMonths ?? 4,
    currency: config.currency || "CLP",
    ...(ufValue != null && ufValue > 0 ? { ufValue } : {}),
  };

  const generatePreview = async () => {
    setPreviewLoading(true);
    try {
      const endpoint = mode === "presentacion"
        ? `/api/crm/leads/${leadId || "preview"}/proposal-preview`
        : `/api/crm/leads/${leadId || "preview"}/cpq-preview`;

      const payload = mode === "cotizacion"
        ? { ...commonPayload, templateSlug: selectedSlug }
        : commonPayload;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const blob = await res.blob();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (err) {
      console.error("[Lead PDF Preview]", err);
    } finally {
      setPreviewLoading(false);
    }
  };

  const switchMode = (m: PdfPreviewMode) => {
    setMode(m);
    setPreviewUrl(null);
  };

  return (
    <Card className="shadow-sm overflow-hidden">
      <div className="px-3 py-2 bg-muted/20 border-b border-border/40 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 mr-auto">
          <button
            type="button"
            onClick={() => switchMode("cotizacion")}
            className={cn(
              "h-7 sm:h-6 rounded-md px-2.5 text-[10px] sm:text-[9px] font-semibold border transition-colors flex items-center gap-1",
              mode === "cotizacion"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                : "border-transparent bg-muted/40 text-muted-foreground hover:bg-muted"
            )}
          >
            <RefreshCw className="h-3 w-3" />
            Cotización
          </button>
          <button
            type="button"
            onClick={() => switchMode("presentacion")}
            className={cn(
              "h-7 sm:h-6 rounded-md px-2.5 text-[10px] sm:text-[9px] font-semibold border transition-colors flex items-center gap-1",
              mode === "presentacion"
                ? "border-blue-500/40 bg-blue-500/10 text-blue-400"
                : "border-transparent bg-muted/40 text-muted-foreground hover:bg-muted"
            )}
          >
            <FileText className="h-3 w-3" />
            Presentación
          </button>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {mode === "cotizacion" && TEMPLATE_SLUGS.map((t) => (
            <button
              key={t.slug}
              type="button"
              onClick={() => { setSelectedSlug(t.slug); setPreviewUrl(null); }}
              className={cn(
                "h-7 sm:h-5 rounded px-2 text-[10px] sm:text-[9px] font-medium border transition-colors",
                selectedSlug === t.slug
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-transparent bg-muted/40 text-muted-foreground hover:bg-muted"
              )}
            >
              {t.label}
            </button>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="h-7 sm:h-5 text-[10px] sm:text-[9px] px-2 ml-1"
            disabled={previewLoading}
            onClick={generatePreview}
          >
            {previewLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            <span className="ml-1">Generar PDF</span>
          </Button>
        </div>
      </div>
      {previewUrl ? (
        <iframe
          src={previewUrl}
          className="w-full h-[400px] sm:h-[600px] bg-white"
          title={mode === "presentacion" ? "Preview presentación PDF" : "Preview propuesta PDF"}
        />
      ) : (
        <div className="flex items-center justify-center h-[200px] text-muted-foreground text-[11px]">
          {mode === "presentacion"
            ? "Click \"Generar PDF\" para ver la presentación técnica"
            : "Click \"Generar PDF\" para ver la vista previa real"}
        </div>
      )}
    </Card>
  );
}

/* ─── Cost Category Block sub-component ─── */

function buildUniformCalcTooltip(
  price: number,
  unit: string | null | undefined,
  logic: string,
  changesPerYear: number,
  guards: number,
  contractMonths: number
): string {
  if (guards === 0) return "Sin guardias en la cotización";
  if (logic === "prorated") {
    const monthlyPerGuard = normalizeUnitPrice(price, unit, contractMonths);
    const total = monthlyPerGuard * guards;
    const unitDesc = (unit || "").toLowerCase().includes("año") ? "÷ 12" : (unit || "").toLowerCase().includes("semestre") ? "÷ 6" : (unit || "").toLowerCase().includes("contrato") ? `÷ ${contractMonths}` : "";
    return `${formatCurrency(price)}${unitDesc ? ` ${unitDesc}` : ""} = ${formatCurrency(Math.round(monthlyPerGuard))}/guardia/mes → × ${guards} = ${formatCurrency(Math.round(total))}`;
  }
  const monthlyPerGuard = (price * changesPerYear) / 12;
  const total = monthlyPerGuard * guards;
  return `${formatCurrency(price)} × ${changesPerYear} cambios/año ÷ 12 = ${formatCurrency(Math.round(monthlyPerGuard))}/guardia/mes → × ${guards} = ${formatCurrency(Math.round(total))}`;
}

function CostCategoryBlock({
  title,
  total,
  groups,
  costItems,
  catalogItems = [],
  onToggleItem,
  onPriceChange,
  onTechnicalSpecsChange,
  groupMonthlyOverrides,
  uniformCalcParams,
}: {
  title: string;
  total: number;
  groups: Record<string, LeadCostItem[]>;
  costItems: LeadCostItem[];
  catalogItems?: { id: string; defaultTechnicalSpecs?: string | null; priceLogic?: string }[];
  onToggleItem: (id: string) => void;
  onPriceChange: (id: string, price: number) => void;
  onTechnicalSpecsChange?: (id: string, specs: string | null) => void;
  groupMonthlyOverrides?: Record<string, number>;
  uniformCalcParams?: { uniformChangesPerYear: number; totalGuards: number; contractMonths: number };
}) {
  const costGroupNames = Object.keys(groups);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(costGroupNames[0] ?? null);
  const catalogSpecsMap = useMemo(
    () => new Map(catalogItems.map((c) => [c.id, c.defaultTechnicalSpecs || null])),
    [catalogItems]
  );
  const catalogPriceLogicMap = useMemo(
    () => new Map(catalogItems.map((c) => [c.id, c.priceLogic ?? "uniform"])),
    [catalogItems]
  );

  return (
    <div className="rounded-md border border-border/40 overflow-hidden">
      <div className="px-2.5 py-1.5 bg-muted/20 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase text-muted-foreground">{title}</span>
        <span className="text-[11px] font-mono font-semibold text-muted-foreground">
          {formatCurrency(total)}
        </span>
      </div>
      {costGroupNames.map((groupName) => {
        const items = groups[groupName];
        const enabledItems = items.filter((i) => i.enabled);
        const enabledCount = enabledItems.length;
        const groupTotal = groupMonthlyOverrides?.[groupName]
          ?? enabledItems.reduce((s, i) => s + normalizeUnitPrice(i.priceOverride ?? i.basePrice, i.unit), 0);
        const disabledItems = items.filter((i) => !i.enabled);
        const isExpanded = expandedGroup === groupName;

        return (
          <div key={groupName} className="border-t border-border/20">
            <button
              type="button"
              onClick={() => setExpandedGroup(isExpanded ? null : groupName)}
              className="flex items-center justify-between w-full px-2.5 py-1.5 hover:bg-muted/10 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-base">{GROUP_ICON[groupName] ?? ""}</span>
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
              <div className="px-2.5 pb-2 space-y-2">
                <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-2">
                  {enabledItems.map((item) => {
                    const defaultSpecs = catalogSpecsMap.get(item.catalogItemId) || null;
                    const displaySpecs = item.technicalSpecs ?? defaultSpecs ?? "";
                    const logic = catalogPriceLogicMap.get(item.catalogItemId) ?? item.priceLogic ?? "uniform";
                    const effectivePrice = item.priceOverride ?? item.basePrice;
                    const calcTooltip = item.type === "uniform" && uniformCalcParams
                      ? buildUniformCalcTooltip(
                          effectivePrice,
                          item.unit,
                          logic,
                          uniformCalcParams.uniformChangesPerYear,
                          uniformCalcParams.totalGuards,
                          uniformCalcParams.contractMonths
                        )
                      : "";
                    return (
                      <div key={item.catalogItemId} className="p-2.5 rounded-lg bg-card border border-border/50 relative group">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[12px] font-semibold truncate">{item.name}</span>
                          <button
                            type="button"
                            onClick={() => onToggleItem(item.catalogItemId)}
                            className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 transition shrink-0"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                        <div
                          title={calcTooltip}
                          className={cn("text-[11px] text-muted-foreground mb-1.5 flex items-center gap-1 flex-wrap", calcTooltip && "cursor-help")}
                        >
                          <span className={cn(calcTooltip && "border-b border-dotted border-muted-foreground/50")}>
                            Base: {formatCurrency(item.basePrice)} / {item.unit === "año" ? "año" : item.unit === "semestre" ? "sem" : item.unit === "contrato" ? "contrato" : item.unit === "examen" ? "examen" : item.unit || "mes"}
                          </span>
                          {item.type === "uniform" && (
                            <span className={`px-1 py-0.5 rounded text-[9px] font-medium ${logic === "prorated" ? "bg-amber-500/15 text-amber-400" : "bg-sky-500/15 text-sky-400"}`}>
                              {logic === "prorated" ? "prorrateo" : "rotación"}
                            </span>
                          )}
                        </div>
                        <Input
                          type="text"
                          inputMode="numeric"
                          placeholder="Precio mensual"
                          value={formatNumber(item.priceOverride ?? item.basePrice)}
                          onChange={(e) => onPriceChange(item.catalogItemId, parseLocalizedNumber(e.target.value) || 0)}
                          className="h-7 text-xs"
                        />
                        {onTechnicalSpecsChange && (
                          <div className="mt-1.5 space-y-1">
                            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                              Especificaciones técnicas
                            </label>
                            <textarea
                              rows={2}
                              placeholder="Ej: Camioneta doble cabina 4x4..."
                              value={item.technicalSpecs ?? defaultSpecs ?? ""}
                              onChange={(e) => onTechnicalSpecsChange(item.catalogItemId, e.target.value || null)}
                              className="w-full rounded-md border border-border bg-muted/30 px-2 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {disabledItems.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {disabledItems.map((item) => (
                      <button
                        key={item.catalogItemId}
                        type="button"
                        onClick={() => onToggleItem(item.catalogItemId)}
                        className="h-6 rounded-md border border-dashed border-primary/30 px-2 text-[10px] text-primary hover:bg-primary/5 transition-colors"
                      >
                        + {item.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
      {costGroupNames.length === 0 && (
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
      financialEnabled: true,
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
    uniformChangesPerYear: 3,
    avgStayMonths: 4,
    quoteName: "",
    currency: "CLP",
  };
}
