/**
 * Agenda PURA de la facturación recurrente. Extraída de
 * dte-recurring.service.ts (que la re-exporta) para que los derivadores del
 * Flujo v3 y los tests puedan importarla sin arrastrar prisma/storage/envíos.
 * CERO cambios de comportamiento respecto del service original.
 */
import type { FinanceDteRecurringTemplate } from "@prisma/client";

export type Frequency = "monthly" | "biweekly" | "weekly" | "yearly";

/**
 * Política de fijación de UF cuando currency=UF.
 *   - RUN_DAY: UF del día en que se ejecuta el cron.
 *   - LAST_DAY_PREV_MONTH: UF del último día del mes anterior.
 *   - FIRST_DAY_MONTH: UF del primer día del mes en curso.
 *   - LAST_DAY_MONTH: UF del último día del mes en curso.
 *   - CUSTOM_DAY: UF del día N del mes (campo `ufFixingDay`).
 */
export type UfFixingPolicy =
  | "RUN_DAY"
  | "LAST_DAY_PREV_MONTH"
  | "FIRST_DAY_MONTH"
  | "LAST_DAY_MONTH"
  | "CUSTOM_DAY";

/**
 * Resuelve la fecha de UF a usar según la policy. Para todas las
 * policies excepto RUN_DAY, devuelve una fecha específica que el
 * caller pasa a `getUfValueForDate`. Para RUN_DAY devuelve null
 * (caller usa `getUfValue()` del día actual).
 */
export function resolveUfDateForPolicy(
  policy: UfFixingPolicy,
  ufFixingDay: number | null,
  now: Date = new Date(),
): Date | null {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-indexed
  switch (policy) {
    case "RUN_DAY":
      return null;
    case "LAST_DAY_PREV_MONTH":
      // Día 0 del mes en curso = último día del mes anterior.
      return new Date(Date.UTC(y, m, 0));
    case "FIRST_DAY_MONTH":
      return new Date(Date.UTC(y, m, 1));
    case "LAST_DAY_MONTH":
      // Día 0 del mes siguiente = último día del mes en curso.
      return new Date(Date.UTC(y, m + 1, 0));
    case "CUSTOM_DAY": {
      const d = ufFixingDay ?? 1;
      // Clampear al último día disponible si el mes es más corto
      // (ej: 31 en febrero → 28/29).
      const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      return new Date(Date.UTC(y, m, Math.min(d, lastDay)));
    }
    default:
      return null;
  }
}

export type ComputeInput = Pick<
  FinanceDteRecurringTemplate,
  "frequency" | "dayOfMonth" | "dayOfWeek" | "monthOfYear" | "startDate" | "endDate" | "lastRunAt"
>;

function lastDayOfMonth(year: number, monthZeroIdx: number): number {
  return new Date(year, monthZeroIdx + 1, 0).getDate();
}

/**
 * Calcula el próximo nextRunAt según frequency. Si endDate está y
 * el resultado supera endDate → null (template completado).
 *
 * SEMÁNTICA DE fromDate:
 *  - Si NO se pasa fromDate y template.lastRunAt es null → es el primer
 *    schedule de la plantilla; usamos startDate como ancla y NO avanzamos.
 *  - Si SE pasa fromDate explícitamente → semánticamente "ya hubo un run
 *    el fromDate, calculá el siguiente desde ahí" (avanzamos un ciclo).
 *    Útil tras un run para evitar el bug histórico de stale lastRunAt.
 *  - Si template.lastRunAt no es null → avanzamos un ciclo desde lastRunAt.
 */
