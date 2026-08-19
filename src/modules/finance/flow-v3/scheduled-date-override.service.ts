import "server-only";
import { prisma } from "@/lib/prisma";
import {
  resolveIssueYmdForPeriod,
  type BillingPeriodTemplate,
} from "@/modules/finance/billing/dte-recurring-schedule";
import { isMondayYmd, ymdToDate } from "./weeks";
import { assertV3WeeksWritable } from "./weekly-close.adapter";

export function scheduledOverrideKey(templateId: string, billingPeriod: string): string {
  return `${templateId}::${billingPeriod}`;
}

export async function loadScheduledDateOverrides(
  tenantId: string,
  templateIds: string[],
): Promise<Map<string, string>> {
  if (templateIds.length === 0) return new Map();
  const rows = await prisma.financeCashflowScheduledDateOverride.findMany({
    where: { tenantId, templateId: { in: templateIds } },
    select: { templateId: true, billingPeriod: true, customDate: true },
  });
  return new Map(
    rows.map((r) => [
      scheduledOverrideKey(r.templateId, r.billingPeriod),
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
 * Mueve una cuota programada (P) a otra semana del flujo.
 * Solo visibilidad: no toca el template, no genera borrador, no mueve facturas.
 */
export async function moveScheduledQuota(args: {
  tenantId: string;
  templateId: string;
  billingPeriod: string;
  toWeek: string;
  createdBy: string;
  reason?: string | null;
}): Promise<{ templateId: string; billingPeriod: string; customDate: string }> {
  const { tenantId, templateId, billingPeriod, createdBy } = args;
  const customDate = assertMonday(args.toWeek);
  await assertV3WeeksWritable(tenantId, [args.toWeek]);

  const template = await prisma.financeDteRecurringTemplate.findFirst({
    where: { id: templateId, tenantId },
    select: {
      id: true,
      frequency: true,
      dayOfMonth: true,
      dayOfWeek: true,
      monthOfYear: true,
      startDate: true,
      endDate: true,
      lastRunAt: true,
      facturaTiming: true,
      facturaDay: true,
      facturaMesRelativo: true,
    },
  });
  if (!template) throw new Error("Programación no encontrada");

  const issueYmd = resolveIssueYmdForPeriod(template as BillingPeriodTemplate, billingPeriod);
  if (!issueYmd) throw new Error("Cuota no encontrada en la programación");
  const originalDate = ymdToDate(issueYmd);
  if (!originalDate) throw new Error("Cuota no encontrada en la programación");

  await prisma.financeCashflowScheduledDateOverride.upsert({
    where: {
      tenantId_templateId_billingPeriod: { tenantId, templateId, billingPeriod },
    },
    create: {
      tenantId,
      templateId,
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

  return {
    templateId,
    billingPeriod,
    customDate: args.toWeek,
  };
}
