import "server-only";
import { prisma } from "@/lib/prisma";
import { addMonths, startOfMonth, endOfMonth, lastDayOfMonth } from "date-fns";

const IVA_CATEGORY_CODE = "EGR_IVA_F29";

type SyncAction = "created" | "updated" | "deactivated" | "reactivated" | "noop";

/** Calcula débito − crédito para un período YYYY-MM. */
async function computeIvaForPeriod(
  tenantId: string,
  periodStart: Date,
): Promise<number> {
  const periodEnd = endOfMonth(periodStart);
  const [issued, received] = await Promise.all([
    prisma.financeDte.aggregate({
      where: {
        tenantId,
        direction: "ISSUED",
        dteType: { in: [33, 39] },
        date: { gte: periodStart, lte: periodEnd },
        siiStatus: { in: ["ACCEPTED", "SENT"] },
      },
      _sum: { taxAmount: true },
    }),
    prisma.financeDte.aggregate({
      where: {
        tenantId,
        direction: "RECEIVED",
        dteType: { in: [33] },
        date: { gte: periodStart, lte: periodEnd },
        receptionStatus: { in: ["ACCEPTED"] },
      },
      _sum: { taxAmount: true },
    }),
  ]);
  const debit = Number(issued._sum.taxAmount ?? 0);
  const credit = Number(received._sum.taxAmount ?? 0);
  return debit - credit;
}

/**
 * Idempotente: 1 item por (período YYYY-MM × tenant).
 * sourceRefId = "YYYY-MM" como TEXTO (cast en sync, no en schema).
 *
 * Como sourceRefId es @db.Uuid en Prisma, codificamos el período en el name
 * y usamos el item con ONCE recurrence + startDate/endDate apuntando al pago.
 * El sourceRefId queda null y la unicidad se protege con un find por tenant
 * + name + source=IVA.
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
    select: { ivaPayDay: true },
  });
  const payDay = config?.ivaPayDay ?? 12;

  // periodKey "YYYY-MM"
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
  const net = await computeIvaForPeriod(tenantId, periodStart);

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

  const data = {
    tenantId,
    categoryId: cat.id,
    kind: "EXPENSE" as const,
    source: "IVA" as const,
    sourceRefId: null,
    name: itemName,
    description: `IVA F29 período ${periodKey} (débito − crédito)`,
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
