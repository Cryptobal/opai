import "server-only";
import { prisma } from "@/lib/prisma";
import { addMonths, startOfMonth, endOfMonth, lastDayOfMonth } from "date-fns";
import { expandRecurrence } from "../recurrence-engine";
import { getUfValueForDate } from "@/lib/uf";
import { computeF29Period } from "@/modules/finance/billing/f29.service";

const IVA_CATEGORY_CODE = "EGR_IVA_F29";
const IVA_RATE = 0.19;

type SyncAction = "created" | "updated" | "deactivated" | "reactivated" | "noop";

/**
 * Total a pagar del F29 del período (datos reales). Delegado al servicio
 * canónico de Libro IVA: débito − crédito (con NC/ND y reclamados bien
 * tratados) − remanente UTM-ajustado + PPM. Mismo número que muestra la
 * página Finanzas → Libro IVA.
 */
async function computeIvaFromDte(
  tenantId: string,
  periodStart: Date,
): Promise<number> {
  const periodo = `${periodStart.getFullYear()}-${String(periodStart.getMonth() + 1).padStart(2, "0")}`;
  const result = await computeF29Period(tenantId, periodo);
  return result.f29.totalAPagar;
}

/**
 * Estima débito − crédito del período YYYY-MM proyectando desde los items
 * activos del flujo. Sirve para meses FUTUROS donde aún no hay DTEs reales
 * pero la matriz ya muestra ingresos brutos (×1.19) y egresos afectos brutos.
 *
 * Débito proyectado = 19% × suma_neta(items kind=INCOME, categoría afecta).
 * Crédito proyectado = 19% × suma_neta(items kind=EXPENSE, categoría afecta).
 *
 * Items UF se convierten a CLP con la UF del primer evento del mes —
 * aproximación suficiente (variación intra-mes < 1%, el IVA se redondea).
 * Categorías exentas (sueldos, previred, IVA, retiros, ajustes, préstamos
 * de socios) quedan fuera automáticamente — son las que NO llevan ×1.19 en
 * la proyección, así que tampoco deben sumar IVA.
 */
async function computeIvaFromProjectedItems(
  tenantId: string,
  periodStart: Date,
  ppmRatePct: number,
): Promise<number> {
  const periodEnd = endOfMonth(periodStart);

  // Una sola query: ítems activos con categoría no-exenta-de-IVA.
  const items = await prisma.financeCashflowItem.findMany({
    where: {
      tenantId,
      isActive: true,
      category: { isTaxExempt: false, isActive: true },
    },
    select: {
      id: true,
      kind: true,
      amount: true,
      currency: true,
      recurrence: true,
      startDate: true,
      endDate: true,
      dayOfMonth: true,
      dayOfWeek: true,
      monthOfYear: true,
      ufFixingPolicy: true,
      ufFixingDay: true,
    },
  });

  let netoIncome = 0;
  let netoExpense = 0;

  for (const item of items) {
    const dates = expandRecurrence(
      {
        recurrence: item.recurrence,
        startDate: item.startDate,
        endDate: item.endDate,
        dayOfMonth: item.dayOfMonth,
        dayOfWeek: item.dayOfWeek,
        monthOfYear: item.monthOfYear,
      },
      periodStart,
      periodEnd,
    );
    if (dates.length === 0) continue;
    const baseNet = Number(item.amount ?? 0);
    if (baseNet <= 0) continue;

    let totalClp: number;
    if (item.currency === "UF") {
      const uf = await getUfValueForDate(dates[0]).catch(() => 0);
      if (uf <= 0) continue;
      totalClp = baseNet * uf * dates.length;
    } else {
      totalClp = baseNet * dates.length;
    }

    if (item.kind === "INCOME") netoIncome += totalClp;
    else if (item.kind === "EXPENSE") netoExpense += totalClp;
  }

  const debit = Math.round(netoIncome * IVA_RATE);
  const credit = Math.round(netoExpense * IVA_RATE);
  // PPM proyectado sobre los ingresos brutos estimados del período.
  const ppm = Math.round(netoIncome * (ppmRatePct / 100));
  return debit - credit + ppm;
}

interface IvaComputation {
  net: number;
  isProjected: boolean;
}

/**
 * Decide cómo calcular el IVA del período:
 * - Período cuyo fin <= hoy → DTEs reales (cálculo histórico).
 * - Período cuyo fin > hoy → proyección desde items del flujo de caja.
 *
 * El "mes en curso" entra en la rama proyectada porque suele tener DTEs
 * parciales: el cálculo DTE-only subestima sistemáticamente y el flujo
 * proyectado refleja mejor el F29 que terminará declarando el contador.
 */
