"use client";

import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Tabla editable masiva del contrato + calendario de cobro.
 *
 * Usada en `/finanzas/configuracion/contratos-cobro` (Configuración
 * Finanzas → "Contratos — Ciclo de cobro"). Lista todos los items
 * source=CONTRACT del tenant en una grilla con inputs inline. El usuario
 * edita N filas y luego clickea "Guardar cambios" → PATCH batch al
 * backend.
 *
 * Columnas (Bloque 6 Fase 2):
 *  - Contrato/Cliente (read-only, identificación)
 *  - Monto · Moneda · Inicio · Fin · Duración (derivada) · IPC ·
 *    IPC meses · IPC desde
 *  - Nickname · Proforma · Día prof. · Días→factura · Día factura ·
 *    Mes fact. · Modo cobro · Días cobro
 *
 * Semántica de proforma (FIX 2 de Fase 3): cuando un item tiene
 * `emiteProforma=true`, los inputs "Día factura" y "Mes fact." quedan
 * deshabilitados (la fecha sale derivada de proforma + días). Al
 * marcar proforma en una fila, limpiamos esos campos en el state local
 * para que el usuario vea coherencia inmediata.
 *
 * Cambio de moneda (Bloque 6 Fase 2): si el usuario cambia CLP→UF o
 * viceversa, pedimos confirmación con `window.confirm` y forzamos el
 * monto a 0 para que se re-ingrese (un monto en CLP guardado como UF
 * sin convertir genera valores erráticos en la proyección).
 *
 * Validación IPC: si `hasIpcAdjustment=true`, `ipcAdjustmentMonths` es
 * obligatorio; el backend rechaza el batch si falta.
 */
type Row = {
  id: string;
  name: string;
  nickname: string | null;
  accountName: string | null;
  installationName: string | null;
  amount: number;
  currency: "CLP" | "UF";
  // Bloque 6 Fase 2 — campos del contrato:
  startDate: string; // YYYY-MM-DD
  endDate: string | null;
  hasIpcAdjustment: boolean;
  ipcAdjustmentMonths: number | null;
  ipcStartDate: string | null;
  // Calendario de cobro:
  emiteProforma: boolean;
  diaEmisionProforma: number | null;
  diasFacturaDesdeProforma: number | null;
  diaEmisionFactura: number | null;
  mesFacturaRelativo: "MISMO_MES" | "MES_SIGUIENTE";
  modoCobro: "DIRECTO" | "FACTORING";
  diasCobroDesdeFactura: number;
};

/**
 * Calcula la duración en meses (entero, redondeado al más cercano) entre
 * startDate y endDate. Si endDate es null, retorna null ("indefinido").
 */
function calcularDuracionMeses(
  startISO: string,
  endISO: string | null,
): number | null {
  if (!endISO) return null;
  const start = new Date(startISO + "T00:00:00Z");
  const end = new Date(endISO + "T00:00:00Z");
  const months =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth());
  return months;
}

/**
 * Validación cliente del cambio de moneda: si el usuario cambia CLP→UF
 * o UF→CLP, el monto que estaba (ej. 15.000.000 CLP) NO se convierte
 * automáticamente. Si se guarda así, el sistema quedaría con
 * `amount=15.000.000 UF` (= varios cientos de mil millones de pesos).
 *
 * Esta función pide confirmación explícita y limpia el monto, forzando
 * al usuario a re-ingresarlo. Se usa `window.confirm` deliberadamente
 * porque es una decisión rápida en plena edición masiva; abrir un modal
 * shadcn interrumpe el flujo.
 */
function pedirConfirmacionCambioMoneda(
  monedaActual: "CLP" | "UF",
  monedaNueva: "CLP" | "UF",
): boolean {
  if (monedaActual === monedaNueva) return true;
  return window.confirm(
    `Vas a cambiar la moneda de ${monedaActual} a ${monedaNueva}. ` +
      `El monto actual NO se convierte automáticamente — vas a tener ` +
      `que re-ingresarlo. ¿Continuar?`,
  );
}

