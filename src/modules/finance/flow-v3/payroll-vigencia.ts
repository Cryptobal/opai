/**
 * Vigencia del costo de personal por instalación / puesto (puro, cero I/O).
 *
 * El Flujo v3 proyectaba remuneraciones como una foto plana repetida en cada
 * mes del horizonte. Este módulo introduce la dimensión temporal:
 *
 *  - Ventana de servicio por instalación: derivada de la programación
 *    recurrente vinculada (`FinanceDteRecurringTemplate.startDate/endDate`),
 *    con fallback a `CrmInstallation.startDate/endDate`.
 *  - Ventana por puesto: `activeFrom/activeUntil`, intersectada con la de la
 *    instalación (un refuerzo agregado después arranca en su propia fecha).
 *  - Prorrateo del mes de inicio / término con convención chilena de
 *    remuneración mensual: base 30 días, factor clampeado a [0, 1].
 */
import type { PayrollCashSegment } from "@/modules/finance/cashflow/payroll-cash.service";

export const PRORATE_BASE_DAYS = 30;

export interface ServiceWindow {
  /** Primer día con costo (YYYY-MM-DD). null = desde siempre. */
  startYmd: string | null;
  /** Último día con costo (YYYY-MM-DD). null = sin término. */
  endYmd: string | null;
  /** Origen de la ventana (diagnóstico / notas). */
  source: "template" | "installation" | "none";
}

export const OPEN_WINDOW: ServiceWindow = { startYmd: null, endYmd: null, source: "none" };

export interface PayrollMonthAmounts {
  liquido: number;
  previred: number;
  impuestoUnico: number;
}

export interface PayrollInstallationMonth extends PayrollMonthAmounts {
  installationId: string;
  name: string | null;
  /** Factor efectivo del mes (ponderado por monto): 1 = mes completo. */
  factor: number;
}

export interface PayrollByMonth {
  /** installationId → monthKey → montos redondeados del mes. */
  byInstallation: Map<string, Map<string, PayrollInstallationMonth>>;
  /** monthKey → totales redondeados (todas las instalaciones). */
  totals: Map<string, PayrollMonthAmounts>;
  /** monthKey → notas de prorrateo ("Torre A desde 20-09 (11/30)"). */
  notes: Map<string, string[]>;
}

type TemplateWindowRow = {
  installationId: string | null;
  startDate: Date | string | null;
  endDate: Date | string | null;
};

type InstallationWindowRow = {
  id: string;
  startDate: Date | string | null;
  endDate: Date | string | null;
};

function toYmd(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.length >= 10 ? value.slice(0, 10) : null;
  const t = value.getTime();
  if (!Number.isFinite(t)) return null;
  return value.toISOString().slice(0, 10);
}

function daysInMonth(y: number, monthZeroIdx: number): number {
  return new Date(Date.UTC(y, monthZeroIdx + 1, 0)).getUTCDate();
}

function splitMonthKey(monthKey: string): { y: number; m: number } {
  const [y, mm] = monthKey.split("-").map(Number);
  return { y, m: mm - 1 };
}

function dayOf(ymd: string): number {
  return Number(ymd.slice(8, 10));
}

