import "server-only";
import { prisma } from "@/lib/prisma";
import { isMondayYmd, ymdToDate } from "./weeks";
import { assertV3WeeksWritable } from "./weekly-close.adapter";
import type { ExpenseMilestoneKey } from "./derive-committed-expense";

export const MOVABLE_MILESTONE_KEYS: readonly ExpenseMilestoneKey[] = [
  "liquido",
  "quincena",
  "previred",
  "impuesto_unico",
  "f29",
  "turnos_extra",
  "retiro_socio",
  "finiquitos",
];

export function milestoneOverrideKey(milestoneKey: string, billingPeriod: string): string {
  return `${milestoneKey}::${billingPeriod}`;
}

export async function loadMilestoneDateOverrides(
  tenantId: string,
): Promise<Map<string, string>> {
  const rows = await prisma.financeCashflowMilestoneDateOverride.findMany({
    where: { tenantId },
    select: { milestoneKey: true, billingPeriod: true, customDate: true },
  });
  return new Map(
    rows.map((r) => [
      milestoneOverrideKey(r.milestoneKey, r.billingPeriod),
      r.customDate.toISOString().slice(0, 10),
    ]),
  );
}

function assertMonday(weekStart: string): Date {
  if (!isMondayYmd(weekStart)) {
    throw new Error(`toWeek inválido: debe ser lunes ISO (YYYY-MM-DD): ${weekStart}`);
  }
  const d = ymdToDate(weekStart);
  if (!d) throw new Error(`toWeek inválido: ${weekStart}`);
  return d;
}

/**
 * Mueve un hito programado (quincena, sueldos, …) a otra semana del flujo.
 * Solo visibilidad: no cambia el día de pago configurado ni el monto.
 */
export async function moveMilestoneQuota(args: {
  tenantId: string;
  milestoneKey: string;
  billingPeriod: string;
  toWeek: string;
  createdBy: string;
  reason?: string | null;
}): Promise<{ milestoneKey: string; billingPeriod: string; customDate: string }> {
  const { tenantId, milestoneKey, billingPeriod, createdBy } = args;
  if (!MOVABLE_MILESTONE_KEYS.includes(milestoneKey as ExpenseMilestoneKey)) {
    throw new Error("Hito no se puede mover en el flujo");
  }
  if (!/^\d{4}-\d{2}$/.test(billingPeriod)) {
    throw new Error("Período inválido (YYYY-MM)");
  }
  const customDate = assertMonday(args.toWeek);
  await assertV3WeeksWritable(tenantId, [args.toWeek]);
  const originalDate = ymdToDate(`${billingPeriod}-01`);
  if (!originalDate) throw new Error("Período inválido (YYYY-MM)");

  await prisma.financeCashflowMilestoneDateOverride.upsert({
    where: {
      tenantId_milestoneKey_billingPeriod: { tenantId, milestoneKey, billingPeriod },
    },
    create: {
      tenantId,
      milestoneKey,
      billingPeriod,
      originalDate,
      customDate,
      createdBy,
      reason: args.reason ?? null,
    },
    update: {
      customDate,
      reason: args.reason ?? null,
    },
  });

  return { milestoneKey, billingPeriod, customDate: args.toWeek };
}
