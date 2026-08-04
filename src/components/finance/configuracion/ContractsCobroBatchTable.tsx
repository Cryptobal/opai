"use client";

import { useEffect, useState } from "react";
import { Loader2, Save, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { confirmDialog } from "@/components/ui/confirm-service";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Tabla editable masiva de monto, vigencia e IPC de items source=CONTRACT.
 *
 * Usada en `/finanzas/configuracion/contratos`. El calendario de emisión
 * y cobro se edita en Programaciones (FinanceDteRecurringTemplate).
 *
 * Columnas: Contrato/Cliente · Monto · Moneda · Inicio · Fin · Duración ·
 * IPC · IPC meses · IPC desde · Nickname.
 */

type Row = {
  id: string;
  name: string;
  nickname: string | null;
  accountName: string | null;
  installationName: string | null;
  amount: number;
  currency: "CLP" | "UF";
  startDate: string;
  endDate: string | null;
  hasIpcAdjustment: boolean;
  ipcAdjustmentMonths: number | null;
  ipcStartDate: string | null;
};

type RowProblem = {
  severity: "warning" | "error";
  message: string;
};

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

async function pedirConfirmacionCambioMoneda(
  monedaActual: "CLP" | "UF",
  monedaNueva: "CLP" | "UF",
): Promise<boolean> {
  if (monedaActual === monedaNueva) return true;
  return confirmDialog({
    description:
      `Vas a cambiar la moneda de ${monedaActual} a ${monedaNueva}. ` +
      `El monto actual NO se convierte automáticamente — vas a tener ` +
      `que re-ingresarlo. ¿Continuar?`,
  });
}

function detectarProblemas(r: Row): RowProblem[] {
  const problemas: RowProblem[] = [];

  if (!r.amount || r.amount <= 0) {
    problemas.push({ severity: "error", message: "Monto debe ser > 0" });
  }
  if (!r.startDate) {
    problemas.push({ severity: "error", message: "Falta fecha de inicio" });
  }
  if (r.endDate && r.endDate < r.startDate) {
    problemas.push({
      severity: "error",
      message: "Fecha fin antes de inicio",
    });
  }
  if (r.hasIpcAdjustment && r.ipcAdjustmentMonths == null) {
    problemas.push({ severity: "error", message: "Falta frecuencia IPC" });
  }

  if (!r.endDate) {
    problemas.push({
      severity: "warning",
      message: "Sin fecha de fin (contrato indefinido)",
    });
  }

  return problemas;
}

export function ContractsCobroBatchTable() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [filtroSoloProblemas, setFiltroSoloProblemas] = useState(false);

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
        ? prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
        : prev,
    );
    setDirty((prev) => {
      const nextSet = new Set(prev);
      nextSet.add(id);
      return nextSet;
    });
  }

  async function handleCopyDown<K extends keyof Row>(rowId: string, field: K) {
    if (!rows) return;
    const sourceIndex = rows.findIndex((r) => r.id === rowId);
    if (sourceIndex === -1) return;
    const value = rows[sourceIndex][field];
    const targetIds = rows.slice(sourceIndex + 1).map((r) => r.id);
    if (targetIds.length === 0) {
      toast.info("No hay filas debajo para copiar");
      return;
    }
    if (
      !(await confirmDialog({
        description:
          `¿Replicar este valor a las ${targetIds.length} filas debajo? ` +
          `Podés cancelar antes de guardar.`,
      }))
    ) {
      return;
    }
    const targetSet = new Set(targetIds);
    setRows((prev) =>
      prev
        ? prev.map((r) => (targetSet.has(r.id) ? { ...r, [field]: value } : r))
        : prev,
    );
    setDirty((prev) => {
      const next = new Set(prev);
      targetIds.forEach((id) => next.add(id));
      return next;
    });
    toast.success(`Valor replicado a ${targetIds.length} filas`);
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

  const rowsConProblemas = rows.map((r) => ({
    ...r,
    _problems: detectarProblemas(r),
  }));
  const rowsVisibles = filtroSoloProblemas
    ? rowsConProblemas.filter((r) => r._problems.length > 0)
    : rowsConProblemas;
  const totalConProblemas = rowsConProblemas.filter(
    (r) => r._problems.length > 0,
  ).length;
  const totalConErrores = rowsConProblemas.filter((r) =>
    r._problems.some((p) => p.severity === "error"),
  ).length;
  const saveDisabled = saving || dirty.size === 0 || totalConErrores > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-ds-text-3">
          {rows.length} contratos · {dirty.size} con cambios sin guardar
        </p>
        <Button
          onClick={handleSave}
          disabled={saveDisabled}
          title={
            totalConErrores > 0
              ? `${totalConErrores} contrato(s) tienen errores que impiden guardar`
              : undefined
          }
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
          ) : (
            <Save className="h-4 w-4 mr-1.5" />
          )}
          Guardar cambios
        </Button>
      </div>

      {totalConProblemas > 0 && (
        <div
          className={cn(
            "rounded-md px-3 py-2 text-sm flex items-center justify-between gap-3 border",
            totalConErrores > 0
              ? "bg-status-danger-soft text-status-danger-fg border-status-danger-border"
              : "bg-status-warn-soft text-status-warn-fg border-status-warn-border",
          )}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              {totalConErrores > 0
                ? `${totalConErrores} contrato${
                    totalConErrores === 1 ? "" : "s"
                  } con errores que impiden guardar.`
                : `${totalConProblemas} contrato${
                    totalConProblemas === 1 ? "" : "s"
                  } con información incompleta.`}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setFiltroSoloProblemas((v) => !v)}
            className="text-xs underline hover:no-underline shrink-0"
          >
            {filtroSoloProblemas ? "Ver todos" : "Ver solo estos"}
          </button>
        </div>
      )}

      <div className="overflow-auto max-h-[calc(100vh-280px)] rounded-lg border border-ds-border-default">
        <table className="w-full text-sm">
          <thead className="bg-ds-surface-2 text-ds-text-3 text-[12px] uppercase tracking-wide sticky top-0 z-30">
            <tr>
              <th className="px-2 py-2 text-left sticky left-0 bg-ds-surface-2 z-40 min-w-[200px]">
                Contrato / Cliente
              </th>
              <th className="px-2 py-2 text-left">Monto</th>
              <th className="px-2 py-2 text-left">Moneda</th>
              <th className="px-2 py-2 text-left">Inicio</th>
              <th className="px-2 py-2 text-left">Fin</th>
              <th className="px-2 py-2 text-left">Duración</th>
              <th className="px-2 py-2 text-left">IPC</th>
              <th className="px-2 py-2 text-left">IPC meses</th>
              <th className="px-2 py-2 text-left">IPC desde</th>
              <th className="px-2 py-2 text-left">Nickname</th>
            </tr>
          </thead>
          <tbody>
            {rowsVisibles.map((r) => {
              const rowDirty = dirty.has(r.id);
              const hasError = r._problems.some(
                (p) => p.severity === "error",
              );
              const stickyCellBg = rowDirty
                ? "bg-status-info-soft"
                : "bg-ds-surface-1";
              return (
                <tr
                  key={r.id}
                  className={cn(
                    "border-t border-ds-border-default",
                    rowDirty && "bg-status-info-soft/30",
                  )}
                >
                  <td
                    className={cn(
                      "px-2 py-1.5 sticky left-0 z-10 min-w-[200px] border-r border-ds-border-default",
                      stickyCellBg,
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      {r._problems.length > 0 && (
                        <span
                          title={r._problems
                            .map(
                              (p) =>
                                `${p.severity === "error" ? "✗" : "⚠"} ${p.message}`,
                            )
                            .join("\n")}
                          className={cn(
                            "shrink-0",
                            hasError
                              ? "text-status-danger-fg"
                              : "text-status-warn-fg",
                          )}
                          aria-label={
                            hasError
                              ? `${r._problems.length} problema(s) — incluye errores`
                              : `${r._problems.length} aviso(s)`
                          }
                        >
                          <AlertTriangle className="h-3.5 w-3.5" />
                        </span>
                      )}
                      <div className="min-w-0">
                        <div className="text-ds-text-1 font-medium text-xs truncate">
                          {r.accountName ?? r.name}
                        </div>
                        <div className="text-ds-text-3 text-[12px] truncate">
                          {r.installationName ?? "—"}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      min={0}
                      step={r.currency === "UF" ? 0.01 : 1}
                      value={r.amount}
                      onChange={(e) =>
                        updateRow(r.id, "amount", Number(e.target.value))
                      }
                      className="h-10 sm:h-9 w-28 bg-ds-surface-1 border border-ds-border-default rounded px-1.5 py-1 text-xs text-right font-mono"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <select
                      value={r.currency}
                      onChange={async (e) => {
                        const nueva = e.target.value as "CLP" | "UF";
                        if (
                          await pedirConfirmacionCambioMoneda(r.currency, nueva)
                        ) {
                          updateRow(r.id, "currency", nueva);
                          updateRow(r.id, "amount", 0);
                        }
                      }}
                      className="h-10 sm:h-9 bg-ds-surface-1 border border-ds-border-default rounded px-1.5 py-1 text-xs"
                    >
                      <option value="CLP">CLP</option>
                      <option value="UF">UF</option>
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="date"
                      value={r.startDate}
                      onChange={(e) =>
                        updateRow(r.id, "startDate", e.target.value)
                      }
                      className="h-10 sm:h-9 bg-ds-surface-1 border border-ds-border-default rounded px-1.5 py-1 text-xs"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="date"
                      value={r.endDate ?? ""}
                      onChange={(e) =>
                        updateRow(r.id, "endDate", e.target.value || null)
                      }
                      className="h-10 sm:h-9 bg-ds-surface-1 border border-ds-border-default rounded px-1.5 py-1 text-xs"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-xs text-ds-text-3 whitespace-nowrap">
                    {(() => {
                      const meses = calcularDuracionMeses(
                        r.startDate,
                        r.endDate,
                      );
                      return meses === null ? "—" : `${meses} meses`;
                    })()}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <div className="flex items-center justify-center gap-0.5">
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
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyDown(r.id, "hasIpcAdjustment")
                        }
                        title="Replicar este valor a todas las filas debajo"
                        className="text-ds-text-3 hover:text-ds-text-1 opacity-40 hover:opacity-100 text-[12px] px-1 min-h-11 min-w-11 sm:min-h-0 sm:min-w-0"
                      >
                        ↓
                      </button>
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-0.5">
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
                        className="h-10 sm:h-9 w-14 bg-ds-surface-1 border border-ds-border-default rounded px-1.5 py-1 text-xs disabled:opacity-40"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyDown(r.id, "ipcAdjustmentMonths")
                        }
                        title="Replicar este valor a todas las filas debajo"
                        className="text-ds-text-3 hover:text-ds-text-1 opacity-40 hover:opacity-100 text-[12px] px-1 min-h-11 min-w-11 sm:min-h-0 sm:min-w-0"
                      >
                        ↓
                      </button>
                    </div>
                  </td>
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
                      className="h-10 sm:h-9 bg-ds-surface-1 border border-ds-border-default rounded px-1.5 py-1 text-xs disabled:opacity-40"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="text"
                      value={r.nickname ?? ""}
                      onChange={(e) =>
                        updateRow(r.id, "nickname", e.target.value || null)
                      }
                      placeholder="—"
                      maxLength={100}
                      className="h-10 sm:h-9 w-32 bg-ds-surface-1 border border-ds-border-default rounded px-1.5 py-1 text-xs"
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
