/**
 * Cobranzas Aggregator — fuente única para el panel "Salud financiera".
 *
 * Calcula en una sola pasada:
 *   - Facturado neto (vía sales-aggregator).
 *   - Cobrado: suma de FinancePaymentAllocation.amount sobre DTEs cuya
 *     fecha tributaria cae en el período.
 *   - Por cobrar: suma de amountPending de DTEs aceptados sin pagar
 *     totalmente en el período.
 *   - Aging buckets (0-30, 31-60, 60+) sobre vencidas (UNPAID/PARTIAL/
 *     OVERDUE) — días desde fecha de emisión (o vencimiento si existe)
 *     hasta hoy.
 *   - Margen del mes: facturado − compras.
 *   - IVA neto: débito − crédito.
 *   - Vencidas que requieren acción.
 *
 * Diseño: hace queries dirigidas a cada métrica para no traer toda la
 * tabla al memoria. Reusa `computeNetSales` y `computeNetPurchases` del
 * sales-aggregator para mantener una sola fuente de verdad de la
 * fórmula F29 (33+34+39+41+56 − 61).
 */

import { prisma } from "@/lib/prisma";
import {
  computeNetSales,
  computeNetPurchases,
  type PeriodRange,
} from "./sales-aggregator";

export interface AgingBucket {
  bucket: "0-30" | "31-60" | "60+";
  count: number;
  monto: number;
}

export interface CobranzasSummary {
  facturadoNeto: number;
  cobrado: number;
  porCobrar: number;
  agingBuckets: AgingBucket[];
  /** DTEs con paymentStatus=OVERDUE que requieren acción del usuario. */
  vencidasCount: number;
  vencidasMonto: number;
  /** facturado − compras (ojo: NO es ganancia neta, no descuenta sueldos). */
  margenBruto: number;
  /** ivaDebito − ivaCredito (positivo = pagás IVA al SII). */
  ivaNeto: number;
  comprasNetas: number;
  ivaDebito: number;
  ivaCredito: number;
  /** Para badge de "% cobrado del facturado neto del período". */
  cobradoPct: number;
  range: PeriodRange;
}

/**
 * Trae las allocations de pago vinculadas a DTEs cuya fecha tributaria
 * cae en el rango. Usamos `dte.date` (fecha tributaria) para que la
 * cobranza coincida con el período del facturado: si emitiste en mayo
 * y te pagan en junio, cuenta como cobrado del MES MAYO (porque mayo
 * fue el período de la venta). Esto es lo que un contador espera.
 */
async function sumCobradoForPeriod(
  tenantId: string,
  range: PeriodRange,
): Promise<number> {
  const result = await prisma.financePaymentAllocation.aggregate({
    where: {
      payment: { tenantId, status: { not: "CANCELLED" } },
      dte: {
        tenantId,
        direction: "ISSUED",
        date: { gte: range.from, lt: range.to },
      },
    },
    _sum: { amount: true },
  });
  return result._sum.amount?.toNumber() ?? 0;
}

/**
 * Trae los DTEs emitidos del período aún pendientes de cobro y arma
 * los 3 buckets de aging. Los días se cuentan desde:
 *   - dueDate si existe (fecha de vencimiento del crédito).
 *   - date (fecha de emisión) si no hay dueDate.
 * Hasta hoy. CEDED se excluye (cobro lo hace el factoring).
 */
async function computeAgingForPeriod(
  tenantId: string,
  range: PeriodRange,
  now: Date = new Date(),
): Promise<{
  buckets: AgingBucket[];
  porCobrar: number;
  vencidasCount: number;
  vencidasMonto: number;
}> {
  const dtes = await prisma.financeDte.findMany({
    where: {
      tenantId,
      direction: "ISSUED",
      siiStatus: "ACCEPTED",
      paymentStatus: { in: ["UNPAID", "PARTIAL", "OVERDUE"] },
      date: { gte: range.from, lt: range.to },
      // Excluir NCs: las NCs no se "cobran".
      dteType: { notIn: [61] },
    },
    select: {
      id: true,
      date: true,
      dueDate: true,
      amountPending: true,
      paymentStatus: true,
    },
  });

  const buckets: AgingBucket[] = [
    { bucket: "0-30", count: 0, monto: 0 },
    { bucket: "31-60", count: 0, monto: 0 },
    { bucket: "60+", count: 0, monto: 0 },
  ];

  let porCobrar = 0;
  let vencidasCount = 0;
  let vencidasMonto = 0;

  const todayMs = now.getTime();
  for (const d of dtes) {
    const refDate = d.dueDate ?? d.date;
    const days = Math.floor(
      (todayMs - new Date(refDate).getTime()) / (1000 * 60 * 60 * 24),
    );
    const monto = d.amountPending.toNumber();
    porCobrar += monto;

    if (days <= 30) buckets[0].count += 1, (buckets[0].monto += monto);
    else if (days <= 60) buckets[1].count += 1, (buckets[1].monto += monto);
    else buckets[2].count += 1, (buckets[2].monto += monto);

    if (d.paymentStatus === "OVERDUE") {
      vencidasCount += 1;
      vencidasMonto += monto;
    }
  }

  return { buckets, porCobrar, vencidasCount, vencidasMonto };
}

