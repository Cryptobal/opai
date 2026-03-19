/**
 * Panel de costos adicionales CPQ
 */

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { formatCurrency } from "@/components/cpq/utils";
import { cn, formatNumber, parseLocalizedNumber } from "@/lib/utils";
import { isDefaultUniform } from "@/lib/cpq-constants";
import type {
  CpqCatalogItem,
  CpqQuoteAdditionalLine,
  CpqQuoteCostItem,
  CpqQuoteCostSummary,
  CpqQuoteExamItem,
  CpqQuoteInfrastructure,
  CpqQuoteMeal,
  CpqQuoteParameters,
  CpqQuoteUniformItem,
  CpqQuoteVehicle,
} from "@/types/cpq";
import { ChevronRight, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CpqQuickAddCost } from "@/components/cpq/CpqQuickAddCost";

/* ── Types ── */

interface CpqQuoteCostsProps {
  quoteId: string;
  variant?: "modal" | "inline";
  showFinancial?: boolean;
  readOnly?: boolean;
  onAdditionalLinesChange?: (lines: CpqQuoteAdditionalLine[]) => void;
  onSaved?: () => void;
}

/* ── Constants ── */

const DEFAULT_PARAMS: CpqQuoteParameters = {
  monthlyHoursStandard: 180,
  avgStayMonths: 4,
  uniformChangesPerYear: 3,
  holidayAnnualCount: 12,
  holidayCommercialBufferPct: 10,
  financialRatePct: 2.5,
  salePriceMonthly: 0,
  policyRatePct: 0,
  policyAdminRatePct: 0,
  policyContractMonths: 12,
  policyContractPct: 100,
  contractMonths: 12,
  contractAmount: 0,
  marginPct: 13,
};

const OPERATIONAL_TYPES = ["phone", "radio", "flashlight"];
const TRANSPORT_TYPES = ["transport"];
const VEHICLE_TYPES = ["vehicle_rent", "vehicle_fuel", "vehicle_tag"];
const INFRA_TYPES = ["infrastructure", "fuel"];
const FINANCIAL_TYPES = ["financial", "policy"];

const toNumber = (value: string) => parseLocalizedNumber(value);
const fmtN = (v: number) => formatNumber(v || 0, { minDecimals: 0, maxDecimals: 2 });

const normalizeCostItems = (items: CpqQuoteCostItem[]) =>
  items.map((item) => ({
    ...item,
    quantity: Number(item.quantity ?? 1),
    unitPriceOverride: item.unitPriceOverride ?? null,
  }));

const CATEGORY_META: Record<string, { icon: string; label: string }> = {
  uniforms: { icon: "\u{1F454}", label: "Uniformes" },
  exams: { icon: "\u{1F3E5}", label: "Exámenes" },
  meals: { icon: "\u{1F37D}\uFE0F", label: "Alimentación" },
  operational: { icon: "\u{1F4FB}", label: "Equipos operativos" },
  transport: { icon: "\u{1F68C}", label: "Transporte" },
  vehicles: { icon: "\u{1F697}", label: "Vehículos" },
  infrastructure: { icon: "\u{1F3D7}\uFE0F", label: "Infraestructura" },
  systems: { icon: "\u{1F4BB}", label: "Sistemas" },
};

/* ── Helper: Inline Add-Item Popover ── */

function AddItemPopover({
  items,
  onSelect,
  label,
}: {
  items: { id: string; name: string }[];
  onSelect: (id: string) => void;
  label: string;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const filtered = items.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase())
  );
  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v) setSearch(""); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-full mt-1.5 flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/60 py-2 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
        >
          <Plus className="h-3 w-3" />
          Agregar ítem a {label}
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-2 w-64" align="start">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            placeholder="Buscar ítem..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 text-xs pl-7"
            autoFocus
          />
        </div>
        <div className="max-h-[180px] overflow-y-auto mt-1.5 space-y-0.5">
          {filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => { onSelect(item.id); setOpen(false); }}
              className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-accent transition-colors"
            >
              + {item.name}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">Sin resultados</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ── Main Component ── */

