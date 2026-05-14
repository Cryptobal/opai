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
import { CategoryAccountsEditor } from "./CategoryAccountsEditor";
import { CategoryRowExpandable } from "./CategoryRowExpandable";

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
  /** Día del mes para pagar PreviRed (imposiciones del mes anterior). */
  previRedPayDay: number;
  ivaPayDay: number;
  matchAmountToleranceClp: number;
  matchDaysTolerance: number;
  ufMonthlyGrowthPct?: number;
  /** Modo de proyección de turnos extra. */
  turnosExtraMode: "HISTORICAL" | "PCT_PAYROLL";
  /** % de planilla cuando mode=PCT_PAYROLL (0.05 = 5%). */
  turnosExtraPercentage: number;
  /** % del monto TE que se descuenta del pago de sueldo líquido (0–1). */
  turnosExtraLiquidoDiscountPct: number;
  /** % del monto TE que se descuenta del pago de PreviRed (0–1). */
  turnosExtraPreviRedDiscountPct: number;
}

/** Prisma serializa campos Decimal como string en JSON; esta interfaz refleja esa realidad. */
type RawCashflowConfig = Omit<
  CashflowConfig,
  "ufMonthlyGrowthPct" | "turnosExtraPercentage" | "turnosExtraLiquidoDiscountPct" | "turnosExtraPreviRedDiscountPct"
> & {
  ufMonthlyGrowthPct?: number | string;
  turnosExtraPercentage: number | string;
  turnosExtraLiquidoDiscountPct: number | string;
  turnosExtraPreviRedDiscountPct: number | string;
};

interface Category {
  id: string;
  code: string;
  name: string;
  kind: "INCOME" | "EXPENSE";
  sortOrder: number;
  color: string | null;
  isActive: boolean;
  isSystem: boolean;
  isTaxExempt: boolean;
}

interface Props {
  initialConfig: RawCashflowConfig;
  initialCategories: Category[];
  accountOptions: { id: string; code: string; name: string }[];
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
    key: "autoPayroll",
    title: "Sueldos desde dotación",
    description:
      "Proyecta el costo empleador mensual usando la salary structure de cada puesto operativo. Pago el día configurado del mes siguiente.",
  },
  {
    key: "autoTurnosExtra",
    title: "Turnos extra",
    description:
      "Proyecta el egreso mensual de turnos extra por instalación según el modo configurado arriba (histórico rolling o % de planilla). Pago el día 20 del mes.",
  },
  {
    key: "autoIva",
    title: "IVA F29",
    description:
      "Calcula F29 = IVA débito (DTEs emitidos afectos) − IVA crédito (DTEs recibidos). Solo proyecta meses con saldo positivo (cuando se debe pagar al SII).",
  },
  {
    key: "autoRecurringDte",
    title: "Facturación recurrente",
    description:
      "Refleja las plantillas de facturación recurrente activas como ingresos proyectados en el flujo de caja. Útil si tenés clientes con facturas de monto y frecuencia fijos.",
  },
];

