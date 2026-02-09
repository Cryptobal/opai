/**
 * Panel de costos adicionales CPQ
 */

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KpiCard } from "@/components/opai";
import { formatCurrency } from "@/components/cpq/utils";
import { formatNumber, parseLocalizedNumber } from "@/lib/utils";
import type {
  CpqCatalogItem,
  CpqQuoteCostItem,
  CpqQuoteCostSummary,
  CpqQuoteExamItem,
  CpqQuoteInfrastructure,
  CpqQuoteMeal,
  CpqQuoteParameters,
  CpqQuoteUniformItem,
  CpqQuoteVehicle,
} from "@/types/cpq";
import { ChevronDown, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface CpqQuoteCostsProps {
  quoteId: string;
  variant?: "modal" | "inline";
  showFinancial?: boolean;
}

const DEFAULT_PARAMS: CpqQuoteParameters = {
  monthlyHoursStandard: 180,
  avgStayMonths: 4,
  uniformChangesPerYear: 3,
  financialRatePct: 0,
  salePriceMonthly: 0,
  policyRatePct: 0,
  policyAdminRatePct: 0,
  policyContractMonths: 12,
  policyContractPct: 100,
  contractMonths: 12,
  contractAmount: 0,
  marginPct: 20,
};

const OPERATIONAL_TYPES = ["phone", "radio", "flashlight"];
const TRANSPORT_TYPES = ["transport"];
const VEHICLE_TYPES = ["vehicle_rent", "vehicle_fuel", "vehicle_tag"];
const INFRA_TYPES = ["infrastructure", "fuel"];
const FINANCIAL_TYPES = ["financial", "policy"];

const toNumber = (value: string) => parseLocalizedNumber(value);

const normalizeCostItems = (items: CpqQuoteCostItem[]) =>
  items.map((item) => ({
    ...item,
    quantity: Number(item.quantity ?? 1),
    unitPriceOverride: item.unitPriceOverride ?? null,
  }));

export function CpqQuoteCosts({
  quoteId,
  variant = "modal",
  showFinancial = true,
}: CpqQuoteCostsProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<"directos" | "indirectos" | "financieros">("directos");
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    uniforms: true,
    exams: true,
    meals: true,
    operational: true,
    transport: true,
    vehicles: true,
    infrastructure: true,
    systems: true,
    financials: true,
  });
  const [decimalDrafts, setDecimalDrafts] = useState<Record<string, string>>({});
  const [catalog, setCatalog] = useState<CpqCatalogItem[]>([]);
  const [summary, setSummary] = useState<CpqQuoteCostSummary | null>(null);
  const [parameters, setParameters] = useState<CpqQuoteParameters>(DEFAULT_PARAMS);
  const [uniforms, setUniforms] = useState<CpqQuoteUniformItem[]>([]);
  const [exams, setExams] = useState<CpqQuoteExamItem[]>([]);
  const [costItems, setCostItems] = useState<CpqQuoteCostItem[]>([]);
  const [meals, setMeals] = useState<CpqQuoteMeal[]>([]);
  const [vehicles, setVehicles] = useState<CpqQuoteVehicle[]>([]);
  const [infrastructure, setInfrastructure] = useState<CpqQuoteInfrastructure[]>([]);
  const defaultsApplied = useRef(false);
  const inputClass =
    "h-10 bg-card text-foreground border-border placeholder:text-muted-foreground";
  const sectionBoxClass = "rounded-md border border-border bg-muted/20 p-3 sm:p-2";
  const isInline = variant === "inline";
  const getDecimalValue = (
    key: string,
    value: number | null | undefined,
    decimals = 2,
    allowEmpty = false
  ) => {
    if (Object.prototype.hasOwnProperty.call(decimalDrafts, key)) {
      return decimalDrafts[key];
    }
    if (allowEmpty && (value === null || value === undefined)) return "";
    return formatNumber(Number(value ?? 0), { minDecimals: decimals, maxDecimals: decimals });
  };
  const setDecimalValue = (key: string, value: string) => {
    setDecimalDrafts((prev) => ({ ...prev, [key]: value }));
  };
  const clearDecimalValue = (key: string) => {
    setDecimalDrafts((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, key)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const loadData = async () => {
    setLoading(true);
    setDecimalDrafts({});
    try {
      const [costsRes, catalogRes, settingsRes] = await Promise.all([
        fetch(`/api/cpq/quotes/${quoteId}/costs`),
        fetch("/api/cpq/catalog?active=true"),
        fetch("/api/cpq/settings"),
      ]);
      const costsData = await costsRes.json();
      const catalogData = await catalogRes.json();
      const settingsData = await settingsRes.json();

      if (catalogData?.success) {
        setCatalog(catalogData.data || []);
      }
      if (costsData?.success) {
        const payload = costsData.data || {};
        setSummary(payload.summary || null);
        const globalDefaults = settingsData?.success ? settingsData.data : {};
        setParameters({
          ...DEFAULT_PARAMS,
          ...globalDefaults,
          ...(payload.parameters || {}),
        });
        setUniforms(payload.uniforms || []);
        setExams(payload.exams || []);
        setCostItems(normalizeCostItems(payload.costItems || []));
        setMeals(payload.meals || []);
        setVehicles(payload.vehicles || []);
        setInfrastructure(payload.infrastructure || []);
      }
    } catch (err) {
      console.error("Error loading CPQ costs:", err);
    } finally {
      setLoading(false);
    }
  };

  const findCostItem = (catalogItemId: string) =>
    costItems.find((item) => item.catalogItemId === catalogItemId);

  const upsertCostItem = (catalogItem: CpqCatalogItem, patch: Partial<CpqQuoteCostItem>) => {
    setCostItems((prev) => {
      const existing = prev.find((item) => item.catalogItemId === catalogItem.id);
      if (existing) {
        return prev.map((item) =>
          item.catalogItemId === catalogItem.id ? { ...item, ...patch } : item
        );
      }
      return [
        ...prev,
        {
          catalogItemId: catalogItem.id,
          calcMode: "per_month",
          quantity: 1,
          unitPriceOverride: null,
          isEnabled: true,
          visibility: catalogItem.defaultVisibility || "visible",
          notes: "",
          catalogItem,
          ...patch,
        },
      ];
    });
  };

  const updateMeal = (mealType: string, patch: Partial<CpqQuoteMeal>) => {
    setMeals((prev) => {
      const index = prev.findIndex(
        (meal) => meal.mealType.toLowerCase() === mealType.toLowerCase()
      );
      if (index >= 0) {
        return prev.map((meal, i) => (i === index ? { ...meal, ...patch } : meal));
      }
      return [
        ...prev,
        {
          mealType,
          mealsPerDay: 0,
          daysOfService: 0,
          priceOverride: null,
          isEnabled: false,
          visibility: "visible",
          ...patch,
        },
      ];
    });
  };

  const handleAddOtherItem = async (payload: { name: string; unit: string; basePrice: number }) => {
    if (!payload.name.trim()) {
      toast.error("Escribe el nombre del ítem");
      return;
    }
    try {
      const res = await fetch("/api/cpq/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "other",
          name: payload.name.trim(),
          unit: payload.unit.trim() || "mes",
          basePrice: payload.basePrice ?? 0,
          isDefault: false,
          active: true,
        }),
      });
      const data = await res.json();
      if (data?.success) {
        setCatalog((prev) => [...prev, data.data]);
        upsertCostItem(data.data, { isEnabled: true });
        toast.success("Ítem agregado");
        return;
      }
      toast.error("No se pudo agregar el ítem");
    } catch (err) {
      console.error("Error creating other cost item:", err);
      toast.error("No se pudo agregar el ítem");
    }
  };


  const handleSave = async (options?: { close?: boolean }) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/cpq/quotes/${quoteId}/costs`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parameters,
          uniforms,
          exams,
          costItems,
          meals,
          vehicles,
          infrastructure,
        }),
      });
      const data = await res.json();
      if (data?.success) {
        setSummary(data.data);
        if (options?.close !== false) setOpen(false);
        toast.success("Costos guardados");
        return;
      }
      toast.error("No se pudieron guardar los costos");
    } catch (err) {
      console.error("Error saving CPQ costs:", err);
      toast.error("No se pudieron guardar los costos");
    } finally {
      setSaving(false);
    }
  };


  useEffect(() => {
    loadData();
  }, [quoteId]);

  useEffect(() => {
    if (open || isInline) {
      defaultsApplied.current = false;
      loadData();
      setActiveSection("directos");
    }
  }, [open, isInline]);

  useEffect(() => {
    defaultsApplied.current = false;
  }, [quoteId]);

  useEffect(() => {
    if (!showFinancial && activeSection === "financieros") {
      setActiveSection("directos");
    }
  }, [showFinancial, activeSection]);

  useEffect(() => {
    if (open || isInline) {
      setCollapsedSections({
        uniforms: true,
        exams: true,
        meals: true,
        operational: true,
        transport: true,
        vehicles: true,
        infrastructure: true,
        systems: true,
        financials: true,
      });
    }
  }, [open, isInline, quoteId]);

  const catalogByType = useMemo(() => {
    const grouped: Record<string, CpqCatalogItem[]> = {};
    for (const item of catalog) {
      grouped[item.type] = grouped[item.type] || [];
      grouped[item.type].push(item);
    }
    return grouped;
  }, [catalog]);

  const catalogById = useMemo(() => {
    return new Map(catalog.map((item) => [item.id, item]));
  }, [catalog]);

  const applyDefaults = () => {
    if (defaultsApplied.current) return;

    const uniformDefaults = (catalogByType.uniform || []).filter((item) => item.isDefault);
    if (uniformDefaults.length) {
      setUniforms((prev) => {
        const map = new Map(prev.map((u) => [u.catalogItemId, u]));
        uniformDefaults.forEach((item) => {
          const existing = map.get(item.id);
          if (existing) {
            map.set(item.id, { ...existing, active: true, catalogItem: item });
          } else {
            map.set(item.id, {
              catalogItemId: item.id,
              unitPriceOverride: null,
              active: true,
              catalogItem: item,
            });
          }
        });
        return Array.from(map.values());
      });
    }

    const examDefaults = (catalogByType.exam || []).filter((item) => item.isDefault);
    if (examDefaults.length) {
      setExams((prev) => {
        const map = new Map(prev.map((u) => [u.catalogItemId, u]));
        examDefaults.forEach((item) => {
          const existing = map.get(item.id);
          if (existing) {
            map.set(item.id, { ...existing, active: true, catalogItem: item });
          } else {
            map.set(item.id, {
              catalogItemId: item.id,
              unitPriceOverride: null,
              active: true,
              catalogItem: item,
            });
          }
        });
        return Array.from(map.values());
      });
    }

    if (mealCatalog.length) {
      setMeals((prev) => {
        const existing = new Map(
          prev.map((meal) => [meal.mealType.toLowerCase(), meal])
        );
        return mealCatalog.map((item) => {
          const found = existing.get(item.name.toLowerCase());
          if (found) {
            return {
              ...found,
              isEnabled: item.isDefault ? true : found.isEnabled,
            };
          }
          return {
            mealType: item.name,
            mealsPerDay: 0,
            daysOfService: 0,
            priceOverride: null,
            isEnabled: item.isDefault ?? false,
            visibility: "visible",
          };
        });
      });
    }

    const operationalDefaults = operationalCatalog.filter((item) => item.isDefault);
    if (operationalDefaults.length) {
      setCostItems((prev) => {
        const map = new Map(prev.map((item) => [item.catalogItemId, item]));
        operationalDefaults.forEach((item) => {
          const existing = map.get(item.id);
          if (existing) {
            map.set(item.id, { ...existing, isEnabled: true, catalogItem: item });
          } else {
            map.set(item.id, {
              catalogItemId: item.id,
              calcMode: "per_month",
              quantity: 1,
              unitPriceOverride: null,
              isEnabled: true,
              visibility: item.defaultVisibility || "visible",
              notes: "",
              catalogItem: item,
            });
          }
        });
        return Array.from(map.values());
      });
    }

    const transportDefaults = transportCatalog.filter((item) => item.isDefault);
    if (transportDefaults.length) {
      setCostItems((prev) => {
        const map = new Map(prev.map((item) => [item.catalogItemId, item]));
        transportDefaults.forEach((item) => {
          const existing = map.get(item.id);
          if (existing) {
            map.set(item.id, { ...existing, isEnabled: true, catalogItem: item });
          } else {
            map.set(item.id, {
              catalogItemId: item.id,
              calcMode: "per_month",
              quantity: 1,
              unitPriceOverride: null,
              isEnabled: true,
              visibility: item.defaultVisibility || "visible",
              notes: "",
              catalogItem: item,
            });
          }
        });
        return Array.from(map.values());
      });
    }

    const vehicleDefaults = vehicleCatalog.filter((item) => item.isDefault);
    if (vehicleDefaults.length) {
      setCostItems((prev) => {
        const map = new Map(prev.map((item) => [item.catalogItemId, item]));
        vehicleDefaults.forEach((item) => {
          const existing = map.get(item.id);
          if (existing) {
            map.set(item.id, { ...existing, isEnabled: true, catalogItem: item });
          } else {
            map.set(item.id, {
              catalogItemId: item.id,
              calcMode: "per_month",
              quantity: 1,
              unitPriceOverride: null,
              isEnabled: true,
              visibility: item.defaultVisibility || "visible",
              notes: "",
              catalogItem: item,
            });
          }
        });
        return Array.from(map.values());
      });
    }

    const infraDefaults = infraCatalog.filter((item) => item.isDefault);
    if (infraDefaults.length) {
      setCostItems((prev) => {
        const map = new Map(prev.map((item) => [item.catalogItemId, item]));
        infraDefaults.forEach((item) => {
          const existing = map.get(item.id);
          if (existing) {
            map.set(item.id, { ...existing, isEnabled: true, catalogItem: item });
          } else {
            map.set(item.id, {
              catalogItemId: item.id,
              calcMode: "per_month",
              quantity: 1,
              unitPriceOverride: null,
              isEnabled: true,
              visibility: item.defaultVisibility || "visible",
              notes: "",
              catalogItem: item,
            });
          }
        });
        return Array.from(map.values());
      });
    }

    const systemDefaults = extraItemsCatalog.filter((item) => item.isDefault);
    if (systemDefaults.length) {
      setCostItems((prev) => {
        const map = new Map(prev.map((item) => [item.catalogItemId, item]));
        systemDefaults.forEach((item) => {
          const existing = map.get(item.id);
          if (existing) {
            map.set(item.id, { ...existing, isEnabled: true, catalogItem: item });
          } else {
            map.set(item.id, {
              catalogItemId: item.id,
              calcMode: "per_month",
              quantity: 1,
              unitPriceOverride: null,
              isEnabled: true,
              visibility: item.defaultVisibility || "visible",
              notes: "",
              catalogItem: item,
            });
          }
        });
        return Array.from(map.values());
      });
    }

    const financialDefaults = financialCatalog.filter((item) => item.isDefault);
    if (financialDefaults.length) {
      setCostItems((prev) => {
        const map = new Map(prev.map((item) => [item.catalogItemId, item]));
        financialDefaults.forEach((item) => {
          const existing = map.get(item.id);
          if (existing) {
            map.set(item.id, { ...existing, isEnabled: true, catalogItem: item });
          } else {
            map.set(item.id, {
              catalogItemId: item.id,
              calcMode: "per_month",
              quantity: 1,
              unitPriceOverride: null,
              isEnabled: true,
              visibility: item.defaultVisibility || "visible",
              notes: "",
              catalogItem: item,
            });
          }
        });
        return Array.from(map.values());
      });
    }

    defaultsApplied.current = true;
  };

  useEffect(() => {
    if ((!open && !isInline) || !catalog.length) return;
    applyDefaults();
  }, [open, isInline, catalog, uniforms.length, exams.length, meals.length, costItems.length]);

  const extraItemsCatalog = useMemo(() => {
    return catalog.filter((item) => item.type === "system");
  }, [catalog]);

  const operationalCatalog = useMemo(() => {
    return catalog.filter((item) => OPERATIONAL_TYPES.includes(item.type));
  }, [catalog]);

  const transportCatalog = useMemo(() => {
    return catalog.filter((item) => TRANSPORT_TYPES.includes(item.type));
  }, [catalog]);

  const vehicleCatalog = useMemo(() => {
    return catalog.filter((item) => VEHICLE_TYPES.includes(item.type));
  }, [catalog]);

  const infraCatalog = useMemo(() => {
    return catalog.filter((item) => INFRA_TYPES.includes(item.type));
  }, [catalog]);

  const mealCatalog = useMemo(() => {
    return catalog.filter((item) => item.type === "meal");
  }, [catalog]);

  const financialCatalog = useMemo(() => {
    return catalog.filter((item) => FINANCIAL_TYPES.includes(item.type));
  }, [catalog]);

  const otherCostItems = useMemo(() => {
    return costItems.filter((item) => {
      const catalogItem = catalogById.get(item.catalogItemId);
      return catalogItem?.type === "system";
    });
  }, [costItems, catalogById]);

  const financialCostItems = useMemo(() => {
    return costItems.filter((item) => {
      const catalogItem = catalogById.get(item.catalogItemId);
      return catalogItem && FINANCIAL_TYPES.includes(catalogItem.type);
    });
  }, [costItems, catalogById]);

  const totalGuards = summary?.totalGuards ?? 0;

  const normalizeUnitPrice = (value: number, unit?: string | null) => {
    if (!unit) return value;
    const normalized = unit.toLowerCase();
    if (normalized.includes("año") || normalized.includes("year")) {
      return value / 12;
    }
    if (normalized.includes("semestre") || normalized.includes("semester")) {
      return value / 6;
    }
    return value;
  };

  const sumCostItemsByType = (types: string[]) =>
    costItems.reduce((sum, item) => {
      if (!item.isEnabled) return sum;
      const catalogItem = item.catalogItem ?? catalogById.get(item.catalogItemId);
      if (!catalogItem || !types.includes(catalogItem.type)) return sum;
      const base = Number(catalogItem.basePrice || 0);
      const override =
        item.unitPriceOverride !== null && item.unitPriceOverride !== undefined
          ? Number(item.unitPriceOverride)
          : null;
      const unitPrice = normalizeUnitPrice(override ?? base, catalogItem.unit);
      const quantity = Number(item.quantity ?? 1);
      const calcMode = item.calcMode || "per_month";
      if (calcMode === "per_guard") {
        return sum + unitPrice * quantity * totalGuards;
      }
      return sum + unitPrice * quantity;
    }, 0);

  const uniformTotal = useMemo(() => {
    const total = uniforms.reduce((sum, item) => {
      if (!item.active) return sum;
      const base = Number(item.catalogItem?.basePrice ?? 0);
      const override =
        item.unitPriceOverride !== null && item.unitPriceOverride !== undefined
          ? Number(item.unitPriceOverride)
          : null;
      const unitPrice = normalizeUnitPrice(override ?? base, item.catalogItem?.unit);
      return sum + unitPrice;
    }, 0);
    const changes = parameters.uniformChangesPerYear || 0;
    const guards = summary?.totalGuards ?? 0;
    return guards > 0 ? ((total * changes) / 12) * guards : 0;
  }, [uniforms, parameters.uniformChangesPerYear, summary?.totalGuards]);

  const examTotal = useMemo(() => {
    const total = exams.reduce((sum, item) => {
      if (!item.active) return sum;
      const base = Number(item.catalogItem?.basePrice ?? 0);
      const override =
        item.unitPriceOverride !== null && item.unitPriceOverride !== undefined
          ? Number(item.unitPriceOverride)
          : null;
      const unitPrice = normalizeUnitPrice(override ?? base, item.catalogItem?.unit);
      return sum + unitPrice;
    }, 0);
    const avgStay = parameters.avgStayMonths || 0;
    const entriesPerYear = avgStay > 0 ? 12 / avgStay : 0;
    const uniformChanges = parameters.uniformChangesPerYear || 0;
    const examFrequency = Math.max(entriesPerYear, uniformChanges);
    const guards = summary?.totalGuards ?? 0;
    return guards > 0 ? ((total * examFrequency) / 12) * guards : 0;
  }, [exams, parameters.avgStayMonths, parameters.uniformChangesPerYear, summary?.totalGuards]);

  const mealTotal = useMemo(() => {
    return meals.reduce((sum, meal) => {
      if (!meal.isEnabled) return sum;
      const base = Number(
        mealCatalog.find((item) => item.name.toLowerCase() === meal.mealType.toLowerCase())
          ?.basePrice ?? 0
      );
      const unit = mealCatalog.find(
        (item) => item.name.toLowerCase() === meal.mealType.toLowerCase()
      )?.unit;
      const override =
        meal.priceOverride !== null && meal.priceOverride !== undefined
          ? Number(meal.priceOverride)
          : null;
      const price = normalizeUnitPrice(override ?? base, unit);
      return sum + price * meal.mealsPerDay * meal.daysOfService;
    }, 0);
  }, [meals, mealCatalog]);
  const financialTotal = summary ? summary.monthlyFinancial + summary.monthlyPolicy : 0;

  const costForm = loading ? (
    <div className="text-sm text-muted-foreground">Cargando...</div>
  ) : (
    <>
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={activeSection === "directos" ? "default" : "outline"}
            className={activeSection === "directos" ? "bg-primary/90" : "bg-transparent"}
            onClick={() => setActiveSection("directos")}
          >
            Directos
          </Button>
          <Button
            size="sm"
            variant={activeSection === "indirectos" ? "default" : "outline"}
            className={activeSection === "indirectos" ? "bg-primary/90" : "bg-transparent"}
            onClick={() => setActiveSection("indirectos")}
          >
            Indirectos
          </Button>
          {showFinancial && (
            <Button
              size="sm"
              variant={activeSection === "financieros" ? "default" : "outline"}
              className={activeSection === "financieros" ? "bg-primary/90" : "bg-transparent"}
              onClick={() => setActiveSection("financieros")}
            >
              Financieros
            </Button>
          )}
        </div>

        {activeSection === "directos" && (
        <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 text-left"
            onClick={() =>
              setCollapsedSections((prev) => ({
                ...prev,
                uniforms: !prev.uniforms,
              }))
            }
            aria-expanded={!collapsedSections.uniforms}
          >
            <div>
              <h3 className="text-sm font-semibold uppercase text-foreground">
                Uniformes
              </h3>
              <span className="text-xs text-muted-foreground">
                Total: {formatCurrency(uniformTotal)}
              </span>
            </div>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${
                collapsedSections.uniforms ? "" : "rotate-180"
              }`}
            />
          </button>
          {!collapsedSections.uniforms && (
            <>
              <div className="flex items-center gap-2 sm:justify-end">
                <select
                  className="flex h-9 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground sm:w-64"
                  value=""
                  onChange={(e) => {
                    const value = e.target.value;
                    if (!value) return;
                    setUniforms((prev) => {
                      const existing = prev.find((u) => u.catalogItemId === value);
                      if (existing) {
                        return prev.map((u) =>
                          u.catalogItemId === value ? { ...u, active: true } : u
                        );
                      }
                      const catalogItem = catalogById.get(value);
                      if (!catalogItem) return prev;
                      return [
                        ...prev,
                        {
                          catalogItemId: value,
                          unitPriceOverride: null,
                          active: true,
                          catalogItem,
                        },
                      ];
                    });
                  }}
                >
                  <option value="">Agregar ítem</option>
                  {(catalogByType.uniform || [])
                    .filter((item) => !uniforms.find((u) => u.catalogItemId === item.id && u.active))
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {(catalogByType.uniform || [])
                  .filter((item) =>
                    uniforms.find((u) => u.catalogItemId === item.id && u.active)
                  )
                  .map((item) => {
                    const selected = uniforms.find((u) => u.catalogItemId === item.id);
                    return (
                      <div key={item.id} className={`${sectionBoxClass} space-y-2`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm">{item.name}</span>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>Base: {formatCurrency(Number(item.basePrice))}</span>
                            <button
                              type="button"
                              className="rounded-md border border-border px-2 py-1 text-xs"
                              onClick={() =>
                                setUniforms((prev) =>
                                  prev.map((u) =>
                                    u.catalogItemId === item.id ? { ...u, active: false } : u
                                  )
                                )
                              }
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                        <Input
                          type="number"
                          placeholder="Precio mensual (override)"
                          value={selected?.unitPriceOverride ?? ""}
                          onChange={(e) =>
                            setUniforms((prev) =>
                              prev.map((u) =>
                                u.catalogItemId === item.id
                                  ? { ...u, unitPriceOverride: toNumber(e.target.value) }
                                  : u
                              )
                            )
                          }
                          className={inputClass}
                        />
                      </div>
                    );
                  })}
              </div>
            </>
          )}
        </div>
        )}

        {activeSection === "directos" && (
        <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 text-left"
            onClick={() =>
              setCollapsedSections((prev) => ({
                ...prev,
                exams: !prev.exams,
              }))
            }
            aria-expanded={!collapsedSections.exams}
          >
            <div>
              <h3 className="text-sm font-semibold uppercase text-foreground">
                Exámenes
              </h3>
              <span className="text-xs text-muted-foreground">
                Total: {formatCurrency(examTotal)}
              </span>
            </div>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${
                collapsedSections.exams ? "" : "rotate-180"
              }`}
            />
          </button>
          {!collapsedSections.exams && (
            <>
              <div className="flex items-center gap-2 sm:justify-end">
                <select
                  className="flex h-9 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground sm:w-64"
                  value=""
                  onChange={(e) => {
                    const value = e.target.value;
                    if (!value) return;
                    setExams((prev) => {
                      const existing = prev.find((u) => u.catalogItemId === value);
                      if (existing) {
                        return prev.map((u) =>
                          u.catalogItemId === value ? { ...u, active: true } : u
                        );
                      }
                      const catalogItem = catalogById.get(value);
                      if (!catalogItem) return prev;
                      return [
                        ...prev,
                        {
                          catalogItemId: value,
                          unitPriceOverride: null,
                          active: true,
                          catalogItem,
                        },
                      ];
                    });
                  }}
                >
                  <option value="">Agregar ítem</option>
                  {(catalogByType.exam || [])
                    .filter((item) => !exams.find((u) => u.catalogItemId === item.id && u.active))
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {(catalogByType.exam || [])
                  .filter((item) =>
                    exams.find((u) => u.catalogItemId === item.id && u.active)
                  )
                  .map((item) => {
                    const selected = exams.find((u) => u.catalogItemId === item.id);
                    return (
                      <div key={item.id} className={`${sectionBoxClass} space-y-2`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm">{item.name}</span>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>Base: {formatCurrency(Number(item.basePrice))}</span>
                            <button
                              type="button"
                              className="rounded-md border border-border px-2 py-1 text-xs"
                              onClick={() =>
                                setExams((prev) =>
                                  prev.map((u) =>
                                    u.catalogItemId === item.id ? { ...u, active: false } : u
                                  )
                                )
                              }
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                        <Input
                          type="number"
                          placeholder="Precio mensual (override)"
                          value={selected?.unitPriceOverride ?? ""}
                          onChange={(e) =>
                            setExams((prev) =>
                              prev.map((u) =>
                                u.catalogItemId === item.id
                                  ? { ...u, unitPriceOverride: toNumber(e.target.value) }
                                  : u
                              )
                            )
                          }
                          className={inputClass}
                        />
                      </div>
                    );
                  })}
              </div>
            </>
          )}
        </div>
        )}

        {activeSection === "directos" && (
        <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 text-left"
            onClick={() =>
              setCollapsedSections((prev) => ({
                ...prev,
                meals: !prev.meals,
              }))
            }
            aria-expanded={!collapsedSections.meals}
          >
            <div>
              <h3 className="text-sm font-semibold uppercase text-foreground">
                Alimentación
              </h3>
              <span className="text-xs text-muted-foreground">
                Total: {formatCurrency(mealTotal)}
              </span>
            </div>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${
                collapsedSections.meals ? "" : "rotate-180"
              }`}
            />
          </button>
          {!collapsedSections.meals && (
            <>
              <div className="flex items-center gap-2 sm:justify-end">
                <select
                  className="flex h-9 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground sm:w-64"
                  value=""
                  onChange={(e) => {
                    const value = e.target.value;
                    if (!value) return;
                    updateMeal(value, { isEnabled: true });
                  }}
                >
                  <option value="">Agregar ítem</option>
                  {mealCatalog
                    .filter(
                      (item) =>
                        !meals.find(
                          (m) =>
                            m.mealType.toLowerCase() === item.name.toLowerCase() &&
                            m.isEnabled
                        )
                    )
                    .map((item) => (
                      <option key={item.id} value={item.name}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {mealCatalog
                  .filter((item) =>
                    meals.find(
                      (m) =>
                        m.mealType.toLowerCase() === item.name.toLowerCase() && m.isEnabled
                    )
                  )
                  .map((item) => {
                    const meal = meals.find(
                      (m) => m.mealType.toLowerCase() === item.name.toLowerCase()
                    );
                    return (
                      <div key={item.id} className={`${sectionBoxClass} space-y-2`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm">{item.name}</span>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>Base: {formatCurrency(Number(item.basePrice))}</span>
                            <button
                              type="button"
                              className="rounded-md border border-border px-2 py-1 text-xs"
                              onClick={() => updateMeal(item.name, { isEnabled: false })}
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            type="number"
                            placeholder="Comidas/día"
                            value={meal?.mealsPerDay ?? 0}
                            onChange={(e) =>
                              updateMeal(item.name, { mealsPerDay: toNumber(e.target.value) })
                            }
                            className={inputClass}
                          />
                          <Input
                            type="number"
                            placeholder="Días/mes"
                            value={meal?.daysOfService ?? 0}
                            onChange={(e) =>
                              updateMeal(item.name, { daysOfService: toNumber(e.target.value) })
                            }
                            className={inputClass}
                          />
                          <Input
                            type="number"
                            placeholder="Precio mensual (override)"
                            value={meal?.priceOverride ?? ""}
                            onChange={(e) =>
                              updateMeal(item.name, { priceOverride: toNumber(e.target.value) })
                            }
                            className={`${inputClass} col-span-2`}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </>
          )}
        </div>
        )}

        {activeSection === "indirectos" && (
        <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 text-left"
            onClick={() =>
              setCollapsedSections((prev) => ({
                ...prev,
                operational: !prev.operational,
              }))
            }
            aria-expanded={!collapsedSections.operational}
          >
            <div>
              <h3 className="text-sm font-semibold uppercase text-foreground">
                Equipos operativos
              </h3>
              <span className="text-xs text-muted-foreground">
                Total: {formatCurrency(sumCostItemsByType(["phone", "radio", "flashlight"]))}
              </span>
            </div>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${
                collapsedSections.operational ? "" : "rotate-180"
              }`}
            />
          </button>
          {!collapsedSections.operational && (
            <>
              <div className="flex items-center gap-2 sm:justify-end">
                <select
                  className="flex h-9 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground sm:w-64"
                  value=""
                  onChange={(e) => {
                    const value = e.target.value;
                    if (!value) return;
                    upsertCostItem(catalogById.get(value)!, { isEnabled: true });
                  }}
                >
                  <option value="">Agregar ítem</option>
                  {operationalCatalog
                    .filter((item) => !findCostItem(item.id)?.isEnabled)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {operationalCatalog
                  .filter((item) => findCostItem(item.id)?.isEnabled)
                  .map((item) => {
                    const costItem = findCostItem(item.id);
                    return (
                      <div key={item.id} className={`${sectionBoxClass} space-y-2`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm">{item.name}</span>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>Base: {formatCurrency(Number(item.basePrice))}</span>
                            <button
                              type="button"
                              className="rounded-md border border-border px-2 py-1 text-xs"
                              onClick={() => upsertCostItem(item, { isEnabled: false })}
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                        <Input
                          type="number"
                          placeholder="Precio mensual (override)"
                          value={costItem?.unitPriceOverride ?? ""}
                          onChange={(e) =>
                            upsertCostItem(item, { unitPriceOverride: toNumber(e.target.value) })
                          }
                          className={inputClass}
                        />
                      </div>
                    );
                  })}
              </div>
            </>
          )}
        </div>
        )}

        {activeSection === "indirectos" && (
        <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 text-left"
            onClick={() =>
              setCollapsedSections((prev) => ({
                ...prev,
                transport: !prev.transport,
              }))
            }
            aria-expanded={!collapsedSections.transport}
          >
            <div>
              <h3 className="text-sm font-semibold uppercase text-foreground">
                Costos de transporte
              </h3>
              <span className="text-xs text-muted-foreground">
                Total: {formatCurrency(sumCostItemsByType(TRANSPORT_TYPES))}
              </span>
            </div>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${
                collapsedSections.transport ? "" : "rotate-180"
              }`}
            />
          </button>
          {!collapsedSections.transport && (
            <>
              <div className="flex items-center gap-2 sm:justify-end">
                <select
                  className="flex h-9 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground sm:w-64"
                  value=""
                  onChange={(e) => {
                    const value = e.target.value;
                    if (!value) return;
                    upsertCostItem(catalogById.get(value)!, { isEnabled: true });
                  }}
                >
                  <option value="">Agregar ítem</option>
                  {transportCatalog
                    .filter((item) => !findCostItem(item.id)?.isEnabled)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {transportCatalog
                  .filter((item) => findCostItem(item.id)?.isEnabled)
                  .map((item) => {
                    const costItem = findCostItem(item.id);
                    return (
                      <div key={item.id} className={`${sectionBoxClass} space-y-2`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm">{item.name}</span>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>Base: {formatCurrency(Number(item.basePrice))}</span>
                            <button
                              type="button"
                              className="rounded-md border border-border px-2 py-1 text-xs"
                              onClick={() => upsertCostItem(item, { isEnabled: false })}
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                        <Input
                          type="number"
                          placeholder="Precio mensual (override)"
                          value={costItem?.unitPriceOverride ?? ""}
                          onChange={(e) =>
                            upsertCostItem(item, { unitPriceOverride: toNumber(e.target.value) })
                          }
                          className={inputClass}
                        />
                      </div>
                    );
                  })}
              </div>
            </>
          )}
        </div>
        )}

        {activeSection === "indirectos" && (
        <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 text-left"
            onClick={() =>
              setCollapsedSections((prev) => ({
                ...prev,
                vehicles: !prev.vehicles,
              }))
            }
            aria-expanded={!collapsedSections.vehicles}
          >
            <div>
              <h3 className="text-sm font-semibold uppercase text-foreground">
                Vehículos
              </h3>
              <span className="text-xs text-muted-foreground">
                Total: {formatCurrency(sumCostItemsByType(VEHICLE_TYPES))}
              </span>
            </div>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${
                collapsedSections.vehicles ? "" : "rotate-180"
              }`}
            />
          </button>
          {!collapsedSections.vehicles && (
            <>
              <div className="flex items-center gap-2 sm:justify-end">
                <select
                  className="flex h-9 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground sm:w-64"
                  value=""
                  onChange={(e) => {
                    const value = e.target.value;
                    if (!value) return;
                    upsertCostItem(catalogById.get(value)!, { isEnabled: true });
                  }}
                >
                  <option value="">Agregar ítem</option>
                  {vehicleCatalog
                    .filter((item) => !findCostItem(item.id)?.isEnabled)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {vehicleCatalog
                  .filter((item) => findCostItem(item.id)?.isEnabled)
                  .map((item) => {
                    const costItem = findCostItem(item.id);
                    return (
                      <div key={item.id} className={`${sectionBoxClass} space-y-2`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm">{item.name}</span>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>Base: {formatCurrency(Number(item.basePrice))}</span>
                            <button
                              type="button"
                              className="rounded-md border border-border px-2 py-1 text-xs"
                              onClick={() => upsertCostItem(item, { isEnabled: false })}
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                        <Input
                          type="number"
                          placeholder="Precio mensual (override)"
                          value={costItem?.unitPriceOverride ?? ""}
                          onChange={(e) =>
                            upsertCostItem(item, { unitPriceOverride: toNumber(e.target.value) })
                          }
                          className={inputClass}
                        />
                      </div>
                    );
                  })}
              </div>
            </>
          )}
        </div>
        )}

        {activeSection === "indirectos" && (
        <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 text-left"
            onClick={() =>
              setCollapsedSections((prev) => ({
                ...prev,
                infrastructure: !prev.infrastructure,
              }))
            }
            aria-expanded={!collapsedSections.infrastructure}
          >
            <div>
              <h3 className="text-sm font-semibold uppercase text-foreground">
                Infraestructura
              </h3>
              <span className="text-xs text-muted-foreground">
                Total: {formatCurrency(sumCostItemsByType(INFRA_TYPES))}
              </span>
            </div>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${
                collapsedSections.infrastructure ? "" : "rotate-180"
              }`}
            />
          </button>
          {!collapsedSections.infrastructure && (
            <>
              <div className="flex items-center gap-2 sm:justify-end">
                <select
                  className="flex h-9 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground sm:w-64"
                  value=""
                  onChange={(e) => {
                    const value = e.target.value;
                    if (!value) return;
                    upsertCostItem(catalogById.get(value)!, { isEnabled: true });
                  }}
                >
                  <option value="">Agregar ítem</option>
                  {infraCatalog
                    .filter((item) => !findCostItem(item.id)?.isEnabled)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {infraCatalog
                  .filter((item) => findCostItem(item.id)?.isEnabled)
                  .map((item) => {
                    const costItem = findCostItem(item.id);
                    return (
                      <div key={item.id} className={`${sectionBoxClass} space-y-2`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm">{item.name}</span>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>Base: {formatCurrency(Number(item.basePrice))}</span>
                            <button
                              type="button"
                              className="rounded-md border border-border px-2 py-1 text-xs"
                              onClick={() => upsertCostItem(item, { isEnabled: false })}
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                        <Input
                          type="number"
                          placeholder="Precio mensual (override)"
                          value={costItem?.unitPriceOverride ?? ""}
                          onChange={(e) =>
                            upsertCostItem(item, { unitPriceOverride: toNumber(e.target.value) })
                          }
                          className={inputClass}
                        />
                      </div>
                    );
                  })}
              </div>
            </>
          )}
        </div>
        )}

        {activeSection === "indirectos" && (
        <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 text-left"
            onClick={() =>
              setCollapsedSections((prev) => ({
                ...prev,
                systems: !prev.systems,
              }))
            }
            aria-expanded={!collapsedSections.systems}
          >
            <div>
              <h3 className="text-sm font-semibold uppercase text-foreground">
                Sistemas
              </h3>
              <span className="text-xs text-muted-foreground">
                Total: {formatCurrency(sumCostItemsByType(["system"]))}
              </span>
            </div>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${
                collapsedSections.systems ? "" : "rotate-180"
              }`}
            />
          </button>
          {!collapsedSections.systems && (
            <>
              <div className="flex items-center gap-2 sm:justify-end">
                <select
                  className="flex h-9 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground sm:w-64"
                  value=""
                  onChange={(e) => {
                    const value = e.target.value;
                    if (!value) return;
                    const item = catalogById.get(value);
                    if (!item) return;
                    upsertCostItem(item, { isEnabled: true });
                  }}
                >
                  <option value="">Agregar ítem</option>
                  {extraItemsCatalog
                    .filter((item) => !findCostItem(item.id)?.isEnabled)
                    .map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {otherCostItems
                  .filter((item) => item.isEnabled)
                  .map((item) => {
                    const catalogItem = catalogById.get(item.catalogItemId);
                    if (!catalogItem) return null;
                    return (
                      <div key={item.catalogItemId} className={`${sectionBoxClass} space-y-2`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm">{catalogItem.name}</span>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>Base: {formatCurrency(Number(catalogItem.basePrice))}</span>
                            <button
                              type="button"
                              className="rounded-md border border-border px-2 py-1 text-xs"
                              onClick={() => upsertCostItem(catalogItem, { isEnabled: false })}
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                        <Input
                          type="number"
                          placeholder="Precio mensual (override)"
                          value={item.unitPriceOverride ?? ""}
                          onChange={(e) =>
                            setCostItems((prev) =>
                              prev.map((c) =>
                                c.catalogItemId === item.catalogItemId
                                  ? { ...c, unitPriceOverride: toNumber(e.target.value) }
                                  : c
                              )
                            )
                          }
                          className={inputClass}
                        />
                      </div>
                    );
                  })}
              </div>
            </>
          )}
        </div>
        )}

        {showFinancial && activeSection === "financieros" && (
        <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-sm font-semibold uppercase text-foreground">
              Costos financieros
            </h3>
            <span className="text-xs text-muted-foreground">
              Total mensual: {formatCurrency(financialTotal)}
            </span>
            {summary?.monthlyTotal === 0 && (
              <span className="text-xs text-muted-foreground">
                Se calcula sobre costo + margen.
              </span>
            )}
            <div className="flex items-center gap-2">
              <select
                className="flex h-9 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground sm:w-64"
                value=""
                onChange={(e) => {
                  const value = e.target.value;
                  if (!value) return;
                  const item = catalogById.get(value);
                  if (!item) return;
                  upsertCostItem(item, { isEnabled: true });
                }}
              >
                <option value="">Agregar ítem</option>
                {financialCatalog
                  .filter((item) => !findCostItem(item.id)?.isEnabled)
                  .map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {financialCostItems
              .filter((item) => item.isEnabled)
              .map((item) => {
                const catalogItem = catalogById.get(item.catalogItemId);
                if (!catalogItem) return null;
                const isPolicy = catalogItem.type === "policy";
                return (
                  <div
                    key={item.catalogItemId}
                    className={`${sectionBoxClass} space-y-2 ${isPolicy ? "sm:col-span-2 lg:col-span-3" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm">{catalogItem.name}</span>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>
                          Tasa base: {formatNumber(Number(catalogItem.basePrice || 0), { minDecimals: 2, maxDecimals: 2 })}%
                        </span>
                        <button
                          type="button"
                          className="rounded-md border border-border px-2 py-1 text-xs"
                          onClick={() => upsertCostItem(catalogItem, { isEnabled: false })}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    <div className="grid gap-2 grid-cols-2 sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Tasa (%)</Label>
                        <Input
                          type="text"
                          inputMode="decimal"
                          placeholder="Ej: 2,50"
                          value={getDecimalValue(
                            `rate:${item.catalogItemId}`,
                            item.unitPriceOverride ?? null,
                            2,
                            true
                          )}
                          onChange={(e) => setDecimalValue(`rate:${item.catalogItemId}`, e.target.value)}
                          onBlur={() => {
                            const raw = decimalDrafts[`rate:${item.catalogItemId}`];
                            if (raw === undefined) return;
                            const parsed = raw.trim() ? parseLocalizedNumber(raw) : null;
                            setCostItems((prev) =>
                              prev.map((c) =>
                                c.catalogItemId === item.catalogItemId
                                  ? { ...c, unitPriceOverride: parsed }
                                  : c
                              )
                            );
                            clearDecimalValue(`rate:${item.catalogItemId}`);
                          }}
                          className={inputClass}
                        />
                      </div>
                      {isPolicy && (
                        <>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Meses a considerar</Label>
                            <Input
                              type="number"
                              value={parameters.policyContractMonths}
                              onChange={(e) =>
                                setParameters((prev) => ({
                                  ...prev,
                                  policyContractMonths: toNumber(e.target.value),
                                }))
                              }
                              className={inputClass}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Porcentaje contrato (%)</Label>
                                    <Input
                                      type="text"
                                      inputMode="decimal"
                                      value={getDecimalValue("policyContractPct", parameters.policyContractPct, 2)}
                                      onChange={(e) => setDecimalValue("policyContractPct", e.target.value)}
                                      onBlur={() => {
                                        const raw = decimalDrafts.policyContractPct;
                                        if (raw === undefined) return;
                                        const parsed = raw.trim() ? parseLocalizedNumber(raw) : 0;
                                        setParameters((prev) => ({
                                          ...prev,
                                          policyContractPct: parsed,
                                        }));
                                        clearDecimalValue("policyContractPct");
                                      }}
                                      className={inputClass}
                                    />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
        )}

        {showFinancial && activeSection === "financieros" && (
        <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-2">
          <h3 className="text-xs font-semibold uppercase text-foreground">
            Margen y parámetros
          </h3>
          <div className="grid gap-2 grid-cols-2 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Margen (%)</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={getDecimalValue("marginPct", parameters.marginPct, 2)}
                onChange={(e) => setDecimalValue("marginPct", e.target.value)}
                onBlur={() => {
                  const raw = decimalDrafts.marginPct;
                  if (raw === undefined) return;
                  const parsed = raw.trim() ? parseLocalizedNumber(raw) : 0;
                  setParameters((prev) => ({
                    ...prev,
                    marginPct: parsed,
                  }));
                  clearDecimalValue("marginPct");
                }}
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Meses contrato</Label>
              <Input
                type="number"
                value={parameters.contractMonths}
                onChange={(e) =>
                  setParameters((prev) => ({
                    ...prev,
                    contractMonths: toNumber(e.target.value),
                  }))
                }
                className={inputClass}
              />
            </div>
          </div>
        </div>
        )}
      </div>

      <div
        className={`flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between ${
          isInline
            ? "sticky bottom-0 border-t border-border/60 bg-background/95 px-2 py-3 backdrop-blur"
            : "mt-4"
        }`}
      >
        <Badge variant="outline" className="text-xs">
          Mobile-first · Los cambios se guardan al presionar "Guardar cambios"
        </Badge>
        <Button
          size="sm"
          onClick={() => handleSave()}
          disabled={saving}
          className=""
        >
          {saving ? "Guardando..." : "Guardar cambios"}
        </Button>
      </div>
    </>
  );

  return (
    <Card className="p-3 sm:p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Costos adicionales</h2>
          <p className="text-xs text-muted-foreground">
            {showFinancial
              ? "Agrupa por pestañas: directos, indirectos y financieros."
              : "Agrupa por pestañas: directos e indirectos."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-2" onClick={loadData}>
            <RefreshCw className="h-3 w-3" />
            <span className="hidden sm:inline">Actualizar</span>
          </Button>
          {!isInline && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Agregar costos</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-background text-foreground">
              <DialogHeader>
                <DialogTitle>Configurar costos adicionales</DialogTitle>
              </DialogHeader>
              {costForm}

              {false && (
                <>
              {loading ? (
                <div className="text-sm text-muted-foreground">Cargando...</div>
              ) : (
                <div className="space-y-4 text-sm">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={activeSection === "directos" ? "default" : "outline"}
                      className={activeSection === "directos" ? "bg-primary/90" : "bg-transparent"}
                      onClick={() => setActiveSection("directos")}
                    >
                      Directos
                    </Button>
                    <Button
                      size="sm"
                      variant={activeSection === "indirectos" ? "default" : "outline"}
                      className={activeSection === "indirectos" ? "bg-primary/90" : "bg-transparent"}
                      onClick={() => setActiveSection("indirectos")}
                    >
                      Indirectos
                    </Button>
                    <Button
                      size="sm"
                      variant={activeSection === "financieros" ? "default" : "outline"}
                      className={activeSection === "financieros" ? "bg-primary/90" : "bg-transparent"}
                      onClick={() => setActiveSection("financieros")}
                    >
                      Financieros
                    </Button>
                  </div>

                  {activeSection === "directos" && (
                  <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <h3 className="text-sm font-semibold uppercase text-foreground">
                        Uniformes
                      </h3>
                      <span className="text-xs text-muted-foreground">
                        Total: {formatCurrency(uniformTotal)}
                      </span>
                      <div className="flex items-center gap-2">
                        <select
                          className="flex h-9 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground sm:w-64"
                          value=""
                          onChange={(e) => {
                            const value = e.target.value;
                            if (!value) return;
                            setUniforms((prev) => {
                              const existing = prev.find((u) => u.catalogItemId === value);
                              if (existing) {
                                return prev.map((u) =>
                                  u.catalogItemId === value ? { ...u, active: true } : u
                                );
                              }
                              const catalogItem = catalogById.get(value);
                              if (!catalogItem) return prev;
                              return [
                                ...prev,
                                {
                                  catalogItemId: value,
                                  unitPriceOverride: null,
                                  active: true,
                                  catalogItem,
                                },
                              ];
                            });
                          }}
                        >
                          <option value="">Agregar ítem</option>
                          {(catalogByType.uniform || [])
                            .filter((item) => !uniforms.find((u) => u.catalogItemId === item.id && u.active))
                            .map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name}
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {(catalogByType.uniform || [])
                        .filter((item) =>
                          uniforms.find((u) => u.catalogItemId === item.id && u.active)
                        )
                        .map((item) => {
                          const selected = uniforms.find((u) => u.catalogItemId === item.id);
                          return (
                            <div key={item.id} className={`${sectionBoxClass} space-y-2`}>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm">{item.name}</span>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <span>Base: {formatCurrency(Number(item.basePrice))}</span>
                                  <button
                                    type="button"
                                    className="rounded-md border border-border px-2 py-1 text-xs"
                                    onClick={() =>
                                      setUniforms((prev) =>
                                        prev.map((u) =>
                                          u.catalogItemId === item.id ? { ...u, active: false } : u
                                        )
                                      )
                                    }
                                  >
                                    ✕
                                  </button>
                                </div>
                              </div>
                              <Input
                                type="number"
                                placeholder="Precio mensual (override)"
                                value={selected?.unitPriceOverride ?? ""}
                                onChange={(e) =>
                                  setUniforms((prev) =>
                                    prev.map((u) =>
                                      u.catalogItemId === item.id
                                        ? { ...u, unitPriceOverride: toNumber(e.target.value) }
                                        : u
                                    )
                                  )
                                }
                                className={inputClass}
                              />
                            </div>
                          );
                        })}
                    </div>
                  </div>
                  
                  )}

                  {activeSection === "directos" && (
                  <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <h3 className="text-sm font-semibold uppercase text-foreground">
                        Exámenes
                      </h3>
                      <span className="text-xs text-muted-foreground">
                        Total: {formatCurrency(examTotal)}
                      </span>
                      <div className="flex items-center gap-2">
                        <select
                          className="flex h-9 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground sm:w-64"
                          value=""
                          onChange={(e) => {
                            const value = e.target.value;
                            if (!value) return;
                            setExams((prev) => {
                              const existing = prev.find((u) => u.catalogItemId === value);
                              if (existing) {
                                return prev.map((u) =>
                                  u.catalogItemId === value ? { ...u, active: true } : u
                                );
                              }
                              const catalogItem = catalogById.get(value);
                              if (!catalogItem) return prev;
                              return [
                                ...prev,
                                {
                                  catalogItemId: value,
                                  unitPriceOverride: null,
                                  active: true,
                                  catalogItem,
                                },
                              ];
                            });
                          }}
                        >
                          <option value="">Agregar ítem</option>
                          {(catalogByType.exam || [])
                            .filter((item) => !exams.find((u) => u.catalogItemId === item.id && u.active))
                            .map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name}
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {(catalogByType.exam || [])
                        .filter((item) =>
                          exams.find((u) => u.catalogItemId === item.id && u.active)
                        )
                        .map((item) => {
                          const selected = exams.find((u) => u.catalogItemId === item.id);
                          return (
                            <div key={item.id} className={`${sectionBoxClass} space-y-2`}>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm">{item.name}</span>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <span>Base: {formatCurrency(Number(item.basePrice))}</span>
                                  <button
                                    type="button"
                                    className="rounded-md border border-border px-2 py-1 text-xs"
                                    onClick={() =>
                                      setExams((prev) =>
                                        prev.map((u) =>
                                          u.catalogItemId === item.id ? { ...u, active: false } : u
                                        )
                                      )
                                    }
                                  >
                                    ✕
                                  </button>
                                </div>
                              </div>
                              <Input
                                type="number"
                                placeholder="Precio mensual (override)"
                                value={selected?.unitPriceOverride ?? ""}
                                onChange={(e) =>
                                  setExams((prev) =>
                                    prev.map((u) =>
                                      u.catalogItemId === item.id
                                        ? { ...u, unitPriceOverride: toNumber(e.target.value) }
                                        : u
                                    )
                                  )
                                }
                                className={inputClass}
                              />
                            </div>
                          );
                        })}
                    </div>
                  </div>
                  )}

                  {activeSection === "directos" && (
                  <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <h3 className="text-sm font-semibold uppercase text-foreground">
                        Alimentación
                      </h3>
                      <span className="text-xs text-muted-foreground">
                        Total: {formatCurrency(mealTotal)}
                      </span>
                      <div className="flex items-center gap-2">
                        <select
                          className="flex h-9 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground sm:w-64"
                          value=""
                          onChange={(e) => {
                            const value = e.target.value;
                            if (!value) return;
                            updateMeal(value, { isEnabled: true });
                          }}
                        >
                          <option value="">Agregar ítem</option>
                          {mealCatalog
                            .filter(
                              (item) =>
                                !meals.find(
                                  (m) =>
                                    m.mealType.toLowerCase() === item.name.toLowerCase() &&
                                    m.isEnabled
                                )
                            )
                            .map((item) => (
                              <option key={item.id} value={item.name}>
                                {item.name}
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {mealCatalog
                        .filter((item) =>
                          meals.find(
                            (m) =>
                              m.mealType.toLowerCase() === item.name.toLowerCase() && m.isEnabled
                          )
                        )
                        .map((item) => {
                          const meal = meals.find(
                            (m) => m.mealType.toLowerCase() === item.name.toLowerCase()
                          );
                          return (
                            <div key={item.id} className={`${sectionBoxClass} space-y-2`}>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm">{item.name}</span>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <span>Base: {formatCurrency(Number(item.basePrice))}</span>
                                  <button
                                    type="button"
                                    className="rounded-md border border-border px-2 py-1 text-xs"
                                    onClick={() => updateMeal(item.name, { isEnabled: false })}
                                  >
                                    ✕
                                  </button>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <Input
                                  type="number"
                                  placeholder="Comidas/día"
                                  value={meal?.mealsPerDay ?? 0}
                                  onChange={(e) =>
                                    updateMeal(item.name, { mealsPerDay: toNumber(e.target.value) })
                                  }
                                  className={inputClass}
                                />
                                <Input
                                  type="number"
                                  placeholder="Días/mes"
                                  value={meal?.daysOfService ?? 0}
                                  onChange={(e) =>
                                    updateMeal(item.name, { daysOfService: toNumber(e.target.value) })
                                  }
                                  className={inputClass}
                                />
                                <Input
                                  type="number"
                                  placeholder="Precio mensual (override)"
                                  value={meal?.priceOverride ?? ""}
                                  onChange={(e) =>
                                    updateMeal(item.name, { priceOverride: toNumber(e.target.value) })
                                  }
                                  className={`${inputClass} col-span-2`}
                                />
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                  )}

                  {activeSection === "indirectos" && (
                  <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <h3 className="text-sm font-semibold uppercase text-foreground">
                        Equipos operativos
                      </h3>
                      <span className="text-xs text-muted-foreground">
                        Total: {formatCurrency(sumCostItemsByType(["phone", "radio", "flashlight"]))}
                      </span>
                      <div className="flex items-center gap-2">
                        <select
                          className="flex h-9 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground sm:w-64"
                          value=""
                          onChange={(e) => {
                            const value = e.target.value;
                            if (!value) return;
                            upsertCostItem(catalogById.get(value)!, { isEnabled: true });
                          }}
                        >
                          <option value="">Agregar ítem</option>
                          {operationalCatalog
                            .filter((item) => !findCostItem(item.id)?.isEnabled)
                            .map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name}
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {operationalCatalog
                        .filter((item) => findCostItem(item.id)?.isEnabled)
                        .map((item) => {
                          const costItem = findCostItem(item.id);
                          return (
                            <div key={item.id} className={`${sectionBoxClass} space-y-2`}>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm">{item.name}</span>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <span>Base: {formatCurrency(Number(item.basePrice))}</span>
                                  <button
                                    type="button"
                                    className="rounded-md border border-border px-2 py-1 text-xs"
                                    onClick={() => upsertCostItem(item, { isEnabled: false })}
                                  >
                                    ✕
                                  </button>
                                </div>
                              </div>
                              <Input
                                type="number"
                                placeholder="Precio mensual (override)"
                                value={costItem?.unitPriceOverride ?? ""}
                                onChange={(e) =>
                                  upsertCostItem(item, { unitPriceOverride: toNumber(e.target.value) })
                                }
                                className={inputClass}
                              />
                            </div>
                          );
                        })}
                    </div>
                  </div>
                  )}

                  {activeSection === "indirectos" && (
                  <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <h3 className="text-sm font-semibold uppercase text-foreground">
                        Costos de transporte
                      </h3>
                      <span className="text-xs text-muted-foreground">
                        Total: {formatCurrency(sumCostItemsByType(TRANSPORT_TYPES))}
                      </span>
                      <div className="flex items-center gap-2">
                        <select
                          className="flex h-9 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground sm:w-64"
                          value=""
                          onChange={(e) => {
                            const value = e.target.value;
                            if (!value) return;
                            upsertCostItem(catalogById.get(value)!, { isEnabled: true });
                          }}
                        >
                          <option value="">Agregar ítem</option>
                          {transportCatalog
                            .filter((item) => !findCostItem(item.id)?.isEnabled)
                            .map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name}
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {transportCatalog
                        .filter((item) => findCostItem(item.id)?.isEnabled)
                        .map((item) => {
                          const costItem = findCostItem(item.id);
                          return (
                            <div key={item.id} className={`${sectionBoxClass} space-y-2`}>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm">{item.name}</span>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <span>Base: {formatCurrency(Number(item.basePrice))}</span>
                                  <button
                                    type="button"
                                    className="rounded-md border border-border px-2 py-1 text-xs"
                                    onClick={() => upsertCostItem(item, { isEnabled: false })}
                                  >
                                    ✕
                                  </button>
                                </div>
                              </div>
                              <Input
                                type="number"
                                placeholder="Precio mensual (override)"
                                value={costItem?.unitPriceOverride ?? ""}
                                onChange={(e) =>
                                  upsertCostItem(item, { unitPriceOverride: toNumber(e.target.value) })
                                }
                                className={inputClass}
                              />
                            </div>
                          );
                        })}
                    </div>
                  </div>
                  )}

                  {activeSection === "indirectos" && (
                  <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <h3 className="text-sm font-semibold uppercase text-foreground">
                        Vehículos
                      </h3>
                      <span className="text-xs text-muted-foreground">
                        Total: {formatCurrency(sumCostItemsByType(VEHICLE_TYPES))}
                      </span>
                      <div className="flex items-center gap-2">
                        <select
                          className="flex h-9 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground sm:w-64"
                          value=""
                          onChange={(e) => {
                            const value = e.target.value;
                            if (!value) return;
                            upsertCostItem(catalogById.get(value)!, { isEnabled: true });
                          }}
                        >
                          <option value="">Agregar ítem</option>
                          {vehicleCatalog
                            .filter((item) => !findCostItem(item.id)?.isEnabled)
                            .map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name}
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {vehicleCatalog
                        .filter((item) => findCostItem(item.id)?.isEnabled)
                        .map((item) => {
                          const costItem = findCostItem(item.id);
                          return (
                            <div key={item.id} className={`${sectionBoxClass} space-y-2`}>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm">{item.name}</span>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <span>Base: {formatCurrency(Number(item.basePrice))}</span>
                                  <button
                                    type="button"
                                    className="rounded-md border border-border px-2 py-1 text-xs"
                                    onClick={() => upsertCostItem(item, { isEnabled: false })}
                                  >
                                    ✕
                                  </button>
                                </div>
                              </div>
                              <Input
                                type="number"
                                placeholder="Precio mensual (override)"
                                value={costItem?.unitPriceOverride ?? ""}
                                onChange={(e) =>
                                  upsertCostItem(item, { unitPriceOverride: toNumber(e.target.value) })
                                }
                                className={inputClass}
                              />
                            </div>
                          );
                        })}
                    </div>
                  </div>
                  )}

                  {activeSection === "indirectos" && (
                  <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <h3 className="text-sm font-semibold uppercase text-foreground">
                        Infraestructura
                      </h3>
                      <span className="text-xs text-muted-foreground">
                        Total: {formatCurrency(sumCostItemsByType(INFRA_TYPES))}
                      </span>
                      <div className="flex items-center gap-2">
                        <select
                          className="flex h-9 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground sm:w-64"
                          value=""
                          onChange={(e) => {
                            const value = e.target.value;
                            if (!value) return;
                            upsertCostItem(catalogById.get(value)!, { isEnabled: true });
                          }}
                        >
                          <option value="">Agregar ítem</option>
                          {infraCatalog
                            .filter((item) => !findCostItem(item.id)?.isEnabled)
                            .map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name}
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {infraCatalog
                        .filter((item) => findCostItem(item.id)?.isEnabled)
                        .map((item) => {
                          const costItem = findCostItem(item.id);
                          return (
                            <div key={item.id} className={`${sectionBoxClass} space-y-2`}>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm">{item.name}</span>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <span>Base: {formatCurrency(Number(item.basePrice))}</span>
                                  <button
                                    type="button"
                                    className="rounded-md border border-border px-2 py-1 text-xs"
                                    onClick={() => upsertCostItem(item, { isEnabled: false })}
                                  >
                                    ✕
                                  </button>
                                </div>
                              </div>
                              <Input
                                type="number"
                                placeholder="Precio mensual (override)"
                                value={costItem?.unitPriceOverride ?? ""}
                                onChange={(e) =>
                                  upsertCostItem(item, { unitPriceOverride: toNumber(e.target.value) })
                                }
                                className={inputClass}
                              />
                            </div>
                          );
                        })}
                    </div>
                  </div>
                  )}

                  {activeSection === "indirectos" && (
                  <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <h3 className="text-sm font-semibold uppercase text-foreground">
                        Sistemas
                      </h3>
                      <span className="text-xs text-muted-foreground">
                        Total: {formatCurrency(sumCostItemsByType(["system"]))}
                      </span>
                      <div className="flex items-center gap-2">
                        <select
                          className="flex h-9 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground sm:w-64"
                          value=""
                          onChange={(e) => {
                            const value = e.target.value;
                            if (!value) return;
                            const item = catalogById.get(value);
                            if (!item) return;
                            upsertCostItem(item, { isEnabled: true });
                          }}
                        >
                          <option value="">Agregar ítem</option>
                          {extraItemsCatalog
                            .filter((item) => !findCostItem(item.id)?.isEnabled)
                            .map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.name}
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {otherCostItems
                        .filter((item) => item.isEnabled)
                        .map((item) => {
                          const catalogItem = catalogById.get(item.catalogItemId);
                          if (!catalogItem) return null;
                          return (
                            <div key={item.catalogItemId} className={`${sectionBoxClass} space-y-2`}>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm">{catalogItem.name}</span>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <span>Base: {formatCurrency(Number(catalogItem.basePrice))}</span>
                                  <button
                                    type="button"
                                    className="rounded-md border border-border px-2 py-1 text-xs"
                                    onClick={() => upsertCostItem(catalogItem, { isEnabled: false })}
                                  >
                                    ✕
                                  </button>
                                </div>
                              </div>
                              <Input
                                type="number"
                                placeholder="Precio mensual (override)"
                                value={item.unitPriceOverride ?? ""}
                                onChange={(e) =>
                                  setCostItems((prev) =>
                                    prev.map((c) =>
                                      c.catalogItemId === item.catalogItemId
                                        ? { ...c, unitPriceOverride: toNumber(e.target.value) }
                                        : c
                                    )
                                  )
                                }
                                className={inputClass}
                              />
                            </div>
                          );
                        })}
                    </div>
                  </div>
                  )}

                  {showFinancial && activeSection === "financieros" && (
                  <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <h3 className="text-sm font-semibold uppercase text-foreground">
                        Costos financieros
                      </h3>
                      <span className="text-xs text-muted-foreground">
                        Total mensual: {formatCurrency(financialTotal)}
                      </span>
                      {summary?.monthlyTotal === 0 && (
                        <span className="text-xs text-muted-foreground">
                          Se calcula sobre costo + margen.
                        </span>
                      )}
                      <div className="flex items-center gap-2">
                        <select
                          className="flex h-9 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground sm:w-64"
                          value=""
                          onChange={(e) => {
                            const value = e.target.value;
                            if (!value) return;
                            const item = catalogById.get(value);
                            if (!item) return;
                            upsertCostItem(item, { isEnabled: true });
                          }}
                        >
                          <option value="">Agregar ítem</option>
                          {financialCatalog
                            .filter((item) => !findCostItem(item.id)?.isEnabled)
                            .map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.name}
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {financialCostItems
                        .filter((item) => item.isEnabled)
                        .map((item) => {
                          const catalogItem = catalogById.get(item.catalogItemId);
                          if (!catalogItem) return null;
                          const isPolicy = catalogItem.type === "policy";
                          return (
                            <div key={item.catalogItemId} className={`${sectionBoxClass} space-y-2 ${isPolicy ? "sm:col-span-2 lg:col-span-3" : ""}`}>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm">{catalogItem.name}</span>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <span>
                                    Tasa base: {formatNumber(Number(catalogItem.basePrice || 0), { minDecimals: 2, maxDecimals: 2 })}%
                                  </span>
                                  <button
                                    type="button"
                                    className="rounded-md border border-border px-2 py-1 text-xs"
                                    onClick={() => upsertCostItem(catalogItem, { isEnabled: false })}
                                  >
                                    ✕
                                  </button>
                                </div>
                              </div>
                              <div className="grid gap-2 grid-cols-2 sm:grid-cols-3">
                                <div className="space-y-1.5">
                                  <Label className="text-xs">Tasa (%)</Label>
                                  <Input
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="Ej: 2,50"
                                    value={getDecimalValue(
                                      `rate:${item.catalogItemId}`,
                                      item.unitPriceOverride ?? null,
                                      2,
                                      true
                                    )}
                                    onChange={(e) => setDecimalValue(`rate:${item.catalogItemId}`, e.target.value)}
                                    onBlur={() => {
                                      const raw = decimalDrafts[`rate:${item.catalogItemId}`];
                                      if (raw === undefined) return;
                                      const parsed = raw.trim() ? parseLocalizedNumber(raw) : null;
                                      setCostItems((prev) =>
                                        prev.map((c) =>
                                          c.catalogItemId === item.catalogItemId
                                            ? { ...c, unitPriceOverride: parsed }
                                            : c
                                        )
                                      );
                                      clearDecimalValue(`rate:${item.catalogItemId}`);
                                    }}
                                    className={inputClass}
                                  />
                                </div>
                                {isPolicy && (
                                  <>
                                    <div className="space-y-1.5">
                                      <Label className="text-xs">Meses a considerar</Label>
                                      <Input
                                        type="number"
                                        value={parameters.policyContractMonths}
                                        onChange={(e) =>
                                          setParameters((prev) => ({
                                            ...prev,
                                            policyContractMonths: toNumber(e.target.value),
                                          }))
                                        }
                                        className={inputClass}
                                      />
                                    </div>
                                    <div className="space-y-1.5">
                                      <Label className="text-xs">Porcentaje contrato (%)</Label>
                                      <Input
                                      type="text"
                                      inputMode="decimal"
                                      value={formatNumber(parameters.policyContractPct, { minDecimals: 2, maxDecimals: 2 })}
                                        onChange={(e) =>
                                          setParameters((prev) => ({
                                            ...prev,
                                            policyContractPct: toNumber(e.target.value),
                                          }))
                                        }
                                        className={inputClass}
                                      />
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                  )}

                  {showFinancial && activeSection === "financieros" && (
                  <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-2">
                    <h3 className="text-xs font-semibold uppercase text-foreground">
                      Margen y parámetros
                    </h3>
                    <div className="grid gap-2 grid-cols-2 sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Margen (%)</Label>
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={getDecimalValue("marginPct", parameters.marginPct, 2)}
                          onChange={(e) => setDecimalValue("marginPct", e.target.value)}
                          onBlur={() => {
                            const raw = decimalDrafts.marginPct;
                            if (raw === undefined) return;
                            const parsed = raw.trim() ? parseLocalizedNumber(raw) : 0;
                            setParameters((prev) => ({
                              ...prev,
                              marginPct: parsed,
                            }));
                            clearDecimalValue("marginPct");
                          }}
                          className={inputClass}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Meses contrato</Label>
                        <Input
                          type="number"
                          value={parameters.contractMonths}
                          onChange={(e) =>
                            setParameters((prev) => ({
                              ...prev,
                              contractMonths: toNumber(e.target.value),
                            }))
                          }
                          className={inputClass}
                        />
                      </div>
                    </div>
                  </div>
                  )}
                </div>
              )}

              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Badge variant="outline" className="text-xs">
                  Mobile-first · Los cambios se guardan al presionar "Guardar cambios"
                </Badge>
                <Button
                  size="sm"
                  onClick={() => handleSave()}
                  disabled={saving}
                  className=""
                >
                  {saving ? "Guardando..." : "Guardar cambios"}
                </Button>
              </div>
                </>
              )}
            </DialogContent>
          </Dialog>
          )}
        </div>
      </div>

      {isInline && <div className="space-y-3">{costForm}</div>}

      {summary ? (
        <div className="space-y-3">
          <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-9">
            <KpiCard
              title="Uniformes"
              value={formatCurrency(summary.monthlyUniforms)}
              variant="blue"
              size="sm"
            tooltip={
              <div className="space-y-1.5">
                <div className="font-semibold">Ítems activos:</div>
                {uniforms
                  .filter((item) => item.active)
                  .map((item) => {
                    const price = item.unitPriceOverride
                      ? Number(item.unitPriceOverride)
                      : Number(item.catalogItem?.basePrice ?? 0);
                    return (
                      <div key={item.catalogItemId} className="text-xs">
                        • {item.catalogItem?.name}: {formatCurrency(price)}
                        {item.unitPriceOverride && <span className="text-emerald-300"> (override)</span>}
                      </div>
                    );
                  })}
                <div className="mt-2 border-t border-border/60 pt-2 text-xs">
                  <div>Guardias: {summary.totalGuards}</div>
                  <div>Cambios/año: {parameters.uniformChangesPerYear}</div>
                </div>
              </div>
            }
            />
            <KpiCard
              title="Exámenes"
              value={formatCurrency(summary.monthlyExams)}
              variant="indigo"
              size="sm"
            tooltip={
              <div className="space-y-1.5">
                <div className="font-semibold">Ítems activos:</div>
                {exams
                  .filter((item) => item.active)
                  .map((item) => {
                    const price = item.unitPriceOverride
                      ? Number(item.unitPriceOverride)
                      : Number(item.catalogItem?.basePrice ?? 0);
                    return (
                      <div key={item.catalogItemId} className="text-xs">
                        • {item.catalogItem?.name}: {formatCurrency(price)}
                        {item.unitPriceOverride && <span className="text-emerald-300"> (override)</span>}
                      </div>
                    );
                  })}
                <div className="mt-2 border-t border-border/60 pt-2 text-xs">
                  <div>Guardias: {summary.totalGuards}</div>
                  <div>Meses estadía: {parameters.avgStayMonths}</div>
                </div>
              </div>
            }
            />
            <KpiCard
              title="Alimentación"
              value={formatCurrency(summary.monthlyMeals)}
              variant="sky"
              size="sm"
            tooltip={
              <div className="space-y-1.5">
                <div className="font-semibold">Ítems activos:</div>
                {meals
                  .filter((meal) => meal.isEnabled)
                  .map((meal) => {
                    const catalogItem = mealCatalog.find(
                      (item) => item.name.toLowerCase() === meal.mealType.toLowerCase()
                    );
                    const price = meal.priceOverride
                      ? Number(meal.priceOverride)
                      : Number(catalogItem?.basePrice ?? 0);
                    return (
                      <div key={meal.mealType} className="text-xs">
                        • {meal.mealType}: {formatCurrency(price)} × {meal.mealsPerDay}/día × {meal.daysOfService} días
                        {meal.priceOverride && <span className="text-emerald-300"> (override)</span>}
                      </div>
                    );
                  })}
              </div>
            }
            />
            <KpiCard
              title="Equipo operativo"
              value={formatCurrency(sumCostItemsByType(["phone", "radio", "flashlight"]))}
              variant="emerald"
              size="sm"
            tooltip={
              <div className="space-y-1.5">
                <div className="font-semibold">Ítems activos:</div>
                {costItems
                  .filter((item) => {
                    const catalogItem = catalogById.get(item.catalogItemId);
                    return catalogItem && ["phone", "radio", "flashlight"].includes(catalogItem.type) && item.isEnabled;
                  })
                  .map((item) => {
                    const catalogItem = catalogById.get(item.catalogItemId);
                    const price = item.unitPriceOverride
                      ? Number(item.unitPriceOverride)
                      : Number(catalogItem?.basePrice ?? 0);
                    return (
                      <div key={item.catalogItemId} className="text-xs">
                        • {catalogItem?.name}: {formatCurrency(price)}
                        {item.unitPriceOverride && <span className="text-emerald-300"> (override)</span>}
                      </div>
                    );
                  })}
                <div className="mt-2 border-t border-border/60 pt-2 text-xs">
                  <div>Guardias: {summary.totalGuards}</div>
                </div>
              </div>
            }
            />
            <KpiCard
              title="Transporte"
              value={formatCurrency(sumCostItemsByType(TRANSPORT_TYPES))}
              variant="sky"
              size="sm"
              tooltip={
                <div className="space-y-1.5">
                  <div className="font-semibold">Ítems activos:</div>
                  {costItems
                    .filter((item) => {
                      const catalogItem = catalogById.get(item.catalogItemId);
                      return catalogItem && TRANSPORT_TYPES.includes(catalogItem.type) && item.isEnabled;
                    })
                    .map((item) => {
                      const catalogItem = catalogById.get(item.catalogItemId);
                      const price = item.unitPriceOverride
                        ? Number(item.unitPriceOverride)
                        : Number(catalogItem?.basePrice ?? 0);
                      return (
                        <div key={item.catalogItemId} className="text-xs">
                          • {catalogItem?.name}: {formatCurrency(price)}
                          {item.unitPriceOverride && <span className="text-emerald-300"> (override)</span>}
                        </div>
                      );
                    })}
                </div>
              }
            />
            <KpiCard
              title="Vehículos"
              value={formatCurrency(sumCostItemsByType(VEHICLE_TYPES))}
              variant="indigo"
              size="sm"
              tooltip={
                <div className="space-y-1.5">
                  <div className="font-semibold">Ítems activos:</div>
                  {costItems
                    .filter((item) => {
                      const catalogItem = catalogById.get(item.catalogItemId);
                      return catalogItem && VEHICLE_TYPES.includes(catalogItem.type) && item.isEnabled;
                    })
                    .map((item) => {
                      const catalogItem = catalogById.get(item.catalogItemId);
                      const price = item.unitPriceOverride
                        ? Number(item.unitPriceOverride)
                        : Number(catalogItem?.basePrice ?? 0);
                      return (
                        <div key={item.catalogItemId} className="text-xs">
                          • {catalogItem?.name}: {formatCurrency(price)}
                          {item.unitPriceOverride && <span className="text-emerald-300"> (override)</span>}
                        </div>
                      );
                    })}
                </div>
              }
            />
            <KpiCard
              title="Infraestructura"
              value={formatCurrency(sumCostItemsByType(INFRA_TYPES))}
              variant="teal"
              size="sm"
              tooltip={
                <div className="space-y-1.5">
                  <div className="font-semibold">Ítems activos:</div>
                  {costItems
                    .filter((item) => {
                      const catalogItem = catalogById.get(item.catalogItemId);
                      return catalogItem && INFRA_TYPES.includes(catalogItem.type) && item.isEnabled;
                    })
                    .map((item) => {
                      const catalogItem = catalogById.get(item.catalogItemId);
                      const price = item.unitPriceOverride
                        ? Number(item.unitPriceOverride)
                        : Number(catalogItem?.basePrice ?? 0);
                      return (
                        <div key={item.catalogItemId} className="text-xs">
                          • {catalogItem?.name}: {formatCurrency(price)}
                          {item.unitPriceOverride && <span className="text-emerald-300"> (override)</span>}
                        </div>
                      );
                    })}
                </div>
              }
            />
            <KpiCard
              title="Sistemas"
              value={formatCurrency(sumCostItemsByType(["system"]))}
              variant="purple"
              size="sm"
            tooltip={
              <div className="space-y-1.5">
                <div className="font-semibold">Ítems activos:</div>
                {costItems
                  .filter((item) => {
                    const catalogItem = catalogById.get(item.catalogItemId);
                    return catalogItem?.type === "system" && item.isEnabled;
                  })
                  .map((item) => {
                    const catalogItem = catalogById.get(item.catalogItemId);
                    const price = item.unitPriceOverride
                      ? Number(item.unitPriceOverride)
                      : Number(catalogItem?.basePrice ?? 0);
                    return (
                      <div key={item.catalogItemId} className="text-xs">
                        • {catalogItem?.name}: {formatCurrency(price)}
                        {item.unitPriceOverride && <span className="text-emerald-300"> (override)</span>}
                      </div>
                    );
                  })}
              </div>
            }
            />
            {showFinancial && (
              <KpiCard
                title="Gastos financieros"
                value={formatCurrency(summary.monthlyFinancial + summary.monthlyPolicy)}
                variant="amber"
                size="sm"
                tooltip={
                  <div className="space-y-1.5">
                    <div className="font-semibold">Desglose:</div>
                    <div className="text-xs">Costo financiero: {formatCurrency(summary.monthlyFinancial)}</div>
                    <div className="text-xs">Póliza: {formatCurrency(summary.monthlyPolicy)}</div>
                  </div>
                }
              />
            )}
          </div>
          <div className="flex justify-end">
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5">
              <div className="text-xs text-emerald-300/70 uppercase">Total adicionales</div>
              <div className="font-mono text-sm font-semibold text-emerald-400">
                {formatCurrency(summary.monthlyExtras)}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">
          Agrega costos adicionales para ver el detalle.
        </div>
      )}
    </Card>
  );
}
