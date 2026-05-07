/**
 * Sales Aggregator — fuente única de verdad para los KPIs de facturación.
 *
 * Cada KPI/dashboard que muestre "ventas del período" debe pasar por acá
 * para evitar drift entre `/finanzas` (dashboard), `/finanzas/facturacion`
 * (módulo) y los endpoints `/api/finance/billing/kpis|trend`.
 *
 * Convenciones (basadas en el F29 SII y la práctica contable chilena):
 *
 * 1. Período: siempre `FinanceDte.date` (fecha tributaria), NUNCA
 *    `createdAt`. Los DTEs importados del SII pueden tener `createdAt`
 *    en la semana en que se sincronizó pero corresponden a otros meses.
 *
 * 2. Estados SII: por default ACCEPTED + PENDING + SENT (lo que está en
 *    flight cuenta como venta). El consumidor puede pedir SOLO ACCEPTED
 *    si quiere coincidir 1:1 con lo que reportará el contador en F29.
 *
 * 3. Fórmula de ventas netas (espejo del Libro IVA):
 *      ventasNetas = Σ(33+34+39+41) + Σ(56) − Σ(61)
 *
 *    - 33 Factura Electrónica
 *    - 34 Factura Exenta
 *    - 39 Boleta Electrónica
 *    - 41 Boleta Exenta
 *    - 56 Nota de Débito (corrige hacia arriba — suma)
 *    - 61 Nota de Crédito (anula/corrige hacia abajo — resta)
 *
 *    Mismo principio aplica al IVA débito.
 *
 * 4. `facturasMes` es el COUNT de los positivos (33+34+39+41+56). Las
 *    NC no se cuentan como "facturas emitidas" en la métrica del KPI
 *    (van separadas en `ncCount`).
 */

import { prisma } from "@/lib/prisma";
import type { FinanceSiiStatus } from "@prisma/client";

export interface PeriodRange {
  from: Date;
  to: Date;
  /** Etiqueta humana: "Mayo 2026", "Últimos 12 meses", "Mes actual". */
  label: string;
}

export interface NetSalesAggregate {
  /** Σ(33+34+39+41) totalAmount. */
  ventasBrutas: number;
  /** Σ(56) totalAmount — corrige hacia arriba, suma. */
  ndMonto: number;
  /** Σ(61) totalAmount — anula/corrige hacia abajo, resta. */
  ncMonto: number;
  /** ventasBrutas + ndMonto - ncMonto. Mismo número que F29. */
  ventasNetas: number;

  /** Σ(33+34+39+41) taxAmount. */
  ivaBruto: number;
  /** Σ(56) taxAmount. */
  ivaNd: number;
  /** Σ(61) taxAmount. */
  ivaNc: number;
  /** ivaBruto + ivaNd - ivaNc. */
  ivaDebito: number;

  /** Cantidad de DTEs positivos (33+34+39+41+56). */
  facturasMes: number;
  ncCount: number;
  ndCount: number;

  range: PeriodRange;
  statusInclude: FinanceSiiStatus[];
}

/** Tipos que SUMAN al débito fiscal del período. */
export const POSITIVE_TYPES = [33, 34, 39, 41] as const;
/** Tipos que CORRIGEN hacia arriba (suman). */
export const ND_TYPES = [56] as const;
/** Tipos que CORRIGEN hacia abajo (restan). */
export const NC_TYPES = [61] as const;

/**
 * Status SII que cuentan como "venta" por default. Mantiene el
 * comportamiento histórico del módulo: un DTE PENDING/SENT al SII ya
 * cuenta porque el folio está reservado y el receptor lo va a recibir.
 *
 * Si el consumidor quiere SOLO ACCEPTED (para reconciliar con F29),
 * pasa `statusInclude: ["ACCEPTED"]`.
 */
export const DEFAULT_INCLUDED_STATUS: FinanceSiiStatus[] = [
  "ACCEPTED",
  "PENDING",
  "SENT",
];

export interface NetSalesOptions {
  /** Default: ACCEPTED + PENDING + SENT. */
  statusInclude?: FinanceSiiStatus[];
}

const MES_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

export function formatMonthLabel(year: number, monthOneIdx: number): string {
  const m = Math.min(12, Math.max(1, monthOneIdx));
  return `${MES_NAMES[m - 1]} ${year}`;
}