export function CashflowConfigClient({ initialConfig, initialCategories, accountOptions }: Props) {
  // Prisma serializa Decimal como string en JSON.stringify; coercionar a number
  // para evitar "expected number, received string" en el validador del API.
  const [config, setConfig] = useState<CashflowConfig>({
    ...initialConfig,
    ufMonthlyGrowthPct: Number(initialConfig.ufMonthlyGrowthPct ?? 0),
    turnosExtraPercentage: Number(initialConfig.turnosExtraPercentage ?? 0),
    turnosExtraLiquidoDiscountPct: Number(initialConfig.turnosExtraLiquidoDiscountPct),
    turnosExtraPreviRedDiscountPct: Number(initialConfig.turnosExtraPreviRedDiscountPct),
  });
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [savingConfig, setSavingConfig] = useState(false);
  const [newCat, setNewCat] = useState<{ code: string; name: string; kind: "INCOME" | "EXPENSE" }>(
    { code: "", name: "", kind: "EXPENSE" },
  );
  const [creatingCat, setCreatingCat] = useState(false);
  const [catError, setCatError] = useState<string | null>(null);
  const [backfillStatus, setBackfillStatus] = useState<string | null>(null);
  const [backfillRunning, setBackfillRunning] = useState(false);

  function setField<K extends keyof CashflowConfig>(key: K, value: CashflowConfig[K]) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  async function toggleAutoSales(enabled: boolean) {
    setField("autoSales", enabled);
    const r = await fetch("/api/finance/cashflow/config/auto-sales-toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    const j = await r.json();
    if (!j?.success) {
      setField("autoSales", !enabled);
      alert(j?.error ?? "Error al actualizar ventas automáticas");
    }
  }

  async function runContractsBackfill() {
    setBackfillRunning(true);
    setBackfillStatus(null);
    try {
      const r = await fetch("/api/finance/cashflow/backfill/contracts", {
        method: "POST",
      });
      const j = await r.json();
      if (j?.success) {
        const s = j.data as {
          created: number;
          updated: number;
          reactivated: number;
          deactivated: number;
        };
        setBackfillStatus(
          `Sincronización OK · creados ${s.created} · actualizados ${s.updated} · reactivados ${s.reactivated} · desactivados ${s.deactivated}`,
        );
      } else {
        setBackfillStatus(j?.error ?? "Error al sincronizar");
      }
    } catch (err) {
      setBackfillStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBackfillRunning(false);
    }
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

  async function toggleCategoryTaxExempt(c: Category) {
    const r = await fetch(`/api/finance/cashflow/categorias/${c.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isTaxExempt: !c.isTaxExempt }),
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
            <Label>Día pago de sueldos (líquido)</Label>
            <Input
              className="h-10 sm:h-9"
              type="number"
              min={-1}
              max={31}
              value={config.payrollPayDay}
              onChange={(e) => setField("payrollPayDay", Number(e.target.value))}
            />
            <p className="mt-1 text-[12px] text-ds-text-3">
              Día del mes en que se proyecta el pago del líquido al guardia. Usa <code className="font-mono">-1</code> para el último día.
            </p>
          </div>
          <div>
            <Label>Día pago PreviRed (imposiciones)</Label>
            <Input
              className="h-10 sm:h-9"
              type="number"
              min={1}
              max={28}
              value={config.previRedPayDay}
              onChange={(e) => setField("previRedPayDay", Number(e.target.value))}
            />
            <p className="mt-1 text-[12px] text-ds-text-3">
              Día del mes siguiente en que pagás imposiciones (AFP + Salud + AFC + SIS + mutual). Plazo legal: día 10 hábil.
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
            <p className="mt-1 text-[12px] text-ds-text-3">
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
            <p className="mt-1 text-[12px] text-ds-text-3">
              Cuando el banco cobra un movimiento, el monto puede no coincidir exacto con tu proyección (impuestos extra, comisiones, redondeo). Este número es la <strong>diferencia máxima en pesos</strong> que el sistema acepta para considerar que el cobro corresponde a esa proyección. Recomendado: <strong>5.000</strong> para gastos fijos, <strong>15.000</strong> si tu banco aplica comisiones variables.
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
            <p className="mt-1 text-[12px] text-ds-text-3">
              Un movimiento puede no caer exactamente el día proyectado. Ej: pagaste Movistar el día 7 pero lo proyectaste para el 5 → diferencia de 2 días. Este número es el <strong>máximo de días de diferencia</strong> aceptado. Recomendado: <strong>3 días</strong> para gastos fijos, <strong>5 días</strong> si tu banco demora en procesar.
            </p>
          </div>
          <div>
            <Label>Modo de proyección turnos extra</Label>
            <Select
              value={config.turnosExtraMode}
              onValueChange={(v) =>
                setField("turnosExtraMode", v as "HISTORICAL" | "PCT_PAYROLL")
              }
            >
              <SelectTrigger className="h-10 sm:h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="HISTORICAL">Histórico (rolling 8 semanas)</SelectItem>
                <SelectItem value="PCT_PAYROLL">% de planilla mensual</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-1 text-[12px] text-ds-text-3">
              <strong>Histórico</strong>: promedia los últimos 2 meses de TE
              registrados. Bien si hay historia. <strong>% de planilla</strong>:
              aplica el porcentaje configurado al costo empleador mensual.
              Útil cuando aún no hay historia o querés un techo predecible.
            </p>
          </div>
          <div>
            <Label>% turnos extra sobre planilla</Label>
            <Input
              className="h-10 sm:h-9"
              type="number"
              min={0}
              max={50}
              step={0.5}
              disabled={config.turnosExtraMode !== "PCT_PAYROLL"}
              value={
                config.turnosExtraMode === "PCT_PAYROLL"
                  ? Number((config.turnosExtraPercentage * 100).toFixed(2))
                  : 0
              }
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setField("turnosExtraPercentage", isNaN(v) ? 0 : v / 100);
              }}
            />
            <p className="mt-1 text-[12px] text-ds-text-3">
              Aplicado al costo empleador total mensual cuando el modo es{" "}
              <strong>% de planilla</strong>. Ej: 5 = 5% del costo de sueldos.
            </p>
          </div>
          <div>
            <Label>% TE que descuenta sueldo líquido</Label>
            <Input
              className="h-10 sm:h-9"
              type="number"
              min={0}
              max={100}
              step={1}
              value={Number((config.turnosExtraLiquidoDiscountPct * 100).toFixed(0))}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setField("turnosExtraLiquidoDiscountPct", isNaN(v) ? 1 : Math.min(1, v / 100));
              }}
            />
            <p className="mt-1 text-[12px] text-ds-text-3">
              Cuando pagás un TE, ese monto ya fue transferido al guardia. Este
              porcentaje del total de TE proyectado se descuenta del pago de{" "}
              <strong>sueldo líquido</strong> del período. Ej: 100 = descuenta todo.
            </p>
          </div>
          <div>
            <Label>% TE que descuenta leyes sociales</Label>
            <Input
              className="h-10 sm:h-9"
              type="number"
              min={0}
              max={100}
              step={1}
              value={Number((config.turnosExtraPreviRedDiscountPct * 100).toFixed(0))}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setField("turnosExtraPreviRedDiscountPct", isNaN(v) ? 0 : Math.min(1, v / 100));
              }}
            />
            <p className="mt-1 text-[12px] text-ds-text-3">
              Porcentaje del total de TE proyectado que se descuenta del pago a{" "}
              <strong>PreviRed</strong> (cotizaciones) del mismo período. Ej: 20 =
              descuenta el 20% del TE de las imposiciones.
            </p>
          </div>
          <div className="sm:col-span-2">
            <Label>Crecimiento mensual de la UF (%)</Label>
            <Input
              className="h-10 sm:h-9"
              type="number"
              min={0}
              max={5}
              step={0.01}
              value={config.ufMonthlyGrowthPct ?? 0}
              onChange={(e) =>
                setField("ufMonthlyGrowthPct" as keyof CashflowConfig, Number(e.target.value))
              }
            />
            <p className="mt-1 text-[12px] text-ds-text-3">
              Para meses futuros donde aún no se conoce la UF, proyectamos con
              <strong> UF<sub>hoy</sub> × (1 + tasa)<sup>N</sup></strong> (compuesto, N = meses
              adelante). El mes en curso y los pasados usan la UF real. Default <strong>0</strong>
              (UF futura plana). Históricamente la UF crece ~0,30%–0,50% al mes.
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
                onCheckedChange={(v) => {
                  if (g.key === "autoSales") {
                    toggleAutoSales(v);
                  } else {
                    setField(g.key, v);
                  }
                }}
              />
            </div>
          ))}
        </div>

        <div className="mt-4 pt-3 border-t border-border">
          <p className="text-[12px] text-ds-text-3 mb-2">
            La sincronización es <strong>automática</strong> en tres puntos:
            (1) cada vez que se crea/edita un contrato CPQ, (2) al cargar el flujo
            de caja por primera vez tras un cambio masivo, (3) cada noche a las
            4 AM. Solo usá el botón si querés forzar una recorrida ahora.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={runContractsBackfill}
            disabled={backfillRunning}
          >
            {backfillRunning ? "Sincronizando..." : "Forzar re-sync ahora"}
          </Button>
          {backfillStatus && (
            <p className="text-[12px] text-ds-text-2 mt-2">{backfillStatus}</p>
          )}
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
            <div className="flex h-10 sm:h-9 rounded-ds-md border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => setNewCat((c) => ({ ...c, kind: "INCOME" }))}
                className={
                  "flex-1 text-[13px] font-medium transition-colors " +
                  (newCat.kind === "INCOME"
                    ? "bg-status-ok-soft text-status-ok-fg"
                    : "bg-transparent text-ds-text-3 hover:bg-muted/40")
                }
              >
                ↑ Ingreso
              </button>
              <button
                type="button"
                onClick={() => setNewCat((c) => ({ ...c, kind: "EXPENSE" }))}
                className={
                  "flex-1 text-[13px] font-medium transition-colors border-l border-border " +
                  (newCat.kind === "EXPENSE"
                    ? "bg-status-danger-soft text-status-danger-fg"
                    : "bg-transparent text-ds-text-3 hover:bg-muted/40")
                }
              >
                ↓ Egreso
              </button>
            </div>
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
                  <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-ds-text-4 truncate">{c.code}</div>
                  <div className="text-[12px] text-ds-text-3 mt-0.5">
                    {c.kind === "INCOME" ? "↑ Ingreso" : "↓ Egreso"}
                    {c.isSystem && (
                      <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded-ds-sm bg-status-info-soft text-status-info-fg font-mono uppercase tracking-[0.08em]">
                        Sistema
                      </span>
                    )}
                  </div>
                  <div className="mt-2">
                    <CategoryAccountsEditor
                      categoryId={c.id}
                      accountOptions={accountOptions}
                      canEdit={true}
                    />
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <label className="flex items-center gap-1.5 text-[11px] text-ds-text-3">
                    IVA
                    <Switch
                      checked={!c.isTaxExempt}
                      onCheckedChange={() => toggleCategoryTaxExempt(c)}
                      aria-label="Afecto a IVA"
                    />
                  </label>
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
                <th className="w-6 p-2"></th>
                <th className="text-left p-2">Código</th>
                <th className="text-left p-2">Nombre</th>
                <th className="text-left p-2">Tipo</th>
                <th className="text-left p-2">Cuentas contables</th>
                <th className="text-center p-2">Sistema</th>
                <th
                  className="text-center p-2"
                  title="Si está OFF, la proyección multiplica el monto por 1.19 (IVA)"
                >
                  Afecto IVA
                </th>
                <th className="text-center p-2">Activa</th>
                <th className="p-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <CategoryRowExpandable
                  key={c.id}
                  categoryId={c.id}
                  categoryCode={c.code}
                  categoryName={c.name}
                  categoryKind={c.kind}
                  canManage={true}
                  colSpan={8}
                  header={
                    <>
                      <td className="p-2 font-mono text-ds-text-3">{c.code}</td>
                      <td className="p-2">{c.name}</td>
                      <td className="p-2">{c.kind === "INCOME" ? "↑ Ingreso" : "↓ Egreso"}</td>
                      <td className="p-2">
                        <CategoryAccountsEditor
                          categoryId={c.id}
                          accountOptions={accountOptions}
                          canEdit={true}
                        />
                      </td>
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
                        <Switch
                          checked={!c.isTaxExempt}
                          onCheckedChange={() => toggleCategoryTaxExempt(c)}
                          aria-label="Afecto a IVA"
                        />
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
                    </>
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      </Surface>
    </div>
  );
}