export async function computeCobranzasSummary(
  tenantId: string,
  range: PeriodRange,
): Promise<CobranzasSummary> {
  const [sales, purchases, cobrado, aging] = await Promise.all([
    computeNetSales(tenantId, range),
    computeNetPurchases(tenantId, range),
    sumCobradoForPeriod(tenantId, range),
    computeAgingForPeriod(tenantId, range),
  ]);

  const facturadoNeto = sales.ventasNetas;
  const ivaNeto = sales.ivaDebito - purchases.ivaCredito;
  const margenBruto = facturadoNeto - purchases.comprasNetas;
  const cobradoPct =
    facturadoNeto > 0 ? (cobrado / facturadoNeto) * 100 : 0;

  return {
    facturadoNeto,
    cobrado,
    porCobrar: aging.porCobrar,
    agingBuckets: aging.buckets,
    vencidasCount: aging.vencidasCount,
    vencidasMonto: aging.vencidasMonto,
    margenBruto,
    ivaNeto,
    comprasNetas: purchases.comprasNetas,
    ivaDebito: sales.ivaDebito,
    ivaCredito: purchases.ivaCredito,
    cobradoPct,
    range,
  };
}

/**
 * Trend mensual de cobrado vs facturado para el chart de los últimos N
 * meses. Devuelve N puntos cronológicos (más antiguo → actual).
 *
 * Usa `dte.date` para asignar al período correcto. Esto es CRUCIAL:
 * un cobro de junio sobre una factura de mayo va al bucket de MAYO,
 * no de junio. Coherente con `computeCobranzasSummary`.
 */
export interface CobranzasTrendPoint {
  mes: string; // "May" / "Jun"
  facturado: number;
  cobrado: number;
}

export async function computeCobranzasTrend(
  tenantId: string,
  monthsBack: number = 6,
  now: Date = new Date(),
): Promise<CobranzasTrendPoint[]> {
  const points: { range: PeriodRange; mes: string }[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const from = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1),
    );
    const to = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 1),
    );
    const mesShort = from
      .toLocaleDateString("es-CL", { month: "short" })
      .replace(".", "");
    points.push({
      range: {
        from,
        to,
        label: `${mesShort.charAt(0).toUpperCase()}${mesShort.slice(1)}`,
      },
      mes: `${mesShort.charAt(0).toUpperCase()}${mesShort.slice(1)}`,
    });
  }

  // Una sola query trae todos los DTEs del rango total (mejor que N
  // queries por mes). Después agrupamos en JS.
  const totalRange = {
    from: points[0].range.from,
    to: points[points.length - 1].range.to,
  };

  const [salesByMonth, allocationsByMonth] = await Promise.all([
    prisma.financeDte.findMany({
      where: {
        tenantId,
        direction: "ISSUED",
        siiStatus: { in: ["ACCEPTED", "PENDING", "SENT"] },
        date: { gte: totalRange.from, lt: totalRange.to },
      },
      select: { date: true, dteType: true, totalAmount: true },
    }),
    prisma.financePaymentAllocation.findMany({
      where: {
        payment: { tenantId, status: { not: "CANCELLED" } },
        dte: {
          tenantId,
          direction: "ISSUED",
          date: { gte: totalRange.from, lt: totalRange.to },
        },
      },
      select: { amount: true, dte: { select: { date: true } } },
    }),
  ]);

  const POSITIVE = new Set([33, 34, 39, 41]);
  const ND = new Set([56]);
  const NC = new Set([61]);

  return points.map((p) => {
    const monthSales = salesByMonth.filter(
      (d) =>
        d.date.getUTCFullYear() === p.range.from.getUTCFullYear() &&
        d.date.getUTCMonth() === p.range.from.getUTCMonth(),
    );
    const facturado = monthSales.reduce((acc, d) => {
      const total = d.totalAmount.toNumber();
      if (POSITIVE.has(d.dteType)) return acc + total;
      if (ND.has(d.dteType)) return acc + total;
      if (NC.has(d.dteType)) return acc - total;
      return acc;
    }, 0);

    const monthCobros = allocationsByMonth.filter(
      (a) =>
        a.dte.date.getUTCFullYear() === p.range.from.getUTCFullYear() &&
        a.dte.date.getUTCMonth() === p.range.from.getUTCMonth(),
    );
    const cobrado = monthCobros.reduce(
      (acc, a) => acc + a.amount.toNumber(),
      0,
    );

    return { mes: p.mes, facturado, cobrado };
  });
}
