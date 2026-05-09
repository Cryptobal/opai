"use client";
import { useState } from "react";
import { Surface } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pencil, Trash2, Plus } from "lucide-react";

interface CashflowConfig {
  horizonWeeksDefault: number;
  horizonMonthsDefault: number;
  weekStartsOn: number;
  autoSales: boolean;
  autoPayroll: boolean;
  autoTurnosExtra: boolean;
  autoIva: boolean;
  autoRecurringDte: boolean;
  payrollPayDay: number;
  ivaPayDay: number;
  matchAmountToleranceClp: number;
  matchDaysTolerance: number;
}

interface Category {
  id: string;
  code: string;
  name: string;
  kind: "INCOME" | "EXPENSE";
  sortOrder: number;
  color: string | null;
  isActive: boolean;
  isSystem: boolean;
}

interface Props {
  initialConfig: CashflowConfig;
  initialCategories: Category[];
}

const GENERATORS: Array<{
  key: keyof Pick<
    CashflowConfig,
    "autoSales" | "autoPayroll" | "autoTurnosExtra" | "autoIva" | "autoRecurringDte"
  >;
  title: string;
  description: string;
}> = [
  {
    key: "autoSales",
    title: "Ventas por contrato",
    description:
      "Proyecta ingresos a partir de cotizaciones (CpqQuote) con contractStartDate y contrato activo. Considera reajuste real anual.",
  },
  {
    key: "autoPayroll",
    title: "Sueldos desde dotación",
    description:
      "Proyecta el costo empleador mensual usando la salary structure de cada puesto operativo. Pago el día configurado del mes siguiente.",
  },
  {
    key: "autoTurnosExtra",
    title: "Turnos extra (rolling)",
    description:
      "Proyecta TE semanales por instalación como promedio rolling de las últimas 8 semanas históricas. Pago día viernes.",
  },
  {
    key: "autoIva",
    title: "IVA F29",
    description:
      "Calcula F29 = IVA débito (DTEs emitidos afectos) − IVA crédito (DTEs recibidos). Solo proyecta meses con saldo positivo.",
  },
  {
    key: "autoRecurringDte",
    title: "DTEs recurrentes",
    description:
      "Espeja FinanceDteRecurringTemplate activos como ingresos proyectados.",
  },
];