export function ContractsCobroBatchTable() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/finance/cashflow/contracts-config");
      const json = await res.json();
      if (json.success) {
        setRows(json.data);
        setDirty(new Set());
      } else {
        toast.error(json.error ?? "Error cargando");
      }
    } catch {
      toast.error("Error de conexión");
    }
  }

  useEffect(() => {
    load();
  }, []);

  function updateRow<K extends keyof Row>(
    id: string,
    field: K,
    value: Row[K],
  ) {
    setRows((prev) =>
      prev
        ? prev.map((r) => {
            if (r.id !== id) return r;
            const next = { ...r, [field]: value };
            // Si se acaba de marcar proforma, limpiar campos que no aplican.
            if (field === "emiteProforma" && value === true) {
              next.diaEmisionFactura = null;
              next.mesFacturaRelativo = "MISMO_MES";
            }
            return next;
          })
        : prev,
    );
    setDirty((prev) => {
      const nextSet = new Set(prev);
      nextSet.add(id);
      return nextSet;
    });
  }

  async function handleSave() {
    if (!rows) return;
    const toSave = rows.filter((r) => dirty.has(r.id));
    if (toSave.length === 0) {
      toast.info("Sin cambios para guardar");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/finance/cashflow/contracts-config/batch", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: toSave.map((r) => ({
            id: r.id,
            nickname: r.nickname,
            amount: r.amount,
            currency: r.currency,
            startDate: r.startDate,
            endDate: r.endDate,
            hasIpcAdjustment: r.hasIpcAdjustment,
            ipcAdjustmentMonths: r.hasIpcAdjustment
              ? r.ipcAdjustmentMonths
              : null,
            ipcStartDate: r.ipcStartDate,
            emiteProforma: r.emiteProforma,
            diaEmisionProforma: r.diaEmisionProforma,
            diasFacturaDesdeProforma: r.diasFacturaDesdeProforma,
            diaEmisionFactura: r.diaEmisionFactura,
            mesFacturaRelativo: r.mesFacturaRelativo,
            modoCobro: r.modoCobro,
            diasCobroDesdeFactura: r.diasCobroDesdeFactura,
          })),
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`${json.data.updated} contratos actualizados`);
        await load();
      } else {
        toast.error(json.error ?? "Error guardando");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setSaving(false);
    }
  }

  if (rows === null) {
    return (
      <div className="flex items-center gap-2 p-8 text-sm text-ds-text-3">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando…
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <p className="p-8 text-sm text-ds-text-3">
        No hay contratos activos en el flujo de caja.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-ds-text-3">
          {rows.length} contratos · {dirty.size} con cambios sin guardar
        </p>
        <Button onClick={handleSave} disabled={saving || dirty.size === 0}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
          ) : (
            <Save className="h-4 w-4 mr-1.5" />
          )}
          Guardar cambios
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-ds-border-default">
        <table className="w-full text-sm">
          <thead className="bg-ds-surface-2 text-ds-text-3 text-[12px] uppercase tracking-wide">
            <tr>
              <th className="px-2 py-2 text-left">Contrato / Cliente</th>
              {/* Bloque 6 Fase 2 — campos del contrato */}
              <th className="px-2 py-2 text-left">Monto</th>
              <th className="px-2 py-2 text-left">Moneda</th>
              <th className="px-2 py-2 text-left">Inicio</th>
              <th className="px-2 py-2 text-left">Fin</th>
              <th className="px-2 py-2 text-left">Duración</th>
              <th className="px-2 py-2 text-left">IPC</th>
              <th className="px-2 py-2 text-left">IPC meses</th>
              <th className="px-2 py-2 text-left">IPC desde</th>
              {/* Calendario de cobro */}
              <th className="px-2 py-2 text-left">Nickname</th>
              <th className="px-2 py-2 text-left">Proforma</th>
              <th className="px-2 py-2 text-left">Día prof.</th>
              <th className="px-2 py-2 text-left">Días→factura</th>
              <th className="px-2 py-2 text-left">Día factura</th>
              <th className="px-2 py-2 text-left">Mes fact.</th>
              <th className="px-2 py-2 text-left">Modo cobro</th>
              <th className="px-2 py-2 text-left">Días cobro</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              // Si emite proforma, los campos diaFactura y mesFactura no
              // aplican (la fecha sale de proforma + días). Los deshabilitamos
              // visualmente para evitar inputs sin efecto.
              const facturaCamposDisabled = r.emiteProforma;
              const rowDirty = dirty.has(r.id);
              return (
                <tr
                  key={r.id}
                  className={`border-t border-ds-border-default ${
                    rowDirty ? "bg-status-info-soft/30" : ""
                  }`}
                >
                  <td className="px-2 py-1.5">
                    <div className="text-ds-text-1 font-medium text-xs">
                      {r.accountName ?? r.name}
                    </div>
                    <div className="text-ds-text-3 text-[12px]">
                      {r.installationName ?? "—"}
                    </div>
                  </td>
                  {/* Bloque 6 Fase 2 — Monto */}
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      min={0}
                      step={r.currency === "UF" ? 0.01 : 1}
                      value={r.amount}
                      onChange={(e) =>
                        updateRow(r.id, "amount", Number(e.target.value))
                      }
                      className="w-28 bg-ds-surface-1 border border-ds-border-default rounded px-1.5 py-1 text-xs text-right font-mono"
                    />
                  </td>
                  {/* Moneda */}
                  <td className="px-2 py-1.5">
                    <select
                      value={r.currency}
                      onChange={(e) => {
                        const nueva = e.target.value as "CLP" | "UF";
                        if (
                          pedirConfirmacionCambioMoneda(r.currency, nueva)
                        ) {
                          updateRow(r.id, "currency", nueva);
                          updateRow(r.id, "amount", 0);
                        }
                      }}
                      className="bg-ds-surface-1 border border-ds-border-default rounded px-1.5 py-1 text-xs"
                    >
                      <option value="CLP">CLP</option>
                      <option value="UF">UF</option>
                    </select>
                  </td>
                  {/* Inicio */}
                  <td className="px-2 py-1.5">
                    <input
                      type="date"
                      value={r.startDate}
                      onChange={(e) =>
                        updateRow(r.id, "startDate", e.target.value)
                      }
                      className="bg-ds-surface-1 border border-ds-border-default rounded px-1.5 py-1 text-xs"
                    />
                  </td>
                  {/* Fin */}
                  <td className="px-2 py-1.5">
                    <input
                      type="date"
                      value={r.endDate ?? ""}
                      onChange={(e) =>
                        updateRow(r.id, "endDate", e.target.value || null)
                      }
                      className="bg-ds-surface-1 border border-ds-border-default rounded px-1.5 py-1 text-xs"
                    />
                  </td>
                  {/* Duración derivada (no editable) */}
                  <td className="px-2 py-1.5 text-xs text-ds-text-3 whitespace-nowrap">
                    {(() => {
                      const meses = calcularDuracionMeses(
                        r.startDate,
                        r.endDate,
                      );
                      return meses === null ? "—" : `${meses} meses`;
                    })()}
                  </td>
                  {/* IPC checkbox */}
                  <td className="px-2 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={r.hasIpcAdjustment}
                      onChange={(e) =>
                        updateRow(
                          r.id,
                          "hasIpcAdjustment",
                          e.target.checked,
                        )
                      }
                      className="cursor-pointer"
                    />
                  </td>
                  {/* IPC meses */}
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={r.ipcAdjustmentMonths ?? ""}
                      onChange={(e) =>
                        updateRow(
                          r.id,
                          "ipcAdjustmentMonths",
                          e.target.value ? Number(e.target.value) : null,
                        )
                      }
                      disabled={!r.hasIpcAdjustment}
                      placeholder="12"
                      title={
                        !r.hasIpcAdjustment
                          ? "Marcá IPC para habilitar"
                          : "Frecuencia del ajuste (1-60 meses)"
                      }
                      className="w-14 bg-ds-surface-1 border border-ds-border-default rounded px-1.5 py-1 text-xs disabled:opacity-40"
                    />
                  </td>
                  {/* IPC fecha desde */}
                  <td className="px-2 py-1.5">
                    <input
                      type="date"
                      value={r.ipcStartDate ?? ""}
                      onChange={(e) =>
                        updateRow(
                          r.id,
                          "ipcStartDate",
                          e.target.value || null,
                        )
                      }
                      disabled={!r.hasIpcAdjustment}
                      title={
                        !r.hasIpcAdjustment
                          ? "Marcá IPC para habilitar"
                          : "Fecha desde la cual empieza el calendario de reajustes"
                      }
                      className="bg-ds-surface-1 border border-ds-border-default rounded px-1.5 py-1 text-xs disabled:opacity-40"
                    />
                  </td>
                  {/* Nickname (existente) */}
                  <td className="px-2 py-1.5">
                    <input
                      type="text"
                      value={r.nickname ?? ""}
                      onChange={(e) =>
                        updateRow(r.id, "nickname", e.target.value || null)
                      }
                      placeholder="—"
                      maxLength={100}
                      className="w-32 bg-ds-surface-1 border border-ds-border-default rounded px-1.5 py-1 text-xs"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={r.emiteProforma}
                      onChange={(e) =>
                        updateRow(r.id, "emiteProforma", e.target.checked)
                      }
                      className="cursor-pointer"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={r.diaEmisionProforma ?? ""}
                      onChange={(e) =>
                        updateRow(
                          r.id,
                          "diaEmisionProforma",
                          e.target.value ? Number(e.target.value) : null,
                        )
                      }
                      disabled={!r.emiteProforma}
                      title={
                        !r.emiteProforma
                          ? "Marcá Proforma para habilitar"
                          : ""
                      }
                      className="w-14 bg-ds-surface-1 border border-ds-border-default rounded px-1.5 py-1 text-xs disabled:opacity-40"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      min={0}
                      max={60}
                      value={r.diasFacturaDesdeProforma ?? ""}
                      onChange={(e) =>
                        updateRow(
                          r.id,
                          "diasFacturaDesdeProforma",
                          e.target.value ? Number(e.target.value) : null,
                        )
                      }
                      disabled={!r.emiteProforma}
                      title={
                        !r.emiteProforma
                          ? "Marcá Proforma para habilitar"
                          : ""
                      }
                      className="w-14 bg-ds-surface-1 border border-ds-border-default rounded px-1.5 py-1 text-xs disabled:opacity-40"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={r.diaEmisionFactura ?? ""}
                      onChange={(e) =>
                        updateRow(
                          r.id,
                          "diaEmisionFactura",
                          e.target.value ? Number(e.target.value) : null,
                        )
                      }
                      disabled={facturaCamposDisabled}
                      title={
                        facturaCamposDisabled
                          ? "No aplica: con proforma la fecha sale de proforma + días"
                          : ""
                      }
                      className="w-14 bg-ds-surface-1 border border-ds-border-default rounded px-1.5 py-1 text-xs disabled:opacity-40"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <select
                      value={r.mesFacturaRelativo}
                      onChange={(e) =>
                        updateRow(
                          r.id,
                          "mesFacturaRelativo",
                          e.target.value as Row["mesFacturaRelativo"],
                        )
                      }
                      disabled={facturaCamposDisabled}
                      title={
                        facturaCamposDisabled
                          ? "No aplica: con proforma el mes sale natural"
                          : ""
                      }
                      className="bg-ds-surface-1 border border-ds-border-default rounded px-1.5 py-1 text-xs disabled:opacity-40"
                    >
                      <option value="MISMO_MES">Mismo</option>
                      <option value="MES_SIGUIENTE">Siguiente</option>
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <select
                      value={r.modoCobro}
                      onChange={(e) =>
                        updateRow(
                          r.id,
                          "modoCobro",
                          e.target.value as Row["modoCobro"],
                        )
                      }
                      className="bg-ds-surface-1 border border-ds-border-default rounded px-1.5 py-1 text-xs"
                    >
                      <option value="DIRECTO">Directo</option>
                      <option value="FACTORING">Factoring</option>
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      min={0}
                      max={180}
                      value={r.diasCobroDesdeFactura}
                      onChange={(e) =>
                        updateRow(
                          r.id,
                          "diasCobroDesdeFactura",
                          Number(e.target.value),
                        )
                      }
                      className="w-14 bg-ds-surface-1 border border-ds-border-default rounded px-1.5 py-1 text-xs"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
