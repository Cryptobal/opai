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
import { ArrowLeft, Save, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatNumber, parseLocalizedNumber } from "@/lib/utils";

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
  financial: "Costo financiero",
  policy: "Póliza de garantía",
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
  { id: "financial", label: "Costos financieros", types: ["financial", "policy"] },
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

export function CpqCatalogConfig() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [globalParams, setGlobalParams] = useState({
    monthlyHoursStandard: 180,
    avgStayMonths: 4,
    uniformChangesPerYear: 3,
  });
  const [savingGlobals, setSavingGlobals] = useState(false);
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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title="Configuración CPQ"
          description="Catálogo maestro global para todas las cotizaciones"
        />
        <div className="flex items-center gap-2">
          <Link href="/cpq">
            <Button variant="outline" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Volver
            </Button>
          </Link>
        </div>
      </div>

      {GROUPS.map((group) => {
        const sectionItems = grouped[group.id] || [];
        return (
          <Card key={group.id} className="p-3 sm:p-4 space-y-2 border-border/40 bg-card/50">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold">{group.label}</h2>
                <p className="text-[11px] text-muted-foreground">
                  Precio por defecto, editable por cotización.
                </p>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {sectionItems.length === 0 && (
                <div className="rounded-md border border-dashed border-border/60 p-2 text-xs text-muted-foreground sm:col-span-2 lg:col-span-3">
                  Sin items aún. Agrega el primero abajo.
                </div>
              )}
              {sectionItems.map((item) => (
                <div
                  key={item.id}
                  className="rounded-md border border-border/60 p-2 space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <Input
                      value={item.name}
                      onChange={(e) => updateItemLocal(item.id, { name: e.target.value })}
                      placeholder="Nombre"
                      className={`${inputClass} flex-1`}
                    />
                    <Input
                      inputMode={["financial", "policy"].includes(item.type) ? "decimal" : "numeric"}
                      value={formatNumberLocal(
                        item.basePrice ?? 0,
                        ["financial", "policy"].includes(item.type) ? 2 : 0
                      )}
                      onChange={(e) =>
                        updateItemLocal(item.id, { basePrice: parseNumber(e.target.value) })
                      }
                      onFocus={(e) => e.currentTarget.select()}
                      placeholder={["financial", "policy"].includes(item.type) ? "Tasa (%)" : "Precio"}
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
                        onClick={() => deactivateItem(item)}
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
                    <span className="text-[11px] text-muted-foreground">
                      {TYPE_NAMES[item.type] || item.type}
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div className="rounded-md border border-border/60 p-2 space-y-2">
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
                    inputMode={group.id === "financial" ? "decimal" : "numeric"}
                    value={newItems[group.id]?.basePrice || ""}
                    onChange={(e) =>
                      setNewItems((prev) => ({
                        ...prev,
                        [group.id]: { ...prev[group.id], basePrice: e.target.value },
                      }))
                    }
                    onFocus={(e) => e.currentTarget.select()}
                    placeholder={group.id === "financial" ? "Tasa (%)" : "Precio"}
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
          </Card>
        );
      })}

      <Card className="p-3 sm:p-4 space-y-2 border-border/40 bg-card/50">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold">Parámetros globales</h2>
            <p className="text-[11px] text-muted-foreground">
              Se aplican como valores base en todas las cotizaciones.
            </p>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Horas mensuales</span>
              <button
                type="button"
                className="text-[11px] text-muted-foreground"
                title="Horas base para el cálculo mensual por guardia."
              >
                ?
              </button>
            </div>
            <Input
              inputMode="numeric"
              value={formatNumberLocal(globalParams.monthlyHoursStandard)}
              onChange={(e) =>
                setGlobalParams((prev) => ({
                  ...prev,
                  monthlyHoursStandard: parseNumber(e.target.value),
                }))
              }
              className={inputClass}
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Meses de estadía</span>
              <button
                type="button"
                className="text-[11px] text-muted-foreground"
                title="Promedio de permanencia para calcular exámenes."
              >
                ?
              </button>
            </div>
            <Input
              inputMode="numeric"
              value={formatNumberLocal(globalParams.avgStayMonths)}
              onChange={(e) =>
                setGlobalParams((prev) => ({
                  ...prev,
                  avgStayMonths: parseNumber(e.target.value),
                }))
              }
              className={inputClass}
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Cambios uniforme/año</span>
              <button
                type="button"
                className="text-[11px] text-muted-foreground"
                title="Número de cambios de uniforme por año para prorrateo."
              >
                ?
              </button>
            </div>
            <Input
              inputMode="numeric"
              value={formatNumberLocal(globalParams.uniformChangesPerYear)}
              onChange={(e) =>
                setGlobalParams((prev) => ({
                  ...prev,
                  uniformChangesPerYear: parseNumber(e.target.value),
                }))
              }
              className={inputClass}
            />
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

      {loading && (
        <div className="text-xs text-muted-foreground">Cargando catálogo...</div>
      )}
    </div>
  );
}
