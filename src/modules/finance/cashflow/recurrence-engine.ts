import "server-only";
import type { FinanceCashflowItem, FinanceCashflowRecurrence } from "@prisma/client";
import {
  addDays, addWeeks, addMonths,
  startOfDay, endOfDay,
  getDay, getDate, getMonth, getYear,
  setDate, lastDayOfMonth, isBefore, isAfter,
  getISOWeek, getISOWeekYear,
  startOfISOWeek, endOfISOWeek, startOfMonth, endOfMonth,
} from "date-fns";

/**
 * Calcula la fecha de EMISIÓN proyectada de una cuota mensual a partir
 * del calendario configurado del contrato. El flujo de caja ubica el
 * ingreso recurrente en esta fecha (el día de la programación: 20, 1, etc.),
 * NO en la fecha de cobro: manda el DTE emitido, la programación es el
 * último recurso. `diasCobroDesdeFactura` ya no desplaza la celda.
 *
 *   - Si `diasCobroDesdeFactura > 0`: usa el ciclo proforma → factura para
 *     resolver el día de emisión (sin sumar el lag de cobro).
 *   - Si es 0 (default legacy): retorna null, el caller usa el comportamiento
 *     legacy (`dayOfMonth` del mes del servicio) — que también es el día de
 *     emisión.
 *
 * Regla clave (alineada con FIX 2): cuando `emiteProforma=true`, el
 * rollover al mes siguiente está implícito en `setUTCDate(diaProf +
 * diasGap)`. En ese caso, NO se debe aplicar
 * `mesFacturaRelativo=MES_SIGUIENTE` encima (sería doble suma).
 * `mesFacturaRelativo` solo aplica al caso de factura directa (sin
 * proforma).
 */
export function calcularFechaEmisionProyectada(
  item: {
    diasCobroDesdeFactura: number;
    emiteProforma: boolean;
    diaEmisionProforma: number | null;
    diasFacturaDesdeProforma: number | null;
    diaEmisionFactura: number | null;
    mesFacturaRelativo: string;
    dayOfMonth: number | null;
  },
  servicioYear: number,
  servicioMonth: number,
): Date | null {
  if (item.diasCobroDesdeFactura === 0) return null;

  let fechaFactura: Date;
  if (
    item.emiteProforma &&
    item.diaEmisionProforma != null &&
    item.diasFacturaDesdeProforma != null
  ) {
    const ultDiaMes = new Date(
      Date.UTC(servicioYear, servicioMonth + 1, 0),
    ).getUTCDate();
    const diaProf =
      item.diaEmisionProforma === -1
        ? ultDiaMes
        : Math.min(item.diaEmisionProforma, ultDiaMes);
    const fechaProforma = new Date(
      Date.UTC(servicioYear, servicioMonth, diaProf),
    );
    fechaFactura = new Date(fechaProforma);
    fechaFactura.setUTCDate(
      fechaProforma.getUTCDate() + item.diasFacturaDesdeProforma,
    );
  } else {
    const ultDiaMes = new Date(
      Date.UTC(servicioYear, servicioMonth + 1, 0),
    ).getUTCDate();
    const diaFact = item.diaEmisionFactura ?? item.dayOfMonth ?? 5;
    const diaFactClamp =
      diaFact === -1 ? ultDiaMes : Math.min(diaFact, ultDiaMes);
    fechaFactura = new Date(
      Date.UTC(servicioYear, servicioMonth, diaFactClamp),
    );
    if (item.mesFacturaRelativo === "MES_SIGUIENTE") {
      fechaFactura.setUTCMonth(fechaFactura.getUTCMonth() + 1);
    }
  }

  // El flujo de caja ubica el ingreso recurrente en la fecha de EMISIÓN del
  // borrador (el día de la programación: 20, 1, etc.), NO en la fecha de cobro.
  // Regla de producto: manda el DTE emitido; la programación es el último
  // recurso. `diasCobroDesdeFactura` ya NO desplaza la celda del flujo.
  return fechaFactura;
}

export type ExpandRecurrenceItem = Pick<
  FinanceCashflowItem,
  "recurrence" | "startDate" | "endDate" | "dayOfMonth" | "dayOfWeek" | "monthOfYear"