export function CashflowConfigClient({ initialConfig, initialCategories }: Props) {
  const [config, setConfig] = useState<CashflowConfig>(initialConfig);
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [savingConfig, setSavingConfig] = useState(false);
  const [newCat, setNewCat] = useState<{ code: string; name: string; kind: "INCOME" | "EXPENSE" }>(
    { code: "", name: "", kind: "EXPENSE" },
  );
  const [creatingCat, setCreatingCat] = useState(false);
  const [catError, setCatError] = useState<string | null>(null);

  function setField<K extends keyof CashflowConfig>(key: K, value: CashflowConfig[K]) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  async function saveConfig() {
    setSavingConfig(true);
    const r = await fetch("/api/finance/cashflow/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    const j = await r.json();
    setSavingConfig(false);
    if (!j?.success) alert(j?.error ?? "Error al guardar");
  }

  async function reloadCategories() {
    const r = await fetch("/api/finance/cashflow/categorias");
    const j = await r.json();
    if (j?.success) setCategories(j.data);
  }

  async function createCategory() {
    setCatError(null);
    if (!newCat.code.trim()) {
      setCatError("Ingresa un código (ej: EGR_INTERNET)");
      return;
    }
    if (!/^[A-Z0-9_]+$/.test(newCat.code)) {
      setCatError("Código solo acepta MAYÚSCULAS, números y guion bajo (_)");
      return;
    }
    if (newCat.code.length < 2) {
      setCatError("El código debe tener al menos 2 caracteres");
      return;
    }
    if (!newCat.name.trim()) {
      setCatError("Ingresa un nombre visible (ej: Internet fibra)");
      return;
    }
    setCreatingCat(true);
    const r = await fetch("/api/finance/cashflow/categorias", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newCat),
    });
    const j = await r.json();
    setCreatingCat(false);
    if (j?.success) {
      setNewCat({ code: "", name: "", kind: "EXPENSE" });
      reloadCategories();
    } else {
      setCatError(j?.error ?? "Error al crear");
    }
  }

  async function toggleCategoryActive(c: Category) {
    const r = await fetch(`/api/finance/cashflow/categorias/${c.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !c.isActive }),
    });
    if ((await r.json())?.success) reloadCategories();
  }

  async function deleteCategory(c: Category) {
    if (!confirm(`¿Eliminar categoría "${c.name}"?`)) return;
    const r = await fetch(`/api/finance/cashflow/categorias/${c.id}`, { method: "DELETE" });
    const j = await r.json();
    if (j?.success) reloadCategories();
    else alert(j?.error ?? "Error al eliminar");
  }

  return (
    <div className="space-y-5">
      {/* Sección 1: Parámetros generales */}
      <Surface elevation={1} padding="md">
        <h2 className="font-semibold mb-3">Parámetros generales</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <Label>Horizonte semanal default</Label>
            <Input
              className="h-10 sm:h-9"
              type="number"
              min={8}
              max={104}
              value={config.horizonWeeksDefault}
              onChange={(e) => setField("horizonWeeksDefault", Number(e.target.value))}
            />
          </div>
          <div>
            <Label>Horizonte mensual default</Label>
            <Input
              className="h-10 sm:h-9"
              type="number"
              min={3}
              max={60}
              value={config.horizonMonthsDefault}
              onChange={(e) => setField("horizonMonthsDefault", Number(e.target.value))}
            />
          </div>
          <div>
            <Label>Inicio de semana</Label>
            <Select
              value={String(config.weekStartsOn)}
              onValueChange={(v) => setField("weekStartsOn", Number(v))}
            >
              <SelectTrigger className="h-10 sm:h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Domingo</SelectItem>
                <SelectItem value="1">Lunes (ISO)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Día pago de sueldos</Label>
            <Input
              className="h-10 sm:h-9"
              type="number"
              min={-1}
              max={31}
              value={config.payrollPayDay}
              onChange={(e) => setField("payrollPayDay", Number(e.target.value))}
            />
            <p className="mt-1 text-[11px] text-ds-text-3">
              Día del mes en que se proyecta el pago. Usa <code className="font-mono">-1</code> para el último día del mes.
            </p>
          </div>
          <div>
            <Label>Día pago IVA F29</Label>
            <Input
              className="h-10 sm:h-9"
              type="number"
              min={1}
              max={28}
              value={config.ivaPayDay}
              onChange={(e) => setField("ivaPayDay", Number(e.target.value))}
            />
            <p className="mt-1 text-[11px] text-ds-text-3">
              Plazo legal: día 12 (papel) o 20 (electrónico) del mes siguiente.
            </p>
          </div>
          <div>
            <Label>Tolerancia de monto al conciliar (CLP)</Label>
            <Input
              className="h-10 sm:h-9"
              type="number"
              min={0}
              max={1000000}
              value={config.matchAmountToleranceClp}
              onChange={(e) => setField("matchAmountToleranceClp", Number(e.target.value))}
            />
            <p className="mt-1 text-[11px] text-ds-text-3">
              Diferencia máxima en pesos para que un movimiento bancario se considere coincidencia con un ítem proyectado.
            </p>
          </div>
          <div>
            <Label>Tolerancia de fecha al conciliar (días)</Label>
            <Input
              className="h-10 sm:h-9"
              type="number"
              min={0}
              max={30}
              value={config.matchDaysTolerance}
              onChange={(e) => setField("matchDaysTolerance", Number(e.target.value))}
            />
            <p className="mt-1 text-[11px] text-ds-text-3">
              Días de diferencia aceptados entre la fecha proyectada y la fecha real del banco.
            </p>
          </div>
        </div>
        <div className="mt-3 sm:flex sm:justify-end">
          <Button
            onClick={saveConfig}
            disabled={savingConfig}
            className="w-full sm:w-auto h-10 sm:h-9"
          >
            {savingConfig ? "Guardando..." : "Guardar parámetros"}
          </Button>
        </div>
      </Surface>

      {/* Sección 2: Generadores automáticos */}
      <Surface elevation={1} padding="md">
        <h2 className="font-semibold mb-3">Generadores automáticos</h2>
        <p className="text-[12px] text-ds-text-3 mb-3">
          Cada generador inyecta ocurrencias virtuales (no se guardan en DB) en la proyección.
          Desactivar uno excluye sus ocurrencias del muro.
        </p>
        <div className="space-y-3">
          {GENERATORS.map((g) => (
            <div key={g.key} className="flex items-start justify-between gap-3 p-3 rounded-ds-md bg-muted/20">
              <div className="min-w-0">
                <p className="font-medium text-[13px]">{g.title}</p>
                <p className="text-[12px] text-ds-text-3">{g.description}</p>
              </div>
              <Switch
                checked={config[g.key]}
                onCheckedChange={(v) => setField(g.key, v)}
              />
            </div>
          ))}
        </div>
      </Surface>

      {/* Sección 3: Categorías */}
      <Surface elevation={1} padding="md">
        <h2 className="font-semibold mb-1">Categorías</h2>
        <p className="text-[12px] text-ds-text-3 mb-3">
          Las flechas <span className="text-status-ok-fg">↑</span> indican <strong>ingresos</strong> y <span className="text-status-warn-fg">↓</span> indican <strong>egresos</strong>.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr_140px_auto] sm:items-end gap-2 mb-2">
          <div>
            <Label>Código</Label>
            <Input
              placeholder="EGR_NUEVO"
              value={newCat.code}
              onChange={(e) => {
                setCatError(null);
                setNewCat((c) => ({ ...c, code: e.target.value.toUpperCase() }));
              }}
              className="h-10 sm:h-9"
            />
          </div>
          <div>
            <Label>Nombre</Label>
            <Input
              placeholder="Mi categoría"
              value={newCat.name}
              onChange={(e) => {
                setCatError(null);
                setNewCat((c) => ({ ...c, name: e.target.value }));
              }}
              className="h-10 sm:h-9"
            />
          </div>
          <div>
            <Label>Tipo</Label>
            <Select value={newCat.kind} onValueChange={(v) => setNewCat((c) => ({ ...c, kind: v as "INCOME" | "EXPENSE" }))}>
              <SelectTrigger className="h-10 sm:h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="INCOME">Ingreso</SelectItem>
                <SelectItem value="EXPENSE">Egreso</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={createCategory}
            disabled={creatingCat || !newCat.code.trim() || !newCat.name.trim()}
            className="w-full sm:w-auto h-10 sm:h-9"
          >
            <Plus className="h-4 w-4 mr-1" /> {creatingCat ? "Creando..." : "Crear"}
          </Button>
        </div>
        {catError && (
          <p className="mb-3 text-[12px] text-status-warn-fg">{catError}</p>
        )}

        {/* Mobile: stacked card list */}
        <ul className="sm:hidden space-y-2">
          {categories.map((c) => (
            <li key={c.id} className="rounded-ds-md border border-border bg-background p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-[13px] truncate">{c.name}</div>
                  <div className="font-mono text-[11px] text-ds-text-3 truncate">{c.code}</div>
                  <div className="text-[12px] text-ds-text-3 mt-0.5">
                    {c.kind === "INCOME" ? "↑ Ingreso" : "↓ Egreso"}
                    {c.isSystem && (
                      <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded-ds-sm bg-status-info-soft text-status-info-fg font-mono uppercase tracking-[0.08em]">
                        Sistema
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <Switch checked={c.isActive} onCheckedChange={() => toggleCategoryActive(c)} />
                  {!c.isSystem && (
                    <button
                      onClick={() => deleteCategory(c)}
                      className="p-1.5 hover:bg-status-warn-soft rounded text-status-warn-fg"
                      aria-label="Eliminar"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>

        {/* Tablet+: table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border text-ds-text-3">
                <th className="text-left p-2">Código</th>
                <th className="text-left p-2">Nombre</th>
                <th className="text-left p-2">Tipo</th>
                <th className="text-center p-2">Sistema</th>
                <th className="text-center p-2">Activa</th>
                <th className="p-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id} className="border-b border-border hover:bg-muted/20">
                  <td className="p-2 font-mono text-ds-text-3">{c.code}</td>
                  <td className="p-2">{c.name}</td>
                  <td className="p-2">{c.kind === "INCOME" ? "↑ Ingreso" : "↓ Egreso"}</td>
                  <td className="p-2 text-center">
                    {c.isSystem ? (
                      <span className="text-[11px] px-1.5 py-0.5 rounded-ds-sm bg-status-info-soft text-status-info-fg font-mono uppercase tracking-[0.08em]">
                        Sistema
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="p-2 text-center">
                    <Switch checked={c.isActive} onCheckedChange={() => toggleCategoryActive(c)} />
                  </td>
                  <td className="p-2 text-center">
                    {!c.isSystem && (
                      <button
                        onClick={() => deleteCategory(c)}
                        className="p-1 hover:bg-status-warn-soft rounded text-status-warn-fg"
                        aria-label="Eliminar"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Surface>
    </div>
  );
}