async function computeIvaForPeriod(
  tenantId: string,
  periodStart: Date,
  ppmRatePct: number,
): Promise<IvaComputation> {
  const periodEnd = endOfMonth(periodStart);
  const now = new Date();
  if (periodEnd.getTime() <= now.getTime()) {
    return { net: await computeIvaFromDte(tenantId, periodStart), isProjected: false };
  }
  return {
    net: await computeIvaFromProjectedItems(tenantId, periodStart, ppmRatePct),
    isProjected: true,
  };
}

/**
 * Idempotente: 1 item por (período YYYY-MM × tenant).
 *
 * El sourceRefId queda null y la unicidad se protege con find por
 * (tenant, name="IVA F29 YYYY-MM", source=IVA). Mismo patrón que existía
 * antes — solo cambia el cálculo del `net` interno.
 */
export async function recomputeIvaForPeriod(
  tenantId: string,
  periodKey: string,
): Promise<{ action: SyncAction }> {
  const cat = await prisma.financeCashflowCategory.findFirst({
    where: { tenantId, code: IVA_CATEGORY_CODE, isActive: true },
    select: { id: true },
  });
  if (!cat) return { action: "noop" };

  const config = await prisma.financeCashflowConfig.findUnique({
    where: { tenantId },
    select: { ivaPayDay: true, ppmRatePct: true },
  });
  const payDay = config?.ivaPayDay ?? 12;
  const ppmRatePct = Number(config?.ppmRatePct ?? 0);

  const [yStr, mStr] = periodKey.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m || m < 1 || m > 12) return { action: "noop" };
  const periodStart = startOfMonth(new Date(y, m - 1, 1));
  const periodEndPay = addMonths(periodStart, 1);
  const last = lastDayOfMonth(periodEndPay);
  const scheduled = new Date(
    periodEndPay.getFullYear(),
    periodEndPay.getMonth(),
    Math.min(payDay, last.getDate()),
  );

  const itemName = `IVA F29 ${periodKey}`;
  const { net, isProjected } = await computeIvaForPeriod(
    tenantId,
    periodStart,
    ppmRatePct,
  );

  const existing = await prisma.financeCashflowItem.findFirst({
    where: { tenantId, source: "IVA", name: itemName },
  });

  // Solo proyectar IVA pagable cuando net > 0; saldo a favor o vacío → desactivar.
  if (net <= 0) {
    if (existing && existing.isActive) {
      await prisma.financeCashflowItem.update({
        where: { id: existing.id },
        data: { isActive: false },
      });
      return { action: "deactivated" };
    }
    return { action: "noop" };
  }

  const description = isProjected
    ? `IVA F29 período ${periodKey} (estimado desde flujo afecto)`
    : `IVA F29 período ${periodKey} (débito − crédito DTE, con remanente y PPM)`;

  const data = {
    tenantId,
    categoryId: cat.id,
    kind: "EXPENSE" as const,
    source: "IVA" as const,
    sourceRefId: null,
    name: itemName,
    description,
    amount: Math.round(net),
    currency: "CLP",
    recurrence: "ONCE" as const,
    dayOfMonth: null,
    dayOfWeek: null,
    monthOfYear: null,
    startDate: scheduled,
    endDate: scheduled,
    installationId: null,
    isActive: true,
  };

  if (existing) {
    await prisma.financeCashflowItem.update({ where: { id: existing.id }, data });
    return { action: existing.isActive ? "updated" : "reactivated" };
  }
  await prisma.financeCashflowItem.create({ data });
  return { action: "created" };
}

export interface RecomputeStats {
  created: number;
  updated: number;
  reactivated: number;
  deactivated: number;
}

/** Recomputa los próximos N períodos (default: 3 meses adelante + el actual). */
export async function recomputeIvaUpcoming(
  tenantId: string,
  monthsAhead = 3,
): Promise<RecomputeStats> {
  const stats: RecomputeStats = { created: 0, updated: 0, reactivated: 0, deactivated: 0 };
  // El IVA se paga el mes siguiente al período. Para cubrir los próximos
  // monthsAhead meses de pago debemos sincronizar los períodos
  // (current_month - 1) .. (current_month - 1 + monthsAhead).
  const now = new Date();
  const baseMonth = startOfMonth(addMonths(now, -1));
  for (let i = 0; i <= monthsAhead; i++) {
    const periodStart = addMonths(baseMonth, i);
    const key = `${periodStart.getFullYear()}-${String(periodStart.getMonth() + 1).padStart(2, "0")}`;
    const r = await recomputeIvaForPeriod(tenantId, key);
    if (r.action === "created") stats.created++;
    else if (r.action === "updated") stats.updated++;
    else if (r.action === "reactivated") stats.reactivated++;
    else if (r.action === "deactivated") stats.deactivated++;
  }
  return stats;
}

export async function setIvaItemsActive(
  tenantId: string,
  active: boolean,
): Promise<{ affected: number }> {
  const r = await prisma.financeCashflowItem.updateMany({
    where: { tenantId, source: "IVA" },
    data: { isActive: active },
  });
  return { affected: r.count };
}
