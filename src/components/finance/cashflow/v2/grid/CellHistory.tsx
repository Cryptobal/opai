"use client";

import type { FinanceCashflowItemSource } from "@/modules/finance/cashflow/types";
import { isoWeek } from "./grid-helpers";
import { toDate } from "../format";
import { startOfIsoWeekUTC } from "./week-keys";

const SOURCE_LABEL: Partial<Record<FinanceCashflowItemSource, string>> = {
  MANUAL: "entrada manual",
  CONTRACT: "contrato",
  RECURRING_DTE: "DTE recurrente",
  SUPPLIER: "proveedor",
  PAYROLL: "payroll",
  PAYROLL_LIQUIDO: "sueldo líquido",
  PAYROLL_PREVIRED: "PreviRed",
  IVA: "IVA",
  TURNOS_EXTRA: "turnos extra",
};

/**
 * Historial best-effort: solo campos que ya viajan en el payload de celda.
 * // TODO(audit-trail): historial completo (quién/cuándo por movimiento)
 * requiere modelo de auditoría de occurrences — no se crea en F3.
 */
export function CellHistory({
  source,
  hasAmountOverride,
  scheduledDate,
  bucketStart,
}: {
  source?: FinanceCashflowItemSource | null;
  hasAmountOverride?: boolean;
  /** yyyy-MM-dd de la cuota, si existe. */
  scheduledDate?: string | null;
  /** Inicio (lunes) de la columna visible. */
  bucketStart?: string | Date | null;
}) {
  const lines: string[] = [];

  if (source) {
    const label = SOURCE_LABEL[source] ?? source.toLowerCase();
    lines.push(`Creada como ${label}`);
  }

  if (hasAmountOverride) {
    lines.push("Monto ajustado a mano");
  }

  if (scheduledDate && bucketStart) {
    try {
      const schedWeek = startOfIsoWeekUTC(toDate(scheduledDate));
      const visibleWeek = startOfIsoWeekUTC(toDate(bucketStart));
      if (schedWeek.getTime() !== visibleWeek.getTime()) {
        lines.push(
          `Movida de S${isoWeek(schedWeek)} a S${isoWeek(visibleWeek)}`,
        );
      }
    } catch {
      /* omitir si fechas inválidas */
    }
  }

  if (lines.length === 0) return null;

  return (
    <div className="mt-5 border-t border-ds-border-subtle pt-4">
      <h3 className="mb-2 text-[12px] font-mono uppercase tracking-[0.08em] text-ds-text-3">
        Historial
      </h3>
      <ol className="space-y-1.5">
        {lines.map((line) => (
          <li
            key={line}
            className="flex gap-2 text-ds-body text-ds-text-2 before:mt-2 before:h-1.5 before:w-1.5 before:shrink-0 before:rounded-full before:bg-ds-surface-3 before:content-['']"
          >
            {line}
          </li>
        ))}
      </ol>
      {/* TODO(audit-trail): historial completo (quién/cuándo por movimiento)
          requiere modelo de auditoría de occurrences — no se crea en F3. */}
    </div>
  );
}
