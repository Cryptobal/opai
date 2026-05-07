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

export interface TopDebtor {
  /** ID del CrmAccount cuando hay vinculación; null si solo tenemos RUT. */
  accountId: string | null;
  /** Nombre del cliente (legalName del CrmAccount o receiverName). */
  name: string;
  /** RUT canónico del cliente. */
  rut: string;
  /** Suma de amountPending de DTEs UNPAID/PARTIAL/OVERDUE. */
  monto: number;
  /** # de facturas pendientes que componen el monto. */
  facturasCount: number;
  /** Días desde la fecha de emisión más antigua sin cobrar (signo de
   *  cuán "viejas" son las deudas — más alto = peor). */
  diasMasAntigua: number;
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
  /**
   * Days Sales Outstanding: días promedio que toma cobrar las facturas.
   * Fórmula: (porCobrar / ventas últimos 30d) × 30.
   * Si ventas últimos 30d = 0, retorna null (no se puede dividir).
   * Más bajo = mejor (cobrás rápido).
   */
  dso: number | null;
  /** DSO del período INMEDIATAMENTE anterior al actual (mismo largo). */
  dsoPrev: number | null;
  /** Top 5 cuentas con más monto pendiente (clientes morosos). */
  topDeudores: TopDebtor[];
  /** Suma de currentBalance de todas las cuentas bancarias activas. */
  saldoBancario: number;
  /** Cantidad de cuentas bancarias activas (para mostrar contexto). */
  bankAccountsCount: number;
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

/**
 * Days Sales Outstanding del período. Fórmula clásica:
 *   DSO = (cuentas por cobrar al cierre / ventas del período) × días
 *
 * Interpretación: cuántos días tarda en promedio una factura en cobrarse.
 * Más bajo = mejor (cobrás rápido).
 *
 * Devuelve null si las ventas del período son 0 (no se puede dividir
 * por cero) o el porCobrar también es 0 (no hay ciclo de cobro).
 *
 * Versión "puro cálculo" — recibe los agregados ya hechos para evitar
 * duplicar queries cuando se llama desde computeCobranzasSummary.
 */
function dsoFromAggregates(
  ventasNetas: number,
  porCobrar: number,
  range: PeriodRange,
): number | null {
  if (ventasNetas <= 0) return null;
  if (porCobrar <= 0) return 0;
  const dias =
    (range.to.getTime() - range.from.getTime()) / (1000 * 60 * 60 * 24);
  if (dias <= 0) return null;
  return Math.round((porCobrar / ventasNetas) * dias);
}

/**
 * Top N clientes con más monto pendiente de cobro. Agrupa DTEs
 * UNPAID/PARTIAL/OVERDUE por (crmAccountId || receiverRut) y ordena
 * desc por monto. Si dos accountIds tienen el mismo RUT, se cuentan
 * juntos (defensa contra duplicados de account creados por error).
 *
 * NO filtra por período: muestra deuda histórica acumulada (que es
 * lo que importa para "a quién hay que llamar a cobrar HOY").
 *
 * Excluye:
 *   - DTEs con paymentStatus=CEDED (los cobra el factoring).
 *   - NCs (no se cobran).
 */
async function computeTopDebtorsForTenant(
  tenantId: string,
  limit = 5,
): Promise<TopDebtor[]> {
  const dtes = await prisma.financeDte.findMany({
    where: {
      tenantId,
      direction: "ISSUED",
      siiStatus: "ACCEPTED",
      paymentStatus: { in: ["UNPAID", "PARTIAL", "OVERDUE"] },
      dteType: { notIn: [61] },
    },
    select: {
      crmAccountId: true,
      receiverRut: true,
      receiverName: true,
      amountPending: true,
      date: true,
    },
  });

  // Agrupar por crmAccountId si existe; sino por RUT canonicalizado.
  const groups = new Map<
    string,
    {
      accountId: string | null;
      rut: string;
      name: string;
      monto: number;
      facturasCount: number;
      oldestDate: Date;
    }
  >();
  for (const d of dtes) {
    const key = d.crmAccountId ?? `rut:${d.receiverRut}`;
    const existing = groups.get(key);
    if (existing) {
      existing.monto += d.amountPending.toNumber();
      existing.facturasCount += 1;
      if (d.date < existing.oldestDate) existing.oldestDate = d.date;
    } else {
      groups.set(key, {
        accountId: d.crmAccountId,
        rut: d.receiverRut,
        name: d.receiverName,
        monto: d.amountPending.toNumber(),
        facturasCount: 1,
        oldestDate: d.date,
      });
    }
  }

  // Para los que tienen accountId, traer el nombre canonical del CRM
  // (más limpio que receiverName). No es crítico, mejora UX.
  const accountIds = [...groups.values()]
    .filter((g) => g.accountId)
    .map((g) => g.accountId as string);
  if (accountIds.length > 0) {
    const accounts = await prisma.crmAccount.findMany({
      where: { id: { in: accountIds }, tenantId },
      select: { id: true, name: true, legalName: true },
    });
    const accMap = new Map(accounts.map((a) => [a.id, a]));
    for (const g of groups.values()) {
      if (g.accountId) {
        const acc = accMap.get(g.accountId);
        if (acc) g.name = acc.name || acc.legalName || g.name;
      }
    }
  }

  const now = Date.now();
  const sorted = [...groups.values()]
    .sort((a, b) => b.monto - a.monto)
    .slice(0, limit)
    .map<TopDebtor>((g) => ({
      accountId: g.accountId,
      name: g.name,
      rut: g.rut,
      monto: g.monto,
      facturasCount: g.facturasCount,
      diasMasAntigua: Math.floor(
        (now - g.oldestDate.getTime()) / (1000 * 60 * 60 * 24),
      ),
    }));

  return sorted;
}

/**
 * Saldo total de cuentas bancarias activas del tenant. Es lo más
 * cercano a "efectivo disponible HOY" que tenemos (no neto descuento
 * de pagos pendientes ni cheques en tránsito).
 */
async function computeBankBalanceForTenant(
  tenantId: string,
): Promise<{ saldoBancario: number; bankAccountsCount: number }> {
  const accounts = await prisma.financeBankAccount.findMany({
    where: { tenantId, isActive: true },
    select: { currentBalance: true },
  });
  const saldo = accounts.reduce(
    (acc, a) => acc + a.currentBalance.toNumber(),
    0,
  );
  return { saldoBancario: saldo, bankAccountsCount: accounts.length };
}

export async function computeCobranzasSummary(
  tenantId: string,
  range: PeriodRange,
): Promise<CobranzasSummary> {
  // Período inmediatamente anterior (mismo largo) para el DSO comparativo.
  const lengthMs = range.to.getTime() - range.from.getTime();
  const prevRange = {
    from: new Date(range.from.getTime() - lengthMs),
    to: new Date(range.from.getTime()),
    label: "anterior",
  };

  const [
    sales,
    purchases,
    cobrado,
    aging,
    salesPrev,
    agingPrev,
    topDeudores,
    bank,
  ] = await Promise.all([
    computeNetSales(tenantId, range),
    computeNetPurchases(tenantId, range),
    sumCobradoForPeriod(tenantId, range),
    computeAgingForPeriod(tenantId, range),
    computeNetSales(tenantId, prevRange),
    computeAgingForPeriod(tenantId, prevRange),
    computeTopDebtorsForTenant(tenantId, 5),
    computeBankBalanceForTenant(tenantId),
  ]);

  const facturadoNeto = sales.ventasNetas;
  const ivaNeto = sales.ivaDebito - purchases.ivaCredito;
  const margenBruto = facturadoNeto - purchases.comprasNetas;
  const cobradoPct =
    facturadoNeto > 0 ? (cobrado / facturadoNeto) * 100 : 0;
  const dso = dsoFromAggregates(facturadoNeto, aging.porCobrar, range);
  const dsoPrev = dsoFromAggregates(
    salesPrev.ventasNetas,
    agingPrev.porCobrar,
    prevRange,
  );

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
    dso,
    dsoPrev,
    topDeudores,
    saldoBancario: bank.saldoBancario,
    bankAccountsCount: bank.bankAccountsCount,
    range,
  };
}

/**
 * Trend mensual de cobrado vs facturado para el chart.
 *
 * Acepta un rango como string preset:
 *   - "3m" / "6m" / "12m" → últimos N meses (incluye el actual).
 *   - "ytd" → desde enero hasta el mes en curso (1 a 12 puntos según
 *     mes actual).
 *
 * Devuelve N puntos cronológicos (más antiguo → actual).
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

export type CobranzasTrendRange = "3m" | "6m" | "12m" | "ytd";

/**
 * Resuelve el rango string a número de meses hacia atrás contando el
 * actual. YTD devuelve mes_actual + 1 (de enero al actual inclusive).
 */
function monthsForTrendRange(
  rangeKey: CobranzasTrendRange,
  now: Date = new Date(),
): number {
  switch (rangeKey) {
    case "3m":
      return 3;
    case "6m":
      return 6;
    case "12m":
      return 12;
    case "ytd":
      return now.getUTCMonth() + 1;
  }
}

export async function computeCobranzasTrend(
  tenantId: string,
  rangeKey: CobranzasTrendRange = "ytd",
  now: Date = new Date(),
): Promise<CobranzasTrendPoint[]> {
  const monthsBack = Math.max(1, monthsForTrendRange(rangeKey, now));
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