> &
  Partial<
    Pick<
      FinanceCashflowItem,
      | "emiteProforma"
      | "diaEmisionProforma"
      | "diasFacturaDesdeProforma"
      | "diaEmisionFactura"
      | "mesFacturaRelativo"
      | "diasCobroDesdeFactura"
    >
  >;

type RecurrenceExpansionSource = Pick<
  FinanceCashflowItem,
  "source" | "sourceRefId"
>;

/**
 * Ítems CONTRACT/OTHER del CRM: el calendario Bloque 5 (proforma/cobro) ya no
 * mueve la celda del flujo — solo `dayOfMonth` (día de pago del contrato).
 * RECURRING_DTE ya usa dayOfMonth de la plantilla vía el espejo.
 */
export function itemForRecurrenceExpansion(
  item: ExpandRecurrenceItem & RecurrenceExpansionSource,
): ExpandRecurrenceItem {
  if (
    item.source === "CONTRACT" ||
    (item.source === "OTHER" && item.sourceRefId != null)
  ) {
    return {
      ...item,
      diasCobroDesdeFactura: 0,
      emiteProforma: false,
      diaEmisionProforma: null,
      diasFacturaDesdeProforma: null,
      diaEmisionFactura: null,
      mesFacturaRelativo: "MISMO_MES",
    };
  }
  return item;
}

export function expandRecurrence(
  item: ExpandRecurrenceItem,
  from: Date,
  to: Date,
): Date[] {
  const start = startOfDay(item.startDate);
  const end = item.endDate ? endOfDay(item.endDate) : null;
  const rangeStart = startOfDay(from);
  const rangeEnd = endOfDay(to);

  const dates: Date[] = [];
  const push = (d: Date) => {
    if (isBefore(d, rangeStart)) return;
    if (isAfter(d, rangeEnd)) return;
    if (isBefore(d, start)) return;
    if (end && isAfter(d, end)) return;
    dates.push(startOfDay(d));
  };

  switch (item.recurrence as FinanceCashflowRecurrence) {
    case "ONCE": {
      push(start);
      break;
    }
    case "WEEKLY":
    case "BIWEEKLY": {
      const stepWeeks = item.recurrence === "BIWEEKLY" ? 2 : 1;
      const targetDow = item.dayOfWeek ?? getDay(start);
      let cursor = start;
      const startDow = getDay(cursor);
      const offset = (targetDow - startDow + 7) % 7;
      cursor = addDays(cursor, offset);
      while (!isAfter(cursor, rangeEnd)) {
        push(cursor);
        cursor = addWeeks(cursor, stepWeeks);
      }
      break;
    }
    case "MONTHLY":
    case "QUARTERLY":
    case "YEARLY": {
      const stepMonths = item.recurrence === "MONTHLY" ? 1 : item.recurrence === "QUARTERLY" ? 3 : 12;
      const dom = item.dayOfMonth ?? getDate(start);
      const targetMonth = item.recurrence === "YEARLY" ? (item.monthOfYear ?? getMonth(start) + 1) : null;

      // Si el item tiene calendario nuevo (Bloque 5) configurado, usamos
      // el helper que aplica proforma → factura → cobro. Si no, caemos al
      // cálculo legacy con `dayOfMonth` del mes del servicio.
      const calendarItem = {
        diasCobroDesdeFactura: item.diasCobroDesdeFactura ?? 0,
        emiteProforma: item.emiteProforma ?? false,
        diaEmisionProforma: item.diaEmisionProforma ?? null,
        diasFacturaDesdeProforma: item.diasFacturaDesdeProforma ?? null,
        diaEmisionFactura: item.diaEmisionFactura ?? null,
        mesFacturaRelativo: item.mesFacturaRelativo ?? "MISMO_MES",
        dayOfMonth: item.dayOfMonth ?? null,
      };

      let cursor = start;
      while (!isAfter(cursor, rangeEnd)) {
        const servicioYear =
          item.recurrence === "YEARLY" && targetMonth
            ? getYear(cursor)
            : getYear(cursor);
        const servicioMonth =
          item.recurrence === "YEARLY" && targetMonth
            ? targetMonth - 1
            : getMonth(cursor);

        const fechaEmision = calcularFechaEmisionProyectada(
          calendarItem,
          servicioYear,
          servicioMonth,
        );

        let d: Date;
        if (fechaEmision) {
          d = fechaEmision;
        } else {
          d = new Date(servicioYear, servicioMonth, 1);
          if (dom === -1) {
            d = lastDayOfMonth(d);
          } else {
            const last = lastDayOfMonth(d);
            d = setDate(d, Math.min(dom, getDate(last)));
          }
        }
        push(d);
        cursor = addMonths(cursor, stepMonths);
      }
      break;
    }
  }

  const uniq = Array.from(new Set(dates.map((d) => d.toISOString())))
    .map((s) => new Date(s))
    .sort((a, b) => a.getTime() - b.getTime());
  return uniq;
}

