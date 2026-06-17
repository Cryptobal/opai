"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatNumber, parseLocalizedNumber } from "@/lib/utils";
import { formatCurrency } from "@/components/cpq/utils";
import { CpqDualCurrencyAmount } from "@/components/cpq/CpqDualCurrency";
import {
  CPQ_BREAKDOWN_SHELL,
  CPQ_BREAKDOWN_ROW,
  cpqBreakdownAmount,
} from "@/components/cpq/cpqBreakdownLayout";
import { ChevronDown, Users, Plus, Copy, Trash2, Moon, Sun, Loader2, Sparkles } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import MarginSection from "@/components/cpq/MarginSection";
import { QuoteBreakdownPanel } from "@/components/cpq/QuoteBreakdownPanel";
import type { QuoteBreakdownData, PositionBreakdownItem } from "@/types/cpq-breakdown";
import { FinancialCostsSection, type FinancialCostsData } from "@/components/cpq/FinancialCostsSection";
import { AdditionalLinesSection, type AdditionalLineItem } from "@/components/cpq/AdditionalLinesSection";
import { CommercialConditionsSection, type CommercialConditionsData } from "@/components/cpq/CommercialConditionsSection";
import {
  CpqPdfPreviewPanel,
  type CpqPdfPreviewMode,
  type CpqPdfTemplateSlug,
} from "@/components/cpq/CpqPdfPreviewPanel";
import type { MarginMode } from "@/types/cpq";
import { AiErrorDialog, type AiErrorPayload } from "@/components/ai/AiErrorDialog";
import { PositionMatrix } from "@/components/cpq/position-matrix";
import { usePositionMatrixLead } from "@/components/cpq/position-matrix/usePositionMatrixLead";

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

  /** Agrupación de servicio (persistida dentro del JSON config del Lead). */
  serviceGroupKey?: string;
  serviceGroupName?: string;
  serviceGroupPattern?: "24-7" | "12-7-dia" | "12-7-noche" | "12-7-finde" | "5x2-dia" | "custom";
  serviceGroupOrder?: number;
  serviceGroupIcon?: string;
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
  /** Si no es true, `quoteName` se iguala al nombre de la instalación hasta que el usuario edite el campo. */
  quoteNameUnlinked?: boolean;
  currency?: "CLP" | "UF";
}

/** Moneda por defecto en borradores de lead (CPQ embebido). */
export const DEFAULT_LEAD_CPQ_CURRENCY: "CLP" | "UF" = "UF";

export interface CpqCatalogOption {
  id: string;
  name: string;
  colorHex?: string | null;
  /** Sueldo bruto sugerido (CLP). Solo aplica a roles. */
  salary?: number | null;
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

  // Ref to always access the latest config inside async callbacks (avoids stale closures)
  const configRef = useRef(config);
  configRef.current = config;

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
          // Usar configRef.current para obtener el config más reciente (evita stale closure
          // cuando el parent restaura cpqConfigs desde metadata después del mount inicial).
          const currentConfig = configRef.current;
          // Hidratar costItems existentes y agregar ítems nuevos del catálogo en leads ya creados.
          const catalogById = new Map(res.data.map((c: any) => [c.id, c]));
          const hydrated: LeadCostItem[] = currentConfig.costItems.map((item) => {
            const def = catalogById.get(item.catalogItemId) as
              | { defaultTechnicalSpecs?: string | null; priceLogic?: string; unit?: string; type?: string; name?: string; basePrice?: number }
              | undefined;
            if (!def) return item;
            const specs =
              item.technicalSpecs ??
              (def.defaultTechnicalSpecs != null ? toTechnicalSpecs(def.defaultTechnicalSpecs) : null);
            const priceLogic = def.priceLogic ?? item.priceLogic ?? "uniform";
            const unit = def.unit ?? item.unit;
            const catalogPrice = Number(def.basePrice);
            return {
              ...item,
              name: def.name ?? item.name,
              type: def.type ?? item.type,
              // Usar precio del catálogo siempre que sea un número válido (incluyendo 0 intencional).
              // Solo caer en item.basePrice si el catálogo no tiene precio definido.
              basePrice: !Number.isNaN(catalogPrice) ? catalogPrice : item.basePrice,
              unit,
              technicalSpecs: specs ?? item.technicalSpecs,
              priceLogic,
            };
          });

