"use client";

import { DatePickerField } from "@/components/ui/date-picker";

import { useEffect, useState } from "react";
import { Loader2, Save, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { confirmDialog } from "@/components/ui/confirm-service";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  computeNextRunAt,
  computeRecurringIssueYmd,
} from "@/modules/finance/billing/dte-recurring-schedule";
import { addDaysYmd } from "@/modules/finance/flow-v3/types";

/**
 * Edición masiva del calendario de emisión/cobro de programaciones
 * (FinanceDteRecurringTemplate). Fuente real del Flujo de Caja v3.
 *
 * Columnas derivadas (Emisión / Cobro estimados) usan los mismos helpers
 * puros que el flujo — el usuario ve en la fila dónde caerá la plata.
 */

type Frequency = "monthly" | "biweekly" | "weekly" | "yearly";
type FacturaTiming = "AL_EMITIR" | "DIA_ESPECIFICO";
type MesRelativo = "MISMO_MES" | "MES_SIGUIENTE";

type Row = {
  id: string;
  name: string;
  isActive: boolean;
  accountName: string | null;
  installationName: string | null;
  frequency: Frequency;
  dayOfMonth: number | null;
  dayOfWeek: number | null;
  monthOfYear: number | null;
  facturaTiming: FacturaTiming;
  facturaDay: number | null;
  facturaMesRelativo: MesRelativo;
  diasCobroDesdeFactura: number | null;
  startDate: string;
  endDate: string | null;
  nextRunAt: string | null;
  lastRunAt: string | null;
};

type RowProblem = {
  severity: "warning" | "error";
  message: string;
};