/** Suma `delta` meses a una clave YYYY-MM. */
export function monthKeyAdd(monthKey: string, delta: number): string {
  const { y, m } = splitMonthKey(monthKey);
  const d = new Date(Date.UTC(y, m + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Claves YYYY-MM inclusivas entre dos fechas YYYY-MM-DD. */
export function monthKeysBetween(fromYmd: string, toYmd: string): string[] {
  const out: string[] = [];
  let cur = fromYmd.slice(0, 7);
  const last = toYmd.slice(0, 7);
  while (cur <= last) {
    out.push(cur);
    cur = monthKeyAdd(cur, 1);
  }
  return out;
}

/**
 * Intersección de dos ventanas: inicio = el más tardío, término = el más
 * temprano. Cualquier lado null se interpreta como sin límite.
 */
export function intersectWindows(
  a: ServiceWindow | null | undefined,
  b: ServiceWindow | null | undefined,
): ServiceWindow {
  const wa = a ?? OPEN_WINDOW;
  const wb = b ?? OPEN_WINDOW;
  const starts = [wa.startYmd, wb.startYmd].filter((s): s is string => !!s);
  const ends = [wa.endYmd, wb.endYmd].filter((e): e is string => !!e);
  const startYmd = starts.length ? starts.reduce((x, y) => (x > y ? x : y)) : null;
  const endYmd = ends.length ? ends.reduce((x, y) => (x < y ? x : y)) : null;
  const source = wa.source !== "none" ? wa.source : wb.source;
  return { startYmd, endYmd, source };
}

/**
 * Fracción del costo mensual que corresponde a `monthKey` según la ventana.
 * Base 30: inicio el 20 → 11/30 (independiente de si el mes tiene 30 o 31
 * días); término el 15 → 15/30; mes completo → 1; fuera de ventana → 0.
 */
export function monthVigenciaFactor(window: ServiceWindow, monthKey: string): number {
  const { y, m } = splitMonthKey(monthKey);
  const dim = daysInMonth(y, m);
  const firstYmd = `${monthKey}-01`;
  const lastYmd = `${monthKey}-${String(dim).padStart(2, "0")}`;
  const start = window.startYmd;
  const end = window.endYmd;

  if (start && start > lastYmd) return 0;
  if (end && end < firstYmd) return 0;

  const startsInside = !!start && start > firstYmd;
  const endsInside = !!end && end < lastYmd;
  if (!startsInside && !endsInside) return 1;

  const startDay = startsInside && start ? dayOf(start) : 1;
  const endDay = endsInside && end ? dayOf(end) : dim;
  const covered = Math.max(1, Math.min(endDay, PRORATE_BASE_DAYS) - startDay + 1);
  return Math.min(1, Math.max(0, covered / PRORATE_BASE_DAYS));
}

/**
 * Ventana por instalación. Manda la programación recurrente activa vinculada
 * (`installationId`): inicio = min(startDate); término = null si alguna es
 * abierta, si no max(endDate). Sin programación cae a la fecha de inicio /
 * término de la instalación. Sin ninguna → ventana abierta (comportamiento
 * histórico: costo vigente todo el horizonte).
 */
export function resolveInstallationWindows(
  templates: TemplateWindowRow[],
  installations: InstallationWindowRow[],
): Map<string, ServiceWindow> {
  const out = new Map<string, ServiceWindow>();

  const byInst = new Map<string, { start: string | null; end: string | null; open: boolean }>();
  for (const t of templates) {
    if (!t.installationId) continue;
    const start = toYmd(t.startDate);
    const end = toYmd(t.endDate);
    const cur = byInst.get(t.installationId) ?? { start: null, end: null, open: false };
    if (start && (!cur.start || start < cur.start)) cur.start = start;
    if (!end) cur.open = true;
    else if (!cur.end || end > cur.end) cur.end = end;
    byInst.set(t.installationId, cur);
  }
  for (const [installationId, w] of byInst) {
    out.set(installationId, {
      startYmd: w.start,
      endYmd: w.open ? null : w.end,
      source: "template",
    });
  }

  for (const inst of installations) {
    if (out.has(inst.id)) continue;
    const startYmd = toYmd(inst.startDate);
    const endYmd = toYmd(inst.endDate);
    if (!startYmd && !endYmd) continue;
    out.set(inst.id, { startYmd, endYmd, source: "installation" });
  }

  return out;
}

function ddmm(ymd: string): string {
  return `${ymd.slice(8, 10)}-${ymd.slice(5, 7)}`;
}

function segmentWindow(seg: PayrollCashSegment, installationWindow: ServiceWindow | undefined): ServiceWindow {
  const puestoWindow: ServiceWindow = {
    startYmd: seg.activeFromYmd,
    endYmd: seg.activeUntilYmd,
    source: "none",
  };
  return intersectWindows(installationWindow, puestoWindow);
}

/**
 * Agrega los segmentos (aporte por puesto) mes a mes aplicando el factor de
 * vigencia. Los montos de `segments` vienen sin redondear; acá se redondea
 * por (instalación, mes) y por mes.
 */
export function buildPayrollByMonth(
  segments: PayrollCashSegment[],
  windows: Map<string, ServiceWindow>,
  monthKeys: string[],
): PayrollByMonth {
  type Acc = PayrollMonthAmounts & { weighted: number; base: number; name: string | null };
  const acc = new Map<string, Map<string, Acc>>();

  for (const seg of segments) {
    const instWindow = windows.get(seg.installationId);
    const window = segmentWindow(seg, instWindow);
    const base = seg.liquido + seg.previred + seg.impuestoUnico;
    let instMonths = acc.get(seg.installationId);
    if (!instMonths) {
      instMonths = new Map();
      acc.set(seg.installationId, instMonths);
    }
    for (const monthKey of monthKeys) {
      const factor = monthVigenciaFactor(window, monthKey);
      let cell = instMonths.get(monthKey);
      if (!cell) {
        cell = { liquido: 0, previred: 0, impuestoUnico: 0, weighted: 0, base: 0, name: seg.installationName };
        instMonths.set(monthKey, cell);
      }
      if (!cell.name && seg.installationName) cell.name = seg.installationName;
      cell.base += base;
      if (factor <= 0) continue;
      cell.liquido += seg.liquido * factor;
      cell.previred += seg.previred * factor;
      cell.impuestoUnico += seg.impuestoUnico * factor;
      cell.weighted += base * factor;
    }
  }

  const byInstallation = new Map<string, Map<string, PayrollInstallationMonth>>();
  const totals = new Map<string, PayrollMonthAmounts>();
  const notes = new Map<string, string[]>();
  for (const monthKey of monthKeys) totals.set(monthKey, { liquido: 0, previred: 0, impuestoUnico: 0 });

  for (const [installationId, months] of acc) {
    const outMonths = new Map<string, PayrollInstallationMonth>();
    const instWindow = windows.get(installationId);
    for (const [monthKey, cell] of months) {
      const factor = cell.base > 0 ? cell.weighted / cell.base : 0;
      const rounded: PayrollInstallationMonth = {
        installationId,
        name: cell.name,
        liquido: Math.round(cell.liquido),
        previred: Math.round(cell.previred),
        impuestoUnico: Math.round(cell.impuestoUnico),
        factor,
      };
      outMonths.set(monthKey, rounded);
      const t = totals.get(monthKey);
      if (t) {
        t.liquido += cell.liquido;
        t.previred += cell.previred;
        t.impuestoUnico += cell.impuestoUnico;
      }
      if (factor > 0 && factor < 1) {
        const label = cell.name ?? "instalación";
        const covered = Math.round(factor * PRORATE_BASE_DAYS);
        let when = "parcial";
        if (instWindow?.startYmd && instWindow.startYmd.slice(0, 7) === monthKey) {
          when = `desde ${ddmm(instWindow.startYmd)}`;
        } else if (instWindow?.endYmd && instWindow.endYmd.slice(0, 7) === monthKey) {
          when = `hasta ${ddmm(instWindow.endYmd)}`;
        }
        const list = notes.get(monthKey) ?? [];
        list.push(`${label} ${when} (${covered}/${PRORATE_BASE_DAYS})`);
        notes.set(monthKey, list);
      }
    }
    byInstallation.set(installationId, outMonths);
  }

  for (const [monthKey, t] of totals) {
    totals.set(monthKey, {
      liquido: Math.round(t.liquido),
      previred: Math.round(t.previred),
      impuestoUnico: Math.round(t.impuestoUnico),
    });
  }

  return { byInstallation, totals, notes };
}

/** Acceso seguro a los totales de un mes (0 si el mes no está en el horizonte). */
export function monthTotals(result: PayrollByMonth, monthKey: string): PayrollMonthAmounts {
  return result.totals.get(monthKey) ?? { liquido: 0, previred: 0, impuestoUnico: 0 };
}