/**
 * Devuelve el viernes (o el día de cierre configurado) de la semana de `date`.
 * Si `date` cae justo en el día de cierre, devuelve esa misma fecha.
 * closingDow: 0=Dom, 1=Lun, ..., 5=Vie, 6=Sáb. Default 5 (viernes).
 */
export function weekEndForClosing(date: Date, closingDow = 5): Date {
  const dow = date.getDay(); // 0=Dom, 6=Sáb
  const daysToAdd = (closingDow - dow + 7) % 7;
  const result = new Date(date);
  result.setDate(date.getDate() + daysToAdd);
  result.setHours(23, 59, 59, 999);
  return result;
}

/** Día siguiente al cierre anterior. Si cierra viernes, devuelve el sábado anterior. */
export function weekStartForClosing(date: Date, closingDow = 5): Date {
  const end = weekEndForClosing(date, closingDow);
  const start = new Date(end);
  start.setDate(end.getDate() - 6);
  start.setHours(0, 0, 0, 0);
  return start;
}

/**
 * Normaliza una fecha a su "día calendario UTC" expresado como fecha local.
 * Las fechas del dominio (cuotas, DTEs) se guardan como UTC-medianoche = día
 * calendario. date-fns (getISOWeek, getMonth, startOfISOWeek…) opera en hora
 * LOCAL, así que en timezones negativas (ej. Chile UTC-4) una fecha
 * UTC-medianoche se interpreta como el día ANTERIOR y cae en la semana/mes
 * equivocado — p.ej. 2026-06-01T00:00Z → 31-may 20:00 local → semana 22 en vez
 * de la 23. Esto provocaba que la cuota de junio apareciera en la semana de
 * mayo (duplicado visible en dev; en prod/UTC no ocurre). Normalizar acá hace
 * el bucketing independiente del timezone del servidor.
 */
export function utcCalendarDay(d: Date): Date {
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function bucketKeyFor(
  date: Date,
  granularity: "weekly" | "monthly",
  weekClosingDow?: number,
): string {
  if (granularity === "weekly") {
    if (weekClosingDow !== undefined) {
      const end = weekEndForClosing(date, weekClosingDow);
      const y = end.getFullYear();
      const m = String(end.getMonth() + 1).padStart(2, "0");
      const d = String(end.getDate()).padStart(2, "0");
      return `WK-${y}${m}${d}`;
    }
    const dd = utcCalendarDay(date);
    const w = String(getISOWeek(dd)).padStart(2, "0");
    return `${getISOWeekYear(dd)}-W${w}`;
  }
  const dd = utcCalendarDay(date);
  const m = String(getMonth(dd) + 1).padStart(2, "0");
  return `${getYear(dd)}-${m}`;
}

export function bucketBoundsFor(
  date: Date,
  granularity: "weekly" | "monthly",
  weekClosingDow?: number,
): { start: Date; end: Date; label: string } {
  if (granularity === "weekly") {
    if (weekClosingDow !== undefined) {
      const start = weekStartForClosing(date, weekClosingDow);
      const end = weekEndForClosing(date, weekClosingDow);
      const closingDayLabel = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"][weekClosingDow];
      const dayNum = String(end.getDate()).padStart(2, "0");
      const monthNum = String(end.getMonth() + 1).padStart(2, "0");
      return { start, end, label: `${closingDayLabel} ${dayNum}/${monthNum}` };
    }
    const dd = utcCalendarDay(date);
    const start = startOfISOWeek(dd);
    const end = endOfISOWeek(dd);
    const w = getISOWeek(dd);
    return { start, end, label: `Sem ${w}` };
  }
  const dd = utcCalendarDay(date);
  const start = startOfMonth(dd);
  const end = endOfMonth(dd);
  const monthNames = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  return { start, end, label: `${monthNames[getMonth(dd)]} ${getYear(dd)}` };
}