/**
 * Construye el rango UTC para un período. Acepta:
 *   - "ALL"      → últimos 12 meses (incluyendo el actual).
 *   - "YTD"      → año en curso, desde 1° de enero hasta hoy (mes en curso).
 *   - "PREV"     → mes anterior completo.
 *   - "YYYY-MM"  → ese mes específico.
 *   - null/undefined/"" → mes actual.
 *
 * Los presets "YTD" y "PREV" se agregaron en Fase 7 para el selector
 * del hero "Salud financiera". El caller solo pasa la string y el
 * helper resuelve el rango y la etiqueta humana correspondiente.
 */
export function buildMonthRange(
  periodo: string | null | undefined,
  now: Date = new Date(),
): PeriodRange {
  if (periodo === "ALL") {
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1),
    );
    const end = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );
    return { from: start, to: end, label: "Últimos 12 meses" };
  }
  if (periodo === "YTD") {
    // Año en curso = 1° enero hasta inicio del mes siguiente al actual.
    // No incluye días futuros del mes en curso (no tiene sentido para
    // "ventas del año": las facturas futuras todavía no existen).
    const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const end = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );
    return { from: start, to: end, label: `Año ${now.getUTCFullYear()}` };
  }
  if (periodo === "PREV") {
    // Mes anterior completo. Si hoy es 7 may → 1 abr a 1 may.
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
    );
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const prevY = start.getUTCFullYear();
    const prevM = start.getUTCMonth() + 1;
    return { from: start, to: end, label: formatMonthLabel(prevY, prevM) };
  }
  if (periodo && /^\d{4}-\d{2}$/.test(periodo)) {
    const [y, m] = periodo.split("-").map((s) => parseInt(s, 10));
    if (m >= 1 && m <= 12) {
      const from = new Date(Date.UTC(y, m - 1, 1));
      const to = new Date(Date.UTC(y, m, 1));
      return { from, to, label: formatMonthLabel(y, m) };
    }
  }
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );
  return {
    from,
    to,
    label: formatMonthLabel(now.getUTCFullYear(), now.getUTCMonth() + 1),
  };
}

/**
 * Devuelve el rango inmediatamente anterior al `range` dado, mismo
 * largo en meses. Sirve para calcular "vs mes anterior" o "vs últimos
 * 12 meses previos".
 */
export function prevRangeOf(range: PeriodRange): PeriodRange {
  const months = monthsBetween(range.from, range.to);
  const from = new Date(range.from);
  from.setUTCMonth(from.getUTCMonth() - months);
  const to = new Date(range.to);
  to.setUTCMonth(to.getUTCMonth() - months);
  const label =
    months === 1 ? "vs mes anterior" : `vs ${months} meses previos`;
  return { from, to, label };
}

function monthsBetween(from: Date, to: Date): number {
  return (
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (to.getUTCMonth() - from.getUTCMonth())
  );
}

/**
 * Calcula los totales de ventas netas para un tenant + rango.
 * Usa 6 queries paralelas (3 sums + 3 counts) — Prisma las ejecuta en
 * batch. La aggregation usa índices `(tenant_id, direction, sii_status, date)`
 * que ya existen en el modelo `FinanceDte`.
 */
