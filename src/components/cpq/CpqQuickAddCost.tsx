"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/components/cpq/utils";
import { Search, X } from "lucide-react";
import type { CpqCatalogItem } from "@/types/cpq";
import { toast } from "sonner";

type CostType = "per_month" | "per_guard" | "investment";

interface CpqQuickAddCostProps {
  catalog: CpqCatalogItem[];
  contractDuration: number;
  onAdd: (item: {
    catalogItemId: string | null;
    customName: string;
    customType: string | null;
    calcMode: string;
    unitPriceOverride: number;
    quantity: number;
    isEnabled: boolean;
    investmentAmount?: number;
    investmentMonths?: number;
  }) => void;
  onSaveToCatalog?: (payload: { name: string; unit: string; basePrice: number; type?: string }) => Promise<CpqCatalogItem | null>;
  onClose: () => void;
}

export function CpqQuickAddCost({
  catalog,
  contractDuration,
  onAdd,
  onSaveToCatalog,
  onClose,
}: CpqQuickAddCostProps) {
  const [search, setSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState<CpqCatalogItem | null>(null);
  const [customName, setCustomName] = useState("");
  const [costType, setCostType] = useState<CostType>("per_month");
  const [amount, setAmount] = useState(0);
  const [investmentMonths, setInvestmentMonths] = useState(contractDuration || 12);
  const [saveToCatalog, setSaveToCatalog] = useState(false);
  const [catalogType, setCatalogType] = useState("other");
  const [showResults, setShowResults] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return catalog.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 8);
  }, [search, catalog]);

  const monthlyCost = costType === "investment" && investmentMonths > 0
    ? Math.round(amount / investmentMonths)
    : amount;

  const handleSelectCatalogItem = (item: CpqCatalogItem) => {
    setSelectedItem(item);
    setSearch(item.name);
    setAmount(Number(item.basePrice) || 0);
    setShowResults(false);
  };

  const handleCreateCustom = () => {
    setSelectedItem(null);
    setCustomName(search);
    setShowResults(false);
  };

  const handleSubmit = async () => {
    const name = selectedItem?.name || customName || search.trim();
    if (!name) {
      toast.error("Ingresa un nombre para el costo");
      return;
    }

    setSaving(true);
    try {
      let catalogItemId: string | null = selectedItem?.id ?? null;

      if (!catalogItemId && saveToCatalog && onSaveToCatalog) {
        const created = await onSaveToCatalog({
          name,
          unit: "mes",
          basePrice: amount,
          type: catalogType,
        });
        if (created) catalogItemId = created.id;
      }

      onAdd({
        catalogItemId,
        customName: catalogItemId ? "" : name,
        customType: catalogItemId ? null : "other",
        calcMode: costType === "per_guard" ? "per_guard" : "per_month",
        unitPriceOverride: monthlyCost,
        quantity: 1,
        isEnabled: true,
        ...(costType === "investment" ? { investmentAmount: amount, investmentMonths } : {}),
      });

      onClose();
    } catch {
      toast.error("Error al agregar costo");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/[0.04] p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-bold text-emerald-400">+ Nuevo costo</span>
        <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Combobox */}
      <div className="relative">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            ref={inputRef}
            placeholder="Buscar en catálogo o crear nuevo..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setShowResults(true); setSelectedItem(null); }}
            onFocus={() => search.trim() && setShowResults(true)}
            className="h-8 pl-8 text-xs bg-card border-border"
          />
        </div>
        {showResults && search.trim() && (
          <div className="absolute z-10 top-full mt-1 w-full rounded-md border bg-popover shadow-lg max-h-48 overflow-y-auto">
            {filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectCatalogItem(item)}
                className="w-full flex items-center justify-between px-3 py-1.5 text-xs hover:bg-accent transition-colors"
              >
                <span>{item.name}</span>
                <span className="text-muted-foreground">{formatCurrency(Number(item.basePrice))}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={handleCreateCustom}
              className="w-full flex items-center px-3 py-1.5 text-xs text-emerald-400 hover:bg-accent transition-colors border-t border-border"
            >
              Crear: &ldquo;{search.trim()}&rdquo;
            </button>
          </div>
        )}
      </div>

      {/* Tipo de costo */}
      <div className="flex gap-1.5">
        {([
          { value: "per_month" as const, label: "Fijo mensual" },
          { value: "per_guard" as const, label: "Por guardia" },
          { value: "investment" as const, label: "Inversión" },
        ]).map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setCostType(t.value)}
            className={cn(
              "flex-1 h-7 rounded-md border text-[11px] font-semibold transition-colors",
              costType === t.value
                ? "bg-emerald-500 text-emerald-950 border-emerald-500"
                : "bg-card text-muted-foreground border-border hover:bg-muted/50",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Amount fields */}
      {costType === "investment" ? (
        <div className="flex gap-2">
          <div className="flex-1 space-y-1">
            <label className="text-[10px] text-muted-foreground">Monto inversión</label>
            <Input
              type="text"
              inputMode="numeric"
              value={amount ? formatCurrency(amount).replace("$", "") : ""}
              onChange={(e) => setAmount(Number(e.target.value.replace(/\D/g, "")) || 0)}
              className="h-7 text-xs bg-card border-border"
              placeholder="$1.300.000"
            />
          </div>
          <div className="w-24 space-y-1">
            <label className="text-[10px] text-muted-foreground">Amort. meses</label>
            <Input
              type="number"
              min={1}
              value={investmentMonths}
              onChange={(e) => setInvestmentMonths(Number(e.target.value) || contractDuration)}
              className="h-7 text-xs bg-card border-border"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground">
            {costType === "per_guard" ? "Precio por guardia/mes" : "Precio mensual"}
          </label>
          <Input
            type="text"
            inputMode="numeric"
            value={amount ? formatCurrency(amount).replace("$", "") : ""}
            onChange={(e) => setAmount(Number(e.target.value.replace(/\D/g, "")) || 0)}
            className="h-7 text-xs bg-card border-border"
            placeholder="$50.000"
          />
        </div>
      )}

      {/* Investment monthly preview */}
      {costType === "investment" && amount > 0 && (
        <div className="rounded-md bg-emerald-500/10 px-2.5 py-1.5 text-[12px] font-semibold text-emerald-400">
          → Costo mensual: {formatCurrency(monthlyCost)}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={saveToCatalog}
              onChange={(e) => setSaveToCatalog(e.target.checked)}
              className="accent-emerald-500 h-3.5 w-3.5"
            />
            Guardar en catálogo
          </label>
          {saveToCatalog && (
            <select
              value={catalogType}
              onChange={(e) => setCatalogType(e.target.value)}
              className="h-6 text-[10px] rounded border border-border bg-card px-1 text-foreground"
            >
              <option value="other">Otros costos adicionales</option>
              <option value="uniform">Uniforme</option>
              <option value="exam">Examen</option>
              <option value="meal">Alimentación</option>
              <option value="phone">Teléfono</option>
              <option value="radio">Radio</option>
              <option value="flashlight">Linterna</option>
              <option value="transport">Transporte</option>
              <option value="infrastructure">Infraestructura</option>
              <option value="system">Sistema</option>
            </select>
          )}
        </div>
        <Button
          size="sm"
          className="h-7 px-3 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={handleSubmit}
          disabled={saving || (!search.trim() && !selectedItem)}
        >
          {saving ? "..." : "Agregar"}
        </Button>
      </div>
    </div>
  );
}
