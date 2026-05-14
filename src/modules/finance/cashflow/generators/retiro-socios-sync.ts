import "server-only";
import { prisma } from "@/lib/prisma";
import { addMonths, lastDayOfMonth, startOfMonth, endOfMonth } from "date-fns";
import { expandRecurrence } from "../recurrence-engine";
import { getUfValueForDate } from "@/lib/uf";

const RETIRO_CATEGORY_CODE = "EGR_RETIRO_SOCIO";

type SyncAction =
  | "created"
  | "updated"
  | "deactivated"
  | "reactivated"
  | "noop";

export interface RecomputeStats {
  created: number;
  updated: number;
  reactivated: number;
  deactivated: number;
}

/**
 * Suma neta de los ingresos proyectados de un mes desde los items activos.
 *
 * Aproximación: usa item.amount (NETO) y expande la recurrencia con
 * `expandRecurrence`. Para ítems UF convierte a CLP usando la UF de la fecha
 * de pago. Excluye categorías exentas de IVA (ING_PRESTAMO_SOCIO, ajustes,
 * ING_OTRO marcado exento por usuario, etc.) — solo cuentan las VENTAS NETAS
 * operacionales, que son la base correcta para calcular el retiro de socios.
 *
 * No usa `buildProjection` para evitar sobrecarga: aquí solo necesitamos la
 * suma neta por mes, sin matching de banco, sin DTEs, sin overrides por
 * celda — el cron retiro corre best-effort y el override por celda del
 * `FinanceCashflowOccurrence.amountOverride` afecta el flujo final pero NO
 * la BASE de cálculo del retiro (el retiro se ata a ventas proyectadas, no a
 * los overrides ad-hoc que el usuario hace por motivos puntuales).
 */
async function sumProjectedIncomeNetForMonth(
  tenantId: string,
  monthStart: Date,
): Promise<number> {
  const monthEnd = endOfMonth(monthStart);

  const incomeItems = await prisma.financeCashflowItem.findMany({
    where: {
      tenantId,
      isActive: true,
      kind: "INCOME",
      // Solo categorías afectas a IVA = ventas operativas reales.
      // Préstamos de socios, ajustes de conciliación y otros ingresos
      // marcados exentos quedan fuera.
      category: { isTaxExempt: false, isActive: true },
    },
    select: {
      id: true,
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

  let total = 0;
  for (const item of incomeItems) {
    const dates = expandRecurrence(
      {
        recurrence: item.recurrence,
        startDate: item.startDate,
        endDate: item.endDate,
        dayOfMonth: item.dayOfMonth,
        dayOfWeek: item.dayOfWeek,
        monthOfYear: item.monthOfYear,
      },
      monthStart,
      monthEnd,
    );
    if (dates.length === 0) continue;
    const baseNet = Number(item.amount ?? 0);
    if (baseNet <= 0) continue;

    if (item.currency === "UF") {
      // Una sola consulta de UF por ítem para el primer evento del mes:
      // suficiente como aproximación. La UF intra-mes varía <1%, el
      // retiro se redondea a CLP igual.
      const ref = dates[0];
      const uf = await getUfValueForDate(ref).catch(() => 0);
      if (uf <= 0) continue;
      total += baseNet * uf * dates.length;
    } else {
      total += baseNet * dates.length;
    }
  }
  return Math.round(total);
}

interface MonthRecomputeResult {
  action: SyncAction;
}

/**
 * Idempotente: 1 item RETIRO_SOCIO por mes (clave por tenant + source + name).
 * El nombre codifica "Retiro socios YYYY-MM" como en iva-f29-sync.
 */
async function recomputeRetiroForMonth(
  tenantId: string,
  categoryId: string,
  monthStart: Date,
  pct: number,
  payDay: number,
): Promise<MonthRecomputeResult> {
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth() + 1;
  const periodKey = `${year}-${String(month).padStart(2, "0")}`;
  const itemName = `Retiro socios ${periodKey}`;

  const existing = await prisma.financeCashflowItem.findFirst({
    where: { tenantId, source: "RETIRO_SOCIO", name: itemName },
  });

  if (pct <= 0) {
    if (existing && existing.isActive) {
      await prisma.financeCashflowItem.update({
        where: { id: existing.id },
        data: { isActive: false },
      });
      return { action: "deactivated" };
    }
    return { action: "noop" };
  }

  const ventasNetas = await sumProjectedIncomeNetForMonth(tenantId, monthStart);
  const monto = Math.round(ventasNetas * pct);

  if (monto <= 0) {
    if (existing && existing.isActive) {
      await prisma.financeCashflowItem.update({
        where: { id: existing.id },
        data: { isActive: false },
      });
      return { action: "deactivated" };
    }
    return { action: "noop" };
  }

  const last = lastDayOfMonth(monthStart);
  const scheduled = new Date(year, month - 1, Math.min(payDay, last.getDate()));

  const data = {
    tenantId,
    categoryId,
    kind: "EXPENSE" as const,
    source: "RETIRO_SOCIO" as const,
    sourceRefId: null,
    name: itemName,
    description: `Retiro socios ${periodKey} (${(pct * 100).toFixed(1)}% de ventas netas proyectadas)`,
    amount: monto,
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

/**
 * Recompute the next N months of retiro de socios items. N viene de
 * `config.horizonMonthsDefault` (default 12).
 *
 * Si `retiroSocioPctVentas <= 0` desactiva cualquier ítem RETIRO_SOCIO activo.
 *
 * Idempotente: no toca el `FinanceCashflowOccurrence.amountOverride` (vive
 * aparte y siempre tiene precedencia en `projection.service.ts`). Si el
 * usuario sobreescribió un retiro vía celda, el monto del item se actualiza
 * pero el override sigue mandando en el render — comportamiento idéntico a
 * iva-f29-sync.
 */
export async function recomputeRetiroSociosAmounts(
  tenantId: string,
): Promise<RecomputeStats> {
  const stats: RecomputeStats = { created: 0, updated: 0, reactivated: 0, deactivated: 0 };

  const cat = await prisma.financeCashflowCategory.findFirst({
    where: { tenantId, code: RETIRO_CATEGORY_CODE, isActive: true },
    select: { id: true },
  });
  if (!cat) return stats;

  const config = await prisma.financeCashflowConfig.findUnique({
    where: { tenantId },
    select: {
      retiroSocioPctVentas: true,
      retiroSocioPayDay: true,
      horizonMonthsDefault: true,
    },
  });
  const pct = Number(config?.retiroSocioPctVentas ?? 0);
  const payDay = config?.retiroSocioPayDay ?? 5;
  const horizon = config?.horizonMonthsDefault ?? 12;

  const base = startOfMonth(new Date());
  for (let i = 0; i < horizon; i++) {
    const month = addMonths(base, i);
    const r = await recomputeRetiroForMonth(tenantId, cat.id, month, pct, payDay);
    if (r.action === "created") stats.created++;
    else if (r.action === "updated") stats.updated++;
    else if (r.action === "reactivated") stats.reactivated++;
    else if (r.action === "deactivated") stats.deactivated++;
  }
  return stats;
}

export async function setRetiroSocioItemsActive(
  tenantId: string,
  active: boolean,
): Promise<{ affected: number }> {
  const r = await prisma.financeCashflowItem.updateMany({
    where: { tenantId, source: "RETIRO_SOCIO" },
    data: { isActive: active },
  });
  return { affected: r.count };
}