export async function computeNetSales(
  tenantId: string,
  range: PeriodRange,
  opts: NetSalesOptions = {},
): Promise<NetSalesAggregate> {
  const statusInclude = opts.statusInclude ?? DEFAULT_INCLUDED_STATUS;

  const baseWhere = {
    tenantId,
    direction: "ISSUED" as const,
    siiStatus: { in: statusInclude },
    date: { gte: range.from, lt: range.to },
  };

  const [brutoAgg, ndAgg, ncAgg, brutoCount, ndCount, ncCount] =
    await Promise.all([
      prisma.financeDte.aggregate({
        where: { ...baseWhere, dteType: { in: [...POSITIVE_TYPES] } },
        _sum: { totalAmount: true, taxAmount: true },
      }),
      prisma.financeDte.aggregate({
        where: { ...baseWhere, dteType: { in: [...ND_TYPES] } },
        _sum: { totalAmount: true, taxAmount: true },
      }),
      prisma.financeDte.aggregate({
        where: { ...baseWhere, dteType: { in: [...NC_TYPES] } },
        _sum: { totalAmount: true, taxAmount: true },
      }),
      prisma.financeDte.count({
        where: { ...baseWhere, dteType: { in: [...POSITIVE_TYPES] } },
      }),
      prisma.financeDte.count({
        where: { ...baseWhere, dteType: { in: [...ND_TYPES] } },
      }),
      prisma.financeDte.count({
        where: { ...baseWhere, dteType: { in: [...NC_TYPES] } },
      }),
    ]);

  const ventasBrutas = brutoAgg._sum.totalAmount?.toNumber() ?? 0;
  const ndMonto = ndAgg._sum.totalAmount?.toNumber() ?? 0;
  const ncMonto = ncAgg._sum.totalAmount?.toNumber() ?? 0;
  const ivaBruto = brutoAgg._sum.taxAmount?.toNumber() ?? 0;
  const ivaNd = ndAgg._sum.taxAmount?.toNumber() ?? 0;
  const ivaNc = ncAgg._sum.taxAmount?.toNumber() ?? 0;

  return {
    ventasBrutas,
    ndMonto,
    ncMonto,
    ventasNetas: ventasBrutas + ndMonto - ncMonto,
    ivaBruto,
    ivaNd,
    ivaNc,
    ivaDebito: ivaBruto + ivaNd - ivaNc,
    facturasMes: brutoCount + ndCount,
    ncCount,
    ndCount,
    range,
    statusInclude,
  };
}

/**
 * Calcula las compras netas (DTEs RECIBIDOS). Espejo de `computeNetSales`
 * para que los KPIs de Compras tengan misma lógica.
 *
 * Nota: en compras NO filtramos por `siiStatus` porque la dirección RECEIVED
 * no tiene un status SII propio (lo único que importa es `receptionStatus`).
 * Si en el futuro queremos excluir CLAIMED, lo hacemos acá.
 */
export interface NetPurchasesAggregate {
  comprasBrutas: number;
  ndMonto: number;
  ncMonto: number;
  comprasNetas: number;
  ivaCredito: number;
  facturasMes: number;
  range: PeriodRange;
}

export async function computeNetPurchases(
  tenantId: string,
  range: PeriodRange,
): Promise<NetPurchasesAggregate> {
  const baseWhere = {
    tenantId,
    direction: "RECEIVED" as const,
    date: { gte: range.from, lt: range.to },
  };

  const [brutoAgg, ndAgg, ncAgg, brutoCount, ndCount] = await Promise.all([
    prisma.financeDte.aggregate({
      where: { ...baseWhere, dteType: { in: [...POSITIVE_TYPES] } },
      _sum: { totalAmount: true, taxAmount: true },
    }),
    prisma.financeDte.aggregate({
      where: { ...baseWhere, dteType: { in: [...ND_TYPES] } },
      _sum: { totalAmount: true, taxAmount: true },
    }),
    prisma.financeDte.aggregate({
      where: { ...baseWhere, dteType: { in: [...NC_TYPES] } },
      _sum: { totalAmount: true, taxAmount: true },
    }),
    prisma.financeDte.count({
      where: { ...baseWhere, dteType: { in: [...POSITIVE_TYPES] } },
    }),
    prisma.financeDte.count({
      where: { ...baseWhere, dteType: { in: [...ND_TYPES] } },
    }),
  ]);

  const comprasBrutas = brutoAgg._sum.totalAmount?.toNumber() ?? 0;
  const ndMonto = ndAgg._sum.totalAmount?.toNumber() ?? 0;
  const ncMonto = ncAgg._sum.totalAmount?.toNumber() ?? 0;
  const ivaBruto = brutoAgg._sum.taxAmount?.toNumber() ?? 0;
  const ivaNd = ndAgg._sum.taxAmount?.toNumber() ?? 0;
  const ivaNc = ncAgg._sum.taxAmount?.toNumber() ?? 0;

  return {
    comprasBrutas,
    ndMonto,
    ncMonto,
    comprasNetas: comprasBrutas + ndMonto - ncMonto,
    ivaCredito: ivaBruto + ivaNd - ivaNc,
    facturasMes: brutoCount + ndCount,
    range,
  };
}

/**
 * Helper para calcular % de variación entre dos números, blindado para
 * división por cero. Devuelve 0 si el `prev` es 0 o negativo.
 */
export function pctChange(actual: number, prev: number): number {
  if (prev <= 0) return 0;
  return ((actual - prev) / prev) * 100;
}