          const enabledTypes = new Set<string>();
          for (const g of currentConfig.selectedCostGroups) {
            const types = COST_GROUP_TYPES_MAP[g];
            if (types) types.forEach((t) => enabledTypes.add(t));
          }

          const existingIds = new Set(hydrated.map((item) => item.catalogItemId));
          const missingCatalogItems: LeadCostItem[] = res.data
            .filter((item: any) => !existingIds.has(item.id))
            .map((item: any) => {
              const bp = Number(item.basePrice);
              return {
                catalogItemId: item.id,
                name: item.name,
                type: item.type,
                unit: item.unit,
                basePrice: !Number.isNaN(bp) ? bp : 0,
                priceOverride: null,
                enabled: Boolean(item.isDefault) && enabledTypes.has(item.type),
                technicalSpecs: toTechnicalSpecs(item.defaultTechnicalSpecs) ?? null,
                priceLogic: item.priceLogic ?? "uniform",
              };
            });

          const merged = [...hydrated, ...missingCatalogItems];
          const changed =
            merged.length !== currentConfig.costItems.length ||
            hydrated.some(
              (h, i) =>
                h.name !== currentConfig.costItems[i]?.name ||
                h.type !== currentConfig.costItems[i]?.type ||
                h.basePrice !== currentConfig.costItems[i]?.basePrice ||
                h.technicalSpecs !== currentConfig.costItems[i]?.technicalSpecs ||
                h.priceLogic !== currentConfig.costItems[i]?.priceLogic ||
                h.unit !== currentConfig.costItems[i]?.unit
            );