export function computeNextRunAt(template: ComputeInput, fromDate?: Date): Date | null {
  const explicitFromDate = fromDate != null;
  const base = fromDate ?? template.lastRunAt ?? template.startDate;
  const ref = new Date(base);
  ref.setHours(0, 0, 0, 0);
  // isFirst SOLO si nunca corrió Y no se nos pidió avanzar explícitamente.
  const isFirst = !explicitFromDate && !template.lastRunAt;
  let next: Date;

  switch (template.frequency as Frequency) {
    case "monthly": {
      next = new Date(ref);
      if (!isFirst) {
        // FIX overflow: setDate(1) ANTES de setMonth para evitar que JS
        // saltee abril cuando el día actual es 31 (31/mar + 1 mes = 1/may
        // en lugar de 30/abr). Después clampeamos al día efectivo.
        next.setDate(1);
        next.setMonth(next.getMonth() + 1);
      }
      const dom = template.dayOfMonth ?? 1;
      const lastDay = lastDayOfMonth(next.getFullYear(), next.getMonth());
      next.setDate(dom === -1 ? lastDay : Math.min(dom, lastDay));
      break;
    }
    case "yearly": {
      next = new Date(ref);
      if (!isFirst) {
        next.setDate(1); // mismo guard de overflow para feb 29 → mar 1
        next.setFullYear(next.getFullYear() + 1);
      }
      const moy = (template.monthOfYear ?? 1) - 1;
      next.setMonth(moy);
      const dom = template.dayOfMonth ?? 1;
      const lastDay = lastDayOfMonth(next.getFullYear(), next.getMonth());
      next.setDate(dom === -1 ? lastDay : Math.min(dom, lastDay));
      break;
    }
    case "weekly":
    case "biweekly": {
      const stepDays = template.frequency === "weekly" ? 7 : 14;
      const targetDow = template.dayOfWeek ?? ref.getDay();
      next = new Date(ref);
      if (isFirst) {
        // Primer hit en o después de startDate con el targetDow.
        const diff = (targetDow - next.getDay() + 7) % 7;
        next.setDate(next.getDate() + diff);
      } else {
        next.setDate(next.getDate() + stepDays);
      }
      break;
    }
    default:
      return null;
  }

  if (template.endDate && next > template.endDate) return null;
  return next;
}

/**
 * YYYY-MM-DD (UTC) con clamp de día al mes destino; -1 = último día.
 */
function toIssueYmd(year: number, monthZeroIdx: number, day: number): string {
  // Date.UTC absorbe el rollover dic → ene del año siguiente.
  const norm = new Date(Date.UTC(year, monthZeroIdx, 1));
  const y = norm.getUTCFullYear();
  const m = norm.getUTCMonth();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const d = day === -1 ? last : Math.min(Math.max(day, 1), last);
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Fecha de EMISIÓN (campo `date` del DTE) de la cuota que se está generando.
 * Espeja `calcularFechaEmisionProyectada` (cashflow) para que el borrador nazca
 * con la MISMA fecha que el flujo proyectó:
 *   - AL_EMITIR: el día de la programación (mes del anchor + dayOfMonth).
 *   - DIA_ESPECIFICO: facturaDay del mes indicado por facturaMesRelativo
 *     (MISMO_MES / MES_SIGUIENTE) relativo al mes de la programación.
 * `anchor` = la ocurrencia que se cumple (nextRunAt), NO hoy: si el cron corre
 * tarde o es el primer run de onboarding, la factura igual queda fechada el día
 * correcto (antes usaba todayChileStr y se corría de fecha).
 */
export function computeRecurringIssueYmd(
  template: Pick<
    FinanceDteRecurringTemplate,
    "facturaTiming" | "facturaDay" | "facturaMesRelativo" | "dayOfMonth"
  >,
  anchor: Date,
): string {
  const y = anchor.getUTCFullYear();
  const m = anchor.getUTCMonth();
  if (template.facturaTiming === "DIA_ESPECIFICO" && template.facturaDay != null) {
    const targetMonth = template.facturaMesRelativo === "MES_SIGUIENTE" ? m + 1 : m;
    return toIssueYmd(y, targetMonth, template.facturaDay);
  }
  return toIssueYmd(y, m, template.dayOfMonth ?? 1);
}
