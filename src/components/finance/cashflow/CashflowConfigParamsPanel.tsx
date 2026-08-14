"use client";

import { DatePickerField } from "@/components/ui/date-picker";

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
import { toast } from "sonner";
import type { AccountOption, CashflowConfig } from "./cashflow-config-types";

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

interface Props {
  config: CashflowConfig;
  onConfigChange: (next: CashflowConfig) => void;
  accountOptions: AccountOption[];
  unpaidReceivedDteCount?: number;
}

export function CashflowConfigParamsPanel({
  config,
  onConfigChange,
  accountOptions,
  unpaidReceivedDteCount = 0,
}: Props) {
  const [savingConfig, setSavingConfig] = useState(false);
  const [backfillStatus, setBackfillStatus] = useState<string | null>(null);
  const [backfillRunning, setBackfillRunning] = useState(false);

  function setField<K extends keyof CashflowConfig>(key: K, value: CashflowConfig[K]) {
    onConfigChange({ ...config, [key]: value });
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
      toast.error(j?.error ?? "Error al actualizar ventas automáticas");
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
    if (!j?.success) toast.error(j?.error ?? "Error al guardar");
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
            <Label>AFP para proyección Previred</Label>
            <Input
              className="h-10 sm:h-9"
              type="text"
              placeholder="Modelo"
              value={config.payrollAfpName ?? ""}
              onChange={(e) =>
                setField(
                  "payrollAfpName",
                  e.target.value.trim() === "" ? null : e.target.value.trim(),
                )
              }
            />
            <p className="mt-1 text-[12px] text-ds-text-3">
              Misma AFP con que se estima el líquido del puesto. Vacío = Modelo. Claves válidas de la versión activa de parámetros (habitat, modelo, capital…).
            </p>
          </div>
          <div>
            <Label>Tasa mutualidad (fracción)</Label>
            <Input
              className="h-10 sm:h-9"
              type="number"
              min={0}
              max={0.15}
              step={0.0001}
              placeholder="0.012"
              value={config.payrollMutualRatePct ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                setField(
                  "payrollMutualRatePct",
                  v === "" ? null : Number(v),
                );
              }}
            />
            <p className="mt-1 text-[12px] text-ds-text-3">
              Tasa total de accidentes del trabajo (ej. 0,012 = 1,2%). Vacío = tasa del rubro seguridad de la versión activa de parámetros.
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
            <Label>Tasa PPM (% sobre ingresos brutos)</Label>
            <Input
              className="h-10 sm:h-9"
              type="number"
              min={0}
              max={10}
              step={0.001}
              value={config.ppmRatePct}
              onChange={(e) => setField("ppmRatePct", Number(e.target.value))}
            />
            <p className="mt-1 text-[12px] text-ds-text-3">
              Pago Provisional Mensual obligatorio del F29 (ej. 0,125 = 0,125%).
              Se suma al IVA determinado en el Libro IVA y en la proyección de
              flujo de caja. 0 = no calcular.
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
            <Label>Término de pago estimado (días) — Planilla v3</Label>
            <Input
              className="h-10 sm:h-9"
              type="number"
              min={0}
              max={180}
              value={config.collectionLagDays}
              onChange={(e) => setField("collectionLagDays", Number(e.target.value))}
            />
            <p className="mt-1 text-[12px] text-ds-text-3">
              Cuando una factura no trae fecha de vencimiento, la planilla asume
              que se cobra/paga este número de días después de emitida. Estándar
              B2B chileno: <strong>30</strong>.
            </p>
          </div>
          <div>
            <Label>Umbral de alerta del saldo (CLP) — Planilla v3</Label>
            <Input
              className="h-10 sm:h-9"
              type="number"
              min={0}
              max={1000000000}
              step={500000}
              value={config.flowWarnThresholdClp}
              onChange={(e) => setField("flowWarnThresholdClp", Number(e.target.value))}
            />
            <p className="mt-1 text-[12px] text-ds-text-3">
              La fila SALDO ACUMULADO se pinta <strong>ámbar</strong> cuando el
              saldo proyectado baja de este monto (rojo bajo $0). Ajústalo a tu
              colchón mínimo de caja.
            </p>
          </div>
          <div className="flex items-start justify-between gap-4 rounded-lg border border-ds-border-subtle px-3 py-2.5">
            <div className="min-w-0">
              <p className="font-medium text-[13px]">Arrastrar el saldo por ejecutar</p>
              <p className="text-[12px] text-ds-text-3">
                Cuando una proyección se ejecuta sólo en parte, el remanente sigue
                pesando en la semana. Apágalo para que el movimiento bancario
                reemplace la proyección (comportamiento anterior).
              </p>
            </div>
            <Switch
              checked={config.residualCarryEnabled}
              onCheckedChange={(v) => setField("residualCarryEnabled", v)}
            />
          </div>
          <div>
            <Label>Remanente mínimo (CLP) — Planilla v3</Label>
            <Input
              className="h-10 sm:h-9"
              type="number"
              min={0}
              max={10_000_000}
              step={1000}
              value={config.residualMinClp}
              onChange={(e) => setField("residualMinClp", Number(e.target.value))}
            />
            <p className="mt-1 text-[12px] text-ds-text-3">
              Diferencias bajo este monto se dan por cumplidas solas. Recomendado{" "}
              <strong>10.000</strong>.
            </p>
          </div>
          <div>
            <Label>Corte de cartera (flujo) — Planilla v4.6</Label>
            <DatePickerField value={config.flowCutoffYmd?.slice(0, 10) || null} onChange={(ymd) => {
                const v = (ymd ?? "").trim();
                setField("flowCutoffYmd", v === "" ? null : v);
              }} max={new Date().toISOString().slice(0, 10)} triggerClassName={"h-10 sm:h-9"} />
            <p className="mt-1 text-[12px] text-ds-text-3">
              Las facturas de ingreso emitidas <strong>antes</strong> de esta
              fecha quedan fuera del comprometido, la bandeja y el KPI de
              cartera (los pagos reales no se tocan). Vacío = sin corte.
              Reversible. Típico: <strong>01/01/2025</strong> para limpiar
              cartera antigua.
            </p>
          </div>
          <div className="sm:col-span-2 rounded-ds-md border border-ds-border-subtle bg-ds-surface-2/40 p-3 space-y-3">
            <div>
              <h3 className="font-medium text-[13px]">Supuestos de proyección</h3>
              <p className="text-[12px] text-ds-text-3">
                Knobs que alimentan la planilla v3 (comprometido derive-on-read).
                Con defaults, el comportamiento es idéntico al anterior.
              </p>
            </div>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-[13px]">Proyectar facturas recibidas como egreso</p>
                <p className="text-[12px] text-ds-text-3">
                  {config.projectReceivedDtesAsExpense
                    ? "Encendido: las facturas de compra impagas aparecen en el proyectado (sin renglón destino caen en Otros egresos)."
                    : "Apagado (recomendado): Otros egresos solo muestra cargos de cartola. El egreso proyectado se define en GAV; las facturas siguen contando para crédito IVA F29."}
                </p>
                {unpaidReceivedDteCount > 0 && (
                  <p className="mt-1 text-[12px] text-ds-text-3">
                    Hoy hay {unpaidReceivedDteCount.toLocaleString("es-CL")} facturas
                    de compra impagas
                    {config.projectReceivedDtesAsExpense
                      ? " proyectándose como egreso."
                      : " (no se proyectan)."}
                  </p>
                )}
              </div>
              <Switch
                checked={config.projectReceivedDtesAsExpense}
                onCheckedChange={(v) => setField("projectReceivedDtesAsExpense", v)}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Finiquitos — promedio (meses)</Label>
                <Input
                  className="h-10 sm:h-9"
                  type="number"
                  min={1}
                  max={36}
                  value={config.finiquitosAvgMonths}
                  onChange={(e) => setField("finiquitosAvgMonths", Number(e.target.value) || 6)}
                />
              </div>
              <div>
                <Label>Finiquitos — monto manual mensual (CLP)</Label>
                <Input
                  className="h-10 sm:h-9"
                  type="number"
                  min={0}
                  placeholder="Vacío = usar promedio"
                  value={config.finiquitosManualMonthlyClp ?? ""}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    setField("finiquitosManualMonthlyClp", v === "" ? null : Number(v));
                  }}
                />
              </div>
              <div>
                <Label>IVA F29 — promedio crédito (meses)</Label>
                <Input
                  className="h-10 sm:h-9"
                  type="number"
                  min={1}
                  max={36}
                  value={config.f29CreditAvgMonths}
                  onChange={(e) => setField("f29CreditAvgMonths", Number(e.target.value) || 6)}
                />
                <p className="mt-1 text-[12px] text-ds-text-3">
                  Para períodos en curso/futuros: fracción no transcurrida del
                  crédito fiscal se estima con este promedio móvil.
                </p>
              </div>
            </div>
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
          <div>
            <Label>% retiro socios sobre ventas netas</Label>
            <Input
              className="h-10 sm:h-9"
              type="number"
              min={0}
              max={50}
              step={0.5}
              value={Number((config.retiroSocioPctVentas * 100).toFixed(2))}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setField("retiroSocioPctVentas", isNaN(v) ? 0 : Math.min(0.5, v / 100));
              }}
            />
            <p className="mt-1 text-[12px] text-ds-text-3">
              Cada mes se proyecta un <strong>retiro de socios</strong> = ventas
              netas del mes × este %. Si dejás <strong>0</strong>, no se genera
              el retiro automático (igual podés cargar retiros puntuales a mano
              en el renglón Retiros socios). Editable celda por celda.
            </p>
          </div>
          <div>
            <Label>Día pago retiro socios</Label>
            <Input
              className="h-10 sm:h-9"
              type="number"
              min={1}
              max={28}
              value={config.retiroSocioPayDay}
              onChange={(e) => setField("retiroSocioPayDay", Number(e.target.value))}
            />
            <p className="mt-1 text-[12px] text-ds-text-3">
              Día del mes en que aparece el retiro proyectado.
            </p>
          </div>
          <div>
            <Label>Modo de proyección de quincena</Label>
            <Select
              value={config.quincenaMode}
              onValueChange={(v) =>
                setField("quincenaMode", v as "FICHA" | "PCT_LIQUIDO")
              }
            >
              <SelectTrigger className="h-10 sm:h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FICHA">Desde ficha de guardias</SelectItem>
                <SelectItem value="PCT_LIQUIDO">% de sueldos líquidos</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-1 text-[12px] text-ds-text-3">
              <strong>Desde ficha</strong>: suma <code className="font-mono">montoAnticipo</code> de los guardias con la opción
              activada en su ficha. <strong>% de sueldos líquidos</strong>: aplica el
              porcentaje configurado a la suma de líquidos proyectados.
            </p>
          </div>
          <div>
            <Label>% quincena sobre líquidos</Label>
            <Input
              className="h-10 sm:h-9"
              type="number"
              min={0}
              max={50}
              step={1}
              disabled={config.quincenaMode !== "PCT_LIQUIDO"}
              value={
                config.quincenaMode === "PCT_LIQUIDO"
                  ? Number((config.quincenaPctLiquido * 100).toFixed(2))
                  : 0
              }
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setField("quincenaPctLiquido", isNaN(v) ? 0 : Math.min(0.5, v / 100));
              }}
            />
            <p className="mt-1 text-[12px] text-ds-text-3">
              Aplica solo cuando el modo es <strong>% de líquidos</strong>. Default 10%.
            </p>
          </div>
          <div>
            <Label>Día pago quincena</Label>
            <Input
              className="h-10 sm:h-9"
              type="number"
              min={1}
              max={28}
              value={config.quincenaPayDay}
              onChange={(e) => setField("quincenaPayDay", Number(e.target.value))}
            />
            <p className="mt-1 text-[12px] text-ds-text-3">
              Día del mes en que se proyecta la quincena. Default 15.
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

      {/* Sección: Diferencias en cobranza (write-off automático) */}
      <Surface elevation={1} padding="md">
        <h2 className="font-semibold mb-1">Diferencias en cobranza</h2>
        <p className="text-[12px] text-ds-text-3 mb-3">
          Cuando un cobro/pago concilia contra una factura con diferencia menor
          al umbral, el DTE se cierra como PAID y la diferencia se imputa
          automáticamente a la cuenta contable elegida (asiento POSTED). Se
          aplica el MENOR entre el umbral absoluto y el relativo. Si la
          diferencia excede ambos, el DTE queda PARTIAL y requiere decisión
          manual.
        </p>
        <div className="flex items-start justify-between gap-3 p-3 rounded-ds-md bg-muted/20 mb-3">
          <div className="min-w-0">
            <p className="font-medium text-[13px]">Cerrar diferencias automáticamente</p>
            <p className="text-[12px] text-ds-text-3">
              Activá el motor de write-off automático para cerrar diferencias
              menores sin intervención.
            </p>
          </div>
          <Switch
            checked={config.writeOffAutoEnabled}
            onCheckedChange={(v) => setField("writeOffAutoEnabled", v)}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Umbral absoluto (CLP)</Label>
            <Input
              className="h-10 sm:h-9"
              type="number"
              min={0}
              max={10_000_000}
              step={1000}
              value={config.writeOffMaxAmountClp}
              onChange={(e) =>
                setField("writeOffMaxAmountClp", Number(e.target.value))
              }
            />
            <p className="mt-1 text-[12px] text-ds-text-3">
              Default <strong>$10.000</strong>. Diferencias mayores requieren
              cierre manual.
            </p>
          </div>
          <div>
            <Label>Umbral relativo (%)</Label>
            <Input
              className="h-10 sm:h-9"
              type="number"
              min={0}
              max={10}
              step={0.05}
              value={(config.writeOffMaxPercent * 100).toFixed(3)}
              onChange={(e) =>
                setField("writeOffMaxPercent", Number(e.target.value) / 100)
              }
            />
            <p className="mt-1 text-[12px] text-ds-text-3">
              Default <strong>0,5%</strong> del total. Protege facturas chicas
              de tolerancias desproporcionadas.
            </p>
          </div>
          <div>
            <Label>Cuenta para diferencias en contra (cliente pagó menos)</Label>
            <Select
              value={config.writeOffShortPaymentAccountId ?? "__none__"}
              onValueChange={(v) =>
                setField(
                  "writeOffShortPaymentAccountId",
                  v === "__none__" ? null : v,
                )
              }
            >
              <SelectTrigger className="h-10 sm:h-9">
                <SelectValue placeholder="Seleccionar cuenta…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— sin asignar —</SelectItem>
                {accountOptions.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-[12px] text-ds-text-3">
              Típicamente <strong>4.4.95.001 Diferencias en cobranza - pérdida</strong>.
            </p>
          </div>
          <div>
            <Label>Cuenta para diferencias a favor (cliente pagó más)</Label>
            <Select
              value={config.writeOffOverPaymentAccountId ?? "__none__"}
              onValueChange={(v) =>
                setField(
                  "writeOffOverPaymentAccountId",
                  v === "__none__" ? null : v,
                )
              }
            >
              <SelectTrigger className="h-10 sm:h-9">
                <SelectValue placeholder="Seleccionar cuenta…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— sin asignar —</SelectItem>
                {accountOptions.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-[12px] text-ds-text-3">
              Típicamente <strong>3.3.95.001 Diferencias en cobranza - ganancia</strong>.
            </p>
          </div>
        </div>
        <div className="mt-3 sm:flex sm:justify-end">
          <Button
            onClick={saveConfig}
            disabled={savingConfig}
            className="w-full sm:w-auto h-10 sm:h-9"
          >
            {savingConfig ? "Guardando..." : "Guardar configuración"}
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
            4 AM. Solo usa el botón si querés forzar una recorrida ahora.
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
      
    </div>
  );
}