export function CpqQuoteCosts({
  quoteId,
  variant = "modal",
  showFinancial = true,
  readOnly = false,
  onAdditionalLinesChange,
  onSaved,
}: CpqQuoteCostsProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<"directos" | "indirectos" | "financieros">("directos");
  const [showQuickAdd, setShowQuickAdd] = useState(false);
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
    additionalLines: false,
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
  const [additionalLines, setAdditionalLines] = useState<CpqQuoteAdditionalLine[]>([]);
  const [expandedSpecs, setExpandedSpecs] = useState<Record<string, boolean>>({});
  const [skipDefaultCosts, setSkipDefaultCosts] = useState(false);
  const defaultsApplied = useRef(false);
  const inputClass =
    "h-7 bg-card text-foreground border-border placeholder:text-muted-foreground text-xs";
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
        setSkipDefaultCosts(Boolean(payload.skipDefaultCosts));
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
        const lines = payload.additionalLines || [];
        setAdditionalLines(lines);
        onAdditionalLinesChange?.(lines);
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
          technicalSpecs: catalogItem.defaultTechnicalSpecs || null,
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


  const handleSave = async (options?: { close?: boolean; silent?: boolean }) => {
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
          additionalLines,
        }),
      });
      const data = await res.json();
      if (data?.success) {
        setSummary(data.data);
        onAdditionalLinesChange?.(additionalLines);
        if (options?.close !== false) setOpen(false);
        if (!options?.silent) toast.success("Costos guardados");
        onSaved?.();
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


  const initialLoadDone = useRef(false);
  const autoSaveTimer = useRef<NodeJS.Timeout | undefined>(undefined);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  useEffect(() => {
    initialLoadDone.current = false;
    loadData().then(() => {
      setTimeout(() => { initialLoadDone.current = true; }, 100);
    });
  }, [quoteId]);

  useEffect(() => {
    if (open || isInline) {
      defaultsApplied.current = false;
      initialLoadDone.current = false;
      loadData().then(() => {
        setTimeout(() => { initialLoadDone.current = true; }, 100);
      });
      setActiveSection("directos");
    }
  }, [open, isInline]);

  // Debounced auto-save: 2s after last change
  // When onAdditionalLinesChange is provided, the parent owns additionalLines and handles saving them.
  // This component only saves uniforms/exams/costItems/meals/vehicles/infrastructure.
  useEffect(() => {
    if (!initialLoadDone.current || readOnly) return;
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      handleSave({ close: false, silent: true }).then(() => setLastSaved(new Date()));
    }, 2000);
    return () => clearTimeout(autoSaveTimer.current);
  }, [uniforms, exams, costItems, meals, vehicles, infrastructure]);

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
    if (defaultsApplied.current || skipDefaultCosts) return;

    const uniformDefaults = (catalogByType.uniform || []).filter((item) =>
      typeof item.name === "string" && isDefaultUniform(item.name, item.isDefault)
    );
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
  }, [open, isInline, catalog, uniforms.length, exams.length, meals.length, costItems.length, skipDefaultCosts]);

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
      const type = item.customType ?? (item.catalogItemId ? catalogById.get(item.catalogItemId)?.type : undefined);
      return type === "system";
    });
  }, [costItems, catalogById]);

  const financialCostItems = useMemo(() => {
    return costItems.filter((item) => {
      const type = item.customType ?? (item.catalogItemId ? catalogById.get(item.catalogItemId)?.type : undefined);
      return type != null && FINANCIAL_TYPES.includes(type);
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
      const catalogItem = item.catalogItem ?? (item.catalogItemId ? catalogById.get(item.catalogItemId) : undefined);
      const itemType = item.customType ?? catalogItem?.type;
      if (!itemType || !types.includes(itemType)) return sum;
      const base = Number(catalogItem?.basePrice || 0);
      const override =
        item.unitPriceOverride !== null && item.unitPriceOverride !== undefined
          ? Number(item.unitPriceOverride)
          : null;
      const unitPrice = normalizeUnitPrice(override ?? base, catalogItem?.unit);
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

  // ── Subtotals for new layout ──
  const holidayAdjustment = summary?.monthlyHolidayAdjustment ?? 0;
  const operationalTotal = sumCostItemsByType(OPERATIONAL_TYPES);
  const transportTotal = sumCostItemsByType(TRANSPORT_TYPES);
  const vehicleTotal = sumCostItemsByType(VEHICLE_TYPES);
  const infraTotal = sumCostItemsByType(INFRA_TYPES);
  const systemTotal = sumCostItemsByType(["system"]);

  const directosTotal = uniformTotal + examTotal + mealTotal + holidayAdjustment;
  const indirectosTotal = operationalTotal + transportTotal + vehicleTotal + infraTotal + systemTotal;
  const grandTotal = directosTotal + indirectosTotal;

  // ── Category counts ──
  const uniformCount = uniforms.filter((u) => u.active).length;
  const examCount = exams.filter((e) => e.active).length;
  const mealCount = meals.filter((m) => m.isEnabled).length;
  const operationalCount = costItems.filter((c) => c.isEnabled && OPERATIONAL_TYPES.includes(c.customType ?? (c.catalogItemId ? catalogById.get(c.catalogItemId)?.type : undefined) ?? "")).length;
  const transportCount = costItems.filter((c) => c.isEnabled && TRANSPORT_TYPES.includes(c.customType ?? (c.catalogItemId ? catalogById.get(c.catalogItemId)?.type : undefined) ?? "")).length;
  const vehicleCount = costItems.filter((c) => c.isEnabled && VEHICLE_TYPES.includes(c.customType ?? (c.catalogItemId ? catalogById.get(c.catalogItemId)?.type : undefined) ?? "")).length;
  const infraCount = costItems.filter((c) => c.isEnabled && INFRA_TYPES.includes(c.customType ?? (c.catalogItemId ? catalogById.get(c.catalogItemId)?.type : undefined) ?? "")).length;
  const systemCount = otherCostItems.filter((c) => c.isEnabled).length;

  // ── Toggle helper ──
  const toggle = (key: string) =>
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  const isOpen = (key: string) => !collapsedSections[key];

  // ── Render helpers ──

  /** Renders a category row header (clickable to expand/collapse) */
  const renderCategoryRow = (
    key: string,
    count: number,
    total: number
  ) => {
    const meta = CATEGORY_META[key];
    const expanded = isOpen(key);
    const dimmed = total === 0 && count === 0;
    return (
      <button
        type="button"
        onClick={() => toggle(key)}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-accent/30",
          dimmed && "opacity-40"
        )}
      >
        <span className="text-[13px]">{meta.icon}</span>
        <span className="text-[12px] font-medium">{meta.label}</span>
        {count > 0 && (
          <span className="text-[10px] text-muted-foreground">({count})</span>
        )}
        <span className={cn("ml-auto text-[12px] font-semibold tabular-nums", total > 0 ? "text-foreground" : "text-muted-foreground")}>
          {formatCurrency(total)}
        </span>
        <ChevronRight className={cn("h-3 w-3 text-muted-foreground shrink-0 transition-transform", expanded && "rotate-90")} />
      </button>
    );
  };

  /** Item card for uniforms/exams (with simple override input) */
  const renderSimpleItemCard = (
    item: CpqCatalogItem,
    overrideValue: number | null | undefined,
    onOverride: (v: number) => void,
    onRemove: () => void
  ) => (
    <div className="p-2.5 rounded-lg bg-card border border-border/50">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[13px] font-semibold truncate">{item.name}</span>
        <button type="button" onClick={onRemove} className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0">
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      <div className="text-[11px] text-muted-foreground mb-1.5">
        Base: {formatCurrency(Number(item.basePrice))}
      </div>
      <Input
        type="text"
        inputMode="numeric"
        placeholder="Precio mensual"
        value={overrideValue != null ? fmtN(Number(overrideValue)) : ""}
        onChange={(e) => onOverride(toNumber(e.target.value))}
        className={inputClass}
      />
    </div>
  );

  /** Item card for cost items (operational, transport, infra, systems) */
  const renderCostItemCard = (
    item: CpqCatalogItem,
    costItem: CpqQuoteCostItem | undefined
  ) => {
    const specKey = item.id;
    const hasSpecs = !!(costItem?.technicalSpecs || item.defaultTechnicalSpecs);
    const isSpecsOpen = expandedSpecs[specKey] ?? false;
    return (
      <div key={item.id} className="p-2.5 rounded-lg bg-card border border-border/50">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[13px] font-semibold truncate">{item.name}</span>
          <button type="button" onClick={() => upsertCostItem(item, { isEnabled: false })} className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
        <div className="text-[11px] text-muted-foreground mb-1.5">
          Base: {formatCurrency(Number(item.basePrice))}
        </div>
        <Input
          type="text"
          inputMode="numeric"
          placeholder="Precio mensual"
          value={costItem?.unitPriceOverride != null ? fmtN(Number(costItem.unitPriceOverride)) : ""}
          onChange={(e) => upsertCostItem(item, { unitPriceOverride: toNumber(e.target.value) })}
          className={inputClass}
        />
        <button
          type="button"
          className={cn("mt-1.5 text-[10px] flex items-center gap-1", hasSpecs ? "text-primary" : "text-muted-foreground hover:text-foreground")}
          onClick={() => setExpandedSpecs((prev) => ({ ...prev, [specKey]: !prev[specKey] }))}
        >
          <ChevronRight className={cn("h-3 w-3 transition-transform", isSpecsOpen && "rotate-90")} />
          Espec. técnicas{hasSpecs && !isSpecsOpen ? " *" : ""}
        </button>
        {isSpecsOpen && (
          <textarea
            rows={2}
            placeholder="Ej: Camioneta doble cabina 4x4, motor 2.8L..."
            value={costItem?.technicalSpecs ?? item.defaultTechnicalSpecs ?? ""}
            onChange={(e) => upsertCostItem(item, { technicalSpecs: e.target.value || null })}
            className="mt-1 w-full rounded-md border border-border bg-muted/30 px-2 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-ring"
          />
        )}
      </div>
    );
  };

  /** Vehicle fuel calculator card */
  const renderFuelCard = (item: CpqCatalogItem, costItem: CpqQuoteCostItem | undefined) => {
    let fuelParams = { kmPerDay: 0, kmPerLiter: 10, fuelPrice: 1250 };
    try {
      if (costItem?.notes) {
        const parsed = JSON.parse(costItem.notes);
        fuelParams = { ...fuelParams, ...parsed };
      }
    } catch {}
    const kmMes = fuelParams.kmPerDay * 30;
    const litrosMes = fuelParams.kmPerLiter > 0 ? kmMes / fuelParams.kmPerLiter : 0;
    const costoMensual = Math.round(litrosMes * fuelParams.fuelPrice);

    const updateFuelParam = (key: string, value: number) => {
      const updated = { ...fuelParams, [key]: value };
      const newKmMes = updated.kmPerDay * 30;
      const newLitros = updated.kmPerLiter > 0 ? newKmMes / updated.kmPerLiter : 0;
      const newCosto = Math.round(newLitros * updated.fuelPrice);
      upsertCostItem(item, {
        unitPriceOverride: newCosto,
        notes: JSON.stringify(updated),
      });
    };

    return (
      <div key={item.id} className="p-2.5 rounded-lg bg-card border border-border/50 col-span-full">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[13px] font-semibold">{item.name}</span>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">Por fórmula</span>
            <button type="button" onClick={() => upsertCostItem(item, { isEnabled: false })} className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10">
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>
        <div className="grid gap-2 grid-cols-3">
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground">Km/día</label>
            <Input type="text" inputMode="numeric" placeholder="50" value={fuelParams.kmPerDay ? fmtN(fuelParams.kmPerDay) : ""} onChange={(e) => updateFuelParam("kmPerDay", toNumber(e.target.value))} className={inputClass} />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground">Km/litro</label>
            <Input type="text" inputMode="numeric" placeholder="10" value={fuelParams.kmPerLiter ? fmtN(fuelParams.kmPerLiter) : ""} onChange={(e) => updateFuelParam("kmPerLiter", toNumber(e.target.value))} className={inputClass} />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground">$/litro</label>
            <Input type="text" inputMode="numeric" placeholder="1250" value={fuelParams.fuelPrice ? fmtN(fuelParams.fuelPrice) : ""} onChange={(e) => updateFuelParam("fuelPrice", toNumber(e.target.value))} className={inputClass} />
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-md bg-muted/40 px-2.5 py-1.5 mt-2 text-[11px]">
          <span className="text-muted-foreground">
            {fuelParams.kmPerDay} km/d &times; 30 = <strong>{kmMes.toLocaleString("es-CL")} km/m</strong>
          </span>
          <span className="text-muted-foreground">&divide; {fuelParams.kmPerLiter} = <strong>{litrosMes.toLocaleString("es-CL", { maximumFractionDigits: 1 })} l/m</strong></span>
          <span className="ml-auto font-semibold text-foreground">{formatCurrency(costoMensual)}</span>
        </div>
        {(() => {
          const specKey = `fuel_${item.id}`;
          const hasSpecs = !!(costItem?.technicalSpecs || item.defaultTechnicalSpecs);
          const isSpecsOpen = expandedSpecs[specKey] ?? false;
          return (
            <>
              <button
                type="button"
                className={cn("mt-1.5 text-[10px] flex items-center gap-1", hasSpecs ? "text-primary" : "text-muted-foreground hover:text-foreground")}
                onClick={() => setExpandedSpecs((prev) => ({ ...prev, [specKey]: !prev[specKey] }))}
              >
                <ChevronRight className={cn("h-3 w-3 transition-transform", isSpecsOpen && "rotate-90")} />
                Espec. técnicas{hasSpecs && !isSpecsOpen ? " *" : ""}
              </button>
              {isSpecsOpen && (
                <textarea
                  rows={2}
                  placeholder="Ej: Camioneta doble cabina 4x4, motor 2.8L..."
                  value={costItem?.technicalSpecs ?? item.defaultTechnicalSpecs ?? ""}
                  onChange={(e) => upsertCostItem(item, { technicalSpecs: e.target.value || null })}
                  className="mt-1 w-full rounded-md border border-border bg-muted/30 px-2 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                />
              )}
            </>
          );
        })()}
      </div>
    );
  };

  // ══════════════════════════════════════════════════════
  // ── costForm: the main cost editor content ──
  // ══════════════════════════════════════════════════════

  const costForm = loading ? (
    <div className="text-sm text-muted-foreground py-8 text-center">Cargando costos...</div>
  ) : (
    <div className="space-y-2">
      {/* Quick Add */}
      {!readOnly && !showQuickAdd && (
        <button
          type="button"
          onClick={() => setShowQuickAdd(true)}
          className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-emerald-500/30 py-2 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/5 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Agregar costo
        </button>
      )}
      {showQuickAdd && (
        <CpqQuickAddCost
          catalog={catalog}
          contractDuration={parameters.contractMonths || 12}
          onClose={() => setShowQuickAdd(false)}
          onAdd={(item) => {
            setCostItems((prev) => [
              ...prev,
              {
                catalogItemId: item.catalogItemId,
                customName: item.customName || null,
                customType: item.customType || null,
                calcMode: item.calcMode,
                quantity: item.quantity,
                unitPriceOverride: item.unitPriceOverride,
                isEnabled: true,
                visibility: "visible",
                notes: item.investmentAmount
                  ? JSON.stringify({ investmentAmount: item.investmentAmount, investmentMonths: item.investmentMonths })
                  : "",
              },
            ]);
            setShowQuickAdd(false);
          }}
          onSaveToCatalog={async (payload) => {
            try {
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
              if (data?.success) {
                setCatalog((prev) => [...prev, data.data]);
                return data.data;
              }
              return null;
            } catch {
              return null;
            }
          }}
        />
      )}

    <div className="rounded-xl border bg-card overflow-hidden">
      {/* ── DIRECTOS ── */}
      <div className="px-3 py-1.5 flex justify-between items-center bg-emerald-500/5">
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-emerald-500">Directos</span>
        <span className="text-[12px] font-bold tabular-nums text-emerald-500">{formatCurrency(directosTotal)}</span>
      </div>

      {/* Uniformes */}
      {renderCategoryRow("uniforms", uniformCount, uniformTotal)}
      {isOpen("uniforms") && (
        <div className="px-4 pb-3">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-2">
            {(catalogByType.uniform || [])
              .filter((item) => uniforms.find((u) => u.catalogItemId === item.id && u.active))
              .map((item) => {
                const sel = uniforms.find((u) => u.catalogItemId === item.id);
                return (
                  <div key={item.id}>
                    {renderSimpleItemCard(
                      item,
                      sel?.unitPriceOverride,
                      (v) => setUniforms((prev) => prev.map((u) => u.catalogItemId === item.id ? { ...u, unitPriceOverride: v } : u)),
                      () => setUniforms((prev) => prev.map((u) => u.catalogItemId === item.id ? { ...u, active: false } : u))
                    )}
                  </div>
                );
              })}
          </div>
          <AddItemPopover
            label="Uniformes"
            items={(catalogByType.uniform || []).filter((item) => !uniforms.find((u) => u.catalogItemId === item.id && u.active))}
            onSelect={(id) => {
              setUniforms((prev) => {
                const existing = prev.find((u) => u.catalogItemId === id);
                if (existing) return prev.map((u) => u.catalogItemId === id ? { ...u, active: true } : u);
                const catalogItem = catalogById.get(id);
                if (!catalogItem) return prev;
                return [...prev, { catalogItemId: id, unitPriceOverride: null, active: true, catalogItem }];
              });
            }}
          />
        </div>
      )}

      {/* Exámenes */}
      <div className="border-t border-border/30" />
      {renderCategoryRow("exams", examCount, examTotal)}
      {isOpen("exams") && (
        <div className="px-4 pb-3">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-2">
            {(catalogByType.exam || [])
              .filter((item) => exams.find((u) => u.catalogItemId === item.id && u.active))
              .map((item) => {
                const sel = exams.find((u) => u.catalogItemId === item.id);
                return (
                  <div key={item.id}>
                    {renderSimpleItemCard(
                      item,
                      sel?.unitPriceOverride,
                      (v) => setExams((prev) => prev.map((u) => u.catalogItemId === item.id ? { ...u, unitPriceOverride: v } : u)),
                      () => setExams((prev) => prev.map((u) => u.catalogItemId === item.id ? { ...u, active: false } : u))
                    )}
                  </div>
                );
              })}
          </div>
          <AddItemPopover
            label="Exámenes"
            items={(catalogByType.exam || []).filter((item) => !exams.find((u) => u.catalogItemId === item.id && u.active))}
            onSelect={(id) => {
              setExams((prev) => {
                const existing = prev.find((u) => u.catalogItemId === id);
                if (existing) return prev.map((u) => u.catalogItemId === id ? { ...u, active: true } : u);
                const catalogItem = catalogById.get(id);
                if (!catalogItem) return prev;
                return [...prev, { catalogItemId: id, unitPriceOverride: null, active: true, catalogItem }];
              });
            }}
          />
        </div>
      )}

      {/* Alimentación */}
      <div className="border-t border-border/30" />
      {renderCategoryRow("meals", mealCount, mealTotal)}
      {isOpen("meals") && (
        <div className="px-4 pb-3">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2">
            {mealCatalog
              .filter((item) => meals.find((m) => m.mealType.toLowerCase() === item.name.toLowerCase() && m.isEnabled))
              .map((item) => {
                const meal = meals.find((m) => m.mealType.toLowerCase() === item.name.toLowerCase());
                return (
                  <div key={item.id} className="p-2.5 rounded-lg bg-card border border-border/50">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[13px] font-semibold">{item.name}</span>
                      <button type="button" onClick={() => updateMeal(item.name, { isEnabled: false })} className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="text-[11px] text-muted-foreground mb-1.5">Base: {formatCurrency(Number(item.basePrice))}</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <Input type="text" inputMode="numeric" placeholder="Comidas/día" value={fmtN(meal?.mealsPerDay ?? 0)} onChange={(e) => updateMeal(item.name, { mealsPerDay: toNumber(e.target.value) })} className={inputClass} />
                      <Input type="text" inputMode="numeric" placeholder="Días/mes" value={fmtN(meal?.daysOfService ?? 0)} onChange={(e) => updateMeal(item.name, { daysOfService: toNumber(e.target.value) })} className={inputClass} />
                      <Input type="text" inputMode="numeric" placeholder="Precio mensual" value={meal?.priceOverride != null ? fmtN(Number(meal.priceOverride)) : ""} onChange={(e) => updateMeal(item.name, { priceOverride: toNumber(e.target.value) })} className={cn(inputClass, "col-span-2")} />
                    </div>
                  </div>
                );
              })}
          </div>
          <AddItemPopover
            label="Alimentación"
            items={mealCatalog.filter((item) => !meals.find((m) => m.mealType.toLowerCase() === item.name.toLowerCase() && m.isEnabled))}
            onSelect={(id) => {
              const item = catalog.find((c) => c.id === id);
              if (item) updateMeal(item.name, { isEnabled: true });
            }}
          />
        </div>
      )}

      {/* Feriados (static, non-expandible) */}
      <div className="border-t border-border/30" />
      <div className="flex items-center gap-2 px-3 py-1.5">
        <span className="text-[13px]">{"\u{1F4C5}"}</span>
        <span className="text-[12px] font-medium">Ajuste feriados</span>
        <span className="text-[9px] font-semibold uppercase text-amber-400 bg-amber-500/10 rounded px-1.5 py-0.5">Auto</span>
        <span className={cn("ml-auto text-[12px] font-semibold tabular-nums", holidayAdjustment > 0 ? "text-foreground" : "text-muted-foreground")}>
          {formatCurrency(holidayAdjustment)}
        </span>
      </div>

      {/* ── SEPARATOR ── */}
      <div className="h-[3px] bg-border" />

      {/* ── INDIRECTOS ── */}
      <div className="px-3 py-1.5 flex justify-between items-center bg-amber-400/5">
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-amber-400">Indirectos</span>
        <span className="text-[12px] font-bold tabular-nums text-amber-400">{formatCurrency(indirectosTotal)}</span>
      </div>

      {/* Equipos operativos */}
      {renderCategoryRow("operational", operationalCount, operationalTotal)}
      {isOpen("operational") && (
        <div className="px-4 pb-3">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-2">
            {operationalCatalog.filter((item) => findCostItem(item.id)?.isEnabled).map((item) => renderCostItemCard(item, findCostItem(item.id)))}
          </div>
          <AddItemPopover
            label="Equipos operativos"
            items={operationalCatalog.filter((item) => !findCostItem(item.id)?.isEnabled)}
            onSelect={(id) => upsertCostItem(catalogById.get(id)!, { isEnabled: true })}
          />
        </div>
      )}

      {/* Transporte */}
      <div className="border-t border-border/30" />
      {renderCategoryRow("transport", transportCount, transportTotal)}
      {isOpen("transport") && (
        <div className="px-4 pb-3">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-2">
            {transportCatalog.filter((item) => findCostItem(item.id)?.isEnabled).map((item) => renderCostItemCard(item, findCostItem(item.id)))}
          </div>
          <AddItemPopover
            label="Transporte"
            items={transportCatalog.filter((item) => !findCostItem(item.id)?.isEnabled)}
            onSelect={(id) => upsertCostItem(catalogById.get(id)!, { isEnabled: true })}
          />
        </div>
      )}

      {/* Vehículos */}
      <div className="border-t border-border/30" />
      {renderCategoryRow("vehicles", vehicleCount, vehicleTotal)}
      {isOpen("vehicles") && (
        <div className="px-4 pb-3">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-2">
            {vehicleCatalog.filter((item) => findCostItem(item.id)?.isEnabled).map((item) =>
              item.type === "vehicle_fuel"
                ? renderFuelCard(item, findCostItem(item.id))
                : renderCostItemCard(item, findCostItem(item.id))
            )}
          </div>
          <AddItemPopover
            label="Vehículos"
            items={vehicleCatalog.filter((item) => !findCostItem(item.id)?.isEnabled)}
            onSelect={(id) => upsertCostItem(catalogById.get(id)!, { isEnabled: true })}
          />
        </div>
      )}

      {/* Infraestructura */}
      <div className="border-t border-border/30" />
      {renderCategoryRow("infrastructure", infraCount, infraTotal)}
      {isOpen("infrastructure") && (
        <div className="px-4 pb-3">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-2">
            {infraCatalog.filter((item) => findCostItem(item.id)?.isEnabled).map((item) => renderCostItemCard(item, findCostItem(item.id)))}
          </div>
          <AddItemPopover
            label="Infraestructura"
            items={infraCatalog.filter((item) => !findCostItem(item.id)?.isEnabled)}
            onSelect={(id) => upsertCostItem(catalogById.get(id)!, { isEnabled: true })}
          />
        </div>
      )}

      {/* Sistemas */}
      <div className="border-t border-border/30" />
      {renderCategoryRow("systems", systemCount, systemTotal)}
      {isOpen("systems") && (
        <div className="px-4 pb-3">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-2">
            {otherCostItems.filter((item) => item.isEnabled).map((item) => {
              const ci = item.catalogItemId ? catalogById.get(item.catalogItemId) : undefined;
              const itemName = item.customName ?? ci?.name ?? "Sin nombre";
              return (
                <div key={item.id ?? item.catalogItemId ?? itemName} className="p-2.5 rounded-lg bg-card border border-border/50">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[13px] font-semibold truncate">{itemName}</span>
                    <button type="button" onClick={() => {
                      if (ci) upsertCostItem(ci, { isEnabled: false });
                      else setCostItems((prev) => prev.map((c) => c.id === item.id ? { ...c, isEnabled: false } : c));
                    }} className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="text-[11px] text-muted-foreground mb-1.5">Base: {formatCurrency(Number(ci?.basePrice ?? 0))}</div>
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="Precio mensual"
                    value={item.unitPriceOverride != null ? fmtN(Number(item.unitPriceOverride)) : ""}
                    onChange={(e) => setCostItems((prev) => prev.map((c) => (item.id ? c.id === item.id : c.catalogItemId === item.catalogItemId) ? { ...c, unitPriceOverride: toNumber(e.target.value) } : c))}
                    className={inputClass}
                  />
                  {(() => {
                    const specKey = `sys_${item.id ?? item.catalogItemId}`;
                    const hasSpecs = !!(item.technicalSpecs || ci?.defaultTechnicalSpecs);
                    const isSpecsOpen = expandedSpecs[specKey] ?? false;
                    return (
                      <>
                        <button
                          type="button"
                          className={cn("mt-1.5 text-[10px] flex items-center gap-1", hasSpecs ? "text-primary" : "text-muted-foreground hover:text-foreground")}
                          onClick={() => setExpandedSpecs((prev) => ({ ...prev, [specKey]: !prev[specKey] }))}
                        >
                          <ChevronRight className={cn("h-3 w-3 transition-transform", isSpecsOpen && "rotate-90")} />
                          Espec. técnicas{hasSpecs && !isSpecsOpen ? " *" : ""}
                        </button>
                        {isSpecsOpen && (
                          <textarea
                            rows={2}
                            placeholder="Ej: Sistema CCTV 4 cámaras IP..."
                            value={item.technicalSpecs ?? ci?.defaultTechnicalSpecs ?? ""}
                            onChange={(e) => setCostItems((prev) => prev.map((c) => (item.id ? c.id === item.id : c.catalogItemId === item.catalogItemId) ? { ...c, technicalSpecs: e.target.value || null } : c))}
                            className="mt-1 w-full rounded-md border border-border bg-muted/30 px-2 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        )}
                      </>
                    );
                  })()}
                </div>
              );
            })}
          </div>
          <AddItemPopover
            label="Sistemas"
            items={extraItemsCatalog.filter((item) => !findCostItem(item.id)?.isEnabled)}
            onSelect={(id) => {
              const item = catalogById.get(id);
              if (item) upsertCostItem(item, { isEnabled: true });
            }}
          />
        </div>
      )}

      {/* ── TOTAL FOOTER ── */}
      <div className="border-t-2 border-primary bg-primary/5 px-3 py-2 flex justify-between items-center">
        <span className="text-[10px] font-bold text-primary uppercase tracking-[0.08em]">Total costos adicionales</span>
        <span className="text-sm font-extrabold text-primary tabular-nums">{formatCurrency(grandTotal)}</span>
      </div>
    </div>
    </div>
  );

  // ══════════════════════════════════════════════════════
  // ── Financial section (shown in modal/showFinancial mode) ──
  // ══════════════════════════════════════════════════════

  const financialForm = showFinancial ? (
    <div className="space-y-3 mt-3">
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-[13px] font-semibold">Costos financieros</h3>
          <span className="text-xs text-muted-foreground">Total: {formatCurrency(financialTotal)}</span>
        </div>
        <div className="px-4 pb-3 grid gap-2 grid-cols-2 lg:grid-cols-3">
          {financialCostItems.filter((item) => item.isEnabled).map((item) => {
            const ci = item.catalogItemId ? catalogById.get(item.catalogItemId) : undefined;
            const itemName = item.customName ?? ci?.name ?? "Sin nombre";
            const itemType = item.customType ?? ci?.type ?? "";
            if (!ci && !item.customType) return null;
            const isPolicy = itemType === "policy";
            return (
              <div key={item.id ?? item.catalogItemId} className={cn("p-2.5 rounded-lg bg-muted/10 border border-border/50 space-y-2", isPolicy && "col-span-full")}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-semibold">{itemName}</span>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>Tasa base: {formatNumber(Number(ci?.basePrice || 0), { minDecimals: 2, maxDecimals: 2 })}%</span>
                    <button type="button" className="w-5 h-5 rounded flex items-center justify-center hover:text-destructive hover:bg-destructive/10" onClick={() => {
                      if (ci) upsertCostItem(ci, { isEnabled: false });
                      else setCostItems((prev) => prev.map((c) => c.id === item.id ? { ...c, isEnabled: false } : c));
                    }}>
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <div className={cn("grid gap-2", isPolicy ? "grid-cols-3" : "grid-cols-1")}>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Tasa (%)</Label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder="Ej: 2,50"
                      value={getDecimalValue(`rate:${item.id ?? item.catalogItemId}`, item.unitPriceOverride ?? null, 2, true)}
                      onChange={(e) => setDecimalValue(`rate:${item.id ?? item.catalogItemId}`, e.target.value)}
                      onBlur={() => {
                        const rateKey = item.id ?? item.catalogItemId;
                        const raw = decimalDrafts[`rate:${rateKey}`];
                        if (raw === undefined) return;
                        const parsed = raw.trim() ? parseLocalizedNumber(raw) : null;
                        setCostItems((prev) => prev.map((c) => (item.id ? c.id === item.id : c.catalogItemId === item.catalogItemId) ? { ...c, unitPriceOverride: parsed } : c));
                        clearDecimalValue(`rate:${rateKey}`);
                      }}
                      className={inputClass}
                    />
                  </div>
                  {isPolicy && (
                    <>
                      <div className="space-y-1">
                        <Label className="text-[10px]">Meses</Label>
                        <Input type="text" inputMode="numeric" value={fmtN(parameters.policyContractMonths)} onChange={(e) => setParameters((prev) => ({ ...prev, policyContractMonths: toNumber(e.target.value) }))} className={inputClass} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px]">% contrato</Label>
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={getDecimalValue("policyContractPct", parameters.policyContractPct, 2)}
                          onChange={(e) => setDecimalValue("policyContractPct", e.target.value)}
                          onBlur={() => {
                            const raw = decimalDrafts.policyContractPct;
                            if (raw === undefined) return;
                            const parsed = raw.trim() ? parseLocalizedNumber(raw) : 0;
                            setParameters((prev) => ({ ...prev, policyContractPct: parsed }));
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
        <div className="px-4 pb-3">
          <AddItemPopover
            label="Financieros"
            items={financialCatalog.filter((item) => !findCostItem(item.id)?.isEnabled)}
            onSelect={(id) => {
              const item = catalogById.get(id);
              if (item) upsertCostItem(item, { isEnabled: true });
            }}
          />
        </div>
      </div>

      {/* Margin params */}
      <div className="rounded-xl border bg-card px-4 py-3 space-y-2">
        <h3 className="text-[13px] font-semibold">Margen y parámetros</h3>
        <div className="grid gap-2 grid-cols-2">
          <div className="space-y-1">
            <Label className="text-[10px]">Margen (%)</Label>
            <Input
              type="text"
              inputMode="decimal"
              value={getDecimalValue("marginPct", parameters.marginPct, 2)}
              onChange={(e) => setDecimalValue("marginPct", e.target.value)}
              onBlur={() => {
                const raw = decimalDrafts.marginPct;
                if (raw === undefined) return;
                const parsed = raw.trim() ? parseLocalizedNumber(raw) : 0;
                setParameters((prev) => ({ ...prev, marginPct: parsed }));
                clearDecimalValue("marginPct");
              }}
              className={inputClass}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">Meses contrato</Label>
            <Input type="text" inputMode="numeric" value={fmtN(parameters.contractMonths)} onChange={(e) => setParameters((prev) => ({ ...prev, contractMonths: toNumber(e.target.value) }))} className={inputClass} />
          </div>
        </div>
      </div>
    </div>
  ) : null;

  // ══════════════════════════════════════════════════════
  // ── Return ──
  // ══════════════════════════════════════════════════════

  return (
    <section className="space-y-1">
      {/* Save indicator */}
      <div className="flex justify-end px-1">
        <span className="text-[10px] text-muted-foreground">
          {saving ? "Guardando..." : lastSaved ? "Guardado \u2713" : ""}
        </span>
      </div>

      {/* Modal mode: button + dialog */}
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
            {financialForm}
          </DialogContent>
        </Dialog>
      )}

      {/* Inline mode: render directly */}
      {isInline && (
        <>
          {costForm}
          {financialForm}
        </>
      )}
    </section>
  );
}