const DOW_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function parseYmdLocal(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function estimatesForRow(r: Row): {
  emisionEstimadaYmd: string | null;
  cobroEstimadoYmd: string | null;
} {
  // Recalcular nextRunAt en cliente si cambió frecuencia/días/inicio,
  // para que las columnas de verificación reflejen el estado editado.
  const next = computeNextRunAt({
    frequency: r.frequency,
    dayOfMonth: r.dayOfMonth,
    dayOfWeek: r.dayOfWeek,
    monthOfYear: r.monthOfYear,
    startDate: parseYmdLocal(r.startDate),
    endDate: r.endDate ? parseYmdLocal(r.endDate) : null,
    lastRunAt: r.lastRunAt ? parseYmdLocal(r.lastRunAt) : null,
  });
  if (!next) {
    return { emisionEstimadaYmd: null, cobroEstimadoYmd: null };
  }
  // computeRecurringIssueYmd usa UTC del anchor; alineamos con el GET
  // del servidor (nextRunAt como Date UTC).
  const anchor = new Date(
    Date.UTC(next.getFullYear(), next.getMonth(), next.getDate()),
  );
  const emisionEstimadaYmd = computeRecurringIssueYmd(
    {
      facturaTiming: r.facturaTiming,
      facturaDay: r.facturaDay,
      facturaMesRelativo: r.facturaMesRelativo,
      dayOfMonth: r.dayOfMonth,
    },
    anchor,
  );
  const cobroEstimadoYmd =
    r.diasCobroDesdeFactura == null
      ? null
      : addDaysYmd(emisionEstimadaYmd, r.diasCobroDesdeFactura);
  return { emisionEstimadaYmd, cobroEstimadoYmd };
}

function formatYmdCl(ymd: string | null): string {
  if (!ymd) return "—";
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

function detectarProblemas(r: Row): RowProblem[] {
  const problemas: RowProblem[] = [];

  if (r.facturaTiming === "DIA_ESPECIFICO" && r.facturaDay == null) {
    problemas.push({
      severity: "error",
      message: "Falta día de factura",
    });
  }
  if (r.endDate && r.endDate < r.startDate) {
    problemas.push({
      severity: "error",
      message: "Fecha fin antes de inicio",
    });
  }
  if (
    r.diasCobroDesdeFactura != null &&
    (r.diasCobroDesdeFactura < 0 || r.diasCobroDesdeFactura > 180)
  ) {
    problemas.push({
      severity: "error",
      message: "Días cobro fuera de 0–180",
    });
  }
  if (
    (r.frequency === "monthly" || r.frequency === "yearly") &&
    r.dayOfMonth == null
  ) {
    problemas.push({
      severity: "error",
      message: "Falta día de programación",
    });
  }
  if (
    (r.frequency === "weekly" || r.frequency === "biweekly") &&
    r.dayOfWeek == null
  ) {
    problemas.push({
      severity: "error",
      message: "Falta día de la semana",
    });
  }

  if (r.diasCobroDesdeFactura == null) {
    problemas.push({
      severity: "warning",
      message: "Sin días cobro (usa default del tenant)",
    });
  }
  if (!r.endDate) {
    problemas.push({
      severity: "warning",
      message: "Sin fecha de fin (indefinido)",
    });
  }
  if (!r.isActive) {
    problemas.push({
      severity: "warning",
      message: "Plantilla inactiva (el flujo no la proyecta)",
    });
  }
  const est = estimatesForRow(r);
  if (!est.emisionEstimadaYmd && r.endDate) {
    problemas.push({
      severity: "warning",
      message: "Plantilla vencida (sin próxima emisión)",
    });
  }

  return problemas;
}

export function RecurringCalendarBatchTable() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [filtroSoloProblemas, setFiltroSoloProblemas] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/finance/billing/recurring/calendario");
      const json = await res.json();
      if (json.success) {
        setRows(
          (json.data as Row[]).map((r) => ({
            ...r,
            frequency: r.frequency as Frequency,
            facturaTiming: r.facturaTiming as FacturaTiming,
            facturaMesRelativo: r.facturaMesRelativo as MesRelativo,
          })),
        );
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

  function updateRow<K extends keyof Row>(id: string, field: K, value: Row[K]) {
    setRows((prev) =>
      prev
        ? prev.map((r) => {
            if (r.id !== id) return r;
            const next = { ...r, [field]: value };
            if (field === "facturaTiming" && value === "AL_EMITIR") {
              next.facturaDay = null;
              next.facturaMesRelativo = "MES_SIGUIENTE";
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
        ? prev.map((r) => {
            if (!targetSet.has(r.id)) return r;
            const next = { ...r, [field]: value };
            if (field === "facturaTiming" && value === "AL_EMITIR") {
              next.facturaDay = null;
              next.facturaMesRelativo = "MES_SIGUIENTE";
            }
            return next;
          })
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
      const res = await fetch("/api/finance/billing/recurring/calendario", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: toSave.map((r) => ({
            id: r.id,
            frequency: r.frequency,
            dayOfMonth: r.dayOfMonth,
            dayOfWeek: r.dayOfWeek,
            monthOfYear: r.monthOfYear,
            facturaTiming: r.facturaTiming,
            facturaDay: r.facturaDay,
            facturaMesRelativo: r.facturaMesRelativo,
            diasCobroDesdeFactura: r.diasCobroDesdeFactura,
            startDate: r.startDate,
            endDate: r.endDate,
          })),
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`${json.data.updated} programaciones actualizadas`);
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
        No hay programaciones de facturación (tipos 33/34).
      </p>
    );
  }

  const rowsConProblemas = rows.map((r) => ({
    ...r,
    _problems: detectarProblemas(r),
    _est: estimatesForRow(r),
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
          {rows.length} programaciones · {dirty.size} con cambios sin guardar
        </p>
        <Button
          onClick={handleSave}
          disabled={saveDisabled}
          title={
            totalConErrores > 0
              ? `${totalConErrores} programación(es) tienen errores que impiden guardar`
              : dirty.size > 0
                ? `Guardar ${dirty.size} fila(s) en batch`
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
                ? `${totalConErrores} programación${
                    totalConErrores === 1 ? "" : "es"
                  } con errores que impiden guardar.`
                : `${totalConProblemas} programación${
                    totalConProblemas === 1 ? "" : "es"
                  } con avisos.`}
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

      <div className="overflow-auto max-h-[calc(100dvh-280px)] rounded-lg border border-ds-border-default">
        <table className="w-full text-sm">
          <thead className="bg-ds-surface-2 text-ds-text-3 text-[12px] uppercase tracking-wide sticky top-0 z-30">
            <tr>
              <th className="px-2 py-2 text-left sticky left-0 bg-ds-surface-2 z-40 min-w-[220px]">
                Plantilla / Cliente
              </th>
              <th className="px-2 py-2 text-left">Frecuencia</th>
              <th className="px-2 py-2 text-left">Día prog.</th>
              <th className="px-2 py-2 text-left">Emisión factura</th>
              <th className="px-2 py-2 text-left">Día factura</th>
              <th className="px-2 py-2 text-left">Mes factura</th>
              <th className="px-2 py-2 text-left">Días cobro</th>
              <th className="px-2 py-2 text-left">Inicio</th>
              <th className="px-2 py-2 text-left">Fin</th>
              <th className="px-2 py-2 text-left">Estado</th>
              <th className="px-2 py-2 text-left">Emisión est.</th>
              <th className="px-2 py-2 text-left">Cobro est.</th>
            </tr>
          </thead>
          <tbody>
            {rowsVisibles.map((r) => {
              const diaEspecifico = r.facturaTiming === "DIA_ESPECIFICO";
              const rowDirty = dirty.has(r.id);
              const hasError = r._problems.some((p) => p.severity === "error");
              const stickyCellBg = rowDirty
                ? "bg-status-info-soft"
                : "bg-ds-surface-1";
              const isWeekly =
                r.frequency === "weekly" || r.frequency === "biweekly";

              return (
                <tr
                  key={r.id}
                  className={cn(
                    "border-t border-ds-border-default",
                    rowDirty && "bg-status-info-soft/30",
                    !r.isActive && "opacity-70",
                  )}
                >
                  <td
                    className={cn(
                      "px-2 py-1.5 sticky left-0 z-10 min-w-[220px] border-r border-ds-border-default",
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
                        >
                          <AlertTriangle className="h-3.5 w-3.5" />
                        </span>
                      )}
                      <div className="min-w-0">
                        <div className="text-ds-text-1 font-medium text-xs truncate">
                          {r.name}
                        </div>
                        <div className="text-ds-text-3 text-[12px] truncate">
                          {r.accountName ?? "—"}
                          {r.installationName
                            ? ` · ${r.installationName}`
                            : ""}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="px-2 py-1.5">
                    <select
                      value={r.frequency}
                      onChange={(e) =>
                        updateRow(
                          r.id,
                          "frequency",
                          e.target.value as Frequency,
                        )
                      }
                      className="h-10 sm:h-9 bg-ds-surface-1 border border-ds-border-default rounded px-1.5 py-1 text-xs"
                    >
                      <option value="monthly">Mensual</option>
                      <option value="biweekly">Quincenal</option>
                      <option value="weekly">Semanal</option>
                      <option value="yearly">Anual</option>
                    </select>
                  </td>

                  <td className="px-2 py-1.5">
                    {isWeekly ? (
                      <select
                        value={r.dayOfWeek ?? ""}
                        onChange={(e) =>
                          updateRow(
                            r.id,
                            "dayOfWeek",
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                          )
                        }
                        className="h-10 sm:h-9 bg-ds-surface-1 border border-ds-border-default rounded px-1.5 py-1 text-xs"
                      >
                        <option value="">—</option>
                        {DOW_LABELS.map((label, i) => (
                          <option key={label} value={i}>
                            {label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="flex items-center gap-1">
                        {r.frequency === "yearly" && (
                          <input
                            type="number"
                            min={1}
                            max={12}
                            value={r.monthOfYear ?? ""}
                            onChange={(e) =>
                              updateRow(
                                r.id,
                                "monthOfYear",
                                e.target.value
                                  ? Number(e.target.value)
                                  : null,
                              )
                            }
                            title="Mes del año (1–12)"
                            placeholder="Mes"
                            className="h-10 sm:h-9 w-14 bg-ds-surface-1 border border-ds-border-default rounded px-1.5 py-1 text-xs"
                          />
                        )}
                        <input
                          type="number"
                          min={-1}
                          max={31}
                          value={r.dayOfMonth ?? ""}
                          onChange={(e) =>
                            updateRow(
                              r.id,
                              "dayOfMonth",
                              e.target.value === ""
                                ? null
                                : Number(e.target.value),
                            )
                          }
                          title="Día del mes (1–31, -1 = último)"
                          className="h-10 sm:h-9 w-14 bg-ds-surface-1 border border-ds-border-default rounded px-1.5 py-1 text-xs"
                        />
                      </div>
                    )}
                  </td>

                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-0.5">
                      <select
                        value={r.facturaTiming}
                        onChange={(e) =>
                          updateRow(
                            r.id,
                            "facturaTiming",
                            e.target.value as FacturaTiming,
                          )
                        }
                        className="h-10 sm:h-9 bg-ds-surface-1 border border-ds-border-default rounded px-1.5 py-1 text-xs"
                      >
                        <option value="AL_EMITIR">Al emitir</option>
                        <option value="DIA_ESPECIFICO">Día específico</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => handleCopyDown(r.id, "facturaTiming")}
                        title="Replicar a filas debajo"
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
                        min={-1}
                        max={31}
                        value={r.facturaDay ?? ""}
                        onChange={(e) =>
                          updateRow(
                            r.id,
                            "facturaDay",
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                          )
                        }
                        disabled={!diaEspecifico}
                        title={
                          diaEspecifico
                            ? "Día de factura (1–31, -1 = último)"
                            : "Solo con emisión día específico"
                        }
                        className="h-10 sm:h-9 w-14 bg-ds-surface-1 border border-ds-border-default rounded px-1.5 py-1 text-xs disabled:opacity-40"
                      />
                      <button
                        type="button"
                        onClick={() => handleCopyDown(r.id, "facturaDay")}
                        disabled={!diaEspecifico}
                        title="Replicar a filas debajo"
                        className="text-ds-text-3 hover:text-ds-text-1 opacity-40 hover:opacity-100 text-[12px] px-1 disabled:opacity-20 min-h-11 min-w-11 sm:min-h-0 sm:min-w-0"
                      >
                        ↓
                      </button>
                    </div>
                  </td>

                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-0.5">
                      <select
                        value={r.facturaMesRelativo}
                        onChange={(e) =>
                          updateRow(
                            r.id,
                            "facturaMesRelativo",
                            e.target.value as MesRelativo,
                          )
                        }
                        disabled={!diaEspecifico}
                        className="h-10 sm:h-9 bg-ds-surface-1 border border-ds-border-default rounded px-1.5 py-1 text-xs disabled:opacity-40"
                      >
                        <option value="MISMO_MES">Mismo</option>
                        <option value="MES_SIGUIENTE">Siguiente</option>
                      </select>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyDown(r.id, "facturaMesRelativo")
                        }
                        disabled={!diaEspecifico}
                        title="Replicar a filas debajo"
                        className="text-ds-text-3 hover:text-ds-text-1 opacity-40 hover:opacity-100 text-[12px] px-1 disabled:opacity-20 min-h-11 min-w-11 sm:min-h-0 sm:min-w-0"
                      >
                        ↓
                      </button>
                    </div>
                  </td>

                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-0.5">
                      <input
                        type="number"
                        min={0}
                        max={180}
                        value={r.diasCobroDesdeFactura ?? ""}
                        onChange={(e) =>
                          updateRow(
                            r.id,
                            "diasCobroDesdeFactura",
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                          )
                        }
                        placeholder="def"
                        title="Días entre factura y cobro (vacío = default tenant)"
                        className="h-10 sm:h-9 w-14 bg-ds-surface-1 border border-ds-border-default rounded px-1.5 py-1 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyDown(r.id, "diasCobroDesdeFactura")
                        }
                        title="Replicar a filas debajo"
                        className="text-ds-text-3 hover:text-ds-text-1 opacity-40 hover:opacity-100 text-[12px] px-1 min-h-11 min-w-11 sm:min-h-0 sm:min-w-0"
                      >
                        ↓
                      </button>
                    </div>
                  </td>

                  <td className="px-2 py-1.5">
                    <DatePickerField value={r.startDate || null} onChange={(ymd) =>
                        updateRow(r.id, "startDate", (ymd ?? ""))} triggerClassName={"h-10 sm:h-9 bg-ds-surface-1 border border-ds-border-default rounded px-1.5 py-1 text-xs"} />
                  </td>
                  <td className="px-2 py-1.5">
                    <DatePickerField value={r.endDate || null} onChange={(ymd) =>
                        updateRow(r.id, "endDate", (ymd ?? "") || null)} triggerClassName={"h-10 sm:h-9 bg-ds-surface-1 border border-ds-border-default rounded px-1.5 py-1 text-xs"} />
                  </td>

                  <td className="px-2 py-1.5 text-xs whitespace-nowrap">
                    {r.isActive ? (
                      <span className="text-status-ok-fg">Activa</span>
                    ) : (
                      <span className="text-ds-text-3">Inactiva</span>
                    )}
                  </td>

                  <td className="px-2 py-1.5 text-xs font-mono text-ds-text-2 whitespace-nowrap">
                    {formatYmdCl(r._est.emisionEstimadaYmd)}
                  </td>
                  <td className="px-2 py-1.5 text-xs font-mono text-ds-text-1 whitespace-nowrap">
                    {formatYmdCl(r._est.cobroEstimadoYmd)}
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
