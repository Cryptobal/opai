/**
 * CPQ Catalog Configuration (global per tenant)
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/opai";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Save, Plus, Trash2, ChevronDown, Info } from "lucide-react";
import { toast } from "sonner";
import { formatNumber, parseLocalizedNumber, cn } from "@/lib/utils";

type CatalogItem = {
  id: string;
  type: string;
  name: string;
  unit: string;
  basePrice: number;
  isDefault: boolean;
  active: boolean;
};

const TYPE_NAMES: Record<string, string> = {
  uniform: "Uniforme",
  exam: "Examen",
  meal: "Alimentación",
  phone: "Teléfono",
  radio: "Radio",
  flashlight: "Linterna",
  infrastructure: "Caseta/Baño/Generador",
  fuel: "Combustible",
  transport: "Traslado/Movilización",
  vehicle_rent: "Arriendo vehículo",
  vehicle_fuel: "Bencina",
  vehicle_tag: "TAG",
  system: "Sistema",
};

const GROUPS = [
  { id: "uniform", label: "Uniformes", types: ["uniform"] },
  { id: "exam", label: "Exámenes", types: ["exam"] },
  { id: "meal", label: "Alimentación", types: ["meal"] },
  { id: "equipment", label: "Equipos operativos", types: ["phone", "radio", "flashlight"] },
  { id: "transport", label: "Costos de transporte", types: ["transport"] },
  { id: "vehicle", label: "Vehículos", types: ["vehicle_rent", "vehicle_fuel", "vehicle_tag"] },
  {
    id: "infrastructure",
    label: "Infraestructura",
    types: ["infrastructure", "fuel"],
  },
  { id: "system", label: "Sistemas", types: ["system"] },
];

type NewItemState = {
  type: string;
  name: string;
  unit: string;
  basePrice: string;
  isDefault: boolean;
};

const makeNewItemState = (type: string): NewItemState => ({
  type,
  name: "",
  unit: "mes",
  basePrice: "",
  isDefault: false,
});

export function CpqCatalogConfig({ showHeader = true }: { showHeader?: boolean }) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [collapsedItems, setCollapsedItems] = useState<Record<string, boolean>>({});
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() =>
    GROUPS.reduce((acc, group) => {
      acc[group.id] = true;
      return acc;
    }, {} as Record<string, boolean>)
  );
  const [globalParams, setGlobalParams] = useState({
    monthlyHoursStandard: 180,
    avgStayMonths: 4,
    uniformChangesPerYear: 3,
    holidayAnnualCount: 12,
    holidayCommercialBufferPct: 10,
  });
  const [savingGlobals, setSavingGlobals] = useState(false);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<CatalogItem | null>(null);
  const [newItems, setNewItems] = useState<Record<string, NewItemState>>(() =>
    GROUPS.reduce((acc, group) => {
      acc[group.id] = makeNewItemState(group.types[0]);
      return acc;
    }, {} as Record<string, NewItemState>)
  );
  const inputClass =
    "h-9 text-sm bg-card text-foreground border-border placeholder:text-muted-foreground";
  const formatNumberLocal = (value: number, decimals = 0) =>
    formatNumber(value || 0, { minDecimals: decimals, maxDecimals: decimals });
  const parseNumber = (value: string) => parseLocalizedNumber(value);
  const holidayMonthlyFactor = (globalParams.holidayAnnualCount || 0) / 12;
  const holidayCommercialFactor = 1 + (globalParams.holidayCommercialBufferPct || 0) / 100;
  const holidayTotalFactor = 0.5 * holidayMonthlyFactor * holidayCommercialFactor;

  const fetchItems = async () => {
    setLoading(true);
    try {
      const [res, settingsRes] = await Promise.all([
        fetch("/api/cpq/catalog?active=true", { cache: "no-store" }),
        fetch("/api/cpq/settings", { cache: "no-store" }),
      ]);
      const data = await res.json();
      const settingsData = await settingsRes.json();
      if (data.success) setItems(data.data || []);
      if (settingsData?.success && settingsData.data) {
        setGlobalParams((prev) => ({ ...prev, ...settingsData.data }));
      }
    } catch (error) {
      console.error("Error loading CPQ catalog:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  useEffect(() => {
    if (!items.length) return;
    setCollapsedItems((prev) => {
      const next = { ...prev };
      items.forEach((item) => {
        if (!(item.id in next)) {
          next[item.id] = true;
        }
      });
      return next;
    });
  }, [items]);

  const grouped = useMemo(() => {
    const map: Record<string, CatalogItem[]> = {};
    GROUPS.forEach((group) => {
      map[group.id] = [];
    });
    items
      .filter((item) => item.active)
      .forEach((item) => {
        const group = GROUPS.find((g) => g.types.includes(item.type));
        if (!group) return;
        map[group.id].push(item);
      });
    return map;
  }, [items]);

  const updateItemLocal = (id: string, patch: Partial<CatalogItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const saveItem = async (item: CatalogItem) => {
    setSavingId(item.id);
    try {
      const res = await fetch(`/api/cpq/catalog/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: item.name,
          unit: item.unit,
          basePrice: Number(item.basePrice || 0),
          isDefault: item.isDefault,
          active: item.active,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        console.error("Error saving CPQ catalog item:", data.error);
        toast.error("No se pudo guardar el ítem");
        return;
      }
      toast.success("Ítem guardado");
    } catch (error) {
      console.error("Error saving CPQ catalog item:", error);
      toast.error("No se pudo guardar el ítem");
    } finally {
      setSavingId(null);
    }
  };

  const deactivateItem = async (item: CatalogItem) => {
    setDeleteConfirmItem(null);
    setSavingId(item.id);
    try {
      const res = await fetch(`/api/cpq/catalog/${item.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        updateItemLocal(item.id, { active: false });
        toast.success("Ítem eliminado");
        return;
      }
      toast.error("No se pudo eliminar el ítem");
    } catch (error) {
      console.error("Error deactivating CPQ catalog item:", error);
      toast.error("No se pudo eliminar el ítem");
    } finally {
      setSavingId(null);
    }
  };

  const addItem = async (groupId: string) => {
    const payload = newItems[groupId];
    if (!payload?.name?.trim()) {
      toast.error("Escribe el nombre del ítem");
      return;
    }
    try {
      const res = await fetch("/api/cpq/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: payload.type,
          name: payload.name.trim(),
          unit: payload.unit.trim() || "mes",
          basePrice: parseNumber(payload.basePrice || "0"),
          isDefault: payload.isDefault ?? false,
          active: true,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setItems((prev) => [...prev, data.data]);
        setNewItems((prev) => ({
          ...prev,
          [groupId]: makeNewItemState(payload.type),
        }));
        toast.success("Ítem agregado");
        return;
      }
      toast.error("No se pudo agregar el ítem");
    } catch (error) {
      console.error("Error adding CPQ catalog item:", error);
      toast.error("No se pudo agregar el ítem");
    }
  };

  return (
    <div className="space-y-4">
      {showHeader && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <PageHeader
            title="Configuración CPQ"
            description="Catálogo maestro global para todas las cotizaciones"
          />
          <div className="flex items-center gap-2">
            <Link href="/crm/cotizaciones">
              <Button variant="outline" size="sm" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Volver
              </Button>
            </Link>
          </div>
        </div>
      )}

      <Card className="p-3 sm:p-4 space-y-2 border-border/40 bg-card/50">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold">Parámetros globales</h2>
            <p className="text-xs text-muted-foreground">
              Se aplican como valores base en todas las cotizaciones.
            </p>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Horas mensuales</span>
              <button
                type="button"
                className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border text-muted-foreground"
                title="Horas base usadas para prorratear el costo mensual por guardia y el valor hora."
                aria-label="Información sobre horas mensuales"
              >
                <Info className="h-3 w-3" />
              </button>
            </div>
            <Input
              inputMode="numeric"
              value={formatNumber(globalParams.monthlyHoursStandard)}
              onChange={(e) =>
                setGlobalParams((prev) => ({
                  ...prev,
                  monthlyHoursStandard: parseNumber(e.target.value),
                }))
              }
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Meses de estadía</span>
              <button
                type="button"
                className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border text-muted-foreground"
                title="Promedio de permanencia. Se usa para calcular la frecuencia de exámenes (se considera junto a cambios de uniforme/año)."
                aria-label="Información sobre meses de estadía"
              >
                <Info className="h-3 w-3" />
              </button>
            </div>
            <Input
              inputMode="numeric"
              value={formatNumber(globalParams.avgStayMonths)}
              onChange={(e) =>
                setGlobalParams((prev) => ({
                  ...prev,
                  avgStayMonths: parseNumber(e.target.value),
                }))
              }
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Cambios uniforme/año</span>
              <button
                type="button"
                className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border text-muted-foreground"
                title="Cambios de uniforme por año. Se usa para prorratear uniformes y también para calcular exámenes (se toma la mayor frecuencia con la estadía)."
                aria-label="Información sobre cambios de uniforme por año"
              >
                <Info className="h-3 w-3" />
              </button>
            </div>
            <Input
              inputMode="numeric"
              value={formatNumber(globalParams.uniformChangesPerYear)}
              onChange={(e) =>
                setGlobalParams((prev) => ({
                  ...prev,
                  uniformChangesPerYear: parseNumber(e.target.value),
                }))
              }
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Feriados/año</span>
              <button
                type="button"
                className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border text-muted-foreground"
                title="Número de feriados usados para prorratear el ajuste mensual."
                aria-label="Información sobre feriados por año"
              >
                <Info className="h-3 w-3" />
              </button>
            </div>
            <Input
              inputMode="numeric"
              value={formatNumber(globalParams.holidayAnnualCount)}
              onChange={(e) =>
                setGlobalParams((prev) => ({
                  ...prev,
                  holidayAnnualCount: parseNumber(e.target.value),
                }))
              }
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Holgura comercial (%)</span>
              <button
                type="button"
                className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border text-muted-foreground"
                title="Porcentaje adicional comercial aplicado al ajuste de feriados (base + holgura)."
                aria-label="Información sobre holgura comercial"
              >
                <Info className="h-3 w-3" />
              </button>
            </div>
            <Input
              inputMode="decimal"
              value={formatNumber(globalParams.holidayCommercialBufferPct, { minDecimals: 2, maxDecimals: 2 })}
              onChange={(e) =>
                setGlobalParams((prev) => ({
                  ...prev,
                  holidayCommercialBufferPct: parseNumber(e.target.value),
                }))
              }
              className={inputClass}
            />
          </div>
        </div>
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs space-y-2">
          <div className="font-semibold text-emerald-300">Factor automático ajuste feriados</div>
          <div className="text-muted-foreground">
            <strong className="text-foreground">Factor mensual feriados</strong>:{" "}
            <span className="font-medium text-foreground">{formatNumber(holidayMonthlyFactor, { minDecimals: 3, maxDecimals: 3 })}</span> = {formatNumber(globalParams.holidayAnnualCount)} ÷ 12 (promedio de feriados por mes).
          </div>
          <div className="text-muted-foreground">
            <strong className="text-foreground">Factor comercial</strong>:{" "}
            <span className="font-medium text-foreground">{formatNumber(holidayCommercialFactor, { minDecimals: 3, maxDecimals: 3 })}</span> = 1 + {formatNumber(globalParams.holidayCommercialBufferPct, { minDecimals: 2, maxDecimals: 2 })}% (holgura).
          </div>
          <div className="text-muted-foreground">
            <strong className="text-foreground">Factor total</strong>:{" "}
            <span className="font-semibold text-emerald-200">
              {formatNumber(holidayTotalFactor, { minDecimals: 4, maxDecimals: 4 })}
            </span>{" "}
            = 0,5 × factor mensual × factor comercial.
          </div>
          <div className="border-t border-emerald-500/20 pt-2 mt-2 text-muted-foreground">
            <strong className="text-foreground">Cómo se calcula:</strong>{" "}
            <strong className="text-emerald-200">
              Ajuste mensual feriados = (costo empresa mensual total guardias ÷ 30) × (feriados/año ÷ 12) × 0,5 × (1 + holgura%)
            </strong>
            . El ajuste resultante se suma al costo mensual de la cotización.
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={async () => {
              setSavingGlobals(true);
              try {
                const res = await fetch("/api/cpq/settings", {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(globalParams),
                });
                const data = await res.json();
                if (!data?.success) throw new Error(data?.error || "Error");
                toast.success("Parámetros globales guardados");
              } catch (error) {
                console.error("Error saving CPQ settings:", error);
                toast.error("No se pudieron guardar los parámetros");
              } finally {
                setSavingGlobals(false);
              }
            }}
            disabled={savingGlobals}
          >
            {savingGlobals ? "Guardando..." : "Guardar parámetros"}
          </Button>
        </div>
      </Card>

      {GROUPS.map((group) => {
        const sectionItems = grouped[group.id] || [];
        const isGroupCollapsed = collapsedGroups[group.id] ?? true;
        return (
          <Card key={group.id} className="p-3 sm:p-4 space-y-2 border-border/40 bg-card/50">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 text-left"
                onClick={() =>
                  setCollapsedGroups((prev) => ({
                    ...prev,
                    [group.id]: !isGroupCollapsed,
                  }))
                }
                aria-expanded={!isGroupCollapsed}
              >
                <div>
                  <h2 className="text-sm font-semibold">{group.label}</h2>
                  <p className="text-xs text-muted-foreground">
                    {sectionItems.length} ítems · Precio por defecto, editable por cotización.
                  </p>
                </div>
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform ${
                    isGroupCollapsed ? "" : "rotate-180"
                  }`}
                />
              </button>
            </div>

            {!isGroupCollapsed && (
              <>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {sectionItems.length === 0 && (
                    <div className="rounded-md border border-dashed border-border/60 p-2 text-xs text-muted-foreground sm:col-span-2 lg:col-span-3">
                      Sin items aún. Agrega el primero abajo.
                    </div>
                  )}
                  {sectionItems.map((item) => {
                    const isCollapsed = collapsedItems[item.id] ?? true;
                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "rounded-md border p-2 space-y-3",
                          item.isDefault
                            ? "border-emerald-500/50 bg-emerald-500/5"
                            : "border-border/60"
                        )}
                      >
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-3 text-left"
                          onClick={() =>
                            setCollapsedItems((prev) => ({
                              ...prev,
                              [item.id]: !isCollapsed,
                            }))
                          }
                          aria-expanded={!isCollapsed}
                        >
                          <div className="min-w-0 flex items-center gap-2">
                            {item.isDefault && (
                              <span className="shrink-0 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium text-emerald-500">
                                Default
                              </span>
                            )}
                            <div>
                              <p className="text-sm font-semibold truncate">
                                {item.name || "Sin nombre"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatNumberLocal(item.basePrice ?? 0)} / {item.unit || "mes"}
                              </p>
                            </div>
                          </div>
                          <ChevronDown
                            className={`h-4 w-4 text-muted-foreground transition-transform ${
                              isCollapsed ? "" : "rotate-180"
                            }`}
                          />
                        </button>

                        {!isCollapsed && (
                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              <Input
                                value={item.name}
                                onChange={(e) => updateItemLocal(item.id, { name: e.target.value })}
                                placeholder="Nombre"
                                className={`${inputClass} flex-1`}
                              />
                              <Input
                                inputMode="numeric"
                                value={formatNumberLocal(item.basePrice ?? 0)}
                                onChange={(e) =>
                                  updateItemLocal(item.id, { basePrice: parseNumber(e.target.value) })
                                }
                                onFocus={(e) => e.currentTarget.select()}
                                placeholder="Precio"
                                className={`${inputClass} w-28`}
                              />
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 text-xs">
                                <select
                                  className="flex h-9 rounded-md border border-border bg-card px-2 text-xs text-foreground"
                                  value={item.unit === "año" ? "año" : item.unit === "semestre" ? "semestre" : "mes"}
                                  onChange={(e) => updateItemLocal(item.id, { unit: e.target.value })}
                                >
                                  <option value="mes">Mes</option>
                                  <option value="semestre">Semestre</option>
                                  <option value="año">Año</option>
                                </select>
                                <label className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={item.isDefault}
                                    onChange={(e) =>
                                      updateItemLocal(item.id, { isDefault: e.target.checked })
                                    }
                                  />
                                  Default
                                </label>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  className="h-9 w-9 p-0"
                                  onClick={() => saveItem(item)}
                                  disabled={savingId === item.id}
                                  aria-label="Guardar item"
                                  title="Guardar"
                                >
                                  <Save className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setDeleteConfirmItem(item)}
                                  disabled={savingId === item.id || !item.active}
                                  className="h-9 w-9 p-0"
                                  aria-label="Eliminar item"
                                  title="Eliminar"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                            {group.types.length > 1 && (
                              <span className="text-xs text-muted-foreground">
                                {TYPE_NAMES[item.type] || item.type}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="rounded-md border border-border/60 p-2 space-y-3">
                  <div className="flex flex-col gap-2 sm:grid sm:grid-cols-[1fr_120px_90px_120px] sm:items-center">
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={newItems[group.id]?.isDefault || false}
                          onChange={(e) =>
                            setNewItems((prev) => ({
                              ...prev,
                              [group.id]: { ...prev[group.id], isDefault: e.target.checked },
                            }))
                          }
                        />
                        Default
                      </label>
                      <Input
                        value={newItems[group.id]?.name || ""}
                        onChange={(e) =>
                          setNewItems((prev) => ({
                            ...prev,
                            [group.id]: { ...prev[group.id], name: e.target.value },
                          }))
                        }
                        placeholder="Nuevo ítem"
                        className={`${inputClass} flex-1`}
                      />
                      <Input
                        inputMode="numeric"
                        value={newItems[group.id]?.basePrice || ""}
                        onChange={(e) =>
                          setNewItems((prev) => ({
                            ...prev,
                            [group.id]: { ...prev[group.id], basePrice: e.target.value },
                          }))
                        }
                        onFocus={(e) => e.currentTarget.select()}
                        placeholder="Precio"
                        className={`${inputClass} w-28`}
                      />
                    </div>
                    <div className="flex items-center gap-2 sm:justify-end">
                      <select
                        className="flex h-9 rounded-md border border-border bg-card px-2 text-xs text-foreground"
                        value={
                          newItems[group.id]?.unit === "año"
                            ? "año"
                            : newItems[group.id]?.unit === "semestre"
                            ? "semestre"
                            : "mes"
                        }
                        onChange={(e) =>
                          setNewItems((prev) => ({
                            ...prev,
                            [group.id]: { ...prev[group.id], unit: e.target.value },
                          }))
                        }
                      >
                        <option value="mes">Mes</option>
                        <option value="semestre">Semestre</option>
                        <option value="año">Año</option>
                      </select>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9 w-9 p-0"
                        onClick={() => addItem(group.id)}
                        aria-label="Agregar item"
                        title="Agregar"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </Card>
        );
      })}

      {loading && (
        <div className="space-y-2 py-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-3 animate-pulse rounded bg-muted/50" style={{ width: `${60 + i * 15}%` }} />
          ))}
        </div>
      )}

      <Dialog open={!!deleteConfirmItem} onOpenChange={(open) => !open && setDeleteConfirmItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar eliminación</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que deseas eliminar <strong>"{deleteConfirmItem?.name}"</strong>? Esta acción
              no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteConfirmItem(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmItem && deactivateItem(deleteConfirmItem)}
              disabled={savingId === deleteConfirmItem?.id}
            >
              {savingId === deleteConfirmItem?.id ? "Eliminando..." : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