          if (changed) {
            // Usar configRef.current para preservar el resto del config (positions, margin, etc.)
            onChange({ ...configRef.current, costItems: merged });
          }
        }
      })
      .catch(() => {});
  }, [catalogLoaded]); // eslint-disable-line react-hooks/exhaustive-deps
  const [secLineas, setSecLineas] = useState(true);
  const [secFinancieros, setSecFinancieros] = useState(true);
  const [secMargen, setSecMargen] = useState(true);
  const [secCondiciones, setSecCondiciones] = useState(true);
  const [secDescripciones, setSecDescripciones] = useState(true);
  const [secDesglose, setSecDesglose] = useState(true);
  const [secPdf, setSecPdf] = useState(true);
  const [generatingCompany, setGeneratingCompany] = useState(false);
  const [generatingService, setGeneratingService] = useState(false);
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiError, setAiError] = useState<AiErrorPayload | null>(null);
  const aiAutoFailedRef = useRef(false);

  // Usa configRef.current (no el config del closure) para evitar que dos updates
  // secuenciales (ej: companyDescription + serviceDescription) se pisen entre sí.
  const update = (patch: Partial<LeadCpqConfig>) => onChange({ ...configRef.current, ...patch });

  const currency = config.currency ?? DEFAULT_LEAD_CPQ_CURRENCY;

  // Borradores antiguos: si cotización ≠ instalación, no sobrescribir con el nombre de instalación
  const quoteMigrateRef = useRef(false);
  useEffect(() => {
    if (quoteMigrateRef.current) return;
    const q = (config.quoteName || "").trim();
    const ins = (installationName || "").trim();
    if (q && ins && q !== ins && config.quoteNameUnlinked !== true) {
      quoteMigrateRef.current = true;
      onChange({ ...config, quoteNameUnlinked: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot; onChange/config omitidos a propósito
  }, [installationName, config.quoteName, config.quoteNameUnlinked]);

  // Mantener nombre cotización = nombre instalación mientras vayan vinculados
  useEffect(() => {
    if (config.quoteNameUnlinked) return;
    const ins = installationName ?? "";
    if ((config.quoteName || "") === ins) return;
    onChange({ ...config, quoteName: ins });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reacciona solo a installationName / quoteNameUnlinked; evitar bucle con quoteName
  }, [installationName, config.quoteNameUnlinked]);

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
        examSetCost += normalizeUnitPrice(item.priceOverride ?? item.basePrice, item.unit, contractMonths);
      } else if (cat.category === "direct") {
        otherDirectos += normalizeUnitPrice(item.priceOverride ?? item.basePrice, item.unit, contractMonths);
      } else {
        indirectos += normalizeUnitPrice(item.priceOverride ?? item.basePrice, item.unit, contractMonths);
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

  // ─── Cost group toggle ───
  const toggleCostGroup = (id: string) => {
    const isAdding = !config.selectedCostGroups.includes(id);
    const groups = isAdding
      ? [...config.selectedCostGroups, id]
      : config.selectedCostGroups.filter((g) => g !== id);

    // Al activar/desactivar un grupo, habilitar/deshabilitar sus ítems de costo correspondientes
    const types = COST_GROUP_TYPES_MAP[id];
    if (types) {
      const typeSet = new Set(types);
      const items = config.costItems.map((item) => {
        if (!typeSet.has(item.type)) return item;
        return { ...item, enabled: isAdding };
      });
      update({ selectedCostGroups: groups, costItems: items });
    } else {
      update({ selectedCostGroups: groups });
    }
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
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (data?.code) {
          aiAutoFailedRef.current = true;
          setAiError({
            code: data.code,
            message: data.error,
            providerType: data.providerType,
          });
          return;
        }
        throw new Error(data?.error || `Error ${res.status} al generar descripción`);
      }
      if (data?.success && data.data?.description) {
        if (type === "company") update({ companyDescription: data.data.description });
        else update({ serviceDescription: data.data.description });
      } else {
        throw new Error(data?.error || "La IA no generó descripción");
      }
    } catch (err) {
      console.error("[Lead IA] Error generating description:", err);
      aiAutoFailedRef.current = true;
      setAiError({
        code: "AI_PROVIDER_ERROR",
        message: err instanceof Error ? err.message : "Error inesperado",
      });
    } finally {
      setter(false);
    }
  };

  // ─── Auto-generate AI descriptions when first position is added ───
  const autoGenTriggered = useRef(false);
  useEffect(() => {
    if (autoGenTriggered.current) return;
    if (aiAutoFailedRef.current) return;
    if (config.positions.length === 0) return;
    if (config.companyDescription || config.serviceDescription) return;
    if (generatingCompany || generatingService) return;
    autoGenTriggered.current = true;
    const timer = setTimeout(async () => {
      await generateDescription("company");
      if (!aiAutoFailedRef.current) {
        await generateDescription("service");
      }
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.positions.length, config.companyDescription, config.serviceDescription]);

  const payrollPreviewSig = useMemo(
    () =>
      JSON.stringify({
        uf: ufValue ?? null,
        salaries: config.positions.map((p) => Number(p.baseSalary) || 550000),
        n: config.positions.length,
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

  const leadAdapter = usePositionMatrixLead({
    config,
    update,
    cpqPuestos,
    cpqCargos,
    cpqRoles,
    catalogDefaults,
    payrollPreview,
    ufValue,
    currency,
  });

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
      <div className="flex flex-col gap-2 sm:flex-row sm:gap-3 sm:items-end">
        <div className="flex-1 space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Label className="text-[10px] text-muted-foreground">Nombre cotización</Label>
            {config.quoteNameUnlinked ? (
              <button
                type="button"
                className="text-[10px] text-primary hover:underline"
                onClick={() => update({ quoteName: installationName || "", quoteNameUnlinked: false })}
              >
                Igualar al nombre de instalación
              </button>
            ) : (
              <span className="text-[10px] text-muted-foreground">(sigue al nombre de instalación)</span>
            )}
          </div>
          <Input
            value={config.quoteName ?? ""}
            onChange={(e) => update({ quoteName: e.target.value, quoteNameUnlinked: true })}
            className="h-7 text-xs"
            placeholder={installationName?.trim() ? installationName : "Ej: Propuesta Control de Acceso"}
          />
        </div>
        <div className="shrink-0 space-y-1">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Moneda</Label>
          <div className="flex gap-0.5">
            {(["UF", "CLP"] as const).map((cur) => (
              <button
                key={cur}
                type="button"
                onClick={() => update({ currency: cur })}
                className={cn(
                  "rounded-md px-3 h-7 text-xs font-medium border transition-colors",
                  currency === cur
                    ? "bg-primary/15 text-primary border-primary/30"
                    : "bg-background text-muted-foreground border-input hover:bg-accent/50",
                )}
              >
                {cur}
              </button>
            ))}
          </div>
        </div>
      </div>

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

      {/* ── Precio venta mensual (ancla visual; el desglose detallado vive más abajo) ── */}
      {config.positions.length > 0 && (
        <Card className="shadow-sm overflow-hidden border-status-ok-border bg-status-ok-soft">
          <div className="px-3 py-3 text-center">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-status-ok-fg">
              Precio Venta Mensual
            </div>
            <CpqDualCurrencyAmount
              clp={estimate.precioVenta}
              currency={currency}
              ufValue={ufValue}
              size="lg"
              primaryClassName="text-foreground"
              secondaryClassName="text-status-ok-fg/80"
              align="center"
            />
            <div className="mt-2 flex items-center justify-center gap-3 text-xs text-muted-foreground">
              <span>Margen {config.marginPercentage}%</span>
              {config.financialCosts.financialEnabled && config.financialCosts.financialRatePct > 0 && (
                <span>Financiero {config.financialCosts.financialRatePct}%</span>
              )}
            </div>
          </div>
        </Card>
      )}

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
          <div className="px-3 pb-3">
            <PositionMatrix adapter={leadAdapter} />
          </div>
        )}
      </Card>

      {/* ── Costos adicionales (acordeón con ítems reales del catálogo) ── */}
      <Card className="shadow-sm overflow-hidden">
        <button type="button" onClick={() => setSecCostos((v) => !v)} className="flex items-center justify-between w-full px-3 py-2.5 hover:bg-muted/10 transition-colors">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-bold shrink-0">Costos adicionales</h2>
            {!secCostos && costTotals.total > 0 && (
              <span className="text-[11px] text-muted-foreground inline-flex items-baseline gap-1.5">
                <CpqDualCurrencyAmount
                  clp={costTotals.total}
                  currency={currency}
                  ufValue={ufValue}
                  size="xs"
                  inline
                  primaryClassName="text-status-warn-fg font-semibold"
                />
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
              displayCurrency={currency}
              ufValue={ufValue}
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
              displayCurrency={currency}
              ufValue={ufValue}
            />
            <div className={cn(CPQ_BREAKDOWN_ROW, "pt-1 border-t border-status-warn-border text-xs")}>
              <span className="text-[11px] font-medium text-status-warn-fg break-words min-w-0">Total costos adicionales</span>
              <div className={cpqBreakdownAmount()}>
                <CpqDualCurrencyAmount
                  clp={costTotals.total}
                  currency={currency}
                  ufValue={ufValue}
                  size="sm"
                  primaryClassName="text-status-warn-fg font-bold"
                />
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* ── Desglose detallado (mismo QuoteBreakdownPanel que CPQ) ── */}
      {config.positions.length > 0 && (() => {
        const monthlyHoursStandard = 180;
        const totalLaborCost = estimate.manoDeObra;
        const totalPositionCosts = totalLaborCost;
        const fallback = config.positions.length > 0 ? 1 / config.positions.length : 0;
        const salePriceNoLines = estimate.precioVenta - estimate.totalLineas;

        const positionItems: PositionBreakdownItem[] = config.positions.map((pos, idx) => {
          const guards = (pos.cantidad || 1) * (pos.numPuestos || 1);
          const perGuard = payrollPreview[idx]?.employerCostPerGuard ?? 0;
          const costClp = perGuard * guards;
          const proportion = totalPositionCosts > 0 ? costClp / totalPositionCosts : fallback;
          const salePrice = salePriceNoLines * proportion;

          const baseSalary = (pos.baseSalary || 550000) * guards;

          return {
            id: `lead-pos-${idx}`,
            name: (() => {
              const pName = cpqPuestos.find(p => p.id === (pos.puestoTrabajoId || catalogDefaults?.puestoId))?.name;
              const cName = cpqCargos.find(c => c.id === (pos.cargoId || catalogDefaults?.cargoId))?.name;
              const rName = cpqRoles.find(r => r.id === (pos.rolId || catalogDefaults?.rolId))?.name;
              const label = [pName, cName, rName].filter(Boolean).join(" · ");
              return label || pos.puesto || `Posición ${idx + 1}`;
            })(),
            numGuards: pos.cantidad || 1,
            numPuestos: pos.numPuestos || 1,
            totalGuardsInPosition: guards,
            baseSalary,
            gratification: 0,
            totalImponible: baseSalary,
            sisEmployer: 0,
            afcEmployer: 0,
            mutualEmployer: 0,
            vacationProvision: 0,
            severanceProvision: 0,
            totalLaborCost: costClp,
            netSalaryPerGuard:
              payrollPreview[idx]?.netSalary != null &&
              Number.isFinite(Number(payrollPreview[idx].netSalary)) &&
              Number(payrollPreview[idx].netSalary) >= 0
                ? Math.round(Number(payrollPreview[idx].netSalary))
                : null,
            salePrice,
            hourlyRateSale: guards > 0 && monthlyHoursStandard > 0 ? salePrice / (guards * monthlyHoursStandard) : 0,
          };
        });

        const subtotalBase = estimate.manoDeObra + estimate.holidayAdjustment + costTotals.total;

        const breakdownData: QuoteBreakdownData = {
          positions: positionItems,
          totalLaborCost: estimate.manoDeObra,
          holidayAdjustment: estimate.holidayAdjustment,
          uniforms: costTotals.monthlyUniforms,
          exams: costTotals.monthlyExams,
          meals: 0,
          vehicles: 0,
          infrastructure: 0,
          equipment: 0,
          transport: 0,
          systems: 0,
          other: costTotals.indirectos,
          subtotalBase,
          marginPct: config.marginPercentage,
          marginAmount: estimate.marginAmount,
          financial: estimate.financiero,
          financialRatePct: config.financialCosts.financialEnabled ? config.financialCosts.financialRatePct : 0,
          policy: estimate.poliza,
          policyRatePct: config.financialCosts.policyEnabled ? (config.financialCosts.policyRatePct ?? 0) : 0,
          totalSalePrice: salePriceNoLines,
          additionalLines: estimate.totalLineas,
          grandTotal: estimate.precioVenta,
          monthlyHoursStandard,
          currency,
          ufValue: ufValue ?? undefined,
        };

        return (
          <Card className="shadow-sm overflow-hidden">
            <button
              type="button"
              onClick={() => setSecDesglose((v) => !v)}
              className="flex items-center justify-between w-full px-3 py-2.5 hover:bg-muted/10 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="text-sm font-bold shrink-0">Desglose</h2>
                {!secDesglose && (
                  <span className="text-[11px] text-muted-foreground inline-flex items-baseline gap-1.5">
                    <CpqDualCurrencyAmount
                      clp={estimate.precioVenta}
                      currency={currency}
                      ufValue={ufValue}
                      size="xs"
                      inline
                      primaryClassName="text-status-ok-fg font-semibold"
                    />
                  </span>
                )}
              </div>
              <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", secDesglose && "rotate-180")} />
            </button>
            {secDesglose && (
              <>
                <div className="px-3 pb-3">
                  <QuoteBreakdownPanel data={breakdownData} variant="default" />
                </div>
                {!estimate.laborPayrollReady && (
                  <div className="px-3 pb-2 text-[10px] text-status-warn-fg/90 font-medium text-center">
                    Calculando mano de obra (motor nómina)…
                  </div>
                )}
              </>
            )}
          </Card>
        );
      })()}

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

      {/* ── PDF y documentos (vista previa real) ── */}
      {config.positions.length > 0 && (
        <Card className="shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setSecPdf((v) => !v)}
            className="flex items-center justify-between w-full px-3 py-2.5 hover:bg-muted/10 transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="text-sm font-bold shrink-0">PDF y documentos</h2>
              {!secPdf && (
                <span className="text-[11px] text-muted-foreground">Vista previa disponible</span>
              )}
            </div>
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", secPdf && "rotate-180")} />
          </button>
          {secPdf && (
            <div className="px-3 pb-3">
              <PdfPreviewSection
                leadId={leadId}
                config={config}
                accountName={accountName}
                installationName={installationName}
                proposalTemplates={proposalTemplates}
                ufValue={ufValue}
              />
            </div>
          )}
        </Card>
      )}

      <AiErrorDialog error={aiError} onClose={() => setAiError(null)} />
    </div>
  );
}

/* ─── PDF Preview sub-component ─── */

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
  const [selectedSlug, setSelectedSlug] = useState<CpqPdfTemplateSlug>("standard");
  const [mode, setMode] = useState<CpqPdfPreviewMode>("presentacion");

  const commonPayload = {
    accountName: accountName || "Cliente",
    installationName: installationName || "",
    quoteName: config.quoteName?.trim() || undefined,
    quoteCode: "Borrador",
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
    currency: config.currency ?? DEFAULT_LEAD_CPQ_CURRENCY,
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

  const switchMode = (m: CpqPdfPreviewMode) => {
    setMode(m);
    setPreviewUrl(null);
  };

  return (
    <CpqPdfPreviewPanel
      mode={mode}
      templateSlug={selectedSlug}
      previewUrl={previewUrl}
      loading={previewLoading}
      onModeChange={switchMode}
      onTemplateSlugChange={(slug) => {
        setSelectedSlug(slug);
        setPreviewUrl(null);
      }}
      onGenerate={generatePreview}
      className="shadow-sm"
      previewClassName={previewUrl ? "h-[400px] sm:h-[600px]" : "h-[200px] text-[12px]"}
      emptyCotizacionText="Click en Generar PDF para ver la vista previa de la cotización"
    />
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
  displayCurrency = "CLP",
  ufValue = null,
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
  displayCurrency?: string;
  ufValue?: number | null;
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
    <div className={cn("rounded-md border border-border/40 overflow-hidden", CPQ_BREAKDOWN_SHELL)}>
      <div className={cn(CPQ_BREAKDOWN_ROW, "px-2.5 py-1.5 bg-muted/20 text-xs")}>
        <span className="text-[11px] font-semibold uppercase text-muted-foreground break-words min-w-0">
          {title}
        </span>
        <div className={cpqBreakdownAmount()}>
          <CpqDualCurrencyAmount
            clp={total}
            currency={displayCurrency}
            ufValue={ufValue}
            size="xs"
            primaryClassName="text-muted-foreground font-semibold"
          />
        </div>
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
              className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-4 items-center px-2.5 py-1.5 hover:bg-muted/10 transition-colors text-left"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base shrink-0">{GROUP_ICON[groupName] ?? ""}</span>
                <span className={cn("text-xs break-words", enabledCount > 0 ? "text-foreground font-medium" : "text-muted-foreground")}>
                  {groupName}{enabledCount > 0 ? ` (${enabledCount})` : ""}
                </span>
              </div>
              <div className="flex items-center gap-2 justify-end shrink-0">
                <div className={cpqBreakdownAmount()}>
                  <CpqDualCurrencyAmount
                    clp={groupTotal}
                    currency={displayCurrency}
                    ufValue={ufValue}
                    size="xs"
                    primaryClassName="text-muted-foreground"
                  />
                </div>
                <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition-transform shrink-0", isExpanded && "rotate-180")} />
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
                          <span className={cn("inline-flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5", calcTooltip && "border-b border-dotted border-muted-foreground/50")}>
                            <span>Base:</span>
                            <CpqDualCurrencyAmount
                              clp={item.basePrice}
                              currency={displayCurrency}
                              ufValue={ufValue}
                              size="xs"
                              inline
                              primaryClassName="text-muted-foreground"
                            />
                            <span>
                              / {item.unit === "año" ? "año" : item.unit === "semestre" ? "sem" : item.unit === "contrato" ? "contrato" : item.unit === "examen" ? "examen" : item.unit || "mes"}
                            </span>
                          </span>
                          {item.type === "uniform" && (
                            <span className={`px-1 py-0.5 rounded text-[9px] font-medium ${logic === "prorated" ? "bg-status-warn-soft text-status-warn-fg" : "bg-status-info-soft text-status-info-fg"}`}>
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
    currency: DEFAULT_LEAD_CPQ_CURRENCY,
  };
}
